use std::cmp::Reverse;
use std::collections::BinaryHeap;

const FLOOR_PENALTY: u32 = 40;

#[derive(uniffi::Record)]
pub struct CampusRoute {
    pub found: bool,
    pub room_names: Vec<String>,
    pub floors: Vec<i32>,
    pub cost: u32,
    pub floor_changes: u32,
}

struct Node {
    #[allow(dead_code)]
    id: u32,
    floor: i16,
    x: u16,
    y: u16,
    name: String,
}

/// route_campus runs A* on a compiled campus graph. The bytes are the topology, not GeoJSON.
#[uniffi::export]
pub fn route_campus(topology: Vec<u8>, from_room: String, to_room: String) -> CampusRoute {
    match search(&topology, &from_room, &to_room) {
        Ok(route) => route,
        Err(_) => CampusRoute { found: false, room_names: Vec::new(), floors: Vec::new(), cost: 0, floor_changes: 0 },
    }
}

#[allow(dead_code)]
pub fn encode_topology(nodes: &[(u32, i16, u16, u16, &str)], edges: &[(u32, u32, u32)]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(b"TMG1");
    put_u32(&mut out, nodes.len() as u32);
    put_u32(&mut out, edges.len() as u32);
    for (id, floor, x, y, name) in nodes {
        put_u32(&mut out, *id);
        put_i16(&mut out, *floor);
        put_u16(&mut out, *x);
        put_u16(&mut out, *y);
        let bytes = name.as_bytes();
        out.push(bytes.len() as u8);
        out.extend_from_slice(bytes);
    }
    for (from, to, cost) in edges {
        put_u32(&mut out, *from);
        put_u32(&mut out, *to);
        put_u32(&mut out, *cost);
    }
    out
}

fn search(bytes: &[u8], from_room: &str, to_room: &str) -> Result<CampusRoute, String> {
    let (nodes, adj) = parse(bytes)?;
    let start = nodes.iter().position(|node| node.name == from_room).ok_or("from")?;
    let goal = nodes.iter().position(|node| node.name == to_room).ok_or("to")?;
    if start == goal {
        return Ok(one_room(&nodes[start]));
    }
    let floor_step = min_floor_step(&nodes, &adj);
    let mut best = vec![u32::MAX; nodes.len()];
    let mut parent = vec![usize::MAX; nodes.len()];
    best[start] = 0;
    let mut heap = BinaryHeap::new();
    heap.push(Reverse((heuristic(&nodes[start], &nodes[goal], floor_step), 0u32, start)));
    while let Some(Reverse((_, g, at))) = heap.pop() {
        if g != best[at] {
            continue;
        }
        if at == goal {
            break;
        }
        for (to, base) in &adj[at] {
            let mut step = *base;
            if nodes[at].floor != nodes[*to].floor {
                step = step.saturating_add(FLOOR_PENALTY);
            }
            let next = g.saturating_add(step);
            if next < best[*to] {
                best[*to] = next;
                parent[*to] = at;
                let score = next.saturating_add(heuristic(&nodes[*to], &nodes[goal], floor_step));
                heap.push(Reverse((score, next, *to)));
            }
        }
    }
    if best[goal] == u32::MAX {
        return Ok(CampusRoute { found: false, room_names: Vec::new(), floors: Vec::new(), cost: 0, floor_changes: 0 });
    }
    let mut path = Vec::new();
    let mut cursor = goal;
    loop {
        path.push(cursor);
        if cursor == start {
            break;
        }
        cursor = parent[cursor];
        if cursor == usize::MAX {
            return Err("broken path".into());
        }
    }
    path.reverse();
    let mut floor_changes = 0u32;
    for pair in path.windows(2) {
        if nodes[pair[0]].floor != nodes[pair[1]].floor {
            floor_changes += 1;
        }
    }
    Ok(CampusRoute {
        found: true,
        room_names: path.iter().map(|index| nodes[*index].name.clone()).collect(),
        floors: path.iter().map(|index| nodes[*index].floor as i32).collect(),
        cost: best[goal],
        floor_changes,
    })
}

fn one_room(node: &Node) -> CampusRoute {
    CampusRoute {
        found: true,
        room_names: vec![node.name.clone()],
        floors: vec![node.floor as i32],
        cost: 0,
        floor_changes: 0,
    }
}

fn heuristic(from: &Node, to: &Node, floor_step: u32) -> u32 {
    let dx = (from.x as i32 - to.x as i32).unsigned_abs();
    let dy = (from.y as i32 - to.y as i32).unsigned_abs();
    let floors = (from.floor - to.floor).unsigned_abs() as u32;
    dx + dy + floors * floor_step
}

