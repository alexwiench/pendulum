<script lang="ts">
  import { onMount } from "svelte";
  import { evalTS } from "../lib/utils/bolt";

  // --- State ---
  let p1 = $state({ x: 0.25, y: 0.0 });
  let p2 = $state({ x: 0.75, y: 1.0 });
  let dragging: "p1" | "p2" | null = $state(null);
  let hovering: "p1" | "p2" | null = $state(null);
  let graphDragging = $state(false);
  let graphDragStart: { normX: number; normY: number; infl: number; out: number } | null = null;
  let viewMode: "curve" | "graph" = $state("graph");

  let canvasEl: HTMLCanvasElement;

  // Independent influence state for graph mode (0–100, default 50 = smooth ease)
  let influenceIn = $state(50.0);
  let influenceOut = $state(50.0);

  // Ghost curves: existing keyframe easing read from AE (one per property)
  type GhostEasing = { x1: number; y1: number; x2: number; y2: number; fps: number; duration: number; name: string };
  let ghostCurves: GhostEasing[] = $state([]);

  const GHOST_COLORS = [
    { r: 255, g: 255, b: 255, strokeA: 0.2, fillA: 0.03 },
    { r: 255, g: 170, b: 100, strokeA: 0.2, fillA: 0.03 },
    { r: 160, g: 220, b: 255, strokeA: 0.2, fillA: 0.03 },
    { r: 200, g: 160, b: 255, strokeA: 0.2, fillA: 0.03 },
  ];
  let ghostOpacity = $state(0);
  let ghostFadeRaf: number | null = null;
  let playheadPos: number | null = $state(null); // rendered position (animated)
  let playheadTarget: number | null = null; // where we're heading (-0.05/1.05 for exit animation)
  let playheadRaf: number | null = null;
  let keySpan: { t1: number; t2: number } | null = null;
  let playheadInterval: ReturnType<typeof setInterval> | null = null;
  let playheadPollPending = false;

  // Smooth Y-axis scaling to avoid jarring jumps
  let smoothMaxSpeed = 1;
  let scaleAnimRaf: number | null = null;

  let bezierString = $derived(
    viewMode === "graph"
      ? `cubic-bezier(${(influenceIn / 100).toFixed(2)}, 0.00, ${(1 - influenceOut / 100).toFixed(2)}, 1.00)`
      : `cubic-bezier(${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}, ${p2.x.toFixed(2)}, ${p2.y.toFixed(2)})`
  );

  // --- Constants ---
  const SIZE = 250;
  const PAD = 20;
  const DRAW = SIZE - PAD * 2; // 210
  const HIT_RADIUS = 12;

  // --- Presets ---
  const CURVE_PRESETS = [
    { label: "Linear", p1: { x: 0.25, y: 0.25 }, p2: { x: 0.75, y: 0.75 } },
    { label: "Ease In", p1: { x: 0.42, y: 0.0 }, p2: { x: 1.0, y: 1.0 } },
    { label: "Ease Out", p1: { x: 0.0, y: 0.0 }, p2: { x: 0.58, y: 1.0 } },
    { label: "In-Out", p1: { x: 0.42, y: 0.0 }, p2: { x: 0.58, y: 1.0 } },
    { label: "Overshoot", p1: { x: 0.18, y: 0.89 }, p2: { x: 0.32, y: 1.28 } },
  ];

  const GRAPH_PRESETS = [
    { label: "Linear", infl: 0, out: 0 },
    { label: "Gentle", infl: 33, out: 33 },
    { label: "Smooth", infl: 50, out: 50 },
    { label: "Ease In", infl: 75, out: 0 },
    { label: "Ease Out", infl: 0, out: 75 },
    { label: "In-Out", infl: 75, out: 75 },
  ];

  // --- Coordinate mapping ---
  function toCanvas(nx: number, ny: number): [number, number] {
    return [PAD + nx * DRAW, PAD + (1 - ny) * DRAW];
  }

  function fromCanvas(cx: number, cy: number): { x: number; y: number } {
    return {
      x: (cx - PAD) / DRAW,
      y: 1 - (cy - PAD) / DRAW,
    };
  }

  // --- Bezier sampling ---
  // Sample a cubic bezier at parameter t: P0=(x0,y0), P1=(x1,y1), P2=(x2,y2), P3=(x3,y3)
  function sampleBezier(t: number, v0: number, v1: number, v2: number, v3: number): number {
    const mt = 1 - t;
    return mt * mt * mt * v0 + 3 * mt * mt * t * v1 + 3 * mt * t * t * v2 + t * t * t * v3;
  }

  // --- Speed graph computation ---
  // Solve for bezier parameter given target x (time), using Newton's method
  function solveBezierT(targetX: number, x1: number, x2: number): number {
    let t = targetX;
    for (let i = 0; i < 8; i++) {
      const mt = 1 - t;
      const x = 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t;
      const dx = 3 * mt * mt * x1 + 6 * mt * t * (x2 - x1) + 3 * t * t * (1 - x2);
      if (Math.abs(dx) < 1e-8) break;
      t -= (x - targetX) / dx;
      t = Math.max(0, Math.min(1, t));
    }
    return t;
  }

  // Get value at a given time (0-1) from cubic-bezier(x1, y1, x2, y2)
  function bezierValue(time: number, x1: number, y1: number, x2: number, y2: number): number {
    if (time <= 0) return 0;
    if (time >= 1) return 1;
    const t = solveBezierT(time, x1, x2);
    const mt = 1 - t;
    return 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t;
  }

  function computeSpeedGraph(x1: number, y1: number, x2: number, y2: number, samples: number): Array<{time: number, speed: number}> {
    const dt = 0.002;
    const points: Array<{time: number, speed: number}> = [];
    for (let i = 0; i <= samples; i++) {
      const time = i / samples;
      const tLo = Math.max(0, time - dt);
      const tHi = Math.min(1, time + dt);
      const vLo = bezierValue(tLo, x1, y1, x2, y2);
      const vHi = bezierValue(tHi, x1, y1, x2, y2);
      const speed = (tHi > tLo) ? (vHi - vLo) / (tHi - tLo) : 0;
      points.push({ time, speed });
    }
    return points;
  }

  // Color based on frame density — blue when plenty of frames, red when sparse
  function speedToColor(normalizedSpeed: number, totalFrames: number, alpha = 1): string {
    const frameDensity = totalFrames / Math.max(normalizedSpeed, 0.01);
    const t = Math.max(0, Math.min(1, 1 - (frameDensity - 3) / 5));
    const r = Math.round(74 + (255 - 74) * t);
    const g = Math.round(158 - (158 - 74) * t);
    const b = Math.round(255 - (255 - 74) * t);
    return alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${alpha})` : `rgb(${r}, ${g}, ${b})`;
  }

  // --- Canvas rendering ---
  function draw() {
    if (!canvasEl) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvasEl.getContext("2d")!;

    canvasEl.width = SIZE * dpr;
    canvasEl.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Grid lines
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const [gx, gy] = toCanvas(t, 0);
      const [, gy2] = toCanvas(t, 1);
      const [gx3] = toCanvas(0, t);
      const [gx4] = toCanvas(1, t);

      ctx.strokeStyle =
        i === 2 ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;

      // Vertical
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx, gy2);
      ctx.stroke();

      // Horizontal
      ctx.beginPath();
      ctx.moveTo(gx3, gy);
      ctx.lineTo(gx4, gy);
      ctx.stroke();
    }

    // Diagonal reference line (linear) — only in curve mode
    if (viewMode === "curve") {
      const [lx0, ly0] = toCanvas(0, 0);
      const [lx1, ly1] = toCanvas(1, 1);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx0, ly0);
      ctx.lineTo(lx1, ly1);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (viewMode === "curve") {
      drawCurveMode(ctx);
    } else {
      drawGraphMode(ctx);
    }
  }

  function drawCurveMode(ctx: CanvasRenderingContext2D) {
    const [cx0, cy0] = toCanvas(0, 0);
    const [cx1, cy1] = toCanvas(p1.x, p1.y);
    const [cx2, cy2] = toCanvas(p2.x, p2.y);
    const [cx3, cy3] = toCanvas(1, 1);

    // Bezier curve
    ctx.strokeStyle = "#f5a623";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx0, cy0);
    ctx.bezierCurveTo(cx1, cy1, cx2, cy2, cx3, cy3);
    ctx.stroke();

    // Handle lines
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx0, cy0);
    ctx.lineTo(cx1, cy1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx3, cy3);
    ctx.lineTo(cx2, cy2);
    ctx.stroke();

    // Endpoint dots
    drawEndpoints(ctx);

    // Handle circles
    drawHandle(ctx, cx1, cy1, "p1");
    drawHandle(ctx, cx2, cy2, "p2");
  }

  function drawGraphMode(ctx: CanvasRenderingContext2D) {
    const x1 = influenceIn / 100;
    const x2 = 1 - influenceOut / 100;
    const points = computeSpeedGraph(x1, 0, x2, 1, 400);

    // Compute ghost points for each property
    const allGhostPoints = ghostCurves.map(g =>
      computeSpeedGraph(g.x1, g.y1, g.x2, g.y2, 400)
    );

    // Find target max speed across all curves for shared Y-axis scaling
    let targetMaxSpeed = 0;
    for (const pt of points) {
      if (pt.speed > targetMaxSpeed) targetMaxSpeed = pt.speed;
    }
    for (const gp of allGhostPoints) {
      for (const pt of gp) {
        if (pt.speed > targetMaxSpeed) targetMaxSpeed = pt.speed;
      }
    }
    if (targetMaxSpeed < 0.01) targetMaxSpeed = 1;

    // Smoothly interpolate toward target scale
    const scaleDiff = Math.abs(smoothMaxSpeed - targetMaxSpeed);
    if (scaleDiff > 0.001) {
      smoothMaxSpeed += (targetMaxSpeed - smoothMaxSpeed) * 0.15;
      // Keep animating until settled
      if (scaleAnimRaf) cancelAnimationFrame(scaleAnimRaf);
      scaleAnimRaf = requestAnimationFrame(() => {
        scaleAnimRaf = null;
        draw();
      });
    } else {
      smoothMaxSpeed = targetMaxSpeed;
    }
    const maxSpeed = smoothMaxSpeed;

    const [startX, startY] = toCanvas(0, 0);
    const [endX, endY] = toCanvas(1, 0);

    // --- Ghost curves (existing easing, drawn behind) ---
    if (allGhostPoints.length > 0 && ghostOpacity > 0) {
      const go = ghostOpacity;
      for (let gi = 0; gi < allGhostPoints.length; gi++) {
        const ghostPts = allGhostPoints[gi];
        const color = GHOST_COLORS[gi % GHOST_COLORS.length];
        const ghostCanvasPoints: Array<[number, number]> = ghostPts.map(pt => {
          const ny = (pt.speed / maxSpeed) * 0.9;
          return toCanvas(pt.time, ny);
        });

        // Ghost fill
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.fillA * go})`;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        for (const [cx, cy] of ghostCanvasPoints) {
          ctx.lineTo(cx, cy);
        }
        ctx.lineTo(endX, endY);
        ctx.closePath();
        ctx.fill();

        // Ghost stroke
        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.strokeA * go})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ghostCanvasPoints[0][0], ghostCanvasPoints[0][1]);
        for (let i = 1; i < ghostCanvasPoints.length; i++) {
          ctx.lineTo(ghostCanvasPoints[i][0], ghostCanvasPoints[i][1]);
        }
        ctx.stroke();
      }
    }

    // --- User's curve (on top) ---
    const canvasPoints: Array<[number, number]> = points.map(pt => {
      const ny = (pt.speed / maxSpeed) * 0.9;
      return toCanvas(pt.time, ny);
    });

    const totalFrames = ghostCurves.length > 0 ? ghostCurves[0].fps * ghostCurves[0].duration : Infinity;

    // Fill under curve
    ctx.fillStyle = "rgba(74, 158, 255, 0.08)";
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (const [cx, cy] of canvasPoints) {
      ctx.lineTo(cx, cy);
    }
    ctx.lineTo(endX, endY);
    ctx.closePath();
    ctx.fill();

    // Per-segment colored stroke
    ctx.lineWidth = 2.5;
    for (let i = 1; i < canvasPoints.length; i++) {
      const avgSpd = (points[i - 1].speed + points[i].speed) / 2;
      ctx.strokeStyle = speedToColor(avgSpd, totalFrames);
      ctx.beginPath();
      ctx.moveTo(canvasPoints[i - 1][0], canvasPoints[i - 1][1]);
      ctx.lineTo(canvasPoints[i][0], canvasPoints[i][1]);
      ctx.stroke();
    }

    // Endpoint dots at baseline
    for (const [dotX, dotY] of [[startX, startY], [endX, endY]]) {
      ctx.fillStyle = "#666";
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Playhead indicator (styled like the AE CTI)
    if (playheadPos !== null) {
      const clampedPh = Math.max(0, Math.min(1, playheadPos));
      // Fade opacity near edges (entering/exiting)
      const edgeDist = Math.min(clampedPh, 1 - clampedPh);
      const phOpacity = Math.min(1, edgeDist / 0.03);
      const [phX] = toCanvas(clampedPh, 0);
      const phColor = `rgba(74, 158, 255, ${phOpacity})`;

      // Vertical line
      ctx.strokeStyle = phColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(phX, PAD);
      ctx.lineTo(phX, PAD + DRAW);
      ctx.stroke();

      // Chip at the top
      const chipW = 8;
      const chipH = 10;
      const chipY = PAD - chipH;
      ctx.fillStyle = phColor;
      ctx.beginPath();
      ctx.moveTo(phX - chipW / 2, chipY);
      ctx.lineTo(phX + chipW / 2, chipY);
      ctx.lineTo(phX + chipW / 2, chipY + chipH * 0.6);
      ctx.lineTo(phX, chipY + chipH);
      ctx.lineTo(phX - chipW / 2, chipY + chipH * 0.6);
      ctx.closePath();
      ctx.fill();
    }

    // Show a dashed vertical line when the active curve's peak timing aligns with a ghost's peak
    if (allGhostPoints.length > 0 && ghostOpacity > 0) {
      let activePeakTime = 0;
      let activePeakSpeed = 0;
      for (let i = 0; i < points.length; i++) {
        if (points[i].speed > activePeakSpeed) {
          activePeakSpeed = points[i].speed;
          activePeakTime = points[i].time;
        }
      }

      for (let gi = 0; gi < allGhostPoints.length; gi++) {
        const ghostPts = allGhostPoints[gi];

        let ghostPeakTime = 0;
        let ghostPeakSpeed = 0;
        for (let i = 0; i < ghostPts.length; i++) {
          if (ghostPts[i].speed > ghostPeakSpeed) {
            ghostPeakSpeed = ghostPts[i].speed;
            ghostPeakTime = ghostPts[i].time;
          }
        }

        const diff = Math.abs(activePeakTime - ghostPeakTime);
        const lineOpacity = Math.max(0, 1 - diff / 0.01) * ghostOpacity;

        if (lineOpacity > 0.01) {
          const color = GHOST_COLORS[gi % GHOST_COLORS.length];
          const [lineX] = toCanvas(ghostPeakTime, 0);
          const topY = PAD;
          const bottomY = PAD + DRAW;
          ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${0.25 * lineOpacity})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(lineX, topY);
          ctx.lineTo(lineX, bottomY);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }

  function drawEndpoints(ctx: CanvasRenderingContext2D) {
    const [cx0, cy0] = toCanvas(0, 0);
    const [cx3, cy3] = toCanvas(1, 1);
    for (const [ex, ey] of [
      [cx0, cy0],
      [cx3, cy3],
    ]) {
      ctx.fillStyle = "#666";
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHandle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    id: "p1" | "p2"
  ) {
    const active = dragging === id || hovering === id;
    const radius = active ? 8 : 6;

    if (active) {
      // Glow
      ctx.fillStyle = "rgba(245, 166, 35, 0.2)";
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = active ? "#f5a623" : "#fff";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Interaction ---
  // Use mouse events bound directly in onMount for CEP compatibility
  // (Svelte 5 event delegation + pointer events can fail in CEP's Chromium)

  function getCanvasPos(e: MouseEvent): { x: number; y: number } {
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SIZE,
      y: ((e.clientY - rect.top) / rect.height) * SIZE,
    };
  }

  function hitTest(pos: { x: number; y: number }): "p1" | "p2" | null {
    const [cx1, cy1] = toCanvas(p1.x, p1.y);
    const [cx2, cy2] = toCanvas(p2.x, p2.y);
    const d1 = Math.sqrt((pos.x - cx1) ** 2 + (pos.y - cy1) ** 2);
    const d2 = Math.sqrt((pos.x - cx2) ** 2 + (pos.y - cy2) ** 2);

    if (d1 <= HIT_RADIUS && d2 <= HIT_RADIUS) {
      return d1 <= d2 ? "p1" : "p2";
    }
    if (d1 <= HIT_RADIUS) return "p1";
    if (d2 <= HIT_RADIUS) return "p2";
    return null;
  }

  function onMouseDown(e: MouseEvent) {
    e.preventDefault();
    const pos = getCanvasPos(e);

    if (viewMode === "graph") {
      const norm = fromCanvas(pos.x, pos.y);
      graphDragging = true;
      graphDragStart = { normX: norm.x, normY: norm.y, infl: influenceIn, out: influenceOut };
      return;
    }

    const hit = hitTest(pos);
    if (hit) {
      dragging = hit;
    }
  }

  function onMouseMove(e: MouseEvent) {
    if (!canvasEl) return;
    const pos = getCanvasPos(e);

    if (viewMode === "graph") {
      if (!graphDragging || !graphDragStart) return;
      e.preventDefault();
      const norm = fromCanvas(pos.x, pos.y);
      // Vertical: down on screen = more easing (both increase)
      const deltaY = (norm.y - graphDragStart.normY) * 100;
      // Horizontal: drag right = peak moves right (+In, -Out)
      const deltaX = (norm.x - graphDragStart.normX) * 60;
      influenceIn = Math.max(0, Math.min(100, graphDragStart.infl + deltaY + deltaX));
      influenceOut = Math.max(0, Math.min(100, graphDragStart.out + deltaY - deltaX));
      return;
    }

    if (dragging) {
      e.preventDefault();
      const norm = fromCanvas(pos.x, pos.y);
      const clampedX = Math.max(0, Math.min(1, norm.x));
      if (dragging === "p1") {
        p1.x = clampedX;
        p1.y = norm.y;
      } else {
        p2.x = clampedX;
        p2.y = norm.y;
      }
    } else {
      hovering = hitTest(pos);
    }
  }

  function onMouseUp() {
    if (graphDragging) {
      graphDragging = false;
      graphDragStart = null;
    }
    if (dragging) {
      dragging = null;
    }
  }

  function applyCurvePreset(preset: (typeof CURVE_PRESETS)[number]) {
    p1 = { ...preset.p1 };
    p2 = { ...preset.p2 };
  }

  function applyGraphPreset(preset: (typeof GRAPH_PRESETS)[number]) {
    influenceIn = preset.infl;
    influenceOut = preset.out;
  }

  function handleApply() {
    let x1: number, y1: number, x2: number, y2: number;
    if (viewMode === "graph") {
      x1 = influenceIn / 100;
      y1 = 0;
      x2 = 1 - influenceOut / 100;
      y2 = 1;
    } else {
      x1 = p1.x;
      y1 = p1.y;
      x2 = p2.x;
      y2 = p2.y;
    }
    evalTS("applyBezierEasing", x1, y1, x2, y2)
      .then(() => {
        loadExistingEasing();
      })
      .catch((e: any) => {
        console.error("applyBezierEasing error:", e);
      });
  }

  // --- Reactive redraw ---
  $effect(() => {
    // Touch reactive deps
    p1.x;
    p1.y;
    p2.x;
    p2.y;
    influenceIn;
    influenceOut;
    hovering;
    dragging;
    graphDragging;
    viewMode;
    ghostCurves;
    ghostOpacity;
    playheadPos;
    draw();
  });

  function ghostsChanged(a: GhostEasing[], b: GhostEasing[]): boolean {
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i].x1 - b[i].x1) > 0.001 || Math.abs(a[i].y1 - b[i].y1) > 0.001 ||
          Math.abs(a[i].x2 - b[i].x2) > 0.001 || Math.abs(a[i].y2 - b[i].y2) > 0.001) {
        return true;
      }
    }
    return false;
  }

  function fadeInGhost() {
    if (ghostFadeRaf) cancelAnimationFrame(ghostFadeRaf);
    ghostOpacity = 0;
    const start = performance.now();
    const duration = 300;
    function tick() {
      const t = Math.min((performance.now() - start) / duration, 1);
      ghostOpacity = t;
      if (t < 1) {
        ghostFadeRaf = requestAnimationFrame(tick);
      } else {
        ghostFadeRaf = null;
      }
    }
    ghostFadeRaf = requestAnimationFrame(tick);
  }

  function animatePlayhead() {
    if (playheadRaf) return; // already running, just update target
    function tick() {
      playheadRaf = null;
      if (playheadTarget === null || playheadPos === null) {
        playheadPos = null;
        return;
      }
      const diff = playheadTarget - playheadPos;
      if (Math.abs(diff) < 0.001) {
        if (playheadTarget < 0 || playheadTarget > 1) {
          playheadPos = null;
          playheadTarget = null;
        } else {
          playheadPos = playheadTarget;
        }
      } else {
        playheadPos += diff * 0.25;
        playheadRaf = requestAnimationFrame(tick);
      }
    }
    playheadRaf = requestAnimationFrame(tick);
  }

  function pollPlayhead() {
    if (!keySpan || playheadPollPending) return;
    playheadPollPending = true;
    evalTS("getCompTime")
      .then((time: any) => {
        playheadPollPending = false;
        if (time == null || !keySpan) {
          playheadTarget = null;
          playheadPos = null;
          return;
        }
        const span = keySpan.t2 - keySpan.t1;
        const normalized = (time - keySpan.t1) / span;

        if (normalized < 0 || normalized > 1) {
          if (playheadPos !== null) {
            playheadTarget = normalized < 0 ? -0.03 : 1.03;
            animatePlayhead();
          }
          return;
        }

        if (playheadPos === null) {
          playheadPos = normalized < 0.5 ? -0.03 : 1.03;
        }
        playheadTarget = normalized;
        animatePlayhead();
      })
      .catch(() => {
        playheadPollPending = false;
        playheadTarget = null;
        playheadPos = null;
      });
  }

  function startPlayheadPoll() {
    if (playheadInterval) return;
    playheadInterval = setInterval(pollPlayhead, 100);
  }

  function stopPlayheadPoll() {
    if (playheadInterval) {
      clearInterval(playheadInterval);
      playheadInterval = null;
    }
    if (playheadRaf) {
      cancelAnimationFrame(playheadRaf);
      playheadRaf = null;
    }
    playheadTarget = null;
    playheadPos = null;
  }

  function loadExistingEasing() {
    evalTS("getSelectedKeyframeEasing")
      .then((result: any) => {
        const newGhosts: GhostEasing[] = result && result.curves ? result.curves : [];
        if (result && result.spanStart != null && result.spanEnd != null) {
          keySpan = { t1: result.spanStart, t2: result.spanEnd };
          startPlayheadPoll();
        } else {
          keySpan = null;
          stopPlayheadPoll();
        }
        if (ghostsChanged(ghostCurves, newGhosts)) {
          ghostCurves = newGhosts;
          if (newGhosts.length > 0) {
            fadeInGhost();
          } else {
            ghostOpacity = 0;
          }
        }
      })
      .catch(() => {
        if (ghostCurves.length > 0) {
          ghostCurves = [];
          ghostOpacity = 0;
        }
        keySpan = null;
        stopPlayheadPoll();
      });
  }

  onMount(() => {
    // Bind mouse events directly to DOM for CEP compatibility
    canvasEl.addEventListener("mousedown", onMouseDown);
    // mousemove and mouseup on window so drag continues outside canvas
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    draw();
    loadExistingEasing();

    // Poll for keyframe selection changes (~1s interval)
    const pollInterval = setInterval(loadExistingEasing, 1000);

    return () => {
      canvasEl.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      clearInterval(pollInterval);
      stopPlayheadPoll();
    };
  });
