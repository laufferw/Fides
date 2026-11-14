"""Pipeline normalizers, tested offline against small recorded samples."""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))

import cdss_water_rights  # noqa: E402
import common  # noqa: E402
import eia_generation_mix  # noqa: E402
import usdm  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


# --- common.fetch: cache-first, dated folders

class FakeResponse:
    def __init__(self, body):
        self.body = body

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_fetch_writes_dated_raw_file_and_reuses_it(tmp_path, monkeypatch):
    calls = []

    def fake_urlopen(request, timeout):
        calls.append((request.full_url, request.get_header("User-agent")))
        return FakeResponse(b'{"ok": true}')

    monkeypatch.setattr(common, "RAW_DIR", tmp_path)
    monkeypatch.setattr(common, "REQUEST_DELAY", 0)
    monkeypatch.setattr(common.urllib.request, "urlopen", fake_urlopen)

    path = common.fetch("https://example.org/api", "demo", "a.json", params={"q": "x y"}, date="2026-01-02")
    assert path == tmp_path / "demo" / "2026-01-02" / "a.json"
    assert path.read_bytes() == b'{"ok": true}'
    assert calls == [("https://example.org/api?q=x+y", common.USER_AGENT)]

    # Same day, same file: served from cache, no second request.
    common.fetch("https://example.org/api", "demo", "a.json", params={"q": "x y"}, date="2026-01-02")
    assert len(calls) == 1

    # A new day gets a new dated folder and a new request.
    common.fetch("https://example.org/api", "demo", "a.json", date="2026-01-03")
    assert len(calls) == 2
    assert (tmp_path / "demo" / "2026-01-03" / "a.json").exists()


def test_fetch_waits_between_requests(tmp_path, monkeypatch):
    sleeps = []
    monkeypatch.setattr(common, "RAW_DIR", tmp_path)
    monkeypatch.setattr(common, "REQUEST_DELAY", 2)
    monkeypatch.setattr(common, "_last_request", common.time.monotonic())
    monkeypatch.setattr(common.time, "sleep", sleeps.append)
    monkeypatch.setattr(common.urllib.request, "urlopen", lambda request, timeout: FakeResponse(b"x"))
    common.fetch("https://example.org/b", "demo", "b.txt", date="2026-01-02")
    assert len(sleeps) == 1 and 1.5 < sleeps[0] <= 2


# --- U.S. Drought Monitor

def row(**pct):
    base = {"none": 0, "d0": 0, "d1": 0, "d2": 0, "d3": 0, "d4": 0}
    return base | pct


@pytest.mark.parametrize("pct, expected", [
    (row(none=100), ("None", "None")),
    (row(none=60, d0=40), ("None", "D0")),
    (row(d0=100, d1=50), ("D1", "D1")),
    (row(d0=100, d1=49.99), ("D0", "D1")),
    (row(d0=100, d1=100, d2=63.36, d3=16.85), ("D2", "D3")),
    (row(d0=100, d1=100, d2=100, d3=100, d4=100), ("D4", "D4")),
    (row(d0=100, d1=100, d2=100, d3=100, d4=0.01), ("D3", "D4")),
])
def test_usdm_levels(pct, expected):
    assert usdm.levels(pct) == expected


def test_usdm_normalize_keeps_only_the_latest_map():
    out = usdm.normalize(fixture("usdm_wy_sample.json"), usdm.API, "2026-11-14")
    assert out["map_date"] == "2026-11-10"
    assert (out["valid_start"], out["valid_end"]) == ("2026-11-10", "2026-11-16")
    assert out["source"] == out["source"] | {"url": usdm.API, "retrieved": "2026-11-14"}
    assert list(out["counties"]) == ["56001", "56021", "56039"]

    albany = out["counties"]["56001"]
    assert albany["county"] == "Albany County" and albany["state"] == "WY"
    assert (albany["level"], albany["max_level"]) == ("D2", "D3")
    assert albany["pct_area"] == {"d0": 100.0, "d1": 100.0, "d2": 63.36, "d3": 16.85, "d4": 0.0, "none": 0.0}
    # Teton: all abnormally dry, a sliver of D1.
    assert (out["counties"]["56039"]["level"], out["counties"]["56039"]["max_level"]) == ("D0", "D1")


def test_usdm_normalize_rejects_empty_input():
    with pytest.raises(ValueError):
        usdm.normalize([], usdm.API, "2026-11-14")


# --- EIA state generation mix

def eia_rows():
    return [tuple(r) for r in fixture("eia_az_ut_sample.json")]


