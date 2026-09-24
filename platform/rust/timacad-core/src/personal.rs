use std::collections::BTreeMap;

use loro::{ExportMode, LoroDoc};
use serde::Serialize;

#[derive(uniffi::Record, Clone, Debug)]
pub struct CompactedSnapshot {
    pub snapshot: Vec<u8>,
    pub json_v4: String,
}

#[derive(Serialize)]
struct BackupFile {
    version: i32,
    data: StudentData,
}

#[derive(Serialize)]
struct StudentData {
    group: String,
    name: String,
    tasks: Vec<TaskItem>,
    notes: String,
    plans: Vec<PlanItem>,
    favorites: Vec<String>,
}

#[derive(Serialize)]
struct TaskItem {
    id: String,
    title: String,
    date: String,
    done: bool,
    kind: String,
}

#[derive(Serialize)]
struct PlanItem {
    id: String,
    title: String,
    date: String,
    start: String,
    end: String,
    room: String,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    cancelled: bool,
}

pub fn compact_doc(doc_bytes: &[u8]) -> Result<CompactedSnapshot, String> {
    let doc = LoroDoc::new();
    doc.import(doc_bytes).map_err(|err| err.to_string())?;
    let frontiers = doc.oplog_frontiers();
    let snapshot = doc
        .export(ExportMode::shallow_snapshot(&frontiers))
        .map_err(|err| err.to_string())?;
    let json_v4 = export_v4(&doc)?;
    let restored = LoroDoc::new();
    restored.import(&snapshot).map_err(|err| err.to_string())?;
    let restored_json = export_v4(&restored)?;
    if restored_json != json_v4 {
        return Err("compacted snapshot changed the v4 document".into());
    }
    Ok(CompactedSnapshot { snapshot, json_v4 })
}

fn export_v4(doc: &LoroDoc) -> Result<String, String> {
    let group = meta_string(doc, "group");
    let name = meta_string(doc, "name");
    let notes = doc.get_text("notes").to_string();
    let tasks = read_tasks(doc)?;
    let plans = read_plans(doc)?;
    let favorites = read_favorites(doc)?;
    validate_v4(&group, &name, &notes, &tasks, &plans, &favorites)?;
    let file = BackupFile {
        version: 4,
        data: StudentData {
            group,
            name,
            tasks,
            notes,
            plans,
            favorites,
        },
    };
    serde_json::to_string(&file).map_err(|err| err.to_string())
}

fn read_tasks(doc: &LoroDoc) -> Result<Vec<TaskItem>, String> {
    let mut items = BTreeMap::new();
    if let loro::LoroValue::Map(map) = doc.get_map("tasks").get_deep_value() {
        for (id, value) in map.as_ref() {
            let loro::LoroValue::Map(fields) = value else { continue };
            items.insert(
                id.clone(),
                TaskItem {
                    id: id.clone(),
                    title: map_string(fields, "title"),
                    date: map_string(fields, "date"),
                    done: map_bool(fields, "done"),
                    kind: map_string(fields, "kind"),
                },
            );
        }
    }
    Ok(items.into_values().collect())
}

fn read_plans(doc: &LoroDoc) -> Result<Vec<PlanItem>, String> {
    let mut items = BTreeMap::new();
    if let loro::LoroValue::Map(map) = doc.get_map("plans").get_deep_value() {
        for (id, value) in map.as_ref() {
            let loro::LoroValue::Map(fields) = value else { continue };
            items.insert(
                id.clone(),
                PlanItem {
                    id: id.clone(),
                    title: map_string(fields, "title"),
                    date: map_string(fields, "date"),
                    start: map_string(fields, "start"),
                    end: map_string(fields, "end"),
                    room: map_string(fields, "room"),
                    cancelled: map_bool(fields, "cancelled"),
                },
            );
        }
    }
    Ok(items.into_values().collect())
}

fn read_favorites(doc: &LoroDoc) -> Result<Vec<String>, String> {
    let mut values = Vec::new();
    if let loro::LoroValue::List(list) = doc.get_list("favorites").get_deep_value() {
        for value in list.as_ref() {
            if let loro::LoroValue::String(text) = value {
                values.push(text.as_ref().to_string());
            }
        }
    }
    values.sort();
    Ok(values)
}

