use loro::{ExportMode, LoroDoc};
use serde::Serialize;

#[cfg(test)]
#[derive(Serialize, PartialEq, Eq, Debug)]
struct Duty {
    id: String,
    title: String,
    assignee: String,
}

#[cfg(test)]
fn add_duty(doc: &LoroDoc, id: &str, title: &str, assignee: &str) {
    let duties = doc.get_map("duties");
    let item = duties.ensure_mergeable_map(id).expect("duty map");
    item.insert("title", title).expect("title");
    item.insert("assignee", assignee).expect("assignee");
    doc.commit();
}

#[cfg(test)]
fn duties_of(doc: &LoroDoc) -> Vec<Duty> {
    let value = doc.get_map("duties").get_deep_value();
    let loro::LoroValue::Map(map) = value else {
        return Vec::new();
    };
    let mut duties = Vec::new();
    for (id, item) in map.as_ref().iter() {
        let loro::LoroValue::Map(fields) = item else {
            continue;
        };
        let title = match fields.as_ref().get("title") {
            Some(loro::LoroValue::String(text)) => text.as_ref().to_string(),
            _ => String::new(),
        };
        let assignee = match fields.as_ref().get("assignee") {
            Some(loro::LoroValue::String(text)) => text.as_ref().to_string(),
            _ => String::new(),
        };
        duties.push(Duty { id: id.to_string(), title, assignee });
    }
    duties.sort_by(|left, right| left.id.cmp(&right.id));
    duties
}

#[cfg(test)]
fn peer(id: u64) -> LoroDoc {
    let doc = LoroDoc::new();
    doc.set_peer_id(id).expect("peer");
    doc
}

#[cfg(test)]
fn exchange(left: &LoroDoc, right: &LoroDoc) {
    let from_left = left.export(ExportMode::all_updates()).expect("export");
    let from_right = right.export(ExportMode::all_updates()).expect("export");
    left.import(&from_right).expect("import");
    right.import(&from_left).expect("import");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_offline_rosters_converge() {
        let anna = peer(1);
        let boris = peer(2);
        add_duty(&anna, "monday", "Столовая", "Анна");
        add_duty(&boris, "tuesday", "Холл", "Борис");
        let from_anna = anna.export(ExportMode::all_updates()).expect("anna");
        let from_boris = boris.export(ExportMode::all_updates()).expect("boris");

        let forward = peer(3);
        forward.import(&from_anna).expect("anna first");
        forward.import(&from_boris).expect("boris second");
        let reverse = peer(4);
        reverse.import(&from_boris).expect("boris first");
        reverse.import(&from_anna).expect("anna second");
        assert_eq!(duties_of(&forward), duties_of(&reverse));
        assert_eq!(duties_of(&forward).len(), 2);

        exchange(&anna, &boris);
        assert_eq!(duties_of(&anna), duties_of(&forward));
        assert_eq!(duties_of(&boris), duties_of(&forward));
    }
}
