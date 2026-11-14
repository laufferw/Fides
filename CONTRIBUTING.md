# Contributing to Fides

Fides is only useful if people can trust it. That makes one rule more
important than all the others:

> **Never add a real-world fact without a source.** Every real project,
> number, commitment and rule needs a source URL and the date you read it. If
> you cannot source it, leave the field `null` or `undisclosed`. Do not
> estimate, round from memory, or fill a gap with what "everyone knows".

The schema and tests enforce the mechanical part of this. The judgment part is
yours.

## Adding a sourced project

### 1. Gather sources first

Good sources, roughly in order of preference:

1. Government records: zoning and permit filings, council minutes and staff
   reports, water-provider agreements, state water-rights records, utility
   commission filings.
2. The operator's own published documents: sustainability reports, press
   releases, permit applications.
3. Reporting by established news outlets, for facts not available above.

Avoid: social media posts, anonymous claims, marketing copy with no numbers,
and anything behind a login you cannot share. Do not scrape sites that forbid
it; read a source's terms before automating anything.

Keep the URL of the exact document (the PDF, not the page that links to it)
and note the date you read it.

### 2. Add the record to `data/projects.json`

Copy this template into the `projects` array and fill it in. Do **not** add
`"demo": true`; that flag is only for fictional records.

```json
{
  "id": "az-maricopa-example-campus",
  "name": "Example Campus",
  "operator": "Example Operator LLC",
  "county": "Maricopa",
  "county_fips": "04013",
  "state": "AZ",
  "lat": 33.33,
  "lon": -111.63,
  "status": "proposed",
  "capacity_mw": null,
  "water_source": "undisclosed",
  "cooling": "undisclosed",
  "water_use": { "projected_mgy": null, "actual_mgy": null },
  "clean_power_pct": null,
  "heat_reuse": "none",
  "commitments": [
    {
      "text": "The promise, quoted or closely paraphrased.",
      "status": "not_yet_due",
      "date": "2026-01-15",
      "source": {
        "title": "City council minutes, January 15, 2026",
        "url": "https://example.gov/minutes.pdf",
        "retrieved": "2026-02-01"
      }
    }
  ],
  "sources": [
    {
      "title": "Rezoning application staff report",
      "url": "https://example.gov/staff-report.pdf",
      "retrieved": "2026-02-01"
    }
  ]
}
```

Field notes:

- **`id`**: lowercase, hyphenated, starting with the state, e.g.
  `ut-utah-some-campus`. Never reuse or change an id once published.
- **`county_fips`**: the 5-digit county FIPS code. It links the project to the
  drought layer; the tests check that it exists in the drought data and
  matches the state.
- **`lat` / `lon`**: the site itself if a public document gives it, otherwise
  the centre of the parcel or city named in the source. Do not publish a
  location more precise than your sources support.
- **`water_use`**: million gallons per year. Convert from the source's units
  and say so in `notes` (1 acre-foot = 0.325851 million gallons). Add
  `actual_year` when you give `actual_mgy`.
- **`clean_power_pct`**: only a share the operator has documented for this
  site. Leave `null` otherwise; the site will show the state grid estimate
  and label it as an estimate.
- **`water_source`, `cooling`, `heat_reuse`, `status`**: use the exact values
  listed in [`data/schema/project.schema.json`](data/schema/project.schema.json).
  When a project fits two categories, choose the one that covers most of its
  use and explain in `notes`.
- **`sources`**: at least one. Every fact in the record should be traceable to
  one of them.

### 3. Recording commitments

A commitment is a specific, checkable public promise: "use only reclaimed
water", "publish annual water use", "cap use at 400 million gallons". Vague
aspirations ("we care about sustainability") are not commitments.

| Status | Use when |
|---|---|
| `not_yet_due` | The deadline has not arrived and there is nothing to check yet |
| `in_progress` | Work is visibly under way, but the promise is not yet met |
| `kept` | A source shows the promise was met |
| `broken` | A source shows it was not met, or the deadline passed unmet |

Marking a promise `kept` or `broken` changes the score, so it needs its own
evidence. Put the source that shows the outcome in the commitment's `source`
(and keep the source of the original promise in the project's `sources`).
When evidence is mixed, use `in_progress` and explain in `notes`.

### 4. Check your work

```
pip install -r pipeline/requirements.txt
make test
make serve      # open http://localhost:8000/site/ and find your project
```

The tests will fail if a non-demo record lacks a source URL or retrieval
date, if an id is duplicated, or if the county code does not match the state.

If the project's county is not yet in `data/normalized/drought_by_county.json`
(it covers AZ, CA, CO, NM, NV, UT and WY), say so in your pull request.

### 5. Open a pull request

In the description, list each scored field (water source, cooling, clean
power, heat reuse, each commitment status) with the source and page number
that supports it. A reviewer should be able to verify every one in a few
minutes.

## Adding or updating a local rule

Rules live in `data/rules.json` and are always real. Write the summary and
each provision from the official text (the ordinance, code section or enrolled
bill), not from news coverage. Use the `caveats` field to say what you could
not confirm. Prefer the source's own words for anything a reader might act on.

## Corrections

If a record is wrong or out of date, open an issue or a pull request with the
correcting source. Update the `retrieved` date whenever you re-check a source,
even if nothing changed. Operators are welcome to submit corrections on the
same terms as anyone else: with a public source.

## Demo records

The records with `"demo": true` are fictional and exist so the site has
something to show. Do not edit them to resemble real facilities. They will be
removed as real projects are added.

## Changing the score

The rubric lives in `site/js/scoring.js`. If you change a weight or a tier:

1. Change `RUBRIC` in `site/js/scoring.js`.
2. Update the tables in `README.md` (a test fails if they disagree).
3. Update `tests/scoring.test.mjs` so the expected points match.
4. Explain the reasoning in the pull request. Score changes affect every
   project, so they get more scrutiny than data changes.

The "How scoring works" tab is generated from `RUBRIC` and needs no edit.

## Code

- Keep it boring: plain HTML, CSS and ES modules in `site/`; Python standard
  library plus the few packages in `pipeline/requirements.txt`. No framework
  or build step without a clear reason.
- Pipeline scripts must cache raw downloads by date, write a normalized file
  with `source.url` and `source.retrieved`, wait between requests, and keep
  their parsing in a pure function with an offline test.
- Do not add paid services, API keys, or anything that deploys or publishes
  without discussing it first.
- Run `make test` before every commit.
