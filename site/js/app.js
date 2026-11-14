import { loadAll } from './data.js';
import { h, fill, link, formatDate } from './dom.js';
import { createMap } from './map.js';
import { RUBRIC, BANDS, scoreProject } from './scoring.js';
import { DROUGHT_LEVELS, droughtFor } from './drought.js';

const LABELS = {
  status: { proposed: 'Proposed', approved: 'Approved', under_construction: 'Under construction', operating: 'Operating', cancelled: 'Cancelled' },
  commitment: { kept: 'Kept', broken: 'Broken', in_progress: 'In progress', not_yet_due: 'Not yet due' },
  level: { city: 'City', town: 'Town', county: 'County', state: 'State' },
  topic: { water: 'Water', power: 'Power', noise: 'Noise', zoning: 'Zoning', notice: 'Public notice', reporting: 'Reporting', enforcement: 'Enforcement', other: 'Scope' },
};
const STATE_NAMES = { AZ: 'Arizona', CA: 'California', CO: 'Colorado', NM: 'New Mexico', NV: 'Nevada', UT: 'Utah', WY: 'Wyoming' };

const $ = (id) => document.getElementById(id);
const number = (n, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits });
const mgy = (n) => (n == null ? 'Not disclosed' : `${number(n, 1)} million gallons a year`);

const state = { data: null, scores: new Map(), selectedId: null, map: null, showDrought: true };

// ---------------------------------------------------------------- scoring

function stateCleanShare(abbr) {
  return state.data.powerMix?.states?.[abbr]?.clean_share_pct ?? null;
}

function scoreAll() {
  for (const p of state.data.projects) {
    state.scores.set(p.id, scoreProject(p, { stateCleanSharePct: stateCleanShare(p.state) }));
  }
}

// ---------------------------------------------------------------- filters

function setupFilters() {
  const form = $('filters');
  const projects = state.data.projects;
  const fill = (name, values, label) => {
    for (const value of values) form.elements[name].append(h('option', { value }, label(value)));
  };
  fill('state', [...new Set(projects.map((p) => p.state))].sort(), (v) => STATE_NAMES[v]);
  fill('status', Object.keys(LABELS.status).filter((s) => projects.some((p) => p.status === s)), (v) => LABELS.status[v]);
  fill('water', Object.keys(RUBRIC.water_source.tiers).filter((s) => projects.some((p) => p.water_source === s)), (v) => RUBRIC.water_source.tiers[v].label);
  form.addEventListener('input', renderProjects);
  form.addEventListener('reset', () => setTimeout(renderProjects));
  form.addEventListener('submit', (event) => event.preventDefault());
}

function visibleProjects() {
  const f = Object.fromEntries(new FormData($('filters')));
  const q = f.q.trim().toLowerCase();
  const total = (p) => state.scores.get(p.id).total;
  const list = state.data.projects.filter((p) => {
    if (q && ![p.name, p.operator, p.county].some((s) => s.toLowerCase().includes(q))) return false;
    if (f.state && p.state !== f.state) return false;
    if (f.status && p.status !== f.status) return false;
    if (f.water && p.water_source !== f.water) return false;
    if (f.band === 'below40') return total(p) < 40;
    if (f.band && total(p) < Number(f.band)) return false;
    return true;
  });
  const sorters = {
    'score-desc': (a, b) => total(b) - total(a) || a.name.localeCompare(b.name),
    'score-asc': (a, b) => total(a) - total(b) || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
    mw: (a, b) => (b.capacity_mw ?? -1) - (a.capacity_mw ?? -1),
  };
  return list.sort(sorters[f.sort]);
}

// ---------------------------------------------------------------- pieces

const demoTag = (p) => (p.demo ? h('span', { class: 'tag tag-demo', title: 'Fictional record for demonstration' }, 'Demo') : null);

