<script lang="ts">
  import { computeSpeedGraph, sampleBezierCurve, hexToRgb } from './curve-math';
  import { settings } from './settings.svelte';

  let { x1, y1, x2, y2, size, onclick, viewMode = "graph" }: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    size: number;
    onclick: () => void;
    viewMode?: "curve" | "graph";
  } = $props();

  let canvas: HTMLCanvasElement;

  function drawGraph() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, size, size);

    // Compute speed graph
    const points = computeSpeedGraph(x1, y1, x2, y2, 60);
    let maxSpeed = 0;
    for (const p of points) {
      if (p.speed > maxSpeed) maxSpeed = p.speed;
    }
    if (maxSpeed === 0) maxSpeed = 1;

    const { r, g, b } = settings.graphColor;

    // Build curve path
    ctx.beginPath();
    ctx.moveTo(0, size);
    for (const p of points) {
      const px = p.time * size;
      const py = size - (p.speed / maxSpeed) * size * 0.85;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(size, size);
    ctx.closePath();

    // Fill
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
    ctx.fill();

    // Stroke
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const px = points[i].time * size;
      const py = size - (points[i].speed / maxSpeed) * size * 0.85;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawCurve() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, size, size);

    const rgb = hexToRgb(settings.curveColor);
    const r = rgb?.r ?? 245;
    const g = rgb?.g ?? 166;
    const b = rgb?.b ?? 35;

    // Auto-scale Y viewport to actual curve range (linear, like AE)
    const samples = sampleBezierCurve(x1, y1, x2, y2, 30);
    let lo = 0, hi = 1;
    for (const p of samples) {
      if (p.y < lo) lo = p.y;
      if (p.y > hi) hi = p.y;
    }
    lo = Math.min(lo, y1, y2);
    hi = Math.max(hi, y1, y2);
    const span = hi - lo;
    const viewMin = lo - span * 0.1;
    const viewMax = hi + span * 0.1;
    const viewSpan = viewMax - viewMin;

    function toX(nx: number): number {
      return nx * size;
    }
    function toY(ny: number): number {
      return ((viewMax - ny) / viewSpan) * size;
    }

    // Faint diagonal reference line (0,0) -> (1,1)
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(0));
    ctx.lineTo(toX(1), toY(1));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Sample the bezier for fill polygon
    const fillPts = sampleBezierCurve(x1, y1, x2, y2, 60);

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(0));
    for (const p of fillPts) {
      ctx.lineTo(toX(p.x), toY(p.y));
    }
    ctx.lineTo(toX(1), toY(0));
    ctx.closePath();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
    ctx.fill();

    // Draw the bezier curve via bezierCurveTo
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(0));
    ctx.bezierCurveTo(toX(x1), toY(y1), toX(x2), toY(y2), toX(1), toY(1));
    ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  $effect(() => {
    // Track bezier control points
    x1; y1; x2; y2;
    // Track the relevant color based on mode
    if (viewMode === "curve") {
      settings.curveColor;
      drawCurve();
    } else {
      settings.graphColor.r;
      settings.graphColor.g;
      settings.graphColor.b;
      drawGraph();
    }
  });
</script>

<canvas
  bind:this={canvas}
  style="width: {size}px; height: {size}px; border-radius: 3px; cursor: pointer;"
  {onclick}
></canvas>

<style>
  canvas {
    border: 1px solid transparent;
    transition: border-color 0.15s;
  }
  canvas:hover {
    border-color: #444;
  }
</style>