</script>

<div class="curve-editor">
  <div class="view-toggle">
    <button
      class="toggle-btn"
      class:active={viewMode === 'curve'}
      onclick={() => viewMode = 'curve'}
    >Curve</button>
    <button
      class="toggle-btn"
      class:active={viewMode === 'graph'}
      onclick={() => { viewMode = 'graph'; }}
    >Graph</button>
  </div>

  <canvas
    bind:this={canvasEl}
    class="curve-canvas"
    style="width: {SIZE}px; height: {SIZE}px; cursor: {viewMode === 'graph'
      ? (graphDragging ? 'grabbing' : 'grab')
      : dragging
        ? 'grabbing'
        : hovering
          ? 'grab'
          : 'crosshair'};"
  ></canvas>

  {#if viewMode === 'graph'}
    <div class="influence-sliders">
      <div class="slider-group">
        <label class="slider-label" for="influence-in">In</label>
        <input
          id="influence-in"
          type="range"
          class="influence-range"
          min="0"
          max="100"
          value={Math.round(100 - influenceIn)}
          oninput={(e) => { influenceIn = 100 - parseInt(e.currentTarget.value); }}
        />
        <span class="slider-value">{Math.round(influenceIn)}</span>
      </div>
      <div class="slider-group">
        <label class="slider-label" for="influence-out">Out</label>
        <input
          id="influence-out"
          type="range"
          class="influence-range"
          min="0"
          max="100"
          value={Math.round(influenceOut)}
          oninput={(e) => { influenceOut = parseInt(e.currentTarget.value); }}
        />
        <span class="slider-value">{Math.round(influenceOut)}</span>
      </div>
    </div>
  {/if}

  <div class="presets">
    {#if viewMode === 'graph'}
      {#each GRAPH_PRESETS as preset}
        <button
          class="preset-btn"
          onclick={() => applyGraphPreset(preset)}
        >
          {preset.label}
        </button>
      {/each}
    {:else}
      {#each CURVE_PRESETS as preset}
        <button
          class="preset-btn"
          onclick={() => applyCurvePreset(preset)}
        >
          {preset.label}
        </button>
      {/each}
    {/if}
  </div>

  <span class="bezier-string">{bezierString}</span>

  <button class="apply-btn" onclick={handleApply}>Apply</button>
</div>

<style lang="scss">
  .curve-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }

  .curve-canvas {
    border-radius: 4px;
    display: block;
  }

  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    width: 100%;
  }

  .preset-btn {
    all: unset;
    font-size: 10px;
    padding: 3px 8px !important;
    border-radius: 3px;
    background: #252525 !important;
    color: #aaa;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .preset-btn:hover {
    background: #333 !important;
    color: #f5a623;
  }

  .preset-btn:active {
    background: #2a2a2a !important;
  }

  .view-toggle {
    display: flex;
    gap: 4px;
    width: 100%;
  }

  .toggle-btn {
    all: unset;
    flex: 1;
    font-size: 10px;
    padding: 3px 8px !important;
    border-radius: 3px;
    background: #252525 !important;
    color: #aaa;
    cursor: pointer;
    text-align: center;
    transition: background 0.15s, color 0.15s;
  }

  .toggle-btn:hover {
    background: #333 !important;
    color: #f5a623;
  }

  .toggle-btn.active {
    background: #f5a623 !important;
    color: #1a1a1a;
  }

  .influence-sliders {
    display: flex;
    gap: 8px;
    width: 100%;
  }

  .slider-group {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .slider-label {
    font-size: 9px;
    color: #666;
    min-width: 20px;
    text-transform: uppercase;
  }

  .influence-range {
    flex: 1;
    height: 3px;
    -webkit-appearance: none;
    appearance: none;
    background: #333;
    border-radius: 2px;
    outline: none;
  }

  .influence-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #4a9eff;
    cursor: ew-resize;
  }

  .slider-value {
    font-family: monospace;
    font-size: 9px;
    color: #4a9eff;
    min-width: 18px;
    text-align: right;
  }

  .bezier-string {
    font-family: monospace;
    font-size: 10px;
    color: #666;
    text-align: center;
  }

  .apply-btn {
    all: unset;
    width: 100%;
    padding: 8px 0 !important;
    border-radius: 4px;
    background: #f5a623 !important;
    color: #1a1a1a;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    text-align: center;
    box-sizing: border-box;
    transition: background 0.15s;
  }

  .apply-btn:hover {
    background: #ffb84d !important;
  }

  .apply-btn:active {
    background: #e09520 !important;
  }

</style>