const scoreBadge = (score, size = '') => h('span', { class: `score band-${score.band.key} ${size}` },
  h('span', { class: 'score-number' }, score.total),
  h('span', { class: 'score-label' }, score.band.label));

function place(p) {
  return `${p.county} County, ${STATE_NAMES[p.state]}`;
}

// ---------------------------------------------------------------- list + map

function renderProjects() {
  const list = visibleProjects();
  if (state.selectedId && !list.some((p) => p.id === state.selectedId)) state.selectedId = null;

  $('list-heading').textContent = `${list.length} of ${state.data.projects.length} projects`;
  $('project-list').replaceChildren(...list.map((p) => {
    const score = state.scores.get(p.id);
    return h('li', {},
      h('button', { type: 'button', class: 'project-card' + (p.id === state.selectedId ? ' is-selected' : ''), 'aria-pressed': String(p.id === state.selectedId), 'data-id': p.id },
        scoreBadge(score),
        h('span', { class: 'project-card-body' },
          h('span', { class: 'project-name' }, p.name, ' ', demoTag(p)),
          h('span', { class: 'project-meta' }, `${p.operator} · ${p.county} County, ${p.state}`),
          h('span', { class: 'project-meta' }, LABELS.status[p.status], p.capacity_mw != null ? ` · ${number(p.capacity_mw)} MW` : '', markerNote(p)))));
  }));
  if (!list.length) $('project-list').append(h('li', { class: 'empty' }, 'No projects match these filters.'));

  state.map.render(list.map((p) => ({ project: p, score: state.scores.get(p.id), ring: markerRing(p) })), state.selectedId);
  renderDetail();
}

// ---------------------------------------------------------------- drought layer

const drought = (p) => droughtFor(state.data.drought, p);

function setupDroughtToggle() {
  if (!state.data.drought) return;
  const box = h('input', { type: 'checkbox', checked: state.showDrought });
  box.addEventListener('change', () => {
    state.showDrought = box.checked;
    renderLegend();
    renderProjects();
  });
  fill($('map-tools'), h('label', {}, box, 'Show county drought level'));
}

// Ring drawn around a map marker.
function markerRing(p) {
  const d = state.showDrought && drought(p);
  return d ? { color: d.color, label: `Drought across most of the county: ${d.text}` } : null;
}

// Drought text in a project card.
function markerNote(p) {
  const d = state.showDrought && drought(p);
  return d ? h('span', { class: 'drought-note' }, h('span', { class: 'swatch swatch-ring', style: `border-color:${d.color}` }), `Drought: ${d.text}`) : null;
}

function droughtFact(p) {
  const d = drought(p);
  if (!d) return null;
  const src = state.data.drought;
  const share = `${number(d.pct, 0)}% of ${d.countyName}`;
  return fact('County drought',
    h('span', { class: 'drought-note' }, h('span', { class: 'swatch swatch-ring', style: `border-color:${d.color}` }), h('strong', {}, d.text)),
    d.level === 'None'
      ? ` ${share} is free of drought.` + (d.maxLevel !== 'None' ? ` Worst level present: ${d.maxText}.` : '')
      : ` ${share} is at this level or worse.` + (d.maxLevel !== d.level ? ` Worst level present: ${d.maxText}.` : ''),
    h('span', { class: 'retrieved' }, ' ', link(src.source.homepage || src.source.url, 'U.S. Drought Monitor'), ` map of ${formatDate(src.map_date)}.`));
}

function droughtLegend() {
  if (!state.data.drought || !state.showDrought) return null;
  return [
    h('span', { class: 'legend-group' }, h('span', { class: 'legend-title' }, 'County drought (ring)'),
      DROUGHT_LEVELS.map((l) => h('span', { class: 'legend-item' }, h('span', { class: 'swatch swatch-ring', style: `border-color:${l.color}` }), l.key === 'None' ? 'None' : `${l.key} ${l.label}`))),
    h('span', { class: 'legend-note' }, `The ring shows the most severe drought level covering at least half of the project's county. U.S. Drought Monitor map of ${formatDate(state.data.drought.map_date)}.`),
  ];
}

