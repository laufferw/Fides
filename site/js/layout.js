// Spread map markers that would overlap. Pure function, no DOM, so it can be
// tested in Node.
//
// points: [{ id, x, y }] in screen units (the true, projected locations).
// Returns a Map id -> { x, y } of display positions: each marker is moved the
// least it can so that no two centres are closer than `gap`. Markers that do
// not touch anything keep their exact position.

export function spreadMarkers(points, { gap = 48, bounds = null, iterations = 200 } = {}) {
  const pos = points.map((p) => ({ id: p.id, x: p.x, y: p.y, x0: p.x, y0: p.y }));

  for (let step = 0; step < iterations; step++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i], b = pos[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= gap - 0.01) continue;
        if (d < 1e-6) {
          // Same spot: split along a direction fixed by the ids, so the result
          // is stable between renders.
          const angle = (hash(a.id + '|' + b.id) % 360) * Math.PI / 180;
          dx = Math.cos(angle); dy = Math.sin(angle); d = 1;
        }
        const push = (gap - d) / 2 / d;
        a.x -= dx * push; a.y -= dy * push;
        b.x += dx * push; b.y += dy * push;
        moved = true;
      }
    }
    if (bounds) for (const p of pos) {
      p.x = clamp(p.x, bounds.minX, bounds.maxX);
      p.y = clamp(p.y, bounds.minY, bounds.maxY);
    }
    if (!moved) break;
  }
  return new Map(pos.map((p) => [p.id, { x: p.x, y: p.y }]));
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
