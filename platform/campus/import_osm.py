"""Build a reproducible, offline campus dataset from a bounded OSM API extract.

No inferred entrances or straight-line connections are added. The retained OSM
source and derived pack are ODbL data; see README.md. Uses only Python's stdlib.
"""
import argparse
import base64
import hashlib
import json
import math
from pathlib import Path
import struct
import xml.etree.ElementTree as ET

BBOX = (37.535, 55.820, 37.574, 55.846)
SOURCE_URL = "https://api.openstreetmap.org/api/0.6/map?bbox=" + ",".join(map(str, BBOX))
WALKABLE = {"footway", "path", "pedestrian", "steps", "living_street", "service", "residential", "unclassified"}
RESTRICTED = {"no", "private", "customers", "permit", "agricultural", "forestry", "delivery"}
TAG_KEYS = {"name", "ref", "building", "highway", "foot", "access", "entrance", "barrier", "locked", "oneway:foot", "access:conditional", "foot:conditional", "type", "addr:street", "addr:housenumber"}


def tags(element):
    return {tag.attrib["k"]: tag.attrib["v"] for tag in element.findall("tag") if tag.attrib["k"] in TAG_KEYS}


def inside(node):
    return BBOX[0] <= node["lon"] <= BBOX[2] and BBOX[1] <= node["lat"] <= BBOX[3]


def passable(tag):
    return (tag.get("foot", tag.get("access", "yes")) not in RESTRICTED
            and not tag.get("foot:conditional") and not tag.get("access:conditional")
            and tag.get("locked") != "yes" and tag.get("barrier") not in {"wall", "fence", "retaining_wall"})


def read_source(path, retrieved_on):
    root = ET.parse(path).getroot()
    all_nodes = {int(e.attrib["id"]): {"id": int(e.attrib["id"]), "lat": float(e.attrib["lat"]), "lon": float(e.attrib["lon"]), "tags": tags(e)} for e in root.findall("node")}
    all_ways = {int(e.attrib["id"]): {"id": int(e.attrib["id"]), "nodes": [int(n.attrib["ref"]) for n in e.findall("nd")], "tags": tags(e)} for e in root.findall("way")}
    relations = []
    for e in root.findall("relation"):
        tag = tags(e)
        if "building" not in tag or tag.get("type") != "multipolygon":
            continue
        members = [{"id": int(m.attrib["ref"]), "role": m.attrib["role"]} for m in e.findall("member") if m.attrib["type"] == "way"]
        if members and all(m["id"] in all_ways for m in members):
            relations.append({"id": int(e.attrib["id"]), "tags": tag, "members": members})
    members = {m["id"] for r in relations for m in r["members"]}
    ways = [w for w in all_ways.values() if "building" in w["tags"] or "highway" in w["tags"] or w["id"] in members]
    used = {n for w in ways for n in w["nodes"]}
    return {
        "sourceUrl": SOURCE_URL, "retrievedOn": retrieved_on,
        "rawSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors",
        "nodes": [all_nodes[n] for n in sorted(used) if n in all_nodes],
        "ways": sorted(ways, key=lambda w: w["id"]), "relations": sorted(relations, key=lambda r: r["id"]),
    }


def rings(parts):
    """Join only explicitly shared OSM endpoints. Never close a missing segment."""
    pending = [list(p) for p in parts]
    result = []
    while pending:
        line = pending.pop(0)
        while line[0] != line[-1]:
            for i, other in enumerate(pending):
                if line[-1] == other[0]:
                    line.extend(other[1:])
                elif line[-1] == other[-1]:
                    line.extend(reversed(other[:-1]))
                elif line[0] == other[-1]:
                    line = other[:-1] + line
                elif line[0] == other[0]:
                    line = list(reversed(other[1:])) + line
                else:
                    continue
                pending.pop(i)
                break
            else:
                return []
        if len(line) >= 4:
            result.append(line)
    return result