function select(id, { focus = false } = {}) {
  state.selectedId = id;
  renderProjects();
  if (focus) {
    $('detail').focus({ preventScroll: true });
    $('detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ---------------------------------------------------------------- detail

function breakdown(score) {
  return h('table', { class: 'breakdown' },
    h('caption', {}, 'How this score adds up'),
    h('tbody', {}, score.components.map((c) => h('tr', {},
      h('th', { scope: 'row' }, c.label, c.estimated ? h('span', { class: 'tag tag-estimate' }, 'Estimate') : null,
        h('span', { class: 'reason' }, c.reason)),
      h('td', { class: 'bar-cell' }, h('span', { class: 'bar', role: 'presentation' }, h('span', { style: `width:${(100 * c.points) / c.max}%` }))),
      h('td', { class: 'points' }, h('strong', {}, number(c.points, 1)), ` / ${c.max}`)))));
}

function fact(term, ...description) {
  return [h('dt', {}, term), h('dd', {}, description)];
}

function sourceList(sources) {
  return h('ul', { class: 'sources' }, sources.map((s) => h('li', {},
    s.url ? link(s.url, s.title) : s.title,
    s.retrieved ? h('span', { class: 'retrieved' }, ` Retrieved ${formatDate(s.retrieved)}.`) : null)));
}

function powerFact(p) {
  if (p.clean_power_pct != null) return `${number(p.clean_power_pct, 1)}% clean, as documented by the operator`;
  const mix = state.data.powerMix;
  const share = stateCleanShare(p.state);
  if (share == null) return 'Not disclosed';
  return ['Not disclosed. ', `${STATE_NAMES[p.state]}'s grid generated ${number(share, 1)}% of its electricity from clean sources in ${mix.year} `,
    '(', link(mix.source.url, 'EIA'), '), used here as an estimate.'];
}

function renderDetail() {
  const root = $('detail');
  const p = state.data.projects.find((x) => x.id === state.selectedId);
  if (!p) {
    root.replaceChildren(h('p', { class: 'detail-empty' }, 'Select a project on the map or in the list to see its water, cooling, power and promises.'));
    return;
  }
  const score = state.scores.get(p.id);
  const use = p.water_use;
  const over = use.actual_mgy != null && use.projected_mgy != null && use.actual_mgy > use.projected_mgy;

  root.replaceChildren(
    h('header', { class: 'detail-head' },
      h('div', {},
        h('h2', {}, p.name, ' ', demoTag(p)),
        h('p', { class: 'project-meta' }, `${p.operator} · ${place(p)}`),
        h('p', { class: 'project-meta' }, LABELS.status[p.status], p.capacity_mw != null ? ` · ${number(p.capacity_mw)} MW` : '')),
      scoreBadge(score, 'score-large')),
    p.demo ? h('p', { class: 'note note-demo' }, 'This is a fictional record. Nothing here describes a real facility or company.') : null,
    breakdown(score),
    h('h3', {}, 'The facts'),
    h('dl', { class: 'facts' },
      fact('Water source', RUBRIC.water_source.tiers[p.water_source]?.label ?? p.water_source),
      fact('Projected water use', mgy(use.projected_mgy)),
      fact('Actual water use', mgy(use.actual_mgy), use.actual_mgy != null && use.actual_year ? ` (${use.actual_year})` : '',
        over ? h('span', { class: 'tag tag-warn' }, 'Above projection') : null),
      fact('Cooling', RUBRIC.cooling.tiers[p.cooling]?.label ?? p.cooling),
      fact('Power', powerFact(p)),
      fact('Waste heat', RUBRIC.heat_reuse.tiers[p.heat_reuse]?.label ?? p.heat_reuse),
      droughtFact(p)),
    h('h3', {}, 'Public commitments'),
    p.commitments.length
      ? h('ul', { class: 'commitments' }, p.commitments.map((c) => h('li', {},
        h('span', { class: `chip chip-${c.status}` }, LABELS.commitment[c.status]),
        h('span', {}, c.text, h('span', { class: 'retrieved' }, ` Made ${formatDate(c.date)}. `,
          c.source.url ? link(c.source.url, 'Source') : c.source.title, '.')))))
      : h('p', { class: 'muted' }, 'No public commitments on file. No track record yet.'),
    h('h3', {}, 'Sources'),
    sourceList(p.sources));
}

// ---------------------------------------------------------------- rules tab

function renderRules() {
  $('view-rules').replaceChildren(
    h('div', { class: 'prose' },
      h('h2', {}, 'Local rules'),
      h('p', {}, 'Rules that cities, towns and states in the West have adopted for data centers. Each summary is written from the official text linked beneath it. Read the source before relying on a summary.')),
    h('div', { class: 'rule-list' }, state.data.rules.map((r) => h('article', { class: 'rule' },
      h('p', { class: 'rule-kicker' }, `${r.jurisdiction} · ${LABELS.level[r.level]} rule`),
      h('h3', {}, r.title),
      h('p', { class: 'rule-citation' }, r.citation),
      h('p', {}, r.summary),
      h('dl', { class: 'rule-dates' },
        r.adopted ? fact('Adopted', formatDate(r.adopted)) : null,
        r.effective ? fact('In effect', formatDate(r.effective)) : null),
      h('ul', { class: 'provisions' }, r.provisions.map((v) => h('li', {}, h('span', { class: `chip chip-topic` }, LABELS.topic[v.topic]), h('span', {}, v.text)))),
      r.caveats ? h('p', { class: 'note' }, h('strong', {}, 'What to know: '), r.caveats) : null,
      h('h4', {}, 'Sources'),
      sourceList(r.sources)))));
}

// ---------------------------------------------------------------- scoring tab

function tierTable(component) {
  return h('table', { class: 'rubric' },
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'If the project has'), h('th', { scope: 'col', class: 'points' }, 'Points'))),
    h('tbody', {}, Object.values(component.tiers).map((t) => h('tr', {}, h('td', {}, t.label), h('td', { class: 'points' }, t.points)))));
}

