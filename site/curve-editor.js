// Pendulum — faithful recreation of the actual AE plugin CurveEditor.
// Underlying curve: cubic-bezier(x1, 0, x2, 1). We plot its DERIVATIVE
// (speed over time). Handles slide on the baseline at x1*0.45 and 1-(1-x2)*0.45.
(function () {
  const canvas = document.getElementById('curveCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const wrap = canvas.parentElement;
  const readout = document.getElementById('curveReadout');
  const presetBar = document.getElementById('presetBar');

  let DPR = window.devicePixelRatio || 1;
  let W = 0, H = 0;
  const PAD = { t: 28, r: 28, b: 40, l: 28 };
  const SAMPLES = 150;
  const DT = 0.002;
  const HIT_RADIUS = 12;

  // ───── cubic-bezier math (matches curve-math.ts) ─────
  function sampleBezier(t, v0, v1, v2, v3) {
    const mt = 1 - t;
    return mt * mt * mt * v0 + 3 * mt * mt * t * v1 + 3 * mt * t * t * v2 + t * t * t * v3;
  }

  function solveBezierT(targetX, x1, x2) {
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

  function bezierValue(time, x1, y1, x2, y2) {
    if (time <= 0) return 0;
    if (time >= 1) return 1;
    const t = solveBezierT(time, x1, x2);
    return sampleBezier(t, 0, y1, y2, 1);
  }

  function computeSpeedGraph(x1, y1, x2, y2, samples) {
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const time = i / samples;
      const tLo = Math.max(0, time - DT);
      const tHi = Math.min(1, time + DT);
      const vLo = bezierValue(tLo, x1, y1, x2, y2);
      const vHi = bezierValue(tHi, x1, y1, x2, y2);
      const speed = tHi > tLo ? (vHi - vLo) / (tHi - tLo) : 0;
      pts.push({ time, speed });
    }
    return pts;
  }

  function findPeakTime(pts) {
    let peakTime = 0, peakSpeed = 0;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].speed > peakSpeed) {
        peakSpeed = pts[i].speed;
        peakTime = pts[i].time;
      }
    }
    return peakTime;
  }

  // ───── Coordinate mapping ─────
  function toCanvas(nx, ny) {
    const drawW = W - PAD.l - PAD.r;
    const drawH = H - PAD.t - PAD.b;
    return [PAD.l + nx * drawW, (H - PAD.b) - ny * drawH];
  }

  function fromCanvas(cx, cy) {
    const drawW = W - PAD.l - PAD.r;
    const drawH = H - PAD.t - PAD.b;
    if (drawW <= 0 || drawH <= 0) return { x: 0, y: 0 };
    return {
      x: (cx - PAD.l) / drawW,
      y: ((H - PAD.b) - cy) / drawH,
    };
  }

  // ───── State ─────
  let influenceIn = 50.0;
  let influenceOut = 50.0;
  let targetIn = influenceIn;
  let targetOut = influenceOut;

  // Match the plugin's exact colors
  const GRAPH_COLOR = { r: 74, g: 158, b: 255 };
  const MAX_SPEED_COLOR = { r: 255, g: 74, b: 74 };
  let activeColor = { r: GRAPH_COLOR.r, g: GRAPH_COLOR.g, b: GRAPH_COLOR.b };
  let targetColor = { ...activeColor };

  // Simulated short keyframe span (frames available between two keyframes)
  const TOTAL_FRAMES = 20;

  // Drag state
  let dragging = null; // 'in' | 'out' | 'graph'
  let graphDragStart = null;

  // ───── Color helper (exact plugin formula) ─────
  // Colors by frame density: blue when plenty of frames per unit speed,
  // red when sparse. RAW speed is passed, NOT normalized by maxSpeed.
  function speedToColor(rawSpeed, alpha) {
    const frameDensity = TOTAL_FRAMES / Math.max(rawSpeed, 0.01);
    const t = Math.max(0, Math.min(1, 1 - (frameDensity - 3) / 5));
    const lo = activeColor;
    const hi = MAX_SPEED_COLOR;
    const r = Math.round(lo.r + (hi.r - lo.r) * t);
    const g = Math.round(lo.g + (hi.g - lo.g) * t);
    const b = Math.round(lo.b + (hi.b - lo.b) * t);
    return alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${alpha})` : `rgb(${r}, ${g}, ${b})`;
  }

  // ───── Resize ─────
  function resize() {
    DPR = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  // ───── Pointer helpers ─────
  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  }

  function getHandlePositions() {
    const inPos = toCanvas(influenceIn / 100 * 0.45, 0);
    const outPos = toCanvas(1 - influenceOut / 100 * 0.45, 0);
    return { inPos, outPos };
  }

  function hitTest(pos) {
    const { inPos, outPos } = getHandlePositions();
    const dIn = Math.hypot(pos.x - inPos[0], pos.y - inPos[1]);
    const dOut = Math.hypot(pos.x - outPos[0], pos.y - outPos[1]);
    if (dIn <= HIT_RADIUS && dOut <= HIT_RADIUS) {
      return dIn <= dOut ? 'in' : 'out';
    }
    if (dIn <= HIT_RADIUS) return 'in';
    if (dOut <= HIT_RADIUS) return 'out';
    return null;
  }

  // ───── Interaction ─────
  function onDown(e) {
    const pos = pointerPos(e);
    const handle = hitTest(pos);
    if (handle) {
      dragging = handle;
      activePreset = null;
      updatePresetUI();
      wrap.classList.add('dragging');
      e.preventDefault();
      return;
    }
    const norm = fromCanvas(pos.x, pos.y);
    graphDragStart = { normX: norm.x, normY: norm.y, infl: influenceIn, out: influenceOut };
    dragging = 'graph';
    activePreset = null;
    updatePresetUI();
    wrap.classList.add('dragging');
    e.preventDefault();
  }

  function onMove(e) {
    if (!dragging) {
      const pos = pointerPos(e);
      const handle = hitTest(pos);
      canvas.style.cursor = handle ? 'ew-resize' : 'grab';
      return;
    }
    const pos = pointerPos(e);
    if (dragging === 'in') {
      const norm = fromCanvas(pos.x, pos.y);
      const nx = Math.max(0, Math.min(0.45, norm.x));
      influenceIn = (nx / 0.45) * 100;
      targetIn = influenceIn;
    } else if (dragging === 'out') {
      const norm = fromCanvas(pos.x, pos.y);
      const nx = Math.max(0.55, Math.min(1, norm.x));
      influenceOut = ((1 - nx) / 0.45) * 100;
      targetOut = influenceOut;
    } else if (dragging === 'graph') {
      const norm = fromCanvas(pos.x, pos.y);
      const deltaY = (norm.y - graphDragStart.normY) * 100;
      const deltaX = (norm.x - graphDragStart.normX) * 60;
      influenceIn = Math.max(0, Math.min(100, graphDragStart.infl + deltaY + deltaX));
      influenceOut = Math.max(0, Math.min(100, graphDragStart.out + deltaY - deltaX));
      targetIn = influenceIn;
      targetOut = influenceOut;
    }
    e.preventDefault();
  }

  function onUp() {
    if (dragging === 'graph') graphDragStart = null;
    dragging = null;
    wrap.classList.remove('dragging');
    canvas.style.cursor = 'grab';
  }

  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp);

  // ───── Presets (static demo defaults) ─────
  const PRESETS = [
    { id: 'default-1', name: 'Ease In Out', x1: 0.65, y1: 0, x2: 0.35, y2: 1, color: { r: 77, g: 148, b: 214 } },
    { id: 'default-2', name: 'Ease In', x1: 0.70, y1: 0, x2: 1.00, y2: 1, color: { r: 209, g: 85, b: 120 } },
    { id: 'default-3', name: 'Ease Out', x1: 0.00, y1: 0, x2: 0.30, y2: 1, color: { r: 64, g: 191, b: 155 } },
    { id: 'default-4', name: 'Smooth Decel', x1: 0.25, y1: 0, x2: 0.00, y2: 1, color: { r: 230, g: 153, b: 51 } },
  ];

  let activePreset = null;

  function applyPreset(preset) {
    targetIn = preset.x1 * 100;
    targetOut = (1 - preset.x2) * 100;
    targetColor = { ...preset.color };
    activePreset = preset.id;
    updatePresetUI();
  }

  function updatePresetUI() {
    presetBar.querySelectorAll('.preset').forEach(el => {
      const isActive = el.dataset.preset === activePreset;
      el.classList.toggle('active', isActive);
      if (isActive) {
        const preset = PRESETS.find(p => p.id === activePreset);
        if (preset) {
          const c = preset.color;
          el.style.borderColor = `rgb(${c.r},${c.g},${c.b})`;
          el.style.background = `rgba(${c.r},${c.g},${c.b},0.08)`;
        }
      } else {
        el.style.borderColor = '';
        el.style.background = '';
      }
    });
  }

  function buildPresetUI() {
    presetBar.innerHTML = '';
    PRESETS.forEach(preset => {
      const btn = document.createElement('button');
      btn.className = 'preset';
      btn.dataset.preset = preset.id;
      btn.innerHTML = miniCurveSVG(preset) + '<div class="label">' + escapeHtml(preset.name) + '</div>';
      btn.addEventListener('click', () => applyPreset(preset));
      presetBar.appendChild(btn);
    });
    updatePresetUI();
  }

  function miniCurveSVG(preset) {
    const w = 52, h = 30, pad = 3;
    const pts = computeSpeedGraph(preset.x1, preset.y1, preset.x2, preset.y2, 60);
    let peak = 0;
    for (const p of pts) if (p.speed > peak) peak = p.speed;
    peak = peak || 1;
    let d = '';
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const sx = pad + p.time * (w - pad * 2);
      const ny = (p.speed / peak) * 0.85;
      const sy = (h - pad) - ny * (h - pad * 2);
      d += (i === 0 ? 'M' : 'L') + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' ';
    }
    const c = preset.color;
    const colorStr = `rgb(${c.r},${c.g},${c.b})`;
    return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <path d="${d}" fill="none" stroke="${colorStr}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ───── Readout / Copy ─────
  let copyFeedback = false;
  let copyTimer = null;

  function copyBezier() {
    const text = `cubic-bezier(${(influenceIn / 100).toFixed(2)}, 0.00, ${(1 - influenceOut / 100).toFixed(2)}, 1.00)`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    copyFeedback = true;
    if (readout) {
      readout.textContent = 'Copied!';
      readout.classList.add('copied');
    }
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyFeedback = false;
      if (readout) readout.classList.remove('copied');
    }, 800);
  }

  if (readout) {
    readout.addEventListener('click', copyBezier);
  }

  function updateReadout() {
    if (copyFeedback || !readout) return;
    const x1 = influenceIn / 100;
    const x2 = 1 - influenceOut / 100;
    readout.textContent = `cubic-bezier(${x1.toFixed(2)}, 0.00, ${x2.toFixed(2)}, 1.00)`;
  }

  // ───── Rendering ─────
  let tStart = performance.now();

  function draw(now) {
    if (!canvas || W <= 0 || H <= 0) return;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0a0a10';
    ctx.fillRect(0, 0, W, H);

    // Grid
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const [gx1, gy1] = toCanvas(t, 0);
      const [, gy2] = toCanvas(t, 1);
      const [gx3] = toCanvas(0, t);
      const [gx4] = toCanvas(1, t);

      ctx.strokeStyle = i === 2 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;

      ctx.beginPath(); ctx.moveTo(gx1, gy1); ctx.lineTo(gx1, gy2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx3, gy1); ctx.lineTo(gx4, gy1); ctx.stroke();
    }

    // Speed graph
    const x1 = influenceIn / 100;
    const x2 = 1 - influenceOut / 100;
    const pts = computeSpeedGraph(x1, 0, x2, 1, SAMPLES);
    let maxSpeed = 0;
    for (const p of pts) if (p.speed > maxSpeed) maxSpeed = p.speed;
    if (maxSpeed < 0.01) maxSpeed = 1;

    const [startX, startY] = toCanvas(0, 0);
    const [endX, endY] = toCanvas(1, 0);

    // Fill
    ctx.fillStyle = `rgba(${activeColor.r}, ${activeColor.g}, ${activeColor.b}, 0.08)`;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (const p of pts) {
      const ny = (p.speed / maxSpeed) * 0.9;
      const [cx, cy] = toCanvas(p.time, ny);
      ctx.lineTo(cx, cy);
    }
    ctx.lineTo(endX, endY);
    ctx.closePath();
    ctx.fill();

    // Per-segment colored stroke
    const canvasPoints = pts.map(p => {
      const ny = (p.speed / maxSpeed) * 0.9;
      return toCanvas(p.time, ny);
    });

    ctx.lineWidth = 2.5;
    let batchColor = '';
    ctx.beginPath();
    for (let i = 1; i < canvasPoints.length; i++) {
      const avgSpd = (pts[i - 1].speed + pts[i].speed) / 2;
      const color = speedToColor(avgSpd);
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

    // Endpoint dots
    ctx.fillStyle = '#666';
    for (const [dotX, dotY] of [[startX, startY], [endX, endY]]) {
      ctx.beginPath(); ctx.arc(dotX, dotY, 3, 0, Math.PI * 2); ctx.fill();
    }

    // Handle positions
    const [inHx, inHy] = toCanvas(x1 * 0.45, 0);
    const [outHx, outHy] = toCanvas(1 - influenceOut / 100 * 0.45, 0);

    // Handle arms
    ctx.strokeStyle = 'rgba(245, 166, 35, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(inHx, inHy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(endX, endY); ctx.lineTo(outHx, outHy); ctx.stroke();

    // Handles
    drawHandle(ctx, inHx, inHy, 'in');
    drawHandle(ctx, outHx, outHy, 'out');

    // Animated preview dot
    const period = 2600;
    const phase = ((now - tStart) % period) / period;
    const tt = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    const position = bezierValue(tt, x1, 0, x2, 1);

    const railY = H - PAD.b + 8;
    const railDotX = PAD.l + position * (W - PAD.l - PAD.r);

    // Halo on rail
    ctx.fillStyle = `rgba(${activeColor.r}, ${activeColor.g}, ${activeColor.b}, 0.2)`;
    ctx.beginPath(); ctx.arc(railDotX, railY, 8, 0, Math.PI * 2); ctx.fill();

    // Preview object on rail
    ctx.shadowColor = `rgb(${activeColor.r}, ${activeColor.g}, ${activeColor.b})`;
    ctx.shadowBlur = 16;
    ctx.fillStyle = `rgb(${activeColor.r}, ${activeColor.g}, ${activeColor.b})`;
    ctx.beginPath(); ctx.arc(railDotX, railY, 6, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(railDotX, railY, 2.2, 0, Math.PI * 2); ctx.fill();

    // Axis labels
    ctx.fillStyle = '#4a4a55';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('speed', PAD.l + 4, PAD.t + 6);
    ctx.textAlign = 'right';
    ctx.fillText('time →', W - PAD.r - 4, H - PAD.b - 8);

    updateReadout();
  }

  function splineSpeedAt(pts, tq) {
    if (tq <= 0) return pts[0].speed;
    if (tq >= 1) return pts[pts.length - 1].speed;
    const idx = Math.min(pts.length - 2, Math.floor(tq * SAMPLES));
    const frac = tq * SAMPLES - idx;
    return pts[idx].speed + (pts[idx + 1].speed - pts[idx].speed) * frac;
  }

  function drawHandle(ctx, x, y, id) {
    const active = dragging === id;
    const radius = active ? 5 : 4;

    if (active) {
      ctx.fillStyle = 'rgba(245, 166, 35, 0.2)';
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = '#f5a623';
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }

  // ───── Animation loop ─────
  let rafId;
  function tick(now) {
    const k = 0.18;
    influenceIn += (targetIn - influenceIn) * k;
    influenceOut += (targetOut - influenceOut) * k;
    activeColor.r += (targetColor.r - activeColor.r) * k;
    activeColor.g += (targetColor.g - activeColor.g) * k;
    activeColor.b += (targetColor.b - activeColor.b) * k;
    draw(now);
    rafId = requestAnimationFrame(tick);
  }

  // ───── Init ─────
  buildPresetUI();

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  if (PRESETS.length > 0) {
    applyPreset(PRESETS[0]);
  }

  rafId = requestAnimationFrame(tick);
})();
