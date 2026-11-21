# Next steps

Where things stood at the end of the session on 2026-11-14, and what to pick
up next.

## Where we are

Milestone 1 is done and on `main` (commit `809683d`).

- Static site in `site/`: map, filters, project list, detail panel, Local
  rules tab, How scoring works tab, drought layer.
- `data/projects.json`: 11 **fictional** demo projects. `data/rules.json`:
  3 real rules (Chandler AZ, Marana AZ, Utah HB 76), cited to official texts.
- Scoring module with 45 unit tests; 34 data and pipeline tests. All passing.
- Pipeline scripts for the U.S. Drought Monitor, EIA state generation mix and
  Colorado DWR water rights, each run once against the live source on
  2026-11-14.

To get going again:

```
pip install -r pipeline/requirements.txt
make test
make serve          # http://localhost:8000/site/
```

## Decisions waiting on you

These were made or left open during the build and need your call.

1. **Review the scoring tiers.** You set the five weights (25/25/25/10/15).
   The points inside each component were proposed during the build, not
   specified by you. See the tables in `README.md`. In particular:
   - Air cooling scores 22, just under closed-loop at 25.
   - "No track record yet" earns half credit (7.5 of 15).
   - Undisclosed clean power falls back to the state grid estimate, so
     silence can beat disclosure. Consider scoring undisclosed as 0, or
     capping the estimate.
2. **Nuclear as clean power.** Currently counted. It moves Arizona from
   16.1% to 44.0% clean. `python pipeline/eia_generation_mix.py --no-nuclear`
   switches it off.
3. **Licence.** There is no licence file. Pick one for the code and one for
   the data (they are often different).
4. **Default branch.** GitHub probably made `claude/vibrant-tesla-fe2wkz` the
   default because it was pushed first. Switch it to `main` under Settings →
   General → Default branch, then delete the work branch.
5. **Hosting.** Done: `.github/workflows/pages.yml` publishes the site to
   GitHub Pages (https://laufferw.github.io/Fides/) on every push to `main`,
   after the tests pass.

## Loose ends from Milestone 1

- **Utah HB 76:** the entry is based on the enrolled bill. The signing date
  was not confirmed; `adopted` is `null`.
- **Marana:** the adoption day in December 2024 is illegible in the scanned
  ordinance, so only the month is recorded and there is no exact effective
  date. News reports mention amendments in October 2026 that have not been
  reviewed against a primary source.
- **Chandler:** Ordinance 5033 does not cover water. Chandler's water rules
  for large users sit elsewhere in the City Code and have not been reviewed.
  A code update was reportedly under discussion in late October 2026.
- **Colorado water rights** are downloaded and summarized but not shown
  anywhere in the site.
- ~~Overlapping map markers~~ Done: `site/js/layout.js` nudges markers apart
  so none overlap; a leader line shows the true spot when one moves far.
- ~~No CI~~ Done: `.github/workflows/ci.yml` runs `make test` on every pull
  request and every push to a branch other than `main`.
- **Pipeline commits were coarser than planned:** the three scripts landed in
  one commit.

## Milestone 2 (proposed): first real projects

The goal is to replace demo records with sourced ones.

1. Pick one county to start. Maricopa County, AZ or Utah County, UT would
   connect directly to the rules already documented.
2. For each project, collect primary sources (zoning filings, council
   minutes, water agreements) and add a record following `CONTRIBUTING.md`.
3. Decide how demo and real records coexist while there are only a few real
   ones: a filter, a separate view, or removing demo records for a county
   once it has real ones.
4. Add commitment evidence: a field for the source that shows a promise was
   kept or broken, separate from the source of the promise itself.
5. Add a "last checked" date per project and show it in the detail panel.

## Later

- County drought choropleth, instead of rings on markers only.
- Show Colorado water-rights context on Colorado project pages.
- Utility-level power mix (EIA-861 or utility filings) in place of the
  state-level estimate.
- Score water volume against local supply.
- More rules: Tucson, Mesa and Phoenix have reportedly adopted data center
  standards; verify each from the official text before adding.
- Scheduled pipeline refresh (drought weekly, EIA yearly). A scheduled
  job is a deployment decision, so it needs your OK first.
- Paid certification and risk intelligence, kept separate from the public
  score.

## Environment notes

- The cloud environment named **Fides** allows six hosts beyond package
  registries: `usdmdataservices.unl.edu`, `dwr.state.co.us`, `www.eia.gov`,
  `www.chandleraz.gov`, `www.maranaaz.gov`, `le.utah.gov`. Researching rules
  for a new jurisdiction means adding its official site to that list.
- `data/raw/` and `data/normalized/cdss/` are git-ignored. A fresh clone has
  no raw cache; re-run the pipeline scripts to rebuild it.
- The EIA file needs `xlrd` (it is an old-format `.xls`).
