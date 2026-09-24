use sha2::{Digest, Sha256};

#[derive(uniffi::Record, Clone)]
pub struct CanonicalLesson {
    pub occurs_on: String,
    pub starts_at: String,
    pub ends_at: String,
    pub subject: String,
    pub kind: String,
    pub teacher: String,
    pub building: String,
    pub room: String,
    pub week_type: String,
    pub source_url: String,
}

fn fields(lesson: &CanonicalLesson) -> [&str; 10] {
    [
        &lesson.occurs_on,
        &lesson.starts_at,
        &lesson.ends_at,
        &lesson.subject,
        &lesson.kind,
        &lesson.teacher,
        &lesson.building,
        &lesson.room,
        &lesson.week_type,
        &lesson.source_url,
    ]
}

fn preimage(lessons: &[CanonicalLesson]) -> Vec<u8> {
    let mut ordered = lessons.to_vec();
    ordered.sort_by(|a, b| fields(a).cmp(&fields(b)));
    let mut out = Vec::new();
    for lesson in ordered {
        for (index, field) in fields(&lesson).into_iter().enumerate() {
            if index > 0 {
                out.push(0x1f);
            }
            out.extend(field.as_bytes());
        }
        out.push(0x1e);
    }
    out
}

pub fn canonical_snapshot_hash(lessons: &[CanonicalLesson]) -> [u8; 32] {
    let digest = Sha256::digest(preimage(lessons));
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&digest);
    hash
}

pub fn canonical_snapshot_hash_hex(lessons: &[CanonicalLesson]) -> String {
    hex_encode(&canonical_snapshot_hash(lessons))
}

#[cfg(test)]
mod tests {
    use super::{canonical_snapshot_hash_hex, CanonicalLesson};
    use serde_json::Value;
    use std::fs;

    fn lesson(value: &Value) -> CanonicalLesson {
        let field = |name: &str| value.get(name).and_then(|v| v.as_str()).unwrap_or("").to_string();
        CanonicalLesson {
            occurs_on: field("occurs_on"),
            starts_at: field("starts_at"),
            ends_at: field("ends_at"),
            subject: field("subject"),
            kind: field("kind"),
            teacher: field("teacher"),
            building: field("building"),
            room: field("room"),
            week_type: field("week_type"),
            source_url: field("source_url"),
        }
    }

    #[test]
    fn vector_matches_committed_hash() {
        let raw = fs::read_to_string("../../testdata/hash-vector.json").expect("vector");
        let parsed: Vec<Value> = serde_json::from_str(&raw).expect("json");
        let lessons: Vec<_> = parsed.iter().map(lesson).collect();
        let expected = fs::read_to_string("../../testdata/hash-vector.sha256").expect("hash");
        assert_eq!(canonical_snapshot_hash_hex(&lessons), expected.trim());
    }

    #[test]
    fn golden_group_matches_committed_hash() {
        let catalog: Value = serde_json::from_str(
            &fs::read_to_string("../../../public/data/official-schedule.json").expect("catalog"),
        )
        .expect("catalog json");
        let group = &catalog["groups"]["Д-А401"];
        let relative = group["schedulePath"].as_str().expect("path");
        let file = format!("../../../public/{relative}");
        let parsed: Value = serde_json::from_str(&fs::read_to_string(&file).expect("group")).expect("group json");
        let mut lessons = Vec::new();
        for day in parsed["schedule"].as_array().expect("schedule") {
            for class in day["classes"].as_array().expect("classes") {
                lessons.push(CanonicalLesson {
                    occurs_on: day["date"].as_str().unwrap_or("").into(),
                    starts_at: class["start"].as_str().unwrap_or("").into(),
                    ends_at: class["end"].as_str().unwrap_or("").into(),
                    subject: class["subject"].as_str().unwrap_or("").into(),
                    kind: class["type"].as_str().unwrap_or("").into(),
                    teacher: class["teacher"].as_str().unwrap_or("").into(),
                    building: class["building"].as_str().unwrap_or("").into(),
                    room: class["room"].as_str().unwrap_or("").into(),
                    week_type: class["weekType"].as_str().unwrap_or("").into(),
                    source_url: class["sourceUrl"].as_str().unwrap_or("").into(),
                });
            }
        }
        assert_eq!(lessons.len(), 73);
        let expected = fs::read_to_string("../../testdata/group-da401.sha256").expect("hash");
        assert_eq!(canonical_snapshot_hash_hex(&lessons), expected.trim());
    }

    #[test]
    fn order_does_not_change_hash() {
        let raw = fs::read_to_string("../../testdata/hash-vector.json").expect("vector");
        let parsed: Vec<Value> = serde_json::from_str(&raw).expect("json");
        let mut lessons: Vec<_> = parsed.iter().map(lesson).collect();
        let forward = canonical_snapshot_hash_hex(&lessons);
        lessons.reverse();
        assert_eq!(canonical_snapshot_hash_hex(&lessons), forward);
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}