fn min_floor_step(nodes: &[Node], adj: &[Vec<(usize, u32)>]) -> u32 {
    let mut step = u32::MAX;
    for (from, edges) in adj.iter().enumerate() {
        for (to, base) in edges {
            let delta = (nodes[from].floor - nodes[*to].floor).unsigned_abs() as u32;
            if delta == 0 {
                continue;
            }
            let per_floor = base.saturating_add(FLOOR_PENALTY) / delta;
            step = step.min(per_floor);
        }
    }
    if step == u32::MAX { 0 } else { step }
}

fn parse(bytes: &[u8]) -> Result<(Vec<Node>, Vec<Vec<(usize, u32)>>), String> {
    if bytes.len() < 12 || &bytes[0..4] != b"TMG1" {
        return Err("topology magic".into());
    }
    let mut cursor = 4;
    let node_count = read_u32(bytes, &mut cursor)?;
    let edge_count = read_u32(bytes, &mut cursor)?;
    let mut nodes = Vec::with_capacity(node_count as usize);
    let mut index_of = std::collections::HashMap::with_capacity(node_count as usize);
    for _ in 0..node_count {
        let id = read_u32(bytes, &mut cursor)?;
        let floor = read_i16(bytes, &mut cursor)?;
        let x = read_u16(bytes, &mut cursor)?;
        let y = read_u16(bytes, &mut cursor)?;
        let length = *bytes.get(cursor).ok_or("name")? as usize;
        cursor += 1;
        let name_bytes = bytes.get(cursor..cursor + length).ok_or("name bytes")?;
        cursor += length;
        let name = String::from_utf8(name_bytes.to_vec()).map_err(|_| "name utf-8")?;
        index_of.insert(id, nodes.len());
        nodes.push(Node { id, floor, x, y, name });
    }
    let mut adj = vec![Vec::new(); nodes.len()];
    for _ in 0..edge_count {
        let from = read_u32(bytes, &mut cursor)?;
        let to = read_u32(bytes, &mut cursor)?;
        let cost = read_u32(bytes, &mut cursor)?;
        let from_index = *index_of.get(&from).ok_or("edge from")?;
        let to_index = *index_of.get(&to).ok_or("edge to")?;
        adj[from_index].push((to_index, cost));
        adj[to_index].push((from_index, cost));
    }
    Ok((nodes, adj))
}

fn read_u32(bytes: &[u8], cursor: &mut usize) -> Result<u32, String> {
    let slice = bytes.get(*cursor..*cursor + 4).ok_or("u32")?;
    *cursor += 4;
    Ok(u32::from_le_bytes(slice.try_into().unwrap()))
}

fn read_u16(bytes: &[u8], cursor: &mut usize) -> Result<u16, String> {
    let slice = bytes.get(*cursor..*cursor + 2).ok_or("u16")?;
    *cursor += 2;
    Ok(u16::from_le_bytes(slice.try_into().unwrap()))
}

fn read_i16(bytes: &[u8], cursor: &mut usize) -> Result<i16, String> {
    Ok(read_u16(bytes, cursor)? as i16)
}

