import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RUBRIC, BANDS, MAX_SCORE, scoreProject, bandFor } from '../site/js/scoring.js';

const commitment = (status) => ({ text: 'x', status, date: '2024-01-01', source: { title: 't', demo: true } });

// A project that earns full marks everywhere; tests override one field at a time.
const best = (overrides = {}) => ({
  water_source: 'reclaimed',
  cooling: 'closed_loop',
  clean_power_pct: 100,
  heat_reuse: 'operating',
  commitments: [commitment('kept')],
  ...overrides,
});

const part = (result, key) => result.components.find((c) => c.key === key);

test('weights are 25 / 25 / 25 / 10 / 15 and add up to 100', () => {
  assert.equal(RUBRIC.water_source.max, 25);
  assert.equal(RUBRIC.cooling.max, 25);
  assert.equal(RUBRIC.clean_power.max, 25);
  assert.equal(RUBRIC.heat_reuse.max, 10);
  assert.equal(RUBRIC.promises.max, 15);
  assert.equal(MAX_SCORE, 100);
});

test('best possible project scores 100; worst possible scores 0', () => {
  assert.equal(scoreProject(best()).total, 100);
  const worst = { water_source: 'undisclosed', cooling: 'undisclosed', clean_power_pct: 0, heat_reuse: 'none', commitments: [commitment('broken')] };
  assert.equal(scoreProject(worst).total, 0);
});

test('components come back in rubric order with their maximums', () => {
  const { components } = scoreProject(best());
  assert.deepEqual(components.map((c) => [c.key, c.max]), [
    ['water_source', 25], ['cooling', 25], ['clean_power', 25], ['heat_reuse', 10], ['promises', 15],
  ]);
});

// --- Tiered components: every tier in the rubric, by its expected points.

const expectedTiers = {
  water_source: { none: 25, reclaimed: 25, non_potable: 18, municipal_potable: 10, surface: 8, groundwater: 3, undisclosed: 0 },
  cooling: { closed_loop: 25, air: 22, hybrid: 14, evaporative: 5, undisclosed: 0 },
  heat_reuse: { operating: 10, planned: 5, none: 0 },
};

for (const [key, tiers] of Object.entries(expectedTiers)) {
  test(`${key}: the rubric has exactly the expected tiers`, () => {
    assert.deepEqual(Object.keys(RUBRIC[key].tiers).sort(), Object.keys(tiers).sort());
  });
  for (const [value, points] of Object.entries(tiers)) {
    test(`${key}: "${value}" earns ${points}`, () => {
      const result = scoreProject(best({ [key]: value }));
      assert.equal(part(result, key).points, points);
      assert.equal(result.total, 100 - RUBRIC[key].max + points);
    });
  }
  test(`${key}: an unrecognized value earns 0 and says so`, () => {
    const c = part(scoreProject(best({ [key]: 'banana' })), key);
    assert.equal(c.points, 0);
    assert.match(c.reason, /Unrecognized/);
  });
  test(`${key}: no tier exceeds the component maximum`, () => {
    for (const tier of Object.values(RUBRIC[key].tiers)) assert.ok(tier.points >= 0 && tier.points <= RUBRIC[key].max);
  });
}

// --- Clean power: linear, with the state-grid fallback.

for (const [pct, points] of [[0, 0], [10, 2.5], [50, 12.5], [72, 18], [100, 25]]) {
  test(`clean power: ${pct}% documented earns ${points}`, () => {
    const c = part(scoreProject(best({ clean_power_pct: pct })), 'clean_power');
    assert.equal(c.points, points);
    assert.equal(c.estimated, false);
  });
}

test('clean power: out-of-range values are clamped to 0–100', () => {
  assert.equal(part(scoreProject(best({ clean_power_pct: 140 })), 'clean_power').points, 25);
  assert.equal(part(scoreProject(best({ clean_power_pct: -5 })), 'clean_power').points, 0);
});

test('clean power: undisclosed falls back to the state grid mix, flagged as an estimate', () => {
  const c = part(scoreProject(best({ clean_power_pct: null }), { stateCleanSharePct: 40 }), 'clean_power');
  assert.equal(c.points, 10);
  assert.equal(c.estimated, true);
  assert.match(c.reason, /estimated from the state grid mix/);
});

