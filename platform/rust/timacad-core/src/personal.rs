use std::collections::BTreeMap;

use loro::{ExportMode, LoroDoc};
use serde::{Deserialize, Serialize};

#[derive(uniffi::Record, Clone, Debug)]
pub struct CompactedSnapshot {
    pub snapshot: Vec<u8>,
    pub json_v4: String,
}

#[derive(Serialize, Deserialize)]
struct BackupFile {
    version: i32,
    data: StudentData,
}

#[derive(Serialize, Deserialize)]
struct StudentData {
    group: String,
    name: String,
    tasks: Vec<TaskItem>,
    notes: String,
    plans: Vec<PlanItem>,
    favorites: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct TaskItem {
    id: String,
    title: String,
    date: String,
    done: bool,
    kind: String,
}

#[derive(Serialize, Deserialize)]
struct PlanItem {
    id: String,
    title: String,
    date: String,
    start: String,
    end: String,
    room: String,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    cancelled: bool,
}

/// Snapshot and SQL projection are committed together by the mobile repository.
/// Only `update` is queued for transport; importing remote updates never echoes them.
#[derive(uniffi::Record, Clone, Debug)]
pub struct PersonalState {
    pub snapshot: Vec<u8>,
    pub update: Vec<u8>,
    pub json_v4: String,
}

#[derive(Debug, uniffi::Error)]
pub enum PersonalError {
    Invalid { reason: String },
}

impl std::fmt::Display for PersonalError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self { Self::Invalid { reason } => f.write_str(reason) }
    }
}
impl std::error::Error for PersonalError {}

