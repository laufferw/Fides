# Fides

*Fides* is Latin for trust, a promise kept.

Fides is a public-benefit accountability tracker for data centers in the
American West. For each project it tracks the water source and water use, the
cooling design, the power mix, waste-heat reuse, and whether the operator keeps
its public commitments. It is built first for residents, journalists and local
officials.

> **Status: prototype with demo data.** The 11 projects in
> `data/projects.json` are **fictional**. They sit in real counties so the map
> and data layers can be exercised, but their names, operators, numbers and
> commitments are invented. The local rules, drought levels, state power mix
> and water-rights figures are real and cited.

## Run it

The live site is at https://laufferw.github.io/Fides/. It is redeployed from
`main` by `.github/workflows/pages.yml` whenever the tests pass.

No build step and no dependencies for the site.

```
make serve          # then open http://localhost:8000/site/
```

The site is static files. It reads `../data/*.json` relative to `/site/`, so
serve the **repository root** (any static host works). Opening
`site/index.html` straight from disk will not work, because browsers block
`fetch` on `file://` pages.

## Test it

```
pip install -r pipeline/requirements.txt
make test           # node --test (scoring) + pytest (data, pipeline)
```

Tests never touch the network; pipeline tests run against small recorded
fixtures in `tests/fixtures/`.

## Layout

| Path | What lives there |
|---|---|
| `site/` | Static front end: `index.html`, `css/style.css`, `js/` (ES modules, no framework) |
| `site/js/scoring.js` | The Fides score. Single source of truth for the rubric |
| `data/projects.json`, `data/rules.json` | Hand-curated records |
| `data/schema/` | JSON Schema for each of those files |
| `data/normalized/` | Pipeline outputs the site reads (committed) |
| `data/raw/` | Dated cache of raw downloads (git-ignored) |
| `data/geo/` | State outlines for the map |
| `pipeline/` | Python ingestion scripts |
| `tests/` | Unit tests for scoring, data and pipeline |

## The Fides score

Every project gets a score from 0 to 100. Higher is better. The score is the
sum of five parts:

| Component | Max points |
|---|---|
| Water source | 25 |
| Cooling design | 25 |
| Clean power | 25 |
| Waste-heat reuse | 10 |
| Promises kept | 15 |

The total is rounded to a whole number and placed in a band: **Strong** 80+,
**Fair** 60–79, **Weak** 40–59, **Poor** below 40.

The rubric lives in [`site/js/scoring.js`](site/js/scoring.js). The "How
scoring works" tab is rendered from that file, and a test fails if the tables
below drift from it. **Change a number there, change it here in the same
commit.**

### Water source (25)

| Source | Points |
|---|---|
| No water used for cooling | 25 |
| Reclaimed (recycled) wastewater | 25 |
| Other non-drinking water (brackish, industrial) | 18 |
| City drinking water | 10 |
| River, lake or canal water | 8 |
| Groundwater (wells) | 3 |
| Not disclosed | 0 |

### Cooling design (25)

| Design | Points |
|---|---|
| Closed-loop liquid cooling | 25 |
| Air cooling (uses more electricity) | 22 |
| Hybrid: air most of the year, evaporative on hot days | 14 |
| Evaporative cooling towers | 5 |
| Not disclosed | 0 |

### Clean power (25)

Points = 25 × the share of electricity from clean sources. A project at 72%
clean power earns 18.

If the operator has not documented a share, Fides uses the clean share of the
state's electricity generation (from EIA, see below) as an **estimate**, and
labels it as an estimate wherever the score is shown. If neither is available
the component earns 0.

"Clean" means wind, solar, conventional hydroelectric, geothermal and nuclear.
Counting nuclear is a judgment call; run the EIA script with `--no-nuclear` to
leave it out.

### Waste-heat reuse (10)

| Status | Points |
|---|---|
| Heat reuse in operation | 10 |
| Heat reuse committed or planned | 5 |
| No heat reuse | 0 |

### Promises kept (15)

Points = 15 × (promises kept ÷ promises resolved).

Each commitment has a status: `kept`, `broken`, `in_progress` or
`not_yet_due`. Only `kept` and `broken` count as resolved.

**No track record yet.** A project with no resolved commitments, either
because it has made none or because none has come due, gets half credit:
7.5 points. It is neither rewarded nor punished for being new.

### Known limits of the score