fn validate_v4(
    group: &str,
    name: &str,
    notes: &str,
    tasks: &[TaskItem],
    plans: &[PlanItem],
    favorites: &[String],
) -> Result<(), String> {
    if group.chars().count() > 150 || name.chars().count() > 40 || notes.chars().count() > 100_000 {
        return Err("personal fields exceed the v4 limits".into());
    }
    if favorites.len() > 5000 || favorites.iter().any(|item| item.is_empty() || item.chars().count() > 150) {
        return Err("favorites are outside the v4 shape".into());
    }
    if tasks.len() > 10_000 || plans.len() > 10_000 {
        return Err("too many personal records".into());
    }
    for task in tasks {
        if task.id.is_empty() || task.title.trim().is_empty() || task.title.chars().count() > 300 {
            return Err(format!("task {} is outside the v4 shape", task.id));
        }
        if !task.date.is_empty() && !valid_date(&task.date) {
            return Err(format!("task {} has a bad date", task.id));
        }
        if task.kind != "task" && task.kind != "homework" {
            return Err(format!("task {} has kind {}", task.id, task.kind));
        }
    }
    for plan in plans {
        if plan.id.is_empty() || plan.title.trim().is_empty() || plan.title.chars().count() > 300 || plan.room.chars().count() > 200 {
            return Err(format!("plan {} is outside the v4 shape", plan.id));
        }
        if !valid_date(&plan.date) || !valid_time(&plan.start) || !valid_time(&plan.end) || plan.start >= plan.end {
            return Err(format!("plan {} has a bad interval", plan.id));
        }
    }
    Ok(())
}

fn valid_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes.iter().enumerate().all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
}

fn valid_time(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 5 && bytes[2] == b':' && bytes.iter().enumerate().all(|(index, byte)| index == 2 || byte.is_ascii_digit())
}

fn meta_string(doc: &LoroDoc, key: &str) -> String {
    if let loro::LoroValue::Map(map) = doc.get_map("meta").get_deep_value() {
        if let Some(loro::LoroValue::String(text)) = map.as_ref().get(key) {
            return text.as_ref().to_string();
        }
    }
    String::new()
}

fn map_string(fields: &loro::LoroMapValue, key: &str) -> String {
    match fields.as_ref().get(key) {
        Some(loro::LoroValue::String(text)) => text.as_ref().to_string(),
        _ => String::new(),
    }
}

fn map_bool(fields: &loro::LoroMapValue, key: &str) -> bool {
    matches!(fields.as_ref().get(key), Some(loro::LoroValue::Bool(true)))
}

pub fn personal_fixture_bytes() -> Result<Vec<u8>, String> {
    let doc = new_personal_doc(1);
    seed_personal(&doc);
    doc.export(ExportMode::snapshot()).map_err(|err| err.to_string())
}

pub fn new_personal_doc(peer: u64) -> LoroDoc {
    let doc = LoroDoc::new();
    doc.set_peer_id(peer).expect("peer id");
    doc
}