fn invalid(error: impl ToString) -> PersonalError {
    PersonalError::Invalid { reason: error.to_string() }
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum PersonalEdit {
    SetNotes { text: String },
    SaveTask { task: TaskItem },
    DeleteTask { id: String },
    SavePlan { plan: PlanItem },
    DeletePlan { id: String },
    ImportV4 { backup: BackupFile },
}

fn load_personal(snapshot: &[u8]) -> Result<LoroDoc, PersonalError> {
    if snapshot.len() > 8 * 1024 * 1024 { return Err(invalid("personal snapshot exceeds 8 MiB")); }
    let doc = LoroDoc::new();
    if !snapshot.is_empty() { doc.import(snapshot).map_err(invalid)?; }
    Ok(doc)
}

fn personal_state(doc: &LoroDoc, update: Vec<u8>) -> Result<PersonalState, PersonalError> {
    let json_v4 = export_v4(doc).map_err(invalid)?;
    let snapshot = doc.export(ExportMode::snapshot()).map_err(invalid)?;
    if snapshot.len() > 8 * 1024 * 1024 { return Err(invalid("personal snapshot exceeds 8 MiB")); }
    Ok(PersonalState { snapshot, update, json_v4 })
}

#[uniffi::export]
pub fn core_personal_open(snapshot: Vec<u8>) -> Result<PersonalState, PersonalError> {
    personal_state(&load_personal(&snapshot)?, Vec::new())
}

#[uniffi::export]
pub fn core_personal_apply(snapshot: Vec<u8>, peer: u64, operation: String) -> Result<PersonalState, PersonalError> {
    if operation.len() > 8 * 1024 * 1024 { return Err(invalid("personal operation exceeds 8 MiB")); }
    let edit: PersonalEdit = serde_json::from_str(&operation).map_err(invalid)?;
    let doc = load_personal(&snapshot)?;
    doc.set_peer_id(peer).map_err(invalid)?;
    let before = doc.oplog_vv();
    match edit {
        PersonalEdit::SetNotes { text } => {
            if text.chars().count() > 100_000 { return Err(invalid("notes exceed the v4 limit")); }
            doc.get_text("notes").update(&text, Default::default()).map_err(invalid)?;
        }
        PersonalEdit::SaveTask { task } => put_task(&doc, &task)?,
        PersonalEdit::SavePlan { plan } => put_plan(&doc, &plan)?,
        PersonalEdit::DeleteTask { id } => doc.get_map("tasks").delete(&id).map_err(invalid)?,
        PersonalEdit::DeletePlan { id } => doc.get_map("plans").delete(&id).map_err(invalid)?,
        PersonalEdit::ImportV4 { backup } => {
            if backup.version != 4 { return Err(invalid("backup version must be 4")); }
            let data = backup.data;
            validate_v4(&data.group, &data.name, &data.notes, &data.tasks, &data.plans, &data.favorites).map_err(invalid)?;
            let meta = doc.get_map("meta");
            meta.insert("group", data.group).map_err(invalid)?;
            meta.insert("name", data.name).map_err(invalid)?;
            doc.get_text("notes").update(&data.notes, Default::default()).map_err(invalid)?;
            doc.get_map("tasks").clear().map_err(invalid)?;
            for task in data.tasks { put_task(&doc, &task)?; }
            doc.get_map("plans").clear().map_err(invalid)?;
            for plan in data.plans { put_plan(&doc, &plan)?; }
            let favorites = doc.get_list("favorites");
            favorites.clear().map_err(invalid)?;
            for (index, value) in data.favorites.into_iter().enumerate() {
                favorites.insert(index, value).map_err(invalid)?;
            }
        }
    }
    doc.commit();
    let update = if before == doc.oplog_vv() { Vec::new() } else {
        doc.export(ExportMode::updates(&before)).map_err(invalid)?
    };
    personal_state(&doc, update)
}

#[uniffi::export]
pub fn core_personal_merge(snapshot: Vec<u8>, updates: Vec<Vec<u8>>) -> Result<PersonalState, PersonalError> {
    if updates.iter().map(Vec::len).sum::<usize>() > 8 * 1024 * 1024 {
        return Err(invalid("personal update batch exceeds 8 MiB"));
    }
    let doc = load_personal(&snapshot)?;
    doc.import_batch(&updates).map_err(invalid)?;
    personal_state(&doc, Vec::new())
}

fn put_task(doc: &LoroDoc, task: &TaskItem) -> Result<(), PersonalError> {
    let item = doc.get_map("tasks").ensure_mergeable_map(&task.id).map_err(invalid)?;
    item.insert("title", task.title.as_str()).map_err(invalid)?;
    item.insert("date", task.date.as_str()).map_err(invalid)?;
    item.insert("done", task.done).map_err(invalid)?;
    item.insert("kind", task.kind.as_str()).map_err(invalid)?;
    Ok(())
}

fn put_plan(doc: &LoroDoc, plan: &PlanItem) -> Result<(), PersonalError> {
    let item = doc.get_map("plans").ensure_mergeable_map(&plan.id).map_err(invalid)?;
    item.insert("title", plan.title.as_str()).map_err(invalid)?;
    item.insert("date", plan.date.as_str()).map_err(invalid)?;
    item.insert("start", plan.start.as_str()).map_err(invalid)?;
    item.insert("end", plan.end.as_str()).map_err(invalid)?;
    item.insert("room", plan.room.as_str()).map_err(invalid)?;
    item.insert("cancelled", plan.cancelled).map_err(invalid)?;
    Ok(())
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

/// Server log compaction must retain causal history for devices still editing offline.
/// A shallow snapshot is only safe after every replica has acknowledged its frontier.
pub fn compact_updates(updates: &[Vec<u8>]) -> Result<CompactedSnapshot, String> {
    let doc = LoroDoc::new();
    doc.import_batch(updates).map_err(|err| err.to_string())?;
    let json_v4 = export_v4(&doc)?;
    let snapshot = doc.export(ExportMode::snapshot()).map_err(|err| err.to_string())?;
    if snapshot.len() > 8 * 1024 * 1024 { return Err("personal snapshot exceeds 8 MiB".into()); }
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
    if !(bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes.iter().enumerate().all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())) { return false; }
    let year = value[..4].parse::<u32>().unwrap();
    let month = value[5..7].parse::<usize>().unwrap();
    let day = value[8..].parse::<u32>().unwrap();
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    year > 0 && (1..=12).contains(&month) && day > 0 && day <= days[month - 1]
}

fn valid_time(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 5 && bytes[2] == b':' && bytes.iter().enumerate().all(|(index, byte)| index == 2 || byte.is_ascii_digit())
        && &value[..2] < "24" && &value[3..] < "60"
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
    fn editing_api_merges_concurrent_devices_and_duplicate_delivery() {
        let base = core_personal_apply(vec![], 11, r#"{"type":"set_notes","text":"Начало"}"#.into()).unwrap();
        let left = core_personal_apply(base.snapshot.clone(), 11, r#"{"type":"set_notes","text":"Начало А"}"#.into()).unwrap();
        let right = core_personal_apply(base.snapshot.clone(), 22, r#"{"type":"save_task","task":{"id":"t","title":"Отчёт","date":"2026-09-28","kind":"task","done":true}}"#.into()).unwrap();
        let merged_left = core_personal_merge(left.snapshot, vec![right.update.clone(), right.update]).unwrap();
        let merged_right = core_personal_merge(right.snapshot, vec![left.update]).unwrap();
        assert_eq!(merged_left.json_v4, merged_right.json_v4);
        assert!(merged_left.update.is_empty());
        let parsed: serde_json::Value = serde_json::from_str(&merged_left.json_v4).unwrap();
        assert_eq!(parsed["data"]["notes"], "Начало А");
        assert_eq!(parsed["data"]["tasks"][0]["done"], true);
        let removed = core_personal_apply(merged_left.snapshot, 11, r#"{"type":"delete_task","id":"t"}"#.into()).unwrap();
        assert_eq!(core_personal_merge(merged_right.snapshot, vec![removed.update]).unwrap().json_v4, removed.json_v4);
    }

    #[test]
    fn editing_api_imports_escaped_v4_and_rejects_invalid_edits() {
        let state = core_personal_apply(vec![], 7, r#"{"type":"import_v4","backup": { "version": 4, "data": {"group":"А","name":"Я","notes":"Строка\n\t\"{текст}\"","tasks":[],"plans":[],"favorites":["А"]}}}"#.into()).unwrap();
        assert_eq!(core_personal_open(state.snapshot.clone()).unwrap().json_v4, state.json_v4);
        for (date, start) in [("2026-02-30", "09:00"), ("2026-09-28", "29:00")] {
            let edit = serde_json::json!({"type":"save_plan","plan":{"id":"p","title":"План","date":date,"start":start,"end":"30:00","room":""}});
            assert!(core_personal_apply(state.snapshot.clone(), 7, edit.to_string()).is_err());
        }
        assert!(core_personal_apply(state.snapshot.clone(), 7, "{}".into()).is_err());
        assert!(core_personal_merge(state.snapshot.clone(), vec![vec![1,2,3]]).is_err());
        assert_eq!(core_personal_open(state.snapshot).unwrap().json_v4, state.json_v4);
        assert!(valid_date("2024-02-29"));
        assert!(!valid_date("2026-02-29"));
        assert!(!valid_time("09:60"));
    }

    #[test]
    fn server_compaction_merges_all_deltas_and_accepts_late_offline_edits() {
        let base = core_personal_apply(vec![], 1, r#"{"type":"set_notes","text":"Общее"}"#.into()).unwrap();
        let online = core_personal_apply(base.snapshot.clone(), 1, r#"{"type":"set_notes","text":"Общее онлайн"}"#.into()).unwrap();
        let offline = core_personal_apply(base.snapshot, 2, r#"{"type":"save_task","task":{"id":"t","title":"Офлайн","date":"","kind":"task","done":false}}"#.into()).unwrap();
        let compacted = compact_updates(&[base.update, online.update.clone()]).unwrap();
        assert_eq!(compacted.json_v4, online.json_v4);
        let server = core_personal_merge(compacted.snapshot, vec![offline.update]).unwrap();
        let device = core_personal_merge(offline.snapshot, vec![online.update]).unwrap();
        assert_eq!(server.json_v4, device.json_v4);
        let parsed: serde_json::Value = serde_json::from_str(&server.json_v4).unwrap();
        assert_eq!(parsed["data"]["notes"], "Общее онлайн");
        assert_eq!(parsed["data"]["tasks"][0]["title"], "Офлайн");
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
