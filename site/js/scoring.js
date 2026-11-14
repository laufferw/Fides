// The Fides score: 0–100, higher is better.
//
// This file is the single source of truth for the rubric. The "How scoring
// works" tab is rendered from RUBRIC below, and README.md repeats it (a test
// fails if the README weights drift from this file). If you change a number
// here, update the README in the same commit.
//
// No dependencies and no DOM access, so it runs in the browser and in Node.

export const RUBRIC = {
  water_source: {
    label: 'Water source',
    max: 25,
    why: 'Where cooling water comes from matters most in a dry region. Reusing wastewater or using no water at all is best; pumping groundwater is worst.',
    tiers: {
      none: { points: 25, label: 'No water used for cooling' },
      reclaimed: { points: 25, label: 'Reclaimed (recycled) wastewater' },
      non_potable: { points: 18, label: 'Other non-drinking water (brackish, industrial)' },
      municipal_potable: { points: 10, label: 'City drinking water' },
      surface: { points: 8, label: 'River, lake or canal water' },
      groundwater: { points: 3, label: 'Groundwater (wells)' },
      undisclosed: { points: 0, label: 'Not disclosed' },
    },
  },
  cooling: {
    label: 'Cooling design',
    max: 25,
    why: 'Cooling design decides how much water is consumed. Closed loops recirculate the same water; evaporative towers consume it continuously.',
    tiers: {
      closed_loop: { points: 25, label: 'Closed-loop liquid cooling' },
      air: { points: 22, label: 'Air cooling (uses more electricity)' },
      hybrid: { points: 14, label: 'Hybrid: air most of the year, evaporative on hot days' },
      evaporative: { points: 5, label: 'Evaporative cooling towers' },
      undisclosed: { points: 0, label: 'Not disclosed' },
    },
  },
  clean_power: {
    label: 'Clean power',
    max: 25,
    why: 'Points scale directly with the share of electricity from clean sources: 25 × share. If the operator has not documented a share, the state grid mix (from EIA) is used as an estimate and marked as such.',
  },
  heat_reuse: {
    label: 'Waste-heat reuse',
    max: 10,
    why: 'Servers turn nearly all their electricity into heat. Sending it to buildings, greenhouses or industry puts it to use.',
    tiers: {
      operating: { points: 10, label: 'Heat reuse in operation' },
      planned: { points: 5, label: 'Heat reuse committed or planned' },
      none: { points: 0, label: 'No heat reuse' },
    },
  },
  promises: {
    label: 'Promises kept',
    max: 15,
    noTrackRecordPoints: 7.5,
    why: 'Points are 15 × (promises kept ÷ promises resolved). Only promises that have come due count as resolved (kept or broken). A project with none resolved has no track record yet and gets half credit, 7.5, so it is neither rewarded nor punished.',
  },
};

export const BANDS = [
  { min: 80, key: 'strong', label: 'Strong' },
  { min: 60, key: 'fair', label: 'Fair' },
  { min: 40, key: 'weak', label: 'Weak' },
  { min: 0, key: 'poor', label: 'Poor' },
];

export const MAX_SCORE = Object.values(RUBRIC).reduce((sum, c) => sum + c.max, 0);

const round1 = (n) => Math.round(n * 10) / 10;

function tiered(key, value) {
  const component = RUBRIC[key];
  const tier = component.tiers[value];
  if (!tier) {
    return { key, label: component.label, max: component.max, points: 0, reason: `Unrecognized value "${value}"; scored as not disclosed` };
  }
  return { key, label: component.label, max: component.max, points: tier.points, reason: tier.label };
}

function cleanPower(project, context) {
  const { label, max } = RUBRIC.clean_power;
  const base = { key: 'clean_power', label, max };
  const valid = (n) => typeof n === 'number' && Number.isFinite(n);
  const clamp = (n) => Math.min(100, Math.max(0, n));

  if (valid(project.clean_power_pct)) {
    const pct = clamp(project.clean_power_pct);
    return { ...base, points: round1((max * pct) / 100), reason: `${round1(pct)}% clean power documented by the operator`, estimated: false };
  }
  if (valid(context.stateCleanSharePct)) {
    const pct = clamp(context.stateCleanSharePct);
    return { ...base, points: round1((max * pct) / 100), reason: `Not disclosed; estimated from the state grid mix (${round1(pct)}% clean)`, estimated: true };
  }
  return { ...base, points: 0, reason: 'Not disclosed, and no state grid estimate available', estimated: false };
}

function promises(project) {
  const { label, max, noTrackRecordPoints } = RUBRIC.promises;
  const base = { key: 'promises', label, max };
  const commitments = project.commitments || [];
  const kept = commitments.filter((c) => c.status === 'kept').length;
  const broken = commitments.filter((c) => c.status === 'broken').length;
  const resolved = kept + broken;

  if (resolved === 0) {
    const reason = commitments.length === 0
      ? 'No track record yet: no public commitments on file'
      : 'No track record yet: no commitments have come due';
    return { ...base, points: noTrackRecordPoints, reason, noTrackRecord: true };
  }
  return { ...base, points: round1((max * kept) / resolved), reason: `${kept} of ${resolved} resolved promises kept`, noTrackRecord: false };
}

export function bandFor(total) {
  return BANDS.find((b) => total >= b.min);
}

// project: a record from data/projects.json.
// context.stateCleanSharePct: clean share of the project's state grid, 0–100,
//   used only when the project has no documented clean_power_pct.
export function scoreProject(project, context = {}) {
  const components = [
    tiered('water_source', project.water_source),
    tiered('cooling', project.cooling),
    cleanPower(project, context),
    tiered('heat_reuse', project.heat_reuse),
    promises(project),
  ];
  const total = Math.round(components.reduce((sum, c) => sum + c.points, 0));
  return { total, band: bandFor(total), components };
}
