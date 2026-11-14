"""The committed data files must match their schemas and the sourcing rules."""
import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def load(path):
    return json.loads((DATA / path).read_text(encoding="utf-8"))


PROJECT_SCHEMA = Draft202012Validator(load("schema/project.schema.json"))
RULE_SCHEMA = Draft202012Validator(load("schema/rule.schema.json"))


def errors(validator, doc):
    return [e.message for e in validator.iter_errors(doc)]


def test_schemas_are_valid_json_schema():
    Draft202012Validator.check_schema(PROJECT_SCHEMA.schema)
    Draft202012Validator.check_schema(RULE_SCHEMA.schema)


def test_projects_file_matches_schema():
    assert errors(PROJECT_SCHEMA, load("projects.json")) == []


def test_rules_file_matches_schema():
    assert errors(RULE_SCHEMA, load("rules.json")) == []


def test_ids_are_unique():
    for doc, key in [(load("projects.json"), "projects"), (load("rules.json"), "rules")]:
        ids = [r["id"] for r in doc[key]]
        assert len(ids) == len(set(ids))


def test_county_fips_matches_state():
    state_fips = {"AZ": "04", "CA": "06", "CO": "08", "NM": "35", "NV": "32", "UT": "49", "WY": "56"}
    for p in load("projects.json")["projects"]:
        assert p["county_fips"].startswith(state_fips[p["state"]]), p["id"]


def test_demo_projects_are_obviously_demo():
    for p in load("projects.json")["projects"]:
        if p.get("demo"):
            assert p["id"].startswith("demo-"), p["id"]
            assert "fictional" in p["operator"].lower(), p["id"]


# --- The sourcing rule itself: a real record cannot ship without real sources.

def real_project():
    p = copy.deepcopy(load("projects.json")["projects"][0])
    p.pop("demo")
    source = {"title": "County filing", "url": "https://example.org/filing.pdf", "retrieved": "2026-01-02"}
    p["sources"] = [source]
    for c in p["commitments"]:
        c["source"] = source
    return p


def test_real_project_with_real_sources_passes():
    assert errors(PROJECT_SCHEMA, {"projects": [real_project()]}) == []


@pytest.mark.parametrize("sources", [
    [],
    [{"title": "Fictional demo record", "demo": True}],
    [{"title": "No URL", "retrieved": "2026-01-02"}],
    [{"title": "No date", "url": "https://example.org/a"}],
    [{"title": "Bad URL", "url": "example.org", "retrieved": "2026-01-02"}],
])
def test_real_project_without_proper_sources_fails(sources):
    p = real_project()
    p["sources"] = sources
    assert errors(PROJECT_SCHEMA, {"projects": [p]}) != []


def test_real_project_commitment_needs_real_source():
    p = real_project()
    p["commitments"][0]["source"] = {"title": "Fictional demo commitment", "demo": True}
    assert errors(PROJECT_SCHEMA, {"projects": [p]}) != []


def test_rule_without_source_fails():
    doc = load("rules.json")
    doc["rules"][0]["sources"] = []
    assert errors(RULE_SCHEMA, doc) != []
