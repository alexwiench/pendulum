<script lang="ts">
  import { onMount } from "svelte";
  import { flip } from "svelte/animate";
  import { slide } from "svelte/transition";
  import { evalTS } from "../lib/utils/bolt";
  import { settings } from "./settings.svelte";
  import { presets } from "./presets.svelte";
  import { computeSpeedGraph, findPeakTime, bezierValue, hexToRgb, sampleBezierCurve } from "./curve-math";
  import AnchorGrid from "./AnchorGrid.svelte";
  import PresetThumbnail from "./PresetThumbnail.svelte";

  let { onOpenSettings }: { onOpenSettings: () => void } = $props();

  // --- State ---
  let p1 = $state({ x: 0.25, y: 0.0 });
  let p2 = $state({ x: 0.75, y: 1.0 });
  let dragging: "p1" | "p2" | null = $state(null);
  let dragViewport: { min: number; max: number } | null = null;
  let hovering: "p1" | "p2" | null = $state(null);
  let graphDragStart: { normX: number; normY: number; infl: number; out: number } | null = $state(null);
  let graphDragging = $derived(graphDragStart !== null);
  let graphHandleDragging: "in" | "out" | null = $state(null);
  let graphHovering: "in" | "out" | null = $state(null);
  let toolbarHover: "mode" | "gear" | null = $state(null);

  // Icon hit regions (pixel coords)
  const ICON_SIZE = 18;
  const ICON_PAD = 2;
  const modeIconRect = { x: ICON_PAD, y: ICON_PAD };
  let gearIconX = $derived(SIZE - ICON_SIZE - ICON_PAD);
  const GRID_GAP = 3;
  const GRID_COLS = 2;
  const GRID_ROWS = 4;
  const ROW_GAP = 6;
  let gridCellSize = $derived(Math.floor((containerWidth - (GRID_COLS + GRID_ROWS - 2) * GRID_GAP - ROW_GAP) / (GRID_COLS + GRID_ROWS)));
  let canvasWidth = $derived(gridCellSize * GRID_ROWS + GRID_GAP * (GRID_ROWS - 1));
  let viewMode: "curve" | "graph" = $state(settings.defaultViewMode);

  let canvasEl: HTMLCanvasElement;
  let containerWidth = $state(0);

  // Independent influence state for graph mode (0–100, default 50 = smooth ease)
  let influenceIn = $state(50.0);
  let influenceOut = $state(50.0);

  // Ghost curves: existing keyframe easing read from AE (one per property)
  type GhostEasing = { x1: number; y1: number; x2: number; y2: number; fps: number; duration: number; name: string };
  let ghostCurves: GhostEasing[] = $state([]);

  const GHOST_COLORS = [
    { r: 255, g: 255, b: 255 },
    { r: 255, g: 170, b: 100 },
    { r: 160, g: 220, b: 255 },
    { r: 200, g: 160, b: 255 },
  ];
  let ghostOpacity = $state(0);
  let ghostFadeRaf: number | null = null;
  let playheadPos: number | null = $state(null); // rendered position (animated)
  let playheadTarget: number | null = null; // where we're heading (-0.05/1.05 for exit animation)
  let playheadRaf: number | null = null;
  let keySpan: { t1: number; t2: number } | null = null;
  let playheadInterval: ReturnType<typeof setInterval> | null = null;
  let playheadPollPending = false;

  let drawRaf: number | null = null;

  let bezierString = $derived(
    viewMode === "graph"
      ? `cubic-bezier(${(influenceIn / 100).toFixed(2)}, 0.00, ${(1 - influenceOut / 100).toFixed(2)}, 1.00)`
      : `cubic-bezier(${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}, ${p2.x.toFixed(2)}, ${p2.y.toFixed(2)})`
  );

  // --- Canvas dimensions (fill container width) ---
  let SIZE = $derived(containerWidth > 0 ? canvasWidth : 250);
  const PAD = 20;
  let DRAW = $derived(SIZE - PAD * 2);
  const HIT_RADIUS = 12;

  // --- Preset thumbnail size ---
  const PRESET_SIZE = 28;

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

  // --- Value graph auto-scaling viewport (linear, driven by user's curve) ---
  // Sample the active bezier to find the actual curve range (like speed graph does)
  let curveRange = $derived.by(() => {
    let lo = 0, hi = 1;
    // Sample the curve path
    for (let i = 0; i <= 50; i++) {
      const t = i / 50;
      const y = bezierValue(t, p1.x, p1.y, p2.x, p2.y);
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    // Include handle positions so they stay visible
    lo = Math.min(lo, p1.y, p2.y);
    hi = Math.max(hi, p1.y, p2.y);
    return { lo, hi };
  });
  let curveViewSpan = $derived(curveRange.hi - curveRange.lo);
  let curveViewMin = $derived(curveRange.lo - curveViewSpan * 0.1);
  let curveViewMax = $derived(curveRange.hi + curveViewSpan * 0.1);

  function curveModeToCanvas(nx: number, ny: number): [number, number] {
    return [PAD + nx * DRAW, PAD + ((curveViewMax - ny) / (curveViewMax - curveViewMin)) * DRAW];
  }

  function curveModeFromCanvas(cx: number, cy: number): { x: number; y: number } {
    return {
      x: (cx - PAD) / DRAW,
      y: curveViewMax - ((cy - PAD) / DRAW) * (curveViewMax - curveViewMin),
    };
  }

  // Color based on frame density — base color when plenty of frames, red when sparse
  function speedToColor(normalizedSpeed: number, totalFrames: number, baseColor?: { r: number; g: number; b: number }, alpha = 1): string {
    const frameDensity = totalFrames / Math.max(normalizedSpeed, 0.01);
    const t = Math.max(0, Math.min(1, 1 - (frameDensity - 3) / 5));
    const lo = baseColor ?? settings.graphColor;
    const hi = settings.graphMaxSpeedColor;
    const r = Math.round(lo.r + (hi.r - lo.r) * t);
    const g = Math.round(lo.g + (hi.g - lo.g) * t);
    const b = Math.round(lo.b + (hi.b - lo.b) * t);
    return alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${alpha})` : `rgb(${r}, ${g}, ${b})`;
  }

  // --- Canvas rendering ---
  function scheduleDraw() {
    if (drawRaf) return;
    drawRaf = requestAnimationFrame(() => {
      drawRaf = null;
      draw();
    });
  }

  function draw() {
    if (!canvasEl) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvasEl.getContext("2d")!;

    const targetW = SIZE * dpr;
    const targetH = SIZE * dpr;
    if (canvasEl.width !== targetW || canvasEl.height !== targetH) {
      canvasEl.width = targetW;
      canvasEl.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Grid lines
    if (viewMode === "curve") {
      // Value graph: vertical time divisions + y=0 and y=1 baselines
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const [vx] = curveModeToCanvas(t, 0);
        ctx.strokeStyle = i === 2 ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(vx, PAD);
        ctx.lineTo(vx, PAD + DRAW);
        ctx.stroke();
      }
      // y=0 and y=1 reference lines
      for (const yVal of [0, 1]) {
        const [, hy] = curveModeToCanvas(0, yVal);
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, hy);
        ctx.lineTo(PAD + DRAW, hy);
        ctx.stroke();
      }
    } else {
      // Speed graph: fixed [0,1] grid
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
    }

    // Diagonal reference line (linear) — only in value graph mode
    if (viewMode === "curve") {
      const [lx0, ly0] = curveModeToCanvas(0, 0);
      const [lx1, ly1] = curveModeToCanvas(1, 1);
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

    drawToolbarIcons(ctx);
  }

  function drawPlayhead(ctx: CanvasRenderingContext2D) {
    if (playheadPos === null) return;
    const clampedPh = Math.max(0, Math.min(1, playheadPos));
    const edgeDist = Math.min(clampedPh, 1 - clampedPh);
    const phOpacity = Math.min(1, edgeDist / 0.03);
    const [phX] = toCanvas(clampedPh, 0);
    const pc = settings.playheadColor;
    const phColor = `rgba(${pc.r}, ${pc.g}, ${pc.b}, ${phOpacity})`;

    ctx.strokeStyle = phColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(phX, PAD);
    ctx.lineTo(phX, PAD + DRAW);
    ctx.stroke();

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

  function drawCurveMode(ctx: CanvasRenderingContext2D) {
    const [cx0, cy0] = curveModeToCanvas(0, 0);
    const [cx1, cy1] = curveModeToCanvas(p1.x, p1.y);
    const [cx2, cy2] = curveModeToCanvas(p2.x, p2.y);
    const [cx3, cy3] = curveModeToCanvas(1, 1);

    // --- Ghost curves (existing keyframe easing, drawn behind) ---
    if (ghostCurves.length > 0 && ghostOpacity > 0) {
      for (let gi = 0; gi < ghostCurves.length; gi++) {
        const g = ghostCurves[gi];
        const color = GHOST_COLORS[gi % GHOST_COLORS.length];
        const ghostPts = sampleBezierCurve(g.x1, g.y1, g.x2, g.y2, 60);

        // Ghost fill
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${settings.ghostFillOpacity * ghostOpacity})`;
        ctx.beginPath();
        ctx.moveTo(...curveModeToCanvas(0, 0));
        for (const pt of ghostPts) {
          ctx.lineTo(...curveModeToCanvas(pt.x, pt.y));
        }
        ctx.lineTo(...curveModeToCanvas(1, 0));
        ctx.closePath();
        ctx.fill();

        // Ghost stroke (sampled to handle non-linear viewport)
        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${settings.ghostStrokeOpacity * ghostOpacity})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let si = 0; si <= 60; si++) {
          const [sx, sy] = curveModeToCanvas(ghostPts[si].x, ghostPts[si].y);
          if (si === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
    }

    // --- Fill under main curve ---
    const curveRgb = hexToRgb(settings.curveColor);
    if (curveRgb) {
      const fillPts = sampleBezierCurve(p1.x, p1.y, p2.x, p2.y, 100);
      ctx.fillStyle = `rgba(${curveRgb.r}, ${curveRgb.g}, ${curveRgb.b}, 0.08)`;
      ctx.beginPath();
      ctx.moveTo(...curveModeToCanvas(0, 0));
      for (const pt of fillPts) {
        ctx.lineTo(...curveModeToCanvas(pt.x, pt.y));
      }
      ctx.lineTo(...curveModeToCanvas(1, 0));
      ctx.closePath();
      ctx.fill();
    }

    // Per-segment colored bezier stroke (speed warning like the speed graph)
    const totalFrames = ghostCurves.length > 0 ? ghostCurves[0].fps * ghostCurves[0].duration : Infinity;
    const curveRgbForStroke = hexToRgb(settings.curveColor) ?? { r: 245, g: 166, b: 35 };
    const curvePts = computeSpeedGraph(p1.x, p1.y, p2.x, p2.y, 100);
    const curveCanvasPts = curvePts.map(pt => curveModeToCanvas(pt.time, bezierValue(pt.time, p1.x, p1.y, p2.x, p2.y)));
    ctx.lineWidth = 2.5;
    for (let i = 1; i < curveCanvasPts.length; i++) {
      const avgSpd = (curvePts[i - 1].speed + curvePts[i].speed) / 2;
      ctx.strokeStyle = speedToColor(avgSpd, totalFrames, curveRgbForStroke);
      ctx.beginPath();
      ctx.moveTo(curveCanvasPts[i - 1][0], curveCanvasPts[i - 1][1]);
      ctx.lineTo(curveCanvasPts[i][0], curveCanvasPts[i][1]);
      ctx.stroke();
    }

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
    ctx.fillStyle = "#666";
    for (const [ex, ey] of [[cx0, cy0], [cx3, cy3]]) {
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Handle circles
    drawHandle(ctx, cx1, cy1, "p1");
    drawHandle(ctx, cx2, cy2, "p2");

    drawPlayhead(ctx);
  }

  function drawGraphMode(ctx: CanvasRenderingContext2D) {
    const x1 = influenceIn / 100;
    const x2 = 1 - influenceOut / 100;
    const points = computeSpeedGraph(x1, 0, x2, 1, 400);

    // Compute ghost points for each property
    const allGhostPoints = ghostCurves.map(g =>
      computeSpeedGraph(g.x1, g.y1, g.x2, g.y2, 400)
    );

    // Scale Y-axis to the user's curve so it's always prominent
    let targetMaxSpeed = 0;
    for (const pt of points) {
      if (pt.speed > targetMaxSpeed) targetMaxSpeed = pt.speed;
    }
    if (targetMaxSpeed < 0.01) targetMaxSpeed = 1;

    const maxSpeed = targetMaxSpeed;

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
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${settings.ghostFillOpacity * go})`;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        for (const [cx, cy] of ghostCanvasPoints) {
          ctx.lineTo(cx, cy);
        }
        ctx.lineTo(endX, endY);
        ctx.closePath();
        ctx.fill();

        // Ghost stroke
        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${settings.ghostStrokeOpacity * go})`;
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
    ctx.fillStyle = settings.graphFillColor;
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

    // Influence handles at baseline
    const [inHx, inHy] = toCanvas(influenceIn / 100 * 0.45, 0);
    const [outHx, outHy] = toCanvas(1 - influenceOut / 100 * 0.45, 0);

    // Handle arms (lines from endpoints to handles)
    ctx.strokeStyle = "rgba(245, 166, 35, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(inHx, inHy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(outHx, outHy);
    ctx.stroke();

    drawHandle(ctx, inHx, inHy, "in");
    drawHandle(ctx, outHx, outHy, "out");

    drawPlayhead(ctx);

    // Show a dashed vertical line when the active curve's peak timing aligns with a ghost's peak
    if (allGhostPoints.length > 0 && ghostOpacity > 0) {
      const activePeakTime = findPeakTime(points);

      for (let gi = 0; gi < allGhostPoints.length; gi++) {
        const ghostPeakTime = findPeakTime(allGhostPoints[gi]);
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

  function drawHandle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    id: "p1" | "p2" | "in" | "out"
  ) {
    const isGraph = id === "in" || id === "out";
    const active = dragging === id || hovering === id || graphHandleDragging === id || graphHovering === id;
    const radius = isGraph ? (active ? 5 : 4) : (active ? 8 : 6);

    if (active) {
      // Glow
      ctx.fillStyle = "rgba(245, 166, 35, 0.2)";
      ctx.beginPath();
      ctx.arc(x, y, isGraph ? 10 : 14, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = isGraph ? "#f5a623" : (active ? "#f5a623" : "#fff");
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawToolbarIcons(ctx: CanvasRenderingContext2D) {
    // Mode toggle icon (top-left) — shows the OTHER mode's icon
    const modeHover = toolbarHover === "mode";
    const s = ICON_SIZE;

    if (modeHover) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(modeIconRect.x - 1, modeIconRect.y - 1, s + 2, s + 2, 3);
      ctx.stroke();
    }

    ctx.strokeStyle = modeHover ? "#ffcf70" : "#f5a623";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (viewMode === "curve") {
      // Show speed graph icon (bell curve)
      const x = modeIconRect.x, y = modeIconRect.y;
      ctx.moveTo(x + 2, y + s - 2);
      ctx.quadraticCurveTo(x + s * 0.35, y + s - 2, x + s / 2, y + 3);
      ctx.quadraticCurveTo(x + s * 0.65, y + s - 2, x + s - 2, y + s - 2);
    } else {
      // Show bezier curve icon
      const x = modeIconRect.x, y = modeIconRect.y;
      ctx.moveTo(x + 2, y + s - 2);
      ctx.bezierCurveTo(x + s * 0.4, y + s - 2, x + s * 0.6, y + 2, x + s - 2, y + 2);
    }
    ctx.stroke();

    // Gear icon (top-right)
    const gearHover = toolbarHover === "gear";

    if (gearHover) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(gearIconX - 1, ICON_PAD - 1, s + 2, s + 2, 3);
      ctx.stroke();
    }

    const gcx = gearIconX + s / 2;
    const gcy = ICON_PAD + s / 2;
    ctx.fillStyle = gearHover ? "#f5a623" : "#555";
    // Gear teeth
    const teeth = 6;
    const outerR = s * 0.4;
    const innerR = s * 0.28;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a1 = (i / teeth) * Math.PI * 2 - Math.PI / 2;
      const a2 = ((i + 0.35) / teeth) * Math.PI * 2 - Math.PI / 2;
      const a3 = ((i + 0.5) / teeth) * Math.PI * 2 - Math.PI / 2;
      const a4 = ((i + 0.85) / teeth) * Math.PI * 2 - Math.PI / 2;
      if (i === 0) {
        ctx.moveTo(gcx + Math.cos(a1) * innerR, gcy + Math.sin(a1) * innerR);
      } else {
        ctx.lineTo(gcx + Math.cos(a1) * innerR, gcy + Math.sin(a1) * innerR);
      }
      ctx.lineTo(gcx + Math.cos(a2) * outerR, gcy + Math.sin(a2) * outerR);
      ctx.lineTo(gcx + Math.cos(a3) * outerR, gcy + Math.sin(a3) * outerR);
      ctx.lineTo(gcx + Math.cos(a4) * innerR, gcy + Math.sin(a4) * innerR);
    }
    ctx.closePath();
    ctx.fill();
    // Center hole
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(gcx, gcy, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  function toolbarHitTest(pos: { x: number; y: number }): "mode" | "gear" | null {
    if (pos.x >= modeIconRect.x && pos.x <= modeIconRect.x + ICON_SIZE &&
        pos.y >= modeIconRect.y && pos.y <= modeIconRect.y + ICON_SIZE) return "mode";
    if (pos.x >= gearIconX && pos.x <= gearIconX + ICON_SIZE &&
        pos.y >= ICON_PAD && pos.y <= ICON_PAD + ICON_SIZE) return "gear";
    return null;
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
    const [cx1, cy1] = curveModeToCanvas(p1.x, p1.y);
    const [cx2, cy2] = curveModeToCanvas(p2.x, p2.y);
    const d1 = Math.sqrt((pos.x - cx1) ** 2 + (pos.y - cy1) ** 2);
    const d2 = Math.sqrt((pos.x - cx2) ** 2 + (pos.y - cy2) ** 2);

    if (d1 <= HIT_RADIUS && d2 <= HIT_RADIUS) {
      return d1 <= d2 ? "p1" : "p2";
    }
    if (d1 <= HIT_RADIUS) return "p1";
    if (d2 <= HIT_RADIUS) return "p2";
    return null;
  }

  function graphHandleHitTest(pos: { x: number; y: number }): "in" | "out" | null {
    const [inHx, inHy] = toCanvas(influenceIn / 100 * 0.45, 0);
    const [outHx, outHy] = toCanvas(1 - influenceOut / 100 * 0.45, 0);
    const dIn = Math.sqrt((pos.x - inHx) ** 2 + (pos.y - inHy) ** 2);
    const dOut = Math.sqrt((pos.x - outHx) ** 2 + (pos.y - outHy) ** 2);

    if (dIn <= HIT_RADIUS && dOut <= HIT_RADIUS) {
      return dIn <= dOut ? "in" : "out";
    }
    if (dIn <= HIT_RADIUS) return "in";
    if (dOut <= HIT_RADIUS) return "out";
    return null;
  }

  function onMouseDown(e: MouseEvent) {
    e.preventDefault();
    const pos = getCanvasPos(e);

    // Toolbar icons (both modes)
    const toolbarHit = toolbarHitTest(pos);
    if (toolbarHit === "mode") {
      viewMode = viewMode === "curve" ? "graph" : "curve";
      return;
    }
    if (toolbarHit === "gear") {
      onOpenSettings();
      return;
    }

    if (viewMode === "graph") {
      const handleHit = graphHandleHitTest(pos);
      if (handleHit) {
        graphHandleDragging = handleHit;
        return;
      }
      const norm = fromCanvas(pos.x, pos.y);
      graphDragStart = { normX: norm.x, normY: norm.y, infl: influenceIn, out: influenceOut };
      return;
    }

    const hit = hitTest(pos);
    if (hit) {
      dragging = hit;
      dragViewport = { min: curveViewMin, max: curveViewMax };
    }
  }

  function onMouseMove(e: MouseEvent) {
    if (!canvasEl) return;
    const pos = getCanvasPos(e);

    // Toolbar hover (both modes, but only when not dragging)
    if (!dragging && !graphHandleDragging && !graphDragging) {
      toolbarHover = toolbarHitTest(pos);
    }

    if (viewMode === "graph") {
      if (graphHandleDragging) {
        e.preventDefault();
        const norm = fromCanvas(pos.x, pos.y);
        if (graphHandleDragging === "in") {
          const nx = Math.max(0, Math.min(0.45, norm.x));
          influenceIn = (nx / 0.45) * 100;
        } else {
          const nx = Math.max(0.55, Math.min(1, norm.x));
          influenceOut = ((1 - nx) / 0.45) * 100;
        }
        return;
      }
      if (!graphDragging) {
        graphHovering = graphHandleHitTest(pos);
        return;
      }
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

    if (dragging && dragViewport) {
      e.preventDefault();
      const cx = (pos.x - PAD) / DRAW;
      const realY = dragViewport.max - ((pos.y - PAD) / DRAW) * (dragViewport.max - dragViewport.min);
      const clampedX = Math.max(0.01, Math.min(0.99, cx));
      if (dragging === "p1") {
        p1.x = clampedX;
        p1.y = realY;
      } else {
        p2.x = clampedX;
        p2.y = realY;
      }
    } else {
      hovering = hitTest(pos);
    }
  }

  function onMouseUp() {
    const wasDragging = graphDragging || dragging || graphHandleDragging;
    if (graphDragging) {
      graphDragStart = null;
    }
    if (graphHandleDragging) {
      graphHandleDragging = null;
    }
    if (dragging) {
      dragging = null;
      dragViewport = null;
    }
    if (settings.autoApply && wasDragging) {
      handleApply();
    }
  }

  function getCurrentBezier(): { x1: number; y1: number; x2: number; y2: number } {
    if (viewMode === "graph") {
      return { x1: influenceIn / 100, y1: 0, x2: 1 - influenceOut / 100, y2: 1 };
    }
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }

  function saveCurrentAsPreset() {
    presets.add({ ...getCurrentBezier(), source: "user", viewMode });
  }

  function saveGhostsAsPresets() {
    for (const g of ghostCurves) {
      presets.add({ x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, source: "ghost", viewMode, name: g.name });
    }
  }

  function loadPreset(preset: { x1: number; y1: number; x2: number; y2: number; viewMode?: "curve" | "graph" }) {
    // Determine target mode: use stored viewMode, or heuristic for legacy presets
    const targetMode = preset.viewMode ?? (Math.abs(preset.y1) < 0.001 && Math.abs(preset.y2 - 1) < 0.001 ? "graph" : "curve");
    viewMode = targetMode;
    if (targetMode === "graph") {
      influenceIn = preset.x1 * 100;
      influenceOut = (1 - preset.x2) * 100;
    } else {
      p1 = { x: preset.x1, y: preset.y1 };
      p2 = { x: preset.x2, y: preset.y2 };
    }
    if (settings.autoApply) handleApply();
  }

  function handleApply() {
    const { x1, y1, x2, y2 } = getCurrentBezier();
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
    graphHovering;
    graphHandleDragging;
    toolbarHover;
    viewMode;
    ghostCurves;
    ghostOpacity;
    playheadPos;
    SIZE;
    settings.curveColor;
    settings.graphFillColor;
    settings.playheadColor;
    settings.ghostStrokeOpacity;
    settings.ghostFillOpacity;
    settings.graphColor;
    settings.graphMaxSpeedColor;
    scheduleDraw();
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
    const duration = settings.ghostFadeDuration;
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
    playheadInterval = setInterval(pollPlayhead, settings.playheadPollInterval);
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
    scheduleDraw();
    loadExistingEasing();

    // Poll for keyframe selection changes
    const pollInterval = setInterval(loadExistingEasing, settings.selectionPollInterval);

    return () => {
      canvasEl.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      clearInterval(pollInterval);
      stopPlayheadPoll();
      if (drawRaf) cancelAnimationFrame(drawRaf);
      if (ghostFadeRaf) cancelAnimationFrame(ghostFadeRaf);
    };
  });
</script>

<div class="curve-editor" bind:clientWidth={containerWidth}>
  <div class="graph-row">
    <canvas
      bind:this={canvasEl}
      class="curve-canvas"
      style="width: {canvasWidth}px; height: {canvasWidth}px; cursor: {toolbarHover
        ? 'pointer'
        : viewMode === 'graph'
          ? (graphHandleDragging ? 'ew-resize' : graphHovering ? 'ew-resize' : graphDragging ? 'grabbing' : 'grab')
          : dragging
            ? 'grabbing'
            : hovering
              ? 'grab'
              : 'crosshair'};"
    ></canvas>
    <div class="side-grid" style="grid-template-columns: repeat(2, {gridCellSize}px); grid-template-rows: repeat(4, {gridCellSize}px);">
      <div class="side-grid-anchor">
        <AnchorGrid />
      </div>
      <button class="side-grid-cell side-grid-btn has-tip" data-tip="Create Null" onclick={() => evalTS("createNull")}>
        <svg viewBox="0 0 16 16" width="70%" height="70%" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="10" height="10" stroke-dasharray="3,4" />
          <line x1="8" y1="5.5" x2="8" y2="10.5" />
          <line x1="5.5" y1="8" x2="10.5" y2="8" />
        </svg>
      </button>
      {#each Array(GRID_COLS * (GRID_ROWS - 2) - 1) as _, i}
        <div class="side-grid-cell"></div>
      {/each}
    </div>
  </div>

  <div class="presets-row">
    <button class="preset-save-btn has-tip" data-tip="Save curve" onclick={saveCurrentAsPreset}>
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
        <line x1="8" y1="3" x2="8" y2="13" />
        <line x1="3" y1="8" x2="13" y2="8" />
      </svg>
    </button>
    {#if ghostCurves.length > 0}
      <button class="preset-save-btn has-tip" data-tip="Save ghosts" onclick={saveGhostsAsPresets} transition:slide={{ axis: 'x', duration: 200 }}>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="8" y1="3" x2="8" y2="13" />
          <line x1="3" y1="8" x2="13" y2="8" />
          <circle cx="12" cy="4" r="2.5" fill="currentColor" stroke="none" opacity="0.4" />
        </svg>
      </button>
    {/if}
    <div class="presets-scroll">
      {#each presets.items as preset (preset.id)}
        <div class="preset-slot" animate:flip={{ duration: 250 }}>
          <PresetThumbnail
            x1={preset.x1} y1={preset.y1}
            x2={preset.x2} y2={preset.y2}
            viewMode={preset.viewMode}
            size={PRESET_SIZE}
            onclick={() => loadPreset(preset)}
          />
          <button class="preset-delete" onclick={() => presets.remove(preset.id)}>&times;</button>
        </div>
      {/each}
    </div>
  </div>

  <span class="bezier-string">{bezierString}</span>

  <div class="apply-row">
    <label class="auto-apply-toggle">
      <input type="checkbox" checked={settings.autoApply} onchange={(e) => { settings.autoApply = (e.target as HTMLInputElement).checked; settings.save(); }} />
      <span>Auto</span>
    </label>
    {#if !settings.autoApply}
      <button class="apply-btn" onclick={handleApply}>Apply</button>
    {/if}
  </div>
</div>

<style lang="scss">
  .curve-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .graph-row {
    display: flex;
    gap: 6px;
  }

  .curve-canvas {
    border-radius: 4px;
    display: block;
    flex-shrink: 0;
  }

  .side-grid {
    display: grid;
    gap: 3px;
    flex-shrink: 0;
  }

  .side-grid-anchor {
    grid-column: span 2;
    grid-row: span 2;
  }

  .side-grid-anchor :global(.anchor-grid) {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
  }

  .side-grid-cell {
    background: #252525;
    border-radius: 3px;
  }

  .side-grid-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #252525;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    color: #888;
    padding: 0;
    transition: color 0.15s, background 0.15s;
  }

  .side-grid-btn:hover {
    color: #f5a623;
    background: #333;
  }

  .side-grid-btn:active {
    background: #2a2a2a;
  }

  .presets-row {
    display: flex;
    gap: 4px;
    align-items: center;
    width: 100%;
  }

  .preset-save-btn {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    background: #252525;
    color: #888;
    cursor: pointer;
    padding: 0;
    transition: color 0.15s, background 0.15s;
  }

  .preset-save-btn:hover {
    background: #333;
    color: #f5a623;
  }

  .preset-save-btn:active {
    background: #2a2a2a;
  }

  .presets-scroll {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    overflow-y: hidden;
    flex: 1;
    scrollbar-width: none;
  }

  .presets-scroll::-webkit-scrollbar {
    display: none;
  }

  .preset-slot {
    position: relative;
    flex-shrink: 0;
  }

  .preset-delete {
    position: absolute;
    top: 1px;
    right: 1px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #d44;
    color: white;
    font-size: 9px;
    line-height: 12px;
    text-align: center;
    padding: 0;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .preset-slot:hover .preset-delete {
    opacity: 1;
  }

  .bezier-string {
    font-family: monospace;
    font-size: 10px;
    color: #666;
    text-align: center;
  }

  .apply-row {
    display: flex;
    gap: 6px;
    width: 100%;
    align-items: center;
  }

  .auto-apply-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: #888;
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
  }

  .auto-apply-toggle input[type="checkbox"] {
    accent-color: #f5a623;
    margin: 0;
    cursor: pointer;
  }

  .apply-btn {
    flex: 1;
    padding: 8px 0;
    border-radius: 4px;
    background: #f5a623;
    color: #1a1a1a;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    text-align: center;
    box-sizing: border-box;
    transition: background 0.15s;
  }

  .apply-btn:hover {
    background: #ffb84d;
  }

  .apply-btn:active {
    background: #e09520;
  }

  .has-tip {
    position: relative;
  }

  .has-tip::after {
    content: attr(data-tip);
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    padding: 3px 7px;
    border-radius: 3px;
    background: #333;
    color: #ccc;
    font-size: 10px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
    transition-delay: 0s;
  }

  .has-tip:hover::after {
    opacity: 1;
    transition-delay: 0.4s;
  }

</style>
