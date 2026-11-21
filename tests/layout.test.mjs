import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spreadMarkers } from '../site/js/layout.js';
import { fitProjection } from '../site/js/map.js';

const GAP = 48;
const minDistance = (positions) => {
  const list = [...positions.values()];
  let min = Infinity;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    min = Math.min(min, Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y));
  }
  return min;
};

test('markers that do not touch keep their exact position', () => {
  const out = spreadMarkers([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }], { gap: GAP });
  assert.deepEqual(out.get('a'), { x: 0, y: 0 });
  assert.deepEqual(out.get('b'), { x: 100, y: 0 });
});

test('two close markers move apart symmetrically to exactly the gap', () => {
  const out = spreadMarkers([{ id: 'a', x: 50, y: 50 }, { id: 'b', x: 60, y: 50 }], { gap: GAP });
  assert.ok(Math.abs(out.get('b').x - out.get('a').x - GAP) < 0.1);
  assert.ok(Math.abs((out.get('a').x + out.get('b').x) / 2 - 55) < 1e-9);
  assert.equal(out.get('a').y, 50);
});

test('markers on the same spot are split, the same way every time', () => {
  const pts = [{ id: 'a', x: 10, y: 10 }, { id: 'b', x: 10, y: 10 }];
  const first = spreadMarkers(pts, { gap: GAP });
  assert.ok(minDistance(first) >= GAP - 0.1);
  assert.deepEqual(spreadMarkers(pts, { gap: GAP }), first);
});

test('a tight cluster ends up with no overlaps and inside the bounds', () => {
  const pts = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, x: 300 + i, y: 200 + (i % 2) }));
  const bounds = { minX: 23, maxX: 617, minY: 23, maxY: 500 };
  const out = spreadMarkers(pts, { gap: GAP, bounds });
  assert.ok(minDistance(out) >= GAP - 0.5, `min distance ${minDistance(out)}`);
  for (const { x, y } of out.values()) {
    assert.ok(x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY);
  }
});

test('no two projects in data/projects.json overlap on the map', () => {
  const geo = JSON.parse(readFileSync(new URL('../data/geo/west_states.json', import.meta.url)));
  const { projects } = JSON.parse(readFileSync(new URL('../data/projects.json', import.meta.url)));
  const { project } = fitProjection(geo.states);
  const pts = projects.map((p) => { const [x, y] = project([p.lon, p.lat]); return { id: p.id, x, y }; });
  const out = spreadMarkers(pts, { gap: GAP });
  assert.ok(minDistance(out) >= GAP - 0.5, `min distance ${minDistance(out)}`);
  // Nothing should be pushed further than a couple of marker widths.
  for (const p of pts) {
    const q = out.get(p.id);
    assert.ok(Math.hypot(q.x - p.x, q.y - p.y) < 2 * GAP, `${p.id} moved too far`);
  }
});
