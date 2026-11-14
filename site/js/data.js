// Loads everything the site needs from /data. The site is static: these are
// plain JSON files served next to /site, so the repository root must be the
// web root (see README).

const DATA = '../data/';

async function getJson(path, { optional = false } = {}) {
  try {
    const response = await fetch(DATA + path);
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (optional) return null;
    throw error;
  }
}

export async function loadAll() {
  const [projects, rules, geo, drought, powerMix] = await Promise.all([
    getJson('projects.json'),
    getJson('rules.json'),
    getJson('geo/west_states.json'),
    // Pipeline outputs are optional: the site still works before they exist.
    getJson('normalized/drought_by_county.json', { optional: true }),
    getJson('normalized/state_generation_mix.json', { optional: true }),
  ]);
  return { projects: projects.projects, notice: projects.notice, rules: rules.rules, geo, drought, powerMix };
}
