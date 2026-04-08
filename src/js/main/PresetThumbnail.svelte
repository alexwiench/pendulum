<script lang="ts">
  import { computeSpeedGraph } from './curve-math';
  import { settings } from './settings.svelte';

  let { x1, y1, x2, y2, size, onclick }: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    size: number;
    onclick: () => void;
  } = $props();

  let canvas: HTMLCanvasElement;

  function draw() {
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

  $effect(() => {
    x1; y1; x2; y2;
    settings.graphColor.r;
    settings.graphColor.g;
    settings.graphColor.b;
    draw();
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
