// Drought layer: county drought level from the U.S. Drought Monitor, read
// from data/normalized/drought_by_county.json (written by pipeline/usdm.py).
//
// Colors are the Drought Monitor's own, so the ring on a marker matches the
// maps people already know.

export const DROUGHT_LEVELS = [
  { key: 'None', label: 'No drought', color: '#b9c0c2' },
  { key: 'D0', label: 'Abnormally dry', color: '#ffff00' },
  { key: 'D1', label: 'Moderate drought', color: '#fcd37f' },
  { key: 'D2', label: 'Severe drought', color: '#ffaa00' },
  { key: 'D3', label: 'Extreme drought', color: '#e60000' },
  { key: 'D4', label: 'Exceptional drought', color: '#730000' },
];

const BY_KEY = Object.fromEntries(DROUGHT_LEVELS.map((level) => [level.key, level]));

// Short text for a level: "D2 Severe drought", or "No drought".
export const levelText = (key) => (key === 'None' ? BY_KEY.None.label : `${key} ${BY_KEY[key].label}`);

// Drought facts for one project, or null if the county is not in the data.
export function droughtFor(drought, project) {
  const county = drought?.counties?.[project.county_fips];
  if (!county || !BY_KEY[county.level]) return null;
  const level = BY_KEY[county.level];
  return {
    level: county.level,
    maxLevel: county.max_level,
    color: level.color,
    text: levelText(county.level),
    maxText: levelText(county.max_level),
    // Share of the county in the headline level or worse.
    pct: county.level === 'None' ? county.pct_area.none : county.pct_area[county.level.toLowerCase()],
    countyName: county.county,
  };
}
