function sampleBezier(t: number, v0: number, v1: number, v2: number, v3: number): number {
  const mt = 1 - t;
  return mt * mt * mt * v0 + 3 * mt * mt * t * v1 + 3 * mt * t * t * v2 + t * t * t * v3;
}

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

function bezierValue(time: number, x1: number, y1: number, x2: number, y2: number): number {
  if (time <= 0) return 0;
  if (time >= 1) return 1;
  const t = solveBezierT(time, x1, x2);
  return sampleBezier(t, 0, y1, y2, 1);
}

export function findPeakTime(pts: Array<{ time: number; speed: number }>): number {
  let peakTime = 0,
    peakSpeed = 0;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].speed > peakSpeed) {
      peakSpeed = pts[i].speed;
      peakTime = pts[i].time;
    }
  }
  return peakTime;
}

export function computeSpeedGraph(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  samples: number,
): Array<{ time: number; speed: number }> {
  const dt = 0.002;
  const points: Array<{ time: number; speed: number }> = [];
  for (let i = 0; i <= samples; i++) {
    const time = i / samples;
    const tLo = Math.max(0, time - dt);
    const tHi = Math.min(1, time + dt);
    const vLo = bezierValue(tLo, x1, y1, x2, y2);
    const vHi = bezierValue(tHi, x1, y1, x2, y2);
    const speed = tHi > tLo ? (vHi - vLo) / (tHi - tLo) : 0;
    points.push({ time, speed });
  }
  return points;
}