test('clean power: a documented share always wins over the state estimate', () => {
  const c = part(scoreProject(best({ clean_power_pct: 20 }), { stateCleanSharePct: 90 }), 'clean_power');
  assert.equal(c.points, 5);
  assert.equal(c.estimated, false);
});

test('clean power: undisclosed with no state estimate earns 0', () => {
  for (const value of [null, undefined, NaN, '50']) {
    const c = part(scoreProject(best({ clean_power_pct: value })), 'clean_power');
    assert.equal(c.points, 0);
    assert.equal(c.estimated, false);
  }
});

// --- Promises kept.

test('promises: no commitments at all is "no track record yet", half credit', () => {
  for (const commitments of [[], undefined]) {
    const c = part(scoreProject(best({ commitments })), 'promises');
    assert.equal(c.points, 7.5);
    assert.equal(c.noTrackRecord, true);
    assert.match(c.reason, /No track record yet/);
  }
});

test('promises: only unresolved commitments is still "no track record yet"', () => {
  const c = part(scoreProject(best({ commitments: [commitment('in_progress'), commitment('not_yet_due')] })), 'promises');
  assert.equal(c.points, 7.5);
  assert.equal(c.noTrackRecord, true);
  assert.match(c.reason, /come due/);
});

test('promises: all kept earns 15, all broken earns 0', () => {
  assert.equal(part(scoreProject(best({ commitments: [commitment('kept'), commitment('kept')] })), 'promises').points, 15);
  const broken = part(scoreProject(best({ commitments: [commitment('broken')] })), 'promises');
  assert.equal(broken.points, 0);
  assert.equal(broken.noTrackRecord, false);
});

test('promises: mixed record is proportional to kept ÷ resolved', () => {
  const c = part(scoreProject(best({ commitments: [commitment('kept'), commitment('kept'), commitment('broken')] })), 'promises');
  assert.equal(c.points, 10);
  assert.equal(c.reason, '2 of 3 resolved promises kept');
});

test('promises: unresolved commitments do not dilute the ratio', () => {
  const c = part(scoreProject(best({ commitments: [commitment('kept'), commitment('broken'), commitment('in_progress'), commitment('not_yet_due')] })), 'promises');
  assert.equal(c.points, 7.5);
  assert.equal(c.noTrackRecord, false);
});

// --- Totals and bands.

test('total is the rounded sum of the components', () => {
  // 25 + 25 + 25 + 10 + 7.5 = 92.5 -> 93
  assert.equal(scoreProject(best({ commitments: [] })).total, 93);
  // 10 + 14 + 8.5 + 0 + 7.5 = 40
  const r = scoreProject({ water_source: 'municipal_potable', cooling: 'hybrid', clean_power_pct: 34, heat_reuse: 'none', commitments: [] });
  assert.equal(r.total, 40);
});

test('bands: Strong 80+, Fair 60–79, Weak 40–59, Poor below 40', () => {
  assert.deepEqual(BANDS.map((b) => [b.min, b.label]), [[80, 'Strong'], [60, 'Fair'], [40, 'Weak'], [0, 'Poor']]);
  for (const [total, label] of [[100, 'Strong'], [80, 'Strong'], [79, 'Fair'], [60, 'Fair'], [59, 'Weak'], [40, 'Weak'], [39, 'Poor'], [0, 'Poor']]) {
    assert.equal(bandFor(total).label, label);
  }
  assert.equal(scoreProject(best()).band.label, 'Strong');
});

// --- The demo data and the docs stay in step with the rubric.

test('every project in data/projects.json scores between 0 and 100 with known values', () => {
  const { projects } = JSON.parse(readFileSync(new URL('../data/projects.json', import.meta.url)));
  for (const p of projects) {
    const r = scoreProject(p, { stateCleanSharePct: 30 });
    assert.ok(r.total >= 0 && r.total <= 100, p.id);
    for (const c of r.components) assert.doesNotMatch(c.reason, /Unrecognized/, p.id);
  }
});

test('README.md states the same weights as the rubric', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const c of Object.values(RUBRIC)) {
    assert.ok(readme.includes(`| ${c.label} | ${c.max} |`), `README is missing the row "| ${c.label} | ${c.max} |"`);
    for (const tier of Object.values(c.tiers || {})) {
      assert.ok(readme.includes(`| ${tier.label} | ${tier.points} |`), `README is missing the tier "| ${tier.label} | ${tier.points} |"`);
    }
  }
});