pub fn seed_personal(doc: &LoroDoc) {
    let meta = doc.get_map("meta");
    meta.insert("group", "Д-А401").unwrap();
    meta.insert("name", "Анна").unwrap();
    doc.get_text("notes").insert(0, "черновик").unwrap();
    let tasks = doc.get_map("tasks");
    let task = tasks.ensure_mergeable_map("t1").unwrap();
    task.insert("title", "Сдать отчёт").unwrap();
    task.insert("date", "2026-09-23").unwrap();
    task.insert("done", false).unwrap();
    task.insert("kind", "homework").unwrap();
    let plans = doc.get_map("plans");
    let plan = plans.ensure_mergeable_map("p1").unwrap();
    plan.insert("title", "Библиотека").unwrap();
    plan.insert("date", "2026-09-23").unwrap();
    plan.insert("start", "16:00").unwrap();
    plan.insert("end", "17:30").unwrap();
    plan.insert("room", "читальный зал").unwrap();
    plan.insert("cancelled", false).unwrap();
    doc.get_list("favorites").insert(0, "Д-А401").unwrap();
    doc.commit();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::alloc_track::{self, CURRENT, PEAK};

    fn snapshot_of(doc: &LoroDoc) -> Vec<u8> {
        doc.export(ExportMode::Snapshot).unwrap()
    }

    #[test]
    fn compacted_snapshot_exports_v4_and_is_stable() {
        let doc = new_personal_doc(1);
        seed_personal(&doc);
        let once = compact_doc(&snapshot_of(&doc)).unwrap();
        let twice = compact_doc(&once.snapshot).unwrap();
        assert_eq!(once.json_v4, twice.json_v4);
        let parsed: serde_json::Value = serde_json::from_str(&once.json_v4).unwrap();
        assert_eq!(parsed["version"], 4);
        assert_eq!(parsed["data"]["tasks"][0]["title"], "Сдать отчёт");
        assert_eq!(parsed["data"]["plans"][0]["start"], "16:00");
        assert_eq!(parsed["data"]["notes"], "черновик");
        assert!(once.snapshot.len() <= 512 * 1024);
    }

    #[test]
    fn redelivery_and_peer_order_converge() {
        let left = new_personal_doc(11);
        seed_personal(&left);
        let right = new_personal_doc(22);
        right.import(&snapshot_of(&left)).unwrap();

        let left_base = left.oplog_vv();
        left.get_text("notes").insert(8, " А").unwrap();
        let from_left = left.export(ExportMode::updates(&left_base)).unwrap();

        let right_base = right.oplog_vv();
        right.get_map("tasks").ensure_mergeable_map("t1").unwrap().insert("done", true).unwrap();
        let from_right = right.export(ExportMode::updates(&right_base)).unwrap();

        left.import(&from_right).unwrap();
        left.import(&from_right).unwrap();
        right.import(&from_left).unwrap();
        let merged = compact_doc(&snapshot_of(&left)).unwrap();
        assert_eq!(merged.json_v4, compact_doc(&snapshot_of(&right)).unwrap().json_v4);
        assert!(merged.json_v4.contains("\"done\":true"), "{}", merged.json_v4);
        assert!(merged.json_v4.contains("черновик А"), "{}", merged.json_v4);

        let third = new_personal_doc(30);
        third.import(&snapshot_of(&left)).unwrap();
        third.import_batch(&[from_right, from_left]).unwrap();
        assert_eq!(compact_doc(&snapshot_of(&third)).unwrap().json_v4, merged.json_v4);
    }

    #[test]
    fn ten_thousand_edits_compact_under_budget() {
        let doc = new_personal_doc(7);
        seed_personal(&doc);
        let notes = doc.get_text("notes");
        let tasks = doc.get_map("tasks");
        for step in 0..10_000 {
            if step % 2 == 0 {
                notes.insert(0, "я").unwrap();
                notes.delete(0, 1).unwrap();
            } else {
                let task = tasks.ensure_mergeable_map("t1").unwrap();
                task.insert("done", step % 4 == 0).unwrap();
            }
        }
        doc.commit();
        let fat = snapshot_of(&doc);
        alloc_track::mark_baseline();
        let before = CURRENT.load(std::sync::atomic::Ordering::Relaxed);
        PEAK.store(before, std::sync::atomic::Ordering::Relaxed);
        let compacted = compact_doc(&fat).expect("compact");
        let peak = PEAK.load(std::sync::atomic::Ordering::Relaxed).saturating_sub(before);
        assert!(
            compacted.snapshot.len() <= 512 * 1024,
            "snapshot {} bytes",
            compacted.snapshot.len()
        );
        assert!(peak <= 16 * 1024 * 1024, "peak {peak} bytes");
        let parsed: serde_json::Value = serde_json::from_str(&compacted.json_v4).unwrap();
        assert_eq!(parsed["version"], 4);
        assert_eq!(parsed["data"]["tasks"][0]["id"], "t1");
        assert_eq!(parsed["data"]["notes"], "черновик");
    }
}