def test_eia_clean_share_with_nuclear():
    out = eia_generation_mix.normalize(eia_rows(), eia_generation_mix.URL, "2026-11-14", states=["AZ", "UT"])
    assert out["year"] == 2024
    assert out["count_nuclear_as_clean"] is True
    assert "Nuclear" in out["clean_sources"]
    assert out["source"]["retrieved"] == "2026-11-14"

    ut = out["states"]["UT"]
    # geothermal 450,980 + hydro 758,694 + solar 5,311,068 + wind 748,405
    assert ut["clean_mwh"] == 7269147
    assert ut["total_mwh"] == 35133906
    assert ut["clean_share_pct"] == 20.7
    assert "Total" not in ut["by_source_mwh"]

    az = out["states"]["AZ"]
    assert az["clean_share_pct"] == az["clean_share_pct_with_nuclear"] == 44.0
    assert az["clean_share_pct_without_nuclear"] == 16.1


def test_eia_clean_share_without_nuclear():
    out = eia_generation_mix.normalize(eia_rows(), eia_generation_mix.URL, "2026-11-14", count_nuclear=False, states=["AZ", "UT"])
    assert out["count_nuclear_as_clean"] is False
    assert "Nuclear" not in out["clean_sources"]
    assert out["states"]["AZ"]["clean_share_pct"] == 16.1
    assert out["states"]["AZ"]["clean_share_pct_with_nuclear"] == 44.0
    assert out["states"]["UT"]["clean_share_pct"] == 20.7  # Utah has no nuclear generation


def test_eia_uses_only_industry_totals_and_requested_states():
    out = eia_generation_mix.normalize(eia_rows(), eia_generation_mix.URL, "2026-11-14", states=["UT"])
    assert list(out["states"]) == ["UT"]
    with pytest.raises(ValueError):
        eia_generation_mix.normalize(eia_rows(), eia_generation_mix.URL, "2026-11-14", states=["ZZ"])


# --- Colorado DWR (CDSS) water rights

def test_cdss_normalize_and_summary():
    out = cdss_water_rights.normalize(fixture("cdss_weld_sample.json"), "Weld", "https://example.org/q", "2026-11-14")
    assert out["county"] == "Weld"
    assert out["source"]["url"] == "https://example.org/q" and out["source"]["retrieved"] == "2026-11-14"
    assert len(out["rights"]) == 5

    hoover = out["rights"][0]
    assert hoover["structure_name"] == "HOOVER DITCH"
    assert hoover["units"] == "cfs" and hoover["net_absolute"] == 23.0
    assert hoover["appropriation_date"] == "1884-02-21"
    assert hoover["more_information"].startswith("https://dwr.state.co.us/")

    s = out["summary"]
    assert s["rights_count"] == 5
    assert s["structures_count"] == 3
    assert s["by_structure_type"] == {"Ditch": 5}
    # Flow (cfs) and volume (acre-feet) are never added together.
    assert s["net_amounts"]["cfs"] == {"net_absolute": 1247.96, "net_conditional": 0.0}
    assert s["net_amounts"]["acre_feet"] == {"net_absolute": 29779.0, "net_conditional": 43821.0}
    assert (s["earliest_appropriation_date"], s["latest_appropriation_date"]) == ("1884-02-21", "2006-12-29")


def test_cdss_placeholder_dates_become_null():
    raw = fixture("cdss_weld_sample.json")["ResultList"][0]
    assert raw["priorAdjudicationDate"].startswith("0001")
    right = cdss_water_rights.normalize_right(raw | {"appropriationDate": raw["priorAdjudicationDate"]})
    assert right["appropriation_date"] is None


def test_cdss_refuses_truncated_results():
    payload = fixture("cdss_weld_sample.json") | {"PageCount": 3}
    with pytest.raises(ValueError, match="pages"):
        cdss_water_rights.normalize(payload, "Weld", "https://example.org/q", "2026-11-14")


def test_cdss_slug():
    assert cdss_water_rights.slug("El Paso") == "el_paso"


# --- The committed normalized outputs are real, sourced and cover the projects.

def test_committed_outputs_carry_source_and_date():
    for name in ["drought_by_county.json", "state_generation_mix.json"]:
        doc = json.loads((ROOT / "data" / "normalized" / name).read_text(encoding="utf-8"))
        assert doc["source"]["url"].startswith("https://")
        assert len(doc["source"]["retrieved"]) == 10


def test_every_project_county_has_a_drought_level():
    drought = json.loads((ROOT / "data" / "normalized" / "drought_by_county.json").read_text(encoding="utf-8"))
    projects = json.loads((ROOT / "data" / "projects.json").read_text(encoding="utf-8"))["projects"]
    for p in projects:
        county = drought["counties"][p["county_fips"]]
        assert county["state"] == p["state"], p["id"]
        assert county["county"].startswith(p["county"]), p["id"]