fn put_u32(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn put_u16(out: &mut Vec<u8>, value: u16) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn put_i16(out: &mut Vec<u8>, value: i16) {
    out.extend_from_slice(&value.to_le_bytes());
}

#[allow(dead_code)]
pub fn glyph_range_pbf(font: &str, range_start: u32) -> Vec<u8> {
    let mut glyphs = Vec::new();
    for offset in 0..256u32 {
        let code = range_start + offset;
        let Some(rows) = ink(code) else { continue };
        glyphs.extend(proto_bytes(3, &glyph_message(code, &rows)));
    }
    let mut stack = Vec::new();
    stack.extend(proto_bytes(1, font.as_bytes()));
    stack.extend(proto_bytes(2, format!("{range_start}-{}", range_start + 255).as_bytes()));
    stack.extend(glyphs);
    proto_bytes(1, &stack)
}

fn glyph_message(id: u32, rows: &[u8; 7]) -> Vec<u8> {
    let (bitmap, width, height) = sdf(rows);
    let mut glyph = Vec::new();
    glyph.extend(proto_varint_field(1, id as u64));
    glyph.extend(proto_bytes(2, &bitmap));
    glyph.extend(proto_varint_field(3, width as u64));
    glyph.extend(proto_varint_field(4, height as u64));
    glyph.extend(proto_varint_field(5, zigzag(1)));
    glyph.extend(proto_varint_field(6, zigzag(height as i32)));
    glyph.extend(proto_varint_field(7, width as u64 + 2));
    glyph
}

fn sdf(rows: &[u8; 7]) -> (Vec<u8>, u32, u32) {
    let width = 16usize;
    let height = 16usize;
    let mut bitmap = vec![0u8; width * height];
    for y in 0..7 {
        for x in 0..5 {
            if rows[y] >> (4 - x) & 1 == 1 {
                let px = x * 2 + 3;
                let py = y * 2 + 1;
                for dy in 0..2 {
                    for dx in 0..2 {
                        bitmap[(py + dy) * width + px + dx] = 255;
                    }
                }
            }
        }
    }
    let mut ink = Vec::new();
    for y in 0..height {
        for x in 0..width {
            if bitmap[y * width + x] == 255 {
                ink.push((x, y));
            }
        }
    }
    if !ink.is_empty() {
        for y in 0..height {
            for x in 0..width {
                if bitmap[y * width + x] == 255 {
                    continue;
                }
                let near = ink.iter().any(|(ix, iy)| x.abs_diff(*ix) + y.abs_diff(*iy) == 1);
                if near {
                    bitmap[y * width + x] = 180;
                }
            }
        }
    }
    (bitmap, width as u32, height as u32)
}

fn ink(code: u32) -> Option<[u8; 7]> {
    Some(match code {
        0x30 => [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
        0x31 => [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
        0x32 => [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
        0x20 => [0, 0, 0, 0, 0, 0, 0],
        0x041A => [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
        0x041B => [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11111],
        0x0430 => [0b00000, 0b00000, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111],
        0x0435 => [0b00000, 0b00000, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110],
        0x0438 => [0b00000, 0b00000, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001],
        0x043D => [0b00000, 0b00000, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001],
        0x043E => [0b00000, 0b00000, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110],
        0x043F => [0b00000, 0b00000, 0b11111, 0b10001, 0b10001, 0b10001, 0b10001],
        0x0440 => [0b00000, 0b00000, 0b01110, 0b10001, 0b01110, 0b10000, 0b10000],
        0x0441 => [0b00000, 0b00000, 0b01110, 0b10000, 0b10000, 0b10000, 0b01110],
        0x0442 => [0b00000, 0b00000, 0b11111, 0b00100, 0b00100, 0b00100, 0b00100],
        0x0443 => [0b00000, 0b00000, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110],
        0x0446 => [0b00000, 0b00000, 0b10001, 0b10001, 0b10001, 0b01111, 0b00001],
        _ => return None,
    })
}

fn proto_varint_field(field: u32, value: u64) -> Vec<u8> {
    let mut out = proto_varint(((field as u64) << 3) | 0);
    out.extend(proto_varint(value));
    out
}

fn proto_bytes(field: u32, data: &[u8]) -> Vec<u8> {
    let mut out = proto_varint(((field as u64) << 3) | 2);
    out.extend(proto_varint(data.len() as u64));
    out.extend_from_slice(data);
    out
}

fn proto_varint(mut value: u64) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if value == 0 {
            break;
        }
    }
    out
}

fn zigzag(value: i32) -> u64 {
    ((value << 1) ^ (value >> 31)) as u32 as u64
}

#[allow(dead_code)]
pub const CAMPUS_STYLE: &str = r##"{
  "version": 8,
  "name": "Схема территории",
  "glyphs": "file:///android_asset/campus/glyphs/{fontstack}/{range}.pbf",
  "center": [37.5502, 55.8334],
  "zoom": 17,
  "sources": {
    "scheme": {
      "type": "geojson",
      "data": {
        "type": "FeatureCollection",
        "features": [
          {
            "type": "Feature",
            "properties": {"name": "Корпус 2", "kind": "building"},
            "geometry": {"type": "Polygon", "coordinates": [[[37.5496, 55.8330], [37.5508, 55.8330], [37.5508, 55.8338], [37.5496, 55.8338], [37.5496, 55.8330]]]}
          },
          {
            "type": "Feature",
            "properties": {"name": "101", "kind": "room"},
            "geometry": {"type": "Point", "coordinates": [37.5499, 55.8332]}
          },
          {
            "type": "Feature",
            "properties": {"name": "102", "kind": "room"},
            "geometry": {"type": "Point", "coordinates": [37.5505, 55.8332]}
          },
          {
            "type": "Feature",
            "properties": {"name": "201", "kind": "room"},
            "geometry": {"type": "Point", "coordinates": [37.5499, 55.8336]}
          },
          {
            "type": "Feature",
            "properties": {"name": "Лестница", "kind": "stair"},
            "geometry": {"type": "Point", "coordinates": [37.5502, 55.8334]}
          }
        ]
      }
    }
  },
  "layers": [
    {"id": "paper", "type": "background", "paint": {"background-color": "#f3efe4"}},
    {"id": "footprint", "type": "fill", "source": "scheme", "filter": ["==", ["geometry-type"], "Polygon"], "paint": {"fill-color": "#d9c7a6", "fill-outline-color": "#6b5a45"}},
    {"id": "rooms", "type": "circle", "source": "scheme", "filter": ["==", ["get", "kind"], "room"], "paint": {"circle-radius": 6, "circle-color": "#2f5d50"}},
    {"id": "labels", "type": "symbol", "source": "scheme", "filter": ["has", "name"], "layout": {"text-field": ["get", "name"], "text-font": ["TimCampus"], "text-size": 22, "text-anchor": "top", "text-allow-overlap": true, "text-ignore-placement": true}, "paint": {"text-color": "#1c1915", "text-halo-color": "#f3efe4", "text-halo-width": 2}}
  ]
}
"##;

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn dense_campus() -> (Vec<u8>, usize) {
        let buildings = 3u32;
        let floors = 6u32;
        let rooms = 30u32;
        let room_id = |b, f, r| b * floors * rooms + f * rooms + r;
        let stair_id = |b, f| buildings * floors * rooms + b * floors + f;
        let mut nodes = Vec::new();
        for b in 0..buildings {
            for f in 0..floors {
                for r in 0..rooms {
                    nodes.push((
                        room_id(b, f, r),
                        f as i16,
                        r as u16,
                        (b * 10 + f) as u16,
                        format!("k{b}-e{f}-a{r:02}"),
                    ));
                }
                nodes.push((stair_id(b, f), f as i16, 0, (b * 10 + f) as u16, format!("k{b}-e{f}-stair")));
            }
        }
        let mut edges = Vec::new();
        for b in 0..buildings {
            for f in 0..floors {
                for r in 0..rooms - 1 {
                    edges.push((room_id(b, f, r), room_id(b, f, r + 1), 4));
                }
                edges.push((room_id(b, f, 0), stair_id(b, f), 4));
                if f + 1 < floors {
                    edges.push((stair_id(b, f), stair_id(b, f + 1), 8));
                }
            }
            if b + 1 < buildings {
                edges.push((stair_id(b, 0), stair_id(b + 1, 0), 20));
            }
        }
        let refs: Vec<(u32, i16, u16, u16, &str)> = nodes.iter().map(|node| (node.0, node.1, node.2, node.3, node.4.as_str())).collect();
        (encode_topology(&refs, &edges), nodes.len())
    }

    #[test]
    fn same_floor_route_does_not_change_floors() {
        let (bytes, count) = dense_campus();
        assert!(count >= 500, "{count}");
        let route = route_campus(bytes, "k0-e0-a00".into(), "k0-e0-a29".into());
        assert!(route.found);
        assert_eq!(route.floor_changes, 0);
        assert_eq!(route.room_names.first().map(String::as_str), Some("k0-e0-a00"));
        assert_eq!(route.room_names.last().map(String::as_str), Some("k0-e0-a29"));
        assert!(route.room_names.iter().all(|name| name.starts_with("k0-e0-")));
    }

    #[test]
    fn another_floor_uses_the_near_stair() {
        let (bytes, _) = dense_campus();
        let route = route_campus(bytes, "k0-e0-a00".into(), "k0-e5-a00".into());
        assert!(route.found);
        assert_eq!(route.floor_changes, 5);
        assert!(route.room_names.iter().any(|name| name == "k0-e0-stair"));
        assert!(!route.room_names.iter().any(|name| name.starts_with("k1-")));
    }

    #[test]
    fn missing_room_is_not_a_route() {
        let (bytes, _) = dense_campus();
        let route = route_campus(bytes, "k0-e0-a00".into(), "missing".into());
        assert!(!route.found);
        assert!(route.room_names.is_empty());
    }

    #[test]
    fn route_on_five_hundred_nodes_finishes_within_two_milliseconds() {
        let (bytes, count) = dense_campus();
        assert!(count >= 500, "{count}");
        let _ = route_campus(bytes.clone(), "k0-e0-a00".into(), "k2-e5-a29".into());
        let mut samples = Vec::new();
        for _ in 0..21 {
            let started = Instant::now();
            let route = route_campus(bytes.clone(), "k0-e0-a00".into(), "k2-e5-a29".into());
            let elapsed = started.elapsed();
            assert!(route.found);
            assert!(route.floor_changes >= 5);
            samples.push(elapsed.as_secs_f64() * 1000.0);
        }
        samples.sort_by(|left, right| left.partial_cmp(right).unwrap());
        let median = samples[samples.len() / 2];
        assert!(median < 2.0, "median {median} ms on {count} nodes");
    }

    #[test]
    fn scheme_pack_keeps_room_labels_offline() {
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../mobile/shared/src/androidMain/assets/campus");
        std::fs::create_dir_all(root.join("glyphs/TimCampus")).unwrap();
        std::fs::write(root.join("style.json"), CAMPUS_STYLE).unwrap();
        let latin = glyph_range_pbf("TimCampus", 0);
        let cyrillic = glyph_range_pbf("TimCampus", 1024);
        std::fs::write(root.join("glyphs/TimCampus/0-255.pbf"), &latin).unwrap();
        std::fs::write(root.join("glyphs/TimCampus/1024-1279.pbf"), &cyrillic).unwrap();
        let style = std::fs::read_to_string(root.join("style.json")).unwrap();
        let lowered = style.to_ascii_lowercase();
        assert!(!lowered.contains("http://") && !lowered.contains("https://"), "style points at the network");
        assert!(style.contains("\"name\": \"Схема территории\""));
        assert!(style.contains("file:///android_asset/campus/glyphs/{fontstack}/{range}.pbf"));
        assert!(style.contains("\"text-font\": [\"TimCampus\"]"));
        let names = ["Корпус 2", "101", "102", "201", "Лестница"];
        for name in names {
            assert!(style.contains(name), "{name}");
            for ch in name.chars() {
                let code = ch as u32;
                let file = if code < 256 { &latin } else { &cyrillic };
                let bitmap = glyph_bitmap(file, code).unwrap_or_else(|| panic!("missing glyph {ch}"));
                if ch != ' ' {
                    assert!(bitmap.iter().any(|pixel| *pixel > 0), "blank glyph {ch}");
                }
            }
        }
    }

    fn glyph_bitmap(bytes: &[u8], id: u32) -> Option<Vec<u8>> {
        let stack = proto_field(bytes, 1)?;
        let mut cursor = 0;
        while cursor < stack.len() {
            let (field, value, next) = proto_read(&stack, cursor)?;
            cursor = next;
            if field != 3 {
                continue;
            }
            if proto_field_varint(&value, 1) == Some(id as u64) {
                return proto_field(&value, 2);
            }
        }
        None
    }

    fn proto_field(bytes: &[u8], want: u32) -> Option<Vec<u8>> {
        let mut cursor = 0;
        while cursor < bytes.len() {
            let (field, value, next) = proto_read(bytes, cursor)?;
            if field == want {
                return Some(value);
            }
            cursor = next;
        }
        None
    }

    fn proto_field_varint(bytes: &[u8], want: u32) -> Option<u64> {
        let mut cursor = 0;
        while cursor < bytes.len() {
            let (field, wire, next) = proto_header(bytes, cursor)?;
            if field == want && wire == 0 {
                let (value, after) = read_varint(bytes, next)?;
                let _ = after;
                return Some(value);
            }
            cursor = skip(bytes, field, wire, next)?;
        }
        None
    }

    fn proto_read(bytes: &[u8], cursor: usize) -> Option<(u32, Vec<u8>, usize)> {
        let (field, wire, next) = proto_header(bytes, cursor)?;
        if wire != 2 {
            let end = skip(bytes, field, wire, next)?;
            return Some((field, Vec::new(), end));
        }
        let (length, data_at) = read_varint(bytes, next)?;
        let end = data_at + length as usize;
        Some((field, bytes.get(data_at..end)?.to_vec(), end))
    }

    fn proto_header(bytes: &[u8], cursor: usize) -> Option<(u32, u32, usize)> {
        let (key, next) = read_varint(bytes, cursor)?;
        Some(((key >> 3) as u32, (key & 7) as u32, next))
    }

    fn skip(bytes: &[u8], _field: u32, wire: u32, cursor: usize) -> Option<usize> {
        match wire {
            0 => read_varint(bytes, cursor).map(|(_, next)| next),
            2 => {
                let (length, data_at) = read_varint(bytes, cursor)?;
                Some(data_at + length as usize)
            }
            _ => None,
        }
    }

    fn read_varint(bytes: &[u8], mut cursor: usize) -> Option<(u64, usize)> {
        let mut value = 0u64;
        let mut shift = 0;
        while cursor < bytes.len() && shift < 64 {
            let byte = bytes[cursor];
            cursor += 1;
            value |= ((byte & 0x7f) as u64) << shift;
            if byte & 0x80 == 0 {
                return Some((value, cursor));
            }
            shift += 7;
        }
        None
    }
}
