<script lang="ts">
  import { onMount } from "svelte";
  import { flip } from "svelte/animate";
  import { slide } from "svelte/transition";
  import { evalTS } from "../lib/utils/bolt";
  import { settings } from "./settings.svelte";
  import { presets } from "./presets.svelte";
  import { computeSpeedGraph, findPeakTime } from "./curve-math";
  import AnchorGrid from "./AnchorGrid.svelte";
  import PresetThumbnail from "./PresetThumbnail.svelte";

  let { onOpenSettings }: { onOpenSettings: () => void } = $props();

  // --- State ---
  let graphDragStart: { normX: number; normY: number; infl: number; out: number } | null = $state(null);
  let graphDragging = $derived(graphDragStart !== null);
  let graphHandleDragging: "in" | "out" | null = $state(null);
  let graphHovering: "in" | "out" | null = $state(null);


  const GRID_GAP = 3;
  const GRID_COLS = 2;
  const GRID_ROWS = 5;
  const ROW_GAP = 4;
  let gridCellSize = $derived(Math.floor((containerWidth - (GRID_COLS + GRID_ROWS - 2) * GRID_GAP - ROW_GAP) / (GRID_COLS + GRID_ROWS)));
  let canvasWidth = $derived(gridCellSize * GRID_ROWS + GRID_GAP * (GRID_ROWS - 1));

  let canvasEl: HTMLCanvasElement;
  let containerWidth = $state(0);

  // Influence state (0–100, default 50 = smooth ease)
  let influenceIn = $state(50.0);
  let influenceOut = $state(50.0);

  const GRAPH_SAMPLES = 150;

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

  // --- Drag-to-favorites state ---
  let draggingPreset: { x1: number; y1: number; x2: number; y2: number } | null = $state(null);
  let dragPos = $state({ x: 0, y: 0 });
  let dragStartPos = $state({ x: 0, y: 0 });
  let dragActive = $state(false);
  let dragOverFavorites = $state(false);
  let favoritesRowEl: HTMLDivElement = $state(null!);
  let clickSuppressed = $state(false);

  // --- Favorites UI state ---
  let favoritesExpanded = $state(false);
  let editingFavoriteId: string | null = $state(null);

  // --- Favorites reorder drag state ---
  let reorderDragIndex: number | null = $state(null);
  let reorderTargetIndex: number | null = $state(null);
  let reorderDragActive = $state(false);

  const PRESET_DRAG_THRESHOLD = 5;
  const FAVORITES_COLLAPSED_ROWS = 2;

  function startPresetDrag(preset: { x1: number; y1: number; x2: number; y2: number }, e: MouseEvent) {
    if (e.button !== 0) return;

    draggingPreset = preset;
    dragStartPos = { x: e.clientX, y: e.clientY };
    dragPos = { x: e.clientX, y: e.clientY };
    dragActive = false;
    clickSuppressed = false;

    let favRect: DOMRect | null = null;

    const onMove = (ev: MouseEvent) => {
      dragPos.x = ev.clientX;
      dragPos.y = ev.clientY;
      if (!dragActive) {
        const dx = ev.clientX - dragStartPos.x;
        const dy = ev.clientY - dragStartPos.y;
        if (dx * dx + dy * dy > PRESET_DRAG_THRESHOLD * PRESET_DRAG_THRESHOLD) {
          dragActive = true;
          clickSuppressed = true;
          if (favoritesRowEl) favRect = favoritesRowEl.getBoundingClientRect();
        }
      }
      if (dragActive && favRect) {
        dragOverFavorites =
          ev.clientX >= favRect.left && ev.clientX <= favRect.right &&
          ev.clientY >= favRect.top && ev.clientY <= favRect.bottom;
      }
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (dragActive && dragOverFavorites && draggingPreset) {
        settings.addFavorite(draggingPreset);
      }
      draggingPreset = null;
      dragActive = false;
      dragOverFavorites = false;
      setTimeout(() => { clickSuppressed = false; }, 0);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startFavoriteReorder(index: number, e: MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;
    reorderDragIndex = index;
    reorderTargetIndex = index;
    reorderDragActive = false;

    let slotCenters: Array<{ cx: number; cy: number }> = [];

    const onMove = (ev: MouseEvent) => {
      if (!active) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (dx * dx + dy * dy > PRESET_DRAG_THRESHOLD * PRESET_DRAG_THRESHOLD) {
          active = true;
          reorderDragActive = true;
          const els = favoritesRowEl.querySelectorAll<HTMLElement>('.favorite-slot:not(.favorite-drop-placeholder)');
          slotCenters = Array.from(els).map((el) => {
            const rect = el.getBoundingClientRect();
            return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
          });
        } else return;
      }
      let closest = index;
      let closestDist = Infinity;
      for (let i = 0; i < slotCenters.length; i++) {
        const dist = Math.abs(ev.clientX - slotCenters[i].cx) + Math.abs(ev.clientY - slotCenters[i].cy);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      }
      reorderTargetIndex = closest;
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (active && reorderDragIndex !== null && reorderTargetIndex !== null && reorderDragIndex !== reorderTargetIndex) {
        settings.reorderFavorites(reorderDragIndex, reorderTargetIndex);
      }
      reorderDragIndex = null;
      reorderTargetIndex = null;
      reorderDragActive = false;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function focusRenameInput(el: HTMLInputElement) {
    el.focus();
    el.select();
  }

  function scrollOverflow(el: HTMLElement) {
    const slot = el.closest('.favorite-slot') as HTMLElement | null;
    const target = slot ?? el.parentElement;
    let anim: Animation | null = null;

    function getOverflow() {
      const parent = el.parentElement;
      if (!parent) return 0;
      return el.scrollWidth - parent.clientWidth;
    }

    function onEnter() {
      const overflow = getOverflow();
      if (overflow <= 1) return;
      const dur = Math.max(800, overflow * 50);
      anim = el.animate(
        [{ transform: 'translateX(0)' }, { transform: `translateX(-${overflow}px)` }],
        { duration: dur, delay: 300, iterations: Infinity, direction: 'alternate', easing: 'linear' },
      );
    }

    function onLeave() {
      if (anim) { anim.cancel(); anim = null; }
      el.style.transform = '';
    }

    target?.addEventListener('mouseenter', onEnter);
    target?.addEventListener('mouseleave', onLeave);

    return {
      destroy() {
        if (anim) anim.cancel();
        target?.removeEventListener('mouseenter', onEnter);
        target?.removeEventListener('mouseleave', onLeave);
      }
    };
  }

  // Cached speed graph computations — only recompute when bezier params change
  let cachedPoints = $derived(computeSpeedGraph(influenceIn / 100, 0, 1 - influenceOut / 100, 1, GRAPH_SAMPLES));
  let cachedGhostPoints = $derived(ghostCurves.map(g => computeSpeedGraph(g.x1, g.y1, g.x2, g.y2, GRAPH_SAMPLES)));
  let playheadPos: number | null = $state(null); // rendered position (animated)
  let playheadTarget: number | null = null; // where we're heading (-0.05/1.05 for exit animation)
  let playheadRaf: number | null = null;
  let keySpan: { t1: number; t2: number } | null = null;
  let playheadInterval: ReturnType<typeof setInterval> | null = null;
  let playheadPollPending = false;

  let drawRaf: number | null = null;

  let bezierString = $derived(
    `cubic-bezier(${(influenceIn / 100).toFixed(2)}, 0.00, ${(1 - influenceOut / 100).toFixed(2)}, 1.00)`
  );

  let copyFeedback = $state(false);
  let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  let pasteInputEl: HTMLInputElement;

  function copyToClipboard(text: string) {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }

  function copyBezier() {
    copyToClipboard(bezierString);
    copyFeedback = true;
    if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = setTimeout(() => { copyFeedback = false; }, 800);
  }

  function parseBezierString(str: string): { x1: number; x2: number } | null {
    const m = str.match(/cubic-bezier\(\s*([\d.]+)\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*,\s*[\d.]+\s*\)/);
    if (!m) return null;
    const x1 = parseFloat(m[1]);
    const x2 = parseFloat(m[2]);
    if (isNaN(x1) || isNaN(x2) || x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return null;
    return { x1, x2 };
  }

  function handlePaste(text: string) {
    const parsed = parseBezierString(text.trim());
    if (!parsed) return;
    loadPreset({ x1: parsed.x1, y1: 0, x2: parsed.x2, y2: 1 });
  }

  // --- Canvas dimensions (fill container width) ---
  let SIZE = $derived(containerWidth > 0 ? canvasWidth : 250);
  const PAD = 10;
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

  // Color based on frame density — blue when plenty of frames, red when sparse
  function speedToColor(normalizedSpeed: number, totalFrames: number, alpha = 1): string {
    const frameDensity = totalFrames / Math.max(normalizedSpeed, 0.01);
    const t = Math.max(0, Math.min(1, 1 - (frameDensity - 3) / 5));
    const lo = settings.graphColor;
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

    drawGraphMode(ctx);
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

  function drawGraphMode(ctx: CanvasRenderingContext2D) {
    const points = cachedPoints;
    const allGhostPoints = cachedGhostPoints;

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

    // Per-segment colored stroke (batched by color)
    ctx.lineWidth = 2.5;
    let batchColor = "";
    ctx.beginPath();
    for (let i = 1; i < canvasPoints.length; i++) {
      const avgSpd = (points[i - 1].speed + points[i].speed) / 2;
      const color = speedToColor(avgSpd, totalFrames);
      if (color !== batchColor) {
        if (batchColor) ctx.stroke();
        batchColor = color;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(canvasPoints[i - 1][0], canvasPoints[i - 1][1]);
      }
      ctx.lineTo(canvasPoints[i][0], canvasPoints[i][1]);
    }
    if (batchColor) ctx.stroke();

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
    id: "in" | "out"
  ) {
    const active = graphHandleDragging === id || graphHovering === id;
    const radius = active ? 5 : 4;

    if (active) {
      ctx.fillStyle = "rgba(245, 166, 35, 0.2)";
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#f5a623";
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

    const handleHit = graphHandleHitTest(pos);
    if (handleHit) {
      graphHandleDragging = handleHit;
      return;
    }
    const norm = fromCanvas(pos.x, pos.y);
    graphDragStart = { normX: norm.x, normY: norm.y, infl: influenceIn, out: influenceOut };
  }

  function onMouseMove(e: MouseEvent) {
    if (!canvasEl) return;
    const pos = getCanvasPos(e);

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
    const deltaY = (norm.y - graphDragStart.normY) * 100;
    const deltaX = (norm.x - graphDragStart.normX) * 60;
    influenceIn = Math.max(0, Math.min(100, graphDragStart.infl + deltaY + deltaX));
    influenceOut = Math.max(0, Math.min(100, graphDragStart.out + deltaY - deltaX));
  }

  function onMouseUp() {
    const wasDragging = graphDragging || graphHandleDragging;
    if (graphDragging) {
      graphDragStart = null;
    }
    if (graphHandleDragging) {
      graphHandleDragging = null;
    }
    if (settings.autoApply && wasDragging) {
      handleApply();
    }
  }

  function getCurrentBezier(): { x1: number; y1: number; x2: number; y2: number } {
    return { x1: influenceIn / 100, y1: 0, x2: 1 - influenceOut / 100, y2: 1 };
  }

  function saveCurrentAsPreset() {
    presets.add({ ...getCurrentBezier(), source: "user" });
  }

  function saveGhostsAsPresets() {
    for (const g of ghostCurves) {
      presets.add({ x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, source: "ghost", name: g.name });
    }
  }

  function loadPreset(preset: { x1: number; y1: number; x2: number; y2: number }) {
    influenceIn = preset.x1 * 100;
    influenceOut = (1 - preset.x2) * 100;
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
    cachedPoints;
    cachedGhostPoints;
    graphDragging;
    graphHovering;
    graphHandleDragging;
    ghostOpacity;
    playheadPos;
    SIZE;
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

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "c") { copyBezier(); }
    };
    window.addEventListener("keydown", onKeyDown);

    scheduleDraw();
    loadExistingEasing();

    // Poll for keyframe selection changes
    const pollInterval = setInterval(loadExistingEasing, settings.selectionPollInterval);

    return () => {
      canvasEl.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
      clearInterval(pollInterval);
      stopPlayheadPoll();
      if (drawRaf) cancelAnimationFrame(drawRaf);
      if (ghostFadeRaf) cancelAnimationFrame(ghostFadeRaf);
      if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
    };
  });
</script>

<div class="curve-editor" bind:clientWidth={containerWidth}>
  <div class="graph-row">
    <canvas
      bind:this={canvasEl}
      class="curve-canvas"
      style="width: {canvasWidth}px; height: {canvasWidth}px; cursor: {graphHandleDragging ? 'ew-resize' : graphHovering ? 'ew-resize' : graphDragging ? 'grabbing' : 'grab'};"
    ></canvas>
    <div class="side-grid" style="grid-template-columns: repeat({GRID_COLS}, {gridCellSize}px); grid-template-rows: repeat({GRID_ROWS}, {gridCellSize}px);">
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

  {#if !settings.autoApply}
    <button class="apply-btn" onclick={handleApply}>Apply</button>
  {/if}

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
        <div class="preset-slot" animate:flip={{ duration: 250 }} onmousedown={(e) => startPresetDrag(preset, e)}>
          <PresetThumbnail
            x1={preset.x1} y1={preset.y1}
            x2={preset.x2} y2={preset.y2}
            size={PRESET_SIZE}
            onclick={() => { if (!clickSuppressed) loadPreset(preset); }}
          />
          <button class="preset-delete" onclick={() => presets.remove(preset.id)}>&times;</button>
        </div>
      {/each}
    </div>
  </div>

  <div
    class="favorites-section"
    class:drag-over={dragOverFavorites}
    class:dragging={dragActive}
    bind:this={favoritesRowEl}
  >
    {#if settings.favorites.length === 0 && !dragActive}
      <div class="favorites-empty">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M8 2.5l1.7 3.5 3.8.5-2.75 2.7.65 3.8L8 11.2 4.6 13l.65-3.8L2.5 6.5l3.8-.5z" />
        </svg>
        <span>Drag presets here to favorite</span>
      </div>
    {:else}
      <div
        class="favorites-grid"
        class:expanded={favoritesExpanded}
        style="--collapsed-rows: {FAVORITES_COLLAPSED_ROWS}; --item-size: {PRESET_SIZE + 20}px;"
      >
        {#if dragActive}
          <div class="favorite-slot favorite-drop-placeholder">
            <div class="favorite-thumb placeholder-thumb">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#555" stroke-width="1.5">
                <line x1="8" y1="4" x2="8" y2="12" />
                <line x1="4" y1="8" x2="12" y2="8" />
              </svg>
            </div>
            <span class="favorite-name" style="color: #555;">Drop here</span>
          </div>
        {/if}
        {#each settings.favorites as fav, i (fav.id)}
          <div
            class="favorite-slot"
            class:reorder-dragging={reorderDragActive && reorderDragIndex === i}
            class:reorder-target={reorderDragActive && reorderTargetIndex === i && reorderDragIndex !== i}
            animate:flip={{ duration: 250 }}
            onmousedown={(e) => { if (editingFavoriteId !== fav.id) startFavoriteReorder(i, e); }}
          >
            <div class="favorite-thumb" style="border-color: rgb({fav.color.r}, {fav.color.g}, {fav.color.b});">
              <PresetThumbnail
                x1={fav.x1} y1={fav.y1}
                x2={fav.x2} y2={fav.y2}
                size={PRESET_SIZE}
                color={fav.color}
                onclick={() => { if (!reorderDragActive) loadPreset(fav); }}
              />
            </div>
            {#if editingFavoriteId === fav.id}
              <input
                class="favorite-name-input"
                style="color: rgb({fav.color.r}, {fav.color.g}, {fav.color.b});"
                value={fav.name}
                maxlength="24"
                use:focusRenameInput
                onmousedown={(e) => e.stopPropagation()}
                onblur={(e) => {
                  const related = e.relatedTarget as HTMLElement | null;
                  const slot = (e.target as HTMLElement).closest('.favorite-slot');
                  if (related && slot?.contains(related)) return;
                  settings.renameFavorite(fav.id, (e.target as HTMLInputElement).value.trim() || fav.name); editingFavoriteId = null;
                }}
                onkeydown={(e) => {
                  if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                  if (e.key === 'Escape') { editingFavoriteId = null; }
                }}
              />
              <button
                class="favorite-color-btn"
                style="background: rgb({fav.color.r}, {fav.color.g}, {fav.color.b});"
                onmousedown={(e) => e.stopPropagation()}
                onclick={(e) => { e.stopPropagation(); settings.cycleFavoriteColor(fav.id); }}
              ></button>
              <button class="favorite-delete" onmousedown={(e) => e.stopPropagation()} onclick={() => settings.removeFavorite(fav.id)}>&times;</button>
            {:else}
              <span
                class="favorite-name"
                style="color: rgb({fav.color.r}, {fav.color.g}, {fav.color.b});"
                onmousedown={(e) => e.stopPropagation()}
                ondblclick={() => { editingFavoriteId = fav.id; }}
              ><span class="favorite-name-inner" use:scrollOverflow>{fav.name}</span></span>
            {/if}
          </div>
        {/each}
      </div>
      {#if settings.favorites.length > 0}
        {@const itemsPerRow = Math.max(1, Math.floor((containerWidth + 2) / (PRESET_SIZE + 20 + 2)))}
        {@const totalRows = Math.ceil(settings.favorites.length / itemsPerRow)}
        {#if totalRows > FAVORITES_COLLAPSED_ROWS}
          <button class="favorites-expand-btn" onclick={() => { favoritesExpanded = !favoritesExpanded; }}>
            {favoritesExpanded ? "Show less" : `+${settings.favorites.length - itemsPerRow * FAVORITES_COLLAPSED_ROWS} more`}
          </button>
        {/if}
      {/if}
    {/if}
  </div>

  {#if dragActive && draggingPreset}
    <div class="drag-preview" style="left: {dragPos.x}px; top: {dragPos.y}px;">
      <PresetThumbnail
        x1={draggingPreset.x1} y1={draggingPreset.y1}
        x2={draggingPreset.x2} y2={draggingPreset.y2}
        size={PRESET_SIZE}
        onclick={() => {}}
      />
    </div>
  {/if}

  <div class="bezier-string-wrap"
    onmouseenter={() => pasteInputEl?.focus()}
    onmouseleave={() => pasteInputEl?.blur()}
  >
    <button class="bezier-string has-tip" data-tip="Click to copy, Cmd+V to paste" onclick={copyBezier}>{copyFeedback ? "Copied!" : bezierString}</button>
    <input
      bind:this={pasteInputEl}
      class="paste-input"
      onpaste={(e) => { const text = e.clipboardData?.getData("text/plain"); if (text) handlePaste(text); e.preventDefault(); }}
    />
  </div>

  <div class="apply-row">
    <button class="gear-btn" onclick={onOpenSettings}>
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d={(() => {
          const cx = 8, cy = 8, teeth = 6, outerR = 6.4, innerR = 4.5;
          let d = '';
          for (let i = 0; i < teeth; i++) {
            const a1 = (i / teeth) * Math.PI * 2 - Math.PI / 2;
            const a2 = ((i + 0.35) / teeth) * Math.PI * 2 - Math.PI / 2;
            const a3 = ((i + 0.5) / teeth) * Math.PI * 2 - Math.PI / 2;
            const a4 = ((i + 0.85) / teeth) * Math.PI * 2 - Math.PI / 2;
            const cmd = i === 0 ? 'M' : 'L';
            d += `${cmd}${cx + Math.cos(a1) * innerR},${cy + Math.sin(a1) * innerR} `;
            d += `L${cx + Math.cos(a2) * outerR},${cy + Math.sin(a2) * outerR} `;
            d += `L${cx + Math.cos(a3) * outerR},${cy + Math.sin(a3) * outerR} `;
            d += `L${cx + Math.cos(a4) * innerR},${cy + Math.sin(a4) * innerR} `;
          }
          return d + 'Z M6,8a2,2 0 1,0 4,0a2,2 0 1,0 -4,0Z';
        })()}/>
      </svg>
    </button>
  </div>
</div>

<style lang="scss">
  .curve-editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  .graph-row {
    display: flex;
    gap: 4px;
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
    cursor: grab;
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

  /* --- Favorites --- */
  .favorites-section {
    width: 100%;
    border: 1px dashed #333;
    border-radius: 4px;
    padding: 4px;
    min-height: 32px;
    transition: border-color 0.2s, background 0.2s;
  }

  .favorites-section.dragging {
    border-color: #555;
    background: rgba(245, 166, 35, 0.03);
  }

  .favorites-section.drag-over {
    border-color: #f5a623;
    background: rgba(245, 166, 35, 0.08);
  }

  .favorites-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 24px;
    color: #444;
    font-size: 9px;
    user-select: none;
  }

  .favorites-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    overflow: hidden;
    max-height: calc(var(--collapsed-rows) * (var(--item-size) + 2px));
    transition: max-height 0.25s ease;
  }

  .favorites-grid.expanded {
    max-height: none;
    overflow-y: auto;
  }

  .favorite-slot {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: var(--item-size);
    flex-shrink: 0;
  }

  .favorite-thumb {
    border-radius: 4px;
    border: 1.5px solid;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .placeholder-thumb {
    width: 28px;
    height: 28px;
    border-style: dashed;
    border-color: #555;
    background: #1a1a1a;
  }

  .favorite-name {
    font-size: 9px;
    max-width: calc(100% - 6px);
    overflow: hidden;
    white-space: nowrap;
    opacity: 0.7;
    cursor: default;
    user-select: none;
    text-align: center;
    line-height: 15px;
  }

  .favorite-name-inner {
    display: inline-block;
  }

  .favorite-name-input {
    font-size: 9px;
    max-width: 100%;
    width: 100%;
    background: #252525;
    border: 1px solid #444;
    border-radius: 2px;
    text-align: center;
    padding: 0 2px;
    line-height: 15px;
    outline: none;
  }

  .favorite-color-btn {
    position: absolute;
    top: 0px;
    left: 0px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid #1a1a1a;
    padding: 0;
    cursor: pointer;
    transition: transform 0.1s;
  }

  .favorite-color-btn:hover {
    transform: scale(1.2);
  }

  .favorite-delete {
    position: absolute;
    top: 0px;
    right: 0px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #d44;
    color: white;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    border: 1.5px solid #1a1a1a;
    transition: transform 0.1s;
  }

  .favorite-delete:hover {
    transform: scale(1.2);
  }

  .favorites-expand-btn {
    width: 100%;
    background: none;
    border: none;
    color: #666;
    font-size: 9px;
    cursor: pointer;
    padding: 2px 0;
    transition: color 0.15s;
  }

  .favorites-expand-btn:hover {
    color: #f5a623;
  }

  .favorite-drop-placeholder {
    opacity: 0.5;
  }

  .favorite-slot.reorder-dragging {
    opacity: 0.3;
  }

  .favorite-slot.reorder-target {
    outline: 1px dashed #f5a623;
    outline-offset: 1px;
    border-radius: 3px;
  }

  .drag-preview {
    position: fixed;
    pointer-events: none;
    z-index: 9999;
    opacity: 0.8;
    transform: translate(-50%, -50%);
  }

  .bezier-string-wrap {
    position: relative;
    width: 100%;
  }

  .paste-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    padding: 0;
    border: none;
    pointer-events: none;
  }

  .bezier-string {
    font-family: monospace;
    font-size: 10px;
    color: #888;
    text-align: center;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
    width: 100%;
    transition: color 0.15s, background 0.15s;
  }

  .bezier-string:hover {
    color: #f5a623;
    background: #333;
  }

  .apply-row {
    display: flex;
    gap: 6px;
    width: 100%;
    align-items: center;
  }

  .gear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    margin-left: auto;
    flex-shrink: 0;
    border-radius: 4px;
    background: transparent;
    color: #555;
    cursor: pointer;
    padding: 0;
    transition: color 0.15s;
  }

  .gear-btn:hover {
    color: #f5a623;
  }

  .apply-btn {
    width: 100%;
    padding: 6px 0;
    border-radius: 4px;
    border: none;
    background: #f5a623;
    color: #1a1a1a;
    font-weight: 600;
    font-size: 11px;
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