function renderScoring() {
  const mix = state.data.powerMix;
  $('view-scoring').replaceChildren(h('div', { class: 'prose' },
    h('h2', {}, 'How scoring works'),
    h('p', {}, 'Every project gets a Fides score from 0 to 100. Higher is better. The score is the sum of five parts, and the same rules apply to every project. This page is generated from the code that computes the scores, so it cannot fall out of date.'),
    h('table', { class: 'rubric' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Part'), h('th', { scope: 'col', class: 'points' }, 'Maximum'))),
      h('tbody', {}, Object.values(RUBRIC).map((c) => h('tr', {}, h('td', {}, c.label), h('td', { class: 'points' }, c.max)))),
      h('tfoot', {}, h('tr', {}, h('th', { scope: 'row' }, 'Total'), h('td', { class: 'points' }, 100)))),
    h('p', {}, 'Totals are rounded to a whole number and grouped into bands: ',
      BANDS.map((b, i) => [h('span', { class: `chip band-chip band-${b.key}` }, b.label), ` ${i === 0 ? `${b.min} and up` : i === BANDS.length - 1 ? `below ${BANDS[i - 1].min}` : `${b.min}–${BANDS[i - 1].min - 1}`}`, i < BANDS.length - 1 ? ', ' : '.'])),
    Object.values(RUBRIC).map((c) => [
      h('h3', {}, `${c.label} (${c.max} points)`),
      h('p', {}, c.why),
      c.tiers ? tierTable(c) : null,
    ]),
    h('h3', {}, 'What counts as clean power'),
    mix
      ? h('p', {}, `Clean sources are ${mix.clean_sources.join(', ').toLowerCase()}. State estimates use ${mix.year} net generation from the `,
        link(mix.source.url, 'U.S. Energy Information Administration'), `, retrieved ${formatDate(mix.source.retrieved)}. They describe electricity generated in the state, not the mix a particular utility delivers to a particular site.`)
      : h('p', {}, 'Clean sources are wind, solar, hydroelectric, geothermal and nuclear.'),
    mix ? h('table', { class: 'rubric' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'State'), h('th', { scope: 'col', class: 'points' }, `Clean share, ${mix.year}`))),
      h('tbody', {}, Object.entries(mix.states).map(([abbr, s]) => h('tr', {}, h('td', {}, STATE_NAMES[abbr]), h('td', { class: 'points' }, `${number(s.clean_share_pct, 1)}%`))))) : null,
    h('h3', {}, 'Limits of the score'),
    h('ul', {},
      h('li', {}, 'An operator that does not disclose its power mix is scored on the state grid estimate, which can be kinder than the truth.'),
      h('li', {}, 'A project that has made no promises gets the same half credit as one whose promises have not come due.'),
      h('li', {}, 'How much water a project uses is shown on its page but is not yet part of the score.'))));
}

