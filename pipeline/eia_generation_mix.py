"""EIA: state electricity generation mix, to estimate the clean-power share.

Source: EIA State Historical Tables, "Net Generation by State by Type of
Producer by Energy Source" (forms EIA-906, EIA-920 and EIA-923). This is a
public bulk file; no API key is needed. It is updated about once a year.

Raw:        data/raw/eia/<date>/annual_generation_state.xls
Normalized: data/normalized/state_generation_mix.json

Usage: python pipeline/eia_generation_mix.py [--no-nuclear]

Caveat: this is electricity *generated in* each state. It is not the mix a
particular utility delivers to a particular site, and it ignores imports and
exports between states. Treat it as an estimate.
"""
from __future__ import annotations

import argparse

from common import NORMALIZED_DIR, ROOT, WEST_STATES, fetch, today, write_json

URL = "https://www.eia.gov/electricity/data/state/annual_generation_state.xls"
PRODUCER = "Total Electric Power Industry"
RENEWABLE = ["Wind", "Solar Thermal and Photovoltaic", "Hydroelectric Conventional", "Geothermal"]
NUCLEAR = "Nuclear"


def read_rows(path) -> list[tuple[int, str, str, str, float]]:
    """Read (year, state, producer, energy source, MWh) rows from the workbook."""
    import xlrd  # imported here so the unit tests do not need it

    sheet = xlrd.open_workbook(str(path)).sheet_by_index(0)
    header = next(r for r in range(sheet.nrows) if str(sheet.cell_value(r, 0)).strip().upper() == "YEAR")
    rows = []
    for r in range(header + 1, sheet.nrows):
        year, state, producer, source, mwh = sheet.row_values(r)[:5]
        if year in ("", None) or mwh in ("", None):
            continue
        rows.append((int(year), str(state).strip(), str(producer).strip(), str(source).strip(), float(mwh)))
    return rows


def normalize(rows, source_url: str, retrieved: str, *, count_nuclear: bool = True,
              states: list[str] = WEST_STATES) -> dict:
    """Clean share of total net generation, per state, for the latest year."""
    rows = [r for r in rows if r[2] == PRODUCER and r[1] in states]
    if not rows:
        raise ValueError("no matching generation rows")
    year = max(r[0] for r in rows)
    clean_sources = RENEWABLE + ([NUCLEAR] if count_nuclear else [])

    result = {}
    for state in states:
        by_source = {source: mwh for y, s, _, source, mwh in rows if y == year and s == state}
        total = by_source.pop("Total", None)
        if not total:
            continue
        renewable = sum(by_source.get(s, 0.0) for s in RENEWABLE)
        nuclear = by_source.get(NUCLEAR, 0.0)
        clean = renewable + (nuclear if count_nuclear else 0.0)
        result[state] = {
            "total_mwh": round(total),
            "clean_mwh": round(clean),
            "clean_share_pct": round(100 * clean / total, 1),
            "clean_share_pct_with_nuclear": round(100 * (renewable + nuclear) / total, 1),
            "clean_share_pct_without_nuclear": round(100 * renewable / total, 1),
            "by_source_mwh": {k: round(v) for k, v in sorted(by_source.items())},
        }
    return {
        "source": {
            "title": "U.S. Energy Information Administration, State Historical Tables: Net Generation by State by Type of Producer by Energy Source (EIA-906, EIA-920, EIA-923)",
            "url": source_url,
            "retrieved": retrieved,
        },
        "year": year,
        "count_nuclear_as_clean": count_nuclear,
        "clean_sources": clean_sources,
        "method": "clean_share_pct = net generation from clean_sources / total net generation, all producers (Total Electric Power Industry), for the latest year in the file. In-state generation only; not a utility- or site-specific mix.",
        "states": result,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--no-nuclear", action="store_true", help="do not count nuclear as clean")
    args = parser.parse_args()
    retrieved = today()
    path = fetch(URL, "eia", "annual_generation_state.xls")
    data = normalize(read_rows(path), URL, retrieved, count_nuclear=not args.no_nuclear)
    out = write_json(NORMALIZED_DIR / "state_generation_mix.json", data)
    print(f"wrote {out.relative_to(ROOT)} (year {data['year']})")


if __name__ == "__main__":
    main()
