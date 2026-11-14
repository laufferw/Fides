"""Colorado DWR (CDSS): water rights net amounts, looked up by county.

Source: Colorado Division of Water Resources, Colorado's Decision Support
Systems (CDSS) REST services, waterrights/netamount. No API key is needed for
light use. One request per county (one large page), so a run for two counties
is two requests.

Raw:        data/raw/cdss/<date>/netamount_<county>.json
Normalized: data/normalized/cdss/<county>.json        (full extract, git-ignored)
            data/normalized/cdss_water_rights_summary.json  (committed)

Usage: python pipeline/cdss_water_rights.py --county Weld --county "El Paso"

Units: CDSS reports each right in CFS (a flow rate, cubic feet per second) or
AF (a volume, acre-feet). They cannot be added together, so totals are kept
separately. "Absolute" rights have been put to use; "conditional" rights are
reserved but not yet perfected.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter

from common import NORMALIZED_DIR, ROOT, fetch, today, write_json

API = "https://dwr.state.co.us/Rest/GET/api/v2/waterrights/netamount/"
PAGE_SIZE = 50000
UNITS = {"C": "cfs", "A": "acre_feet"}
DEFAULT_COUNTIES = ["Weld", "El Paso"]
SUMMARY = NORMALIZED_DIR / "cdss_water_rights_summary.json"


def slug(county: str) -> str:
    return county.strip().lower().replace(" ", "_")


def normalize_right(r: dict) -> dict:
    """Keep the fields a reader needs; drop survey-grid and internal columns."""
    date = lambda v: v[:10] if v and not v.startswith("0001") else None
    return {
        "id": r["waterRightNetAmtNum"],
        "wdid": r["wdid"],
        "structure_name": r["structureName"],
        "structure_type": r["structureType"],
        "water_source": r["waterSource"],
        "county": r["county"],
        "division": r["division"],
        "water_district": r["waterDistrict"],
        "lat": r.get("latitude"),
        "lon": r.get("longitude"),
        "appropriation_date": date(r.get("appropriationDate")),
        "adjudication_date": date(r.get("adjudicationDate")),
        "admin_number": r.get("adminNumber"),
        "decreed_uses": r.get("decreedUses"),
        "units": UNITS.get(r.get("decreedUnits"), r.get("decreedUnits")),
        "net_absolute": r.get("netAbsolute") or 0.0,
        "net_conditional": r.get("netConditional") or 0.0,
        "more_information": r.get("moreInformation"),
    }


def summarize(rights: list[dict]) -> dict:
    totals = {unit: {"net_absolute": 0.0, "net_conditional": 0.0} for unit in UNITS.values()}
    for r in rights:
        if r["units"] in totals:
            totals[r["units"]]["net_absolute"] += r["net_absolute"]
            totals[r["units"]]["net_conditional"] += r["net_conditional"]
    for unit in totals.values():
        for key in unit:
            unit[key] = round(unit[key], 2)
    dates = sorted(r["appropriation_date"] for r in rights if r["appropriation_date"])
    return {
        "rights_count": len(rights),
        "structures_count": len({r["wdid"] for r in rights}),
        "by_structure_type": dict(Counter(r["structure_type"] or "Unknown" for r in rights).most_common()),
        "net_amounts": totals,
        "earliest_appropriation_date": dates[0] if dates else None,
        "latest_appropriation_date": dates[-1] if dates else None,
    }


def normalize(payload: dict, county: str, source_url: str, retrieved: str) -> dict:
    if payload.get("PageCount", 1) > 1:
        raise ValueError(f"{county}: result spans {payload['PageCount']} pages; raise PAGE_SIZE")
    rights = [normalize_right(r) for r in payload["ResultList"]]
    return {
        "source": {
            "title": "Colorado Division of Water Resources, CDSS REST services: water rights net amounts",
            "url": source_url,
            "retrieved": retrieved,
        },
        "county": county,
        "summary": summarize(rights),
        "rights": rights,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--county", action="append", help="Colorado county name; repeatable")
    args = parser.parse_args()
    retrieved = today()

    summary = json.loads(SUMMARY.read_text(encoding="utf-8")) if SUMMARY.exists() else {}
    summary.setdefault("counties", {})
    for county in args.county or DEFAULT_COUNTIES:
        params = {"county": county, "format": "json", "pageSize": PAGE_SIZE}
        path = fetch(API, "cdss", f"netamount_{slug(county)}.json", params=params)
        source_url = f"{API}?county={county.replace(' ', '%20')}&format=json"
        data = normalize(json.loads(path.read_text(encoding="utf-8")), county, source_url, retrieved)
        out = write_json(NORMALIZED_DIR / "cdss" / f"{slug(county)}.json", data)
        summary["counties"][county] = {"source": data["source"], **data["summary"]}
        print(f"wrote {out.relative_to(ROOT)} ({data['summary']['rights_count']} rights)")

    summary["units"] = "cfs = cubic feet per second (flow); acre_feet = volume. Absolute rights are in use; conditional rights are not yet perfected."
    summary["counties"] = dict(sorted(summary["counties"].items()))
    write_json(SUMMARY, {"units": summary["units"], "counties": summary["counties"]})
    print(f"wrote {SUMMARY.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
