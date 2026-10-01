import base64
import json
from pathlib import Path
import struct
import unittest

from import_osm import build_pack, rings


def decode_topology(pack):
    raw = base64.b64decode(pack["topologyBase64"], validate=True)
    assert raw[:4] == b"TMG1"
    node_count, edge_count = struct.unpack_from("<II", raw, 4)
    cursor, nodes, edges = 12, {}, []
    for _ in range(node_count):
        identifier, floor, x, y, size = struct.unpack_from("<IhHHB", raw, cursor)
        cursor += 11
        name = raw[cursor:cursor + size].decode()
        cursor += size
        nodes[identifier] = (floor, x, y, name)
    for _ in range(edge_count):
        edges.append(struct.unpack_from("<III", raw, cursor))
        cursor += 12
    assert cursor == len(raw)
    return nodes, edges


class CampusImportTest(unittest.TestCase):
    def fixture(self):
        return {
            "sourceUrl": "fixture", "retrievedOn": "2026-10-01", "rawSha256": "fixture",
            "attribution": "fixture", "relations": [],
            "nodes": [{"id": i, "lon": 37.55 + i * .00001, "lat": 55.83, "tags": {}} for i in range(1, 7)],
            "ways": [{"id": 1, "nodes": [1, 2, 3, 4, 5, 6], "tags": {"highway": "footway"}}],
        }

    def test_private_gate_breaks_connectivity_without_an_inferred_detour(self):
        source = self.fixture()
        source["nodes"][2]["tags"] = {"barrier": "gate", "access": "private"}
        pack = build_pack(source)
        self.assertNotIn("3", [n["osmId"] for n in pack["nodes"]])
        _, edges = decode_topology(pack)
        original = {p["id"]: int(p["osmId"]) for p in pack["nodes"]}
        self.assertEqual({(1, 2), (4, 5), (5, 6)}, {(original[a], original[b]) for a, b, _ in edges})

    def test_one_way_and_conditional_access_are_not_made_bidirectional(self):
        for restriction in ({"oneway:foot": "yes"}, {"foot:conditional": "yes @ (08:00-18:00)"}, {"access": "private"}):
            source = self.fixture()
            source["ways"][0]["tags"].update(restriction)
            self.assertEqual([], build_pack(source)["nodes"])

    def test_outside_nodes_do_not_extend_the_routing_extract(self):
        source = self.fixture()
        source["nodes"][-1]["lon"] = 37.6
        self.assertEqual(5, len(build_pack(source)["nodes"]))

    def test_polygon_join_does_not_invent_missing_geometry(self):
        self.assertEqual([[1, 2, 3, 4, 1]], rings([[1, 2, 3], [1, 4, 3]]))
        self.assertEqual([], rings([[1, 2, 3], [5, 4, 3]]))

    def test_retained_source_rebuilds_the_committed_pack(self):
        root = Path(__file__).parent / "data"
        source = json.loads((root / "campus-source.json").read_text(encoding="utf-8"))
        pack = build_pack(source)
        self.assertEqual(json.loads((root / "campus-pack.json").read_text(encoding="utf-8")), pack)
        nodes, edges = decode_topology(pack)
        self.assertEqual(5392, len(nodes))
        self.assertEqual(6399, len(edges))
        self.assertEqual(len(nodes), len(pack["nodes"]))
        for a, b, cost in edges:
            self.assertIn(a, nodes)
            self.assertIn(b, nodes)
            self.assertGreater(cost, 0)
            self.assertGreaterEqual(cost, abs(nodes[a][1] - nodes[b][1]) + abs(nodes[a][2] - nodes[b][2]))


if __name__ == "__main__":
    unittest.main()
