"""Build data/geo/west_states.json, the state outlines drawn by the map.

Source: us-atlas 3.0.1 (states-10m.json), a redistribution of the U.S. Census
Bureau's 2017 cartographic boundary files. Census boundary data is public
domain; us-atlas is ISC licensed.

Usage: python pipeline/build_basemap.py
"""
from __future__ import annotations

import io
import json
import tarfile

from common import ROOT, fetch, today, write_json

URL = "https://registry.npmjs.org/us-atlas/-/us-atlas-3.0.1.tgz"
STATES = {"04": "AZ", "06": "CA", "08": "CO", "32": "NV", "35": "NM", "49": "UT", "56": "WY"}


def decode_arcs(topology: dict) -> list[list[list[float]]]:
    """Undo TopoJSON delta + quantization encoding into lon/lat arcs."""
    (sx, sy), (tx, ty) = topology["transform"]["scale"], topology["transform"]["translate"]
    arcs = []
    for arc in topology["arcs"]:
        x = y = 0
        points = []
        for dx, dy in arc:
            x += dx
            y += dy
            points.append([x * sx + tx, y * sy + ty])
        arcs.append(points)
    return arcs


def ring(arc_indexes: list[int], arcs) -> list[list[float]]:
    points: list[list[float]] = []
    for index in arc_indexes:
        arc = arcs[index] if index >= 0 else arcs[~index][::-1]
        points.extend(arc if not points else arc[1:])
    out = []
    for lon, lat in points:
        p = [round(lon, 2), round(lat, 2)]
        if not out or out[-1] != p:
            out.append(p)
    return out


def polygons(geometry: dict, arcs) -> list[list[list[list[float]]]]:
    polys = [geometry["arcs"]] if geometry["type"] == "Polygon" else geometry["arcs"]
    return [[ring(r, arcs) for r in poly] for poly in polys]


def build(topology: dict) -> list[dict]:
    arcs = decode_arcs(topology)
    states = []
    for geometry in topology["objects"]["states"]["geometries"]:
        if geometry["id"] in STATES:
            states.append({
                "fips": geometry["id"],
                "abbr": STATES[geometry["id"]],
                "name": geometry["properties"]["name"],
                "polygons": polygons(geometry, arcs),
            })
    return sorted(states, key=lambda s: s["abbr"])


def main() -> None:
    tarball = fetch(URL, "us_atlas", "us-atlas-3.0.1.tgz")
    with tarfile.open(fileobj=io.BytesIO(tarball.read_bytes())) as tar:
        topology = json.load(tar.extractfile("package/states-10m.json"))
    out = write_json(ROOT / "data" / "geo" / "west_states.json", {
        "source": {
            "title": "us-atlas 3.0.1 (U.S. Census Bureau cartographic boundaries, 2017)",
            "url": URL,
            "retrieved": today(),
        },
        "states": build(topology),
    })
    print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
