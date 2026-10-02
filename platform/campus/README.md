# Campus source data

The retained `data/campus-source.json` and derived `data/campus-pack.json` contain OpenStreetMap data, © OpenStreetMap contributors, under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Their metadata retains the source endpoint, retrieval date and original download hash. Display the attribution and [copyright link](https://www.openstreetmap.org/copyright) wherever the map is shown. Application code remains under the repository's code license; the OSM database and its derivatives retain ODbL.

Rebuild deterministically, without network access:

```powershell
python platform/campus/import_osm.py platform/campus/data/campus-source.json --retrieved-on 2026-10-01 --install
```

The original bounded API download is cached locally as `.cache/phase8-campus.osm`. Contributor account metadata is not needed by the map and is excluded from the retained data.

The pack preserves mapped building geometry and outdoor walking connections. It does not infer missing entrances, draw connecting lines across unmapped space, invent room locations or claim step-free access. Explicit access restrictions, conditional access, locked gates, impassable wall/fence nodes and pedestrian one-way ways are excluded from the undirected TMG1 graph. Disconnected paths remain disconnected. Incomplete building polygons are reported in pack metadata.

TMG1 coordinates use a local metre grid. Edge cost uses that grid's Manhattan distance to satisfy the existing router's heuristic; it is not a duration or an exact travelled distance. A displayed approximate route distance must instead use the path's geographic coordinates.

Two named presets use OSM nodes tagged as main entrances: building 15 (`7678045074`) and building 18 (`7834243335`). Building identities can be cross-checked against the university addresses retained in `docs/evidence/campus-addresses.json`. Other route endpoints must be selected on mapped paths; this dataset does not assert that every building has a mapped reachable entrance.

Approach presets at buildings 5 (`7677706200`) and 9 (`7677706237`) are shared nodes of mapped paths and building boundaries, without an entrance tag. They are labelled approaches, not confirmed entrances. Building 18's approach is disconnected from the public walking network by OSM node `7834243336`, a gate tagged `access=private`; the graph preserves that restriction and must report no public route from building 15 to building 18.