- Undisclosed water source or cooling earns 0, but undisclosed clean power
  falls back to the state grid estimate. An operator with a worse-than-grid
  mix could therefore score higher by staying silent.
- A project that makes no promises gets half credit on that component, the
  same as one whose promises have not come due.
- Water *volume* is tracked and displayed but not yet scored.
- State generation mix is what is generated in the state, not what a given
  utility delivers to a given site.

## Data model

`data/projects.json` holds the projects; the full definition is
[`data/schema/project.schema.json`](data/schema/project.schema.json).

| Field | Meaning |
|---|---|
| `id`, `name`, `operator` | Identity |
| `county`, `county_fips`, `state`, `lat`, `lon` | Location. The FIPS code links county-level data such as drought |
| `status` | `proposed`, `approved`, `under_construction`, `operating`, `cancelled` |
| `capacity_mw` | Capacity in megawatts |
| `water_source`, `cooling`, `heat_reuse` | Scored categories (values in the rubric above) |
| `water_use.projected_mgy`, `water_use.actual_mgy` | Million gallons per year |
| `clean_power_pct` | Clean share documented by the operator, or `null` |
| `commitments[]` | `text`, `status`, `date`, `source` |
| `sources[]` | `title`, `url`, `retrieved` (date). Required on every record |
| `demo` | `true` marks a fictional record |

**Sourcing rule, enforced by the schema and tests:** a record without
`demo: true` must have at least one source, and every source and every
commitment source must have a URL and a retrieval date. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Pipeline

Each script downloads from a public source, saves the raw response under
`data/raw/<source>/<YYYY-MM-DD>/`, and writes a normalized JSON file that
records the source URL and retrieval date. Re-running a script on the same day
reuses the cached raw file instead of hitting the source again. Requests are
spaced at least two seconds apart.

```
python pipeline/usdm.py                  # drought by county, 7 states
python pipeline/eia_generation_mix.py    # state generation mix
python pipeline/cdss_water_rights.py --county Weld --county "El Paso"
```

| Script | Source | Output |
|---|---|---|
| `usdm.py` | [U.S. Drought Monitor data services](https://droughtmonitor.unl.edu/DmData/DataDownload/WebServiceInfo.aspx), county statistics by percent area | `data/normalized/drought_by_county.json` |
| `eia_generation_mix.py` | [EIA State Historical Tables](https://www.eia.gov/electricity/data/state/) (forms EIA-906, 920, 923), annual net generation by state and energy source. No API key | `data/normalized/state_generation_mix.json` |
| `cdss_water_rights.py` | [Colorado DWR / CDSS REST services](https://dwr.state.co.us/Rest/GET/Help), water rights net amounts by county. No API key | `data/normalized/cdss_water_rights_summary.json` (committed) and `data/normalized/cdss/<county>.json` (full extract, git-ignored) |
| `build_basemap.py` | us-atlas, a redistribution of U.S. Census Bureau cartographic boundaries | `data/geo/west_states.json` |

### How the county drought level is derived

The Drought Monitor reports, for each county, the percent of its area in each
category or worse (D0 abnormally dry through D4 exceptional drought). Fides
reports two values:

- `level`: the most severe category covering **at least half** of the county.
  This is the headline level shown on the map.
- `max_level`: the most severe category present **anywhere** in the county.

The U.S. Drought Monitor is produced jointly by the National Drought
Mitigation Center at the University of Nebraska-Lincoln, the U.S. Department
of Agriculture and the National Oceanic and Atmospheric Administration.

### Being a good guest

- Identify yourself: set `FIDES_USER_AGENT="your-name (you@example.org)"`.
- Do not lower `FIDES_REQUEST_DELAY` below the default of 2 seconds.
- CDSS limits anonymous use; the script asks for one large page per county
  rather than many small ones. Do not loop over every county in one run.
- Check each source's terms before adding a new one. No scraping of pages that
  forbid it.

## Roadmap

1. **Milestone 1 (this repo):** static site, schemas, scoring module with
   tests, first three pipeline scripts, drought layer.
2. Replace demo projects with sourced real projects, one county at a time.
3. County drought choropleth; water-rights context on Colorado projects.
4. Utility-level power mix instead of state-level.
5. Score water volume against local supply.
6. Later: paid certification and risk intelligence for developers and
   investors, kept separate from the public score.
