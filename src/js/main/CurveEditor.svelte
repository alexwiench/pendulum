<script lang="ts">
  import { onMount } from "svelte";

  // --- State ---
  let p1 = $state({ x: 0.25, y: 0.1 });
  let p2 = $state({ x: 0.25, y: 1.0 });
  let dragging: "p1" | "p2" | null = $state(null);
  let hovering: "p1" | "p2" | null = $state(null);
  let canvasEl: HTMLCanvasElement;

  let bezierString = $derived(
    `cubic-bezier(${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}, ${p2.x.toFixed(2)}, ${p2.y.toFixed(2)})`
  );

  // --- Constants ---
  const SIZE = 250;
  const PAD = 20;
  const DRAW = SIZE - PAD * 2; // 210
  const HIT_RADIUS = 12;

  // --- Presets ---
  const PRESETS = [
    { label: "Linear", p1: { x: 0.25, y: 0.25 }, p2: { x: 0.75, y: 0.75 } },
    { label: "Ease In", p1: { x: 0.42, y: 0.0 }, p2: { x: 1.0, y: 1.0 } },
    { label: "Ease Out", p1: { x: 0.0, y: 0.0 }, p2: { x: 0.58, y: 1.0 } },
    { label: "In-Out", p1: { x: 0.42, y: 0.0 }, p2: { x: 0.58, y: 1.0 } },
    { label: "Overshoot", p1: { x: 0.18, y: 0.89 }, p2: { x: 0.32, y: 1.28 } },
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

    // Diagonal reference line (linear)
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

    // Bezier curve
    const [cx0, cy0] = toCanvas(0, 0);
    const [cx1, cy1] = toCanvas(p1.x, p1.y);
    const [cx2, cy2] = toCanvas(p2.x, p2.y);
    const [cx3, cy3] = toCanvas(1, 1);

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
    for (const [ex, ey] of [
      [cx0, cy0],
      [cx3, cy3],
    ]) {
      ctx.fillStyle = "#666";
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Handle circles
    drawHandle(ctx, cx1, cy1, "p1");
    drawHandle(ctx, cx2, cy2, "p2");
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
    const hit = hitTest(pos);
    if (hit) {
      dragging = hit;
    }
  }

  function onMouseMove(e: MouseEvent) {
    if (!canvasEl) return;
    const pos = getCanvasPos(e);
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
    if (dragging) {
      dragging = null;
    }
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    p1 = { ...preset.p1 };
    p2 = { ...preset.p2 };
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
    hovering;
    dragging;
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
  <canvas
    bind:this={canvasEl}
    class="curve-canvas"
    style="width: {SIZE}px; height: {SIZE}px; cursor: {dragging
      ? 'grabbing'
      : hovering
        ? 'grab'
        : 'crosshair'};"
  ></canvas>

  <div class="presets">
    {#each PRESETS as preset}
      <button
        class="preset-btn"
        onclick={() => applyPreset(preset)}
      >
        {preset.label}
      </button>
    {/each}
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