def build_pack(source):
    nodes = {n["id"]: n for n in source["nodes"]}
    ways = {w["id"]: w for w in source["ways"]}
    features, edges = [], set()
    omitted = []

    def coords(ids):
        return [[nodes[n]["lon"], nodes[n]["lat"]] for n in ids]

    def building(key, tag, outlines, holes=()):
        # Multiple outer rings with holes require containment assignment. Retain
        # simple complete polygons; report unsupported geometry instead of guessing.
        if not outlines or (len(outlines) > 1 and holes):
            omitted.append(key)
            return
        if any(n not in nodes for ring in list(outlines) + list(holes) for n in ring):
            omitted.append(key)
            return
        if len(outlines) == 1:
            geometry = {"type": "Polygon", "coordinates": [coords(outlines[0])] + [coords(h) for h in holes]}
        else:
            geometry = {"type": "MultiPolygon", "coordinates": [[coords(r)] for r in outlines]}
        address = " ".join(tag.get(k, "") for k in ("addr:street", "addr:housenumber")).strip()
        features.append({"type": "Feature", "id": key, "properties": {"kind": "building", "name": tag.get("name", address), "address": address, "osm": key}, "geometry": geometry})

    relation_members = {m["id"] for r in source["relations"] for m in r["members"]}
    for relation in source["relations"]:
        outer = rings([ways[m["id"]]["nodes"] for m in relation["members"] if m["role"] in ("outer", "")])
        inner_parts = [ways[m["id"]]["nodes"] for m in relation["members"] if m["role"] == "inner"]
        inner = rings(inner_parts)
        if inner_parts and not inner:
            omitted.append(f"relation/{relation['id']}")
            continue
        building(f"relation/{relation['id']}", relation["tags"], outer, inner)
    for way in source["ways"]:
        tag, ids = way["tags"], way["nodes"]
        if "building" in tag and way["id"] not in relation_members:
            building(f"way/{way['id']}", tag, rings([ids]))
        if tag.get("highway") not in WALKABLE or not passable(tag) or tag.get("oneway:foot", "no") != "no":
            continue
        # TMG1 is undirected: do not silently reverse a one-way pedestrian path.
        for a, b in zip(ids, ids[1:]):
            if a == b or a not in nodes or b not in nodes:
                continue
            if not all(inside(nodes[n]) and passable(nodes[n]["tags"]) for n in (a, b)):
                continue
            edges.add(tuple(sorted((a, b))))
    used = sorted({n for edge in edges for n in edge})
    index = {n: i + 1 for i, n in enumerate(used)}
    points = []
    for osm_id in used:
        node = nodes[osm_id]
        x = round((node["lon"] - BBOX[0]) * 111_320 * math.cos(math.radians(BBOX[1])))
        y = round((node["lat"] - BBOX[1]) * 111_320)
        assert 0 <= x <= 65535 and 0 <= y <= 65535
        points.append({"id": index[osm_id], "osmId": str(osm_id), "lon": node["lon"], "lat": node["lat"], "x": x, "y": y})
    xy = {n["id"]: n for n in points}
    topology = bytearray(b"TMG1" + struct.pack("<II", len(points), len(edges)))
    for p in points:
        name = f"n{p['id']}".encode()
        topology.extend(struct.pack("<IhHHB", p["id"], 0, p["x"], p["y"], len(name)) + name)
    line_coords = []
    for a, b in sorted(edges):
        start, end = xy[index[a]], xy[index[b]]
        # Existing router uses a Manhattan heuristic. Match its coordinate metric
        # so the lower bound is admissible; display distance is computed separately.
        cost = max(1, abs(start["x"] - end["x"]) + abs(start["y"] - end["y"]))
        topology.extend(struct.pack("<III", index[a], index[b], cost))
        line_coords.append(coords((a, b)))
    features.append({"type": "Feature", "properties": {"kind": "path"}, "geometry": {"type": "MultiLineString", "coordinates": line_coords}})
    presets = []
    for osm_id, label in ((7678045074, "Корпус 15 · вход"), (7834243335, "Корпус 18 · вход")):
        if osm_id in index and nodes[osm_id]["tags"].get("entrance") == "main":
            presets.append({"id": index[osm_id], "name": label, "osmId": str(osm_id)})
    for osm_id, relation_id, label in ((7677706200, 1563335, "Корпус 5 · подход"), (7677706237, 1897390, "Корпус 9 · подход")):
        relation = next((r for r in source["relations"] if r["id"] == relation_id), None)
        if relation is None:
            continue
        boundary = {n for member in relation["members"] for n in ways[member["id"]]["nodes"]}
        if osm_id in index and osm_id in boundary:
            presets.append({"id": index[osm_id], "name": label, "osmId": str(osm_id)})
    return {
        "format": "tim-campus-v1", "sourceUrl": source["sourceUrl"], "retrievedOn": source["retrievedOn"],
        "sourceSha256": source["rawSha256"], "license": "ODbL-1.0", "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
        "attribution": source["attribution"], "attributionUrl": "https://www.openstreetmap.org/copyright",
        "bounds": list(BBOX), "center": [37.5527, 55.8326],
        "topologyBase64": base64.b64encode(topology).decode(), "nodes": points, "presets": presets,
        "map": {"type": "FeatureCollection", "features": features},
        "omittedIncompleteBuildings": omitted,
        "scope": "Outdoor mapped paths only. No inferred links, indoor rooms, accessibility claims or guarantees that gates are open.",
    }


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="OSM XML download or retained campus-source.json")
    parser.add_argument("--retrieved-on", required=True)
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "data")
    args = parser.parse_args()
    source = json.loads(args.source.read_text(encoding="utf-8")) if args.source.suffix == ".json" else read_source(args.source, args.retrieved_on)
    pack = build_pack(source)
    write_json(args.output / "campus-source.json", source)
    write_json(args.output / "campus-pack.json", pack)
    print(json.dumps({"nodes": len(pack["nodes"]), "features": len(pack["map"]["features"]), "presets": pack["presets"], "omitted": pack["omittedIncompleteBuildings"], "packBytes": (args.output / "campus-pack.json").stat().st_size}, ensure_ascii=False))


if __name__ == "__main__":
    main()
