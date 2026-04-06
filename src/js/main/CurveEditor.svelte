<script lang="ts">
  import { onMount } from "svelte";

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

  // Get value at a given time (0-1) from cubic-bezier(x1, 0, x2, 1)
  function bezierValue(time: number, x1: number, x2: number): number {
    if (time <= 0) return 0;
    if (time >= 1) return 1;
    const t = solveBezierT(time, x1, x2);
    const mt = 1 - t;
    return 3 * mt * t * t + t * t * t;
  }

  function computeSpeedGraph(x1: number, x2: number, samples: number): Array<{time: number, speed: number}> {
    const dt = 0.002;
    const points: Array<{time: number, speed: number}> = [];
    for (let i = 0; i <= samples; i++) {
      const time = i / samples;
      const tLo = Math.max(0, time - dt);
      const tHi = Math.min(1, time + dt);
      const vLo = bezierValue(tLo, x1, x2);
      const vHi = bezierValue(tHi, x1, x2);
      const speed = (tHi > tLo) ? (vHi - vLo) / (tHi - tLo) : 0;
      points.push({ time, speed });
    }
    return points;
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
    const points = computeSpeedGraph(x1, x2, 400);

    // Find max speed for normalization (auto-scale Y axis like AE)
    let maxSpeed = 0;
    for (const pt of points) {
      if (pt.speed > maxSpeed) maxSpeed = pt.speed;
    }
    if (maxSpeed < 0.01) maxSpeed = 1; // avoid division by zero for edge cases

    // Build canvas-space points
    const canvasPoints: Array<[number, number]> = points.map(pt => {
      const ny = (pt.speed / maxSpeed) * 0.9; // scale to 90% of canvas height
      return toCanvas(pt.time, ny);
    });

    const [startX, startY] = toCanvas(0, 0);
    const [endX, endY] = toCanvas(1, 0);

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

    // Curve stroke
    ctx.strokeStyle = "#4a9eff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(canvasPoints[0][0], canvasPoints[0][1]);
    for (let i = 1; i < canvasPoints.length; i++) {
      ctx.lineTo(canvasPoints[i][0], canvasPoints[i][1]);
    }
    ctx.stroke();

    // Endpoint dots at baseline
    for (const [dotX, dotY] of [[startX, startY], [endX, endY]]) {
      ctx.fillStyle = "#666";
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
      ctx.fill();
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
      const deltaY = (graphDragStart.normY - norm.y) * 100;
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
    console.log("Apply easing:", bezierString, { p1, p2 });
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
    draw();
  });

  onMount(() => {
    // Bind mouse events directly to DOM for CEP compatibility
    canvasEl.addEventListener("mousedown", onMouseDown);
    // mousemove and mouseup on window so drag continues outside canvas
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    draw();

    return () => {
      canvasEl.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
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
