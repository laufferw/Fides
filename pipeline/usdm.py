"""U.S. Drought Monitor: current drought level by county for the Western states.

Source: U.S. Drought Monitor data services (National Drought Mitigation
Center, University of Nebraska-Lincoln), county statistics by percent area.
One request per state; the Monitor is updated weekly, on Thursdays.

Raw:        data/raw/usdm/<date>/<STATE>.json
Normalized: data/normalized/drought_by_county.json

Usage: python pipeline/usdm.py
"""
from __future__ import annotations

import datetime as dt
import json

from common import NORMALIZED_DIR, ROOT, WEST_STATES, fetch, today, write_json

API = "https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent"
CATEGORIES = ["D0", "D1", "D2", "D3", "D4"]
LABELS = {
    "None": "No drought",
    "D0": "Abnormally dry",
    "D1": "Moderate drought",
    "D2": "Severe drought",
    "D3": "Extreme drought",
    "D4": "Exceptional drought",
}


def levels(row: dict) -> tuple[str, str]:
    """Return (level, max_level) for one county row.

    The source percentages are cumulative: "d2" is the share of the county in
    D2 or worse. level is the worst category covering at least half the
    county; max_level is the worst category present anywhere in it.
    """
    level = max_level = "None"
    for category in CATEGORIES:
        pct = float(row[category.lower()])
        if pct >= 50:
            level = category
        if pct > 0:
            max_level = category
    return level, max_level


def normalize(rows: list[dict], source_url: str, retrieved: str) -> dict:
    """Keep the most recent weekly map and reduce each county to its levels."""
    if not rows:
        raise ValueError("no drought rows to normalize")
    latest = max(row["mapDate"] for row in rows)
    counties = {}
    for row in rows:
        if row["mapDate"] != latest:
            continue
        level, max_level = levels(row)
        counties[row["fips"]] = {
            "county": row["county"],
            "state": row["state"],
            "level": level,
            "max_level": max_level,
            "pct_area": {c.lower(): float(row[c.lower()]) for c in CATEGORIES} | {"none": float(row["none"])},
        }
    first = next(row for row in rows if row["mapDate"] == latest)
    return {
        "source": {
            "title": "U.S. Drought Monitor, county statistics by percent area",
            "url": source_url,
            "retrieved": retrieved,
            "attribution": "The U.S. Drought Monitor is jointly produced by the National Drought Mitigation Center at the University of Nebraska-Lincoln, the United States Department of Agriculture, and the National Oceanic and Atmospheric Administration.",
        },
        "map_date": latest[:10],
        "valid_start": first["validStart"][:10],
        "valid_end": first["validEnd"][:10],
        "method": "pct_area values are cumulative (share of county area in that category or worse). level = worst category covering at least 50% of the county; max_level = worst category present anywhere in the county.",
        "labels": LABELS,
        "counties": dict(sorted(counties.items())),
    }


def main() -> None:
    retrieved = today()
    end = dt.date.fromisoformat(retrieved)
    start = end - dt.timedelta(days=13)  # always spans at least one weekly map
    fmt = lambda d: f"{d.month}/{d.day}/{d.year}"
    rows: list[dict] = []
    for state in WEST_STATES:
        path = fetch(API, "usdm", f"{state}.json", headers={"Accept": "application/json"},
                     params={"aoi": state, "startdate": fmt(start), "enddate": fmt(end), "statisticsType": 1})
        rows.extend(json.loads(path.read_text(encoding="utf-8")))
    out = write_json(NORMALIZED_DIR / "drought_by_county.json", normalize(rows, API, retrieved))
    print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
