// SVG map: state outlines plus one marker per project. No map library.

import { svg } from './dom.js';

const WIDTH = 640;
const HEIGHT = 660;
const PAD = 14;
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

function fitProjection(states) {
  const raw = albers();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const state of states) for (const polygon of state.polygons) for (const point of polygon[0]) {
    const [x, y] = raw(point);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const scale = Math.min((WIDTH - 2 * PAD) / (maxX - minX), (HEIGHT - 2 * PAD) / (maxY - minY));
  const dx = (WIDTH - scale * (maxX - minX)) / 2 - scale * minX;
  const dy = (HEIGHT - scale * (maxY - minY)) / 2 - scale * minY;
  return (point) => {
    const [x, y] = raw(point);
    return [x * scale + dx, y * scale + dy];
  };
}

const path = (project, rings) => rings
  .map((ring) => 'M' + ring.map((p) => project(p).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z')
  .join('');

// Where to print each state's abbreviation (lon, lat), chosen by eye.
const LABEL_AT = { AZ: [-111.7, 34.6], CA: [-120.0, 36.9], CO: [-105.6, 39.4], NM: [-106.1, 34.0], NV: [-116.8, 39.9], UT: [-111.6, 38.2], WY: [-107.5, 43.6] };

export function createMap(root, geo, { onSelect }) {
  const project = fitProjection(geo.states);
  root.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  root.replaceChildren();

  const land = svg('g', { class: 'map-land', 'aria-hidden': 'true' });
  for (const state of geo.states) {
    land.append(svg('path', { d: state.polygons.map((polygon) => path(project, polygon)).join(''), 'data-state': state.abbr }));
    const [x, y] = project(LABEL_AT[state.abbr]);
    land.append(svg('text', { x, y, class: 'map-state-label' }, state.abbr));
  }
  const markers = svg('g', { class: 'map-markers' });
  root.append(land, markers);

  // items: [{ project, score, ring }] where ring is an optional
  // { color, label } drawn around the marker by a data layer.
  function render(items, selectedId) {
    markers.replaceChildren();
    // Draw low scores first so nothing hides behind a neighbour; selected last.
    const ordered = [...items].sort((a, b) => (a.project.id === selectedId) - (b.project.id === selectedId));
    for (const { project: p, score, ring } of ordered) {
      const [x, y] = project([p.lon, p.lat]);
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
      if (ring) g.append(svg('circle', { r: 19, class: 'marker-ring', stroke: ring.color }));
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
