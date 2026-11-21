// SVG map: state outlines plus one marker per project. No map library.

import { svg } from './dom.js';
import { spreadMarkers } from './layout.js';

const WIDTH = 640;
const PAD = 14;
// A marker with its drought ring reaches 23 units from its centre; keep
// centres 48 apart so rings never touch, and keep rings inside the frame.
const MARKER_GAP = 48;
const MARKER_EDGE = 23;
const RAD = Math.PI / 180;

// Albers equal-area conic projection centred on the interior West.
function albers(lon0 = -112, lat0 = 38, lat1 = 33, lat2 = 45) {
  const n = (Math.sin(lat1 * RAD) + Math.sin(lat2 * RAD)) / 2;
  const c = Math.cos(lat1 * RAD) ** 2 + 2 * n * Math.sin(lat1 * RAD);
  const rho0 = Math.sqrt(c - 2 * n * Math.sin(lat0 * RAD)) / n;
  return ([lon, lat]) => {
    const rho = Math.sqrt(c - 2 * n * Math.sin(lat * RAD)) / n;
    const theta = n * (lon - lon0) * RAD;
    return [rho * Math.sin(theta), -(rho0 - rho * Math.cos(theta))];
  };
}

export function fitProjection(states) {
  const raw = albers();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const state of states) for (const polygon of state.polygons) for (const point of polygon[0]) {
    const [x, y] = raw(point);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  // Fill the width; the height follows from the shape of the region.
  const scale = (WIDTH - 2 * PAD) / (maxX - minX);
  const height = Math.ceil(scale * (maxY - minY) + 2 * PAD);
  const project = (point) => {
    const [x, y] = raw(point);
    return [(x - minX) * scale + PAD, (y - minY) * scale + PAD];
  };
  return { project, height };
}

const path = (project, rings) => rings
  .map((ring) => 'M' + ring.map((p) => project(p).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z')
  .join('');

// Where to print each state's abbreviation (lon, lat), chosen by eye.
const LABEL_AT = { AZ: [-111.7, 34.6], CA: [-120.0, 36.9], CO: [-105.6, 39.4], NM: [-106.1, 34.0], NV: [-116.8, 39.9], UT: [-111.6, 38.2], WY: [-107.5, 43.6] };

export function createMap(root, geo, { onSelect }) {
  const { project, height } = fitProjection(geo.states);
  root.setAttribute('viewBox', `0 0 ${WIDTH} ${height}`);
  root.replaceChildren();

  const land = svg('g', { class: 'map-land', 'aria-hidden': 'true' });
  for (const state of geo.states) {
    land.append(svg('path', { d: state.polygons.map((polygon) => path(project, polygon)).join(''), 'data-state': state.abbr }));
    const [x, y] = project(LABEL_AT[state.abbr]);
    land.append(svg('text', { x, y, class: 'map-state-label' }, state.abbr));
  }
  // Leaders sit under the markers: a dot at the true location and a line to
  // the marker when it had to be moved off a neighbour.
  const leaders = svg('g', { class: 'map-leaders', 'aria-hidden': 'true' });
  const markers = svg('g', { class: 'map-markers' });
  root.append(land, leaders, markers);

  // items: [{ project, score, ring }] where ring is an optional
  // { color, label } drawn around the marker by a data layer.
  function render(items, selectedId) {
    markers.replaceChildren();
    leaders.replaceChildren();
    const truePos = new Map(items.map(({ project: p }) => [p.id, project([p.lon, p.lat])]));
    const shown = spreadMarkers(
      items.map(({ project: p }) => ({ id: p.id, x: truePos.get(p.id)[0], y: truePos.get(p.id)[1] })),
      { gap: MARKER_GAP, bounds: { minX: MARKER_EDGE, maxX: WIDTH - MARKER_EDGE, minY: MARKER_EDGE, maxY: height - MARKER_EDGE } },
    );
    // Selected marker last so it sits on top.
    const ordered = [...items].sort((a, b) => (a.project.id === selectedId) - (b.project.id === selectedId));
    for (const { project: p, score, ring } of ordered) {
      const [tx, ty] = truePos.get(p.id);
      const { x, y } = shown.get(p.id);
      if (Math.hypot(x - tx, y - ty) > 1) {
        leaders.append(
          svg('line', { x1: tx.toFixed(1), y1: ty.toFixed(1), x2: x.toFixed(1), y2: y.toFixed(1), class: 'map-leader' }),
          svg('circle', { cx: tx.toFixed(1), cy: ty.toFixed(1), r: 3, class: 'map-anchor' }),
        );
      }
      const selected = p.id === selectedId;
      const label = `${p.name}, ${p.county} County, ${p.state}. Fides score ${score.total}, ${score.band.label}.` + (ring ? ` ${ring.label}.` : '');
      const g = svg('g', {
        class: `marker band-${score.band.key}` + (selected ? ' is-selected' : ''),
        transform: `translate(${x.toFixed(1)},${y.toFixed(1)})`,
        tabindex: 0,
        role: 'button',
        'aria-label': label,
        'aria-pressed': String(selected),
      });
      g.append(svg('title', {}, label));
      if (ring) g.append(svg('circle', { r: 19, class: 'marker-ring-edge' }), svg('circle', { r: 19, class: 'marker-ring', stroke: ring.color }));
      g.append(svg('circle', { r: 13, class: 'marker-dot' }));
      g.append(svg('text', { class: 'marker-score', dy: '0.35em' }, String(score.total)));
      g.addEventListener('click', () => onSelect(p.id));
      g.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(p.id); }
      });
      markers.append(g);
    }
  }

  return { render };
}