// ---------------------------------------------------------------- tabs + footer

function setupTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const show = (tab, { focus = false } = {}) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
    history.replaceState(null, '', '#' + tab.id.replace('tab-', ''));
  };
  for (const [i, tab] of tabs.entries()) {
    tab.addEventListener('click', () => show(tab));
    tab.addEventListener('keydown', (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (step) show(tabs[(i + step + tabs.length) % tabs.length], { focus: true });
    });
  }
  show(tabs.find((t) => '#' + t.id.replace('tab-', '') === location.hash) || tabs[0]);
}

function renderFooter() {
  const { geo, drought } = state.data;
  fill($('footer'),
    h('p', {}, 'Fides is a public-benefit project. Every real record carries its source and the date it was retrieved. Found an error? See CONTRIBUTING.md in the repository.'),
    h('p', { class: 'retrieved' }, 'State outlines: ', link(geo.source.url, 'U.S. Census Bureau cartographic boundaries via us-atlas'), '.'),
    drought ? h('p', { class: 'retrieved' }, 'Drought data: ', link(drought.source.homepage || drought.source.url, 'U.S. Drought Monitor'), `, retrieved ${formatDate(drought.source.retrieved)}. ${drought.source.attribution}`) : null);
}

// ---------------------------------------------------------------- start

async function start() {
  try {
    state.data = await loadAll();
  } catch (error) {
    $('status').textContent = location.protocol === 'file:'
      ? 'This page has to be served over HTTP to load its data. From the repository root run "make serve", then open http://localhost:8000/site/.'
      : `Could not load data: ${error.message}`;
    $('status').classList.add('is-error');
    return;
  }
  $('status').hidden = true;
  $('demo-banner').hidden = !state.data.projects.some((p) => p.demo);

  scoreAll();
  state.map = createMap($('map'), state.data.geo, { onSelect: (id) => select(id, { focus: true }) });
  setupFilters();
  setupDroughtToggle();
  $('project-list').addEventListener('click', (event) => {
    const card = event.target.closest('.project-card');
    if (card) select(card.dataset.id, { focus: true });
  });
  renderLegend();
  renderProjects();
  renderRules();
  renderScoring();
  renderFooter();
  setupTabs();
}

function renderLegend() {
  fill($('map-legend'),
    h('span', { class: 'legend-group' }, h('span', { class: 'legend-title' }, 'Fides score'),
      BANDS.map((b, i) => h('span', { class: 'legend-item' }, h('span', { class: `swatch band-${b.key}` }), `${b.label} ${i === BANDS.length - 1 ? `under ${BANDS[i - 1].min}` : `${b.min}+`}`))),
    droughtLegend());
}

start();
