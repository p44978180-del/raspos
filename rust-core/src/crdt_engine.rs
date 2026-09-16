//! Local-First CRDT (Conflict-free Replicated Data Type) Engine
//!
//! Provides mathematically proven, zero-conflict data synchronization between peer student devices
//! without requiring central coordinator locks.

use std::collections::{HashMap, HashSet};

/// Lamport Timestamp for strict total ordering of distributed mutation operations
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct LamportTimestamp {
    pub counter: u64,
    pub client_id: u64,
}

impl Ord for LamportTimestamp {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        match self.counter.cmp(&other.counter) {
            std::cmp::Ordering::Equal => self.client_id.cmp(&other.client_id),
            ord => ord,
        }
    }
}

impl PartialOrd for LamportTimestamp {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

/// Last-Write-Wins Register (LWW-Register)
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct LWWRegister<T> {
    pub value: T,
    pub timestamp: LamportTimestamp,
}

impl<T: Clone> LWWRegister<T> {
    pub fn new(initial_value: T, timestamp: LamportTimestamp) -> Self {
        Self {
            value: initial_value,
            timestamp,
        }
    }

    /// Sets value if incoming timestamp is strictly greater
    pub fn set(&mut self, new_val: T, ts: LamportTimestamp) -> bool {
        if ts > self.timestamp {
            self.value = new_val;
            self.timestamp = ts;
            true
        } else {
            false
        }
    }

    /// Deterministic CRDT merge with another register
    pub fn merge(&mut self, other: &Self) {
        if other.timestamp > self.timestamp {
            self.value = other.value.clone();
            self.timestamp = other.timestamp;
        }
    }
}

/// Observed-Remove Set (OR-Set) for concurrent additions and deletions of crowdsourced votes
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ORSet<T: std::hash::Hash + Eq + Clone> {
    pub adds: HashMap<String, (T, LamportTimestamp)>,
    pub removes: HashSet<String>,
}

impl<T: std::hash::Hash + Eq + Clone> ORSet<T> {
    pub fn new() -> Self {
        Self {
            adds: HashMap::new(),
            removes: HashSet::new(),
        }
    }

    pub fn add(&mut self, element: T, tag: String, ts: LamportTimestamp) {
        self.adds.insert(tag, (element, ts));
    }

    pub fn remove(&mut self, tag: &str) {
        self.removes.insert(tag.to_string());
    }

    pub fn elements(&self) -> Vec<T> {
        let mut result = Vec::new();
        for (tag, (elem, _)) in &self.adds {
            if !self.removes.contains(tag) {
                result.push(elem.clone());
            }
        }
        result
    }

    pub fn merge(&mut self, other: &Self) {
        for (tag, val) in &other.adds {
            self.adds.entry(tag.clone()).or_insert_with(|| val.clone());
        }
        for tag in &other.removes {
            self.removes.insert(tag.clone());
        }
    }
}

/// State vector tracking revision counters across all participating peer nodes
#[derive(Debug, Clone, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
pub struct StateVector {
    pub clocks: HashMap<String, u64>,
}

impl StateVector {
    pub fn new() -> Self {
        Self { clocks: HashMap::new() }
    }

    pub fn increment(&mut self, client: &str) -> u64 {
        let entry = self.clocks.entry(client.to_string()).or_insert(0);
        *entry += 1;
        *entry
    }

    pub fn merge(&mut self, other: &Self) {
        for (client, &cnt) in &other.clocks {
            let entry = self.clocks.entry(client.clone()).or_insert(0);
            *entry = (*entry).max(cnt);
        }
    }

    pub fn compute_etag(&self, prefix: &str) -> String {
        let mut sorted: Vec<_> = self.clocks.iter().collect();
        sorted.sort_by_key(|(k, _)| *k);

        let mut hash = 0xcbf29ce484222325u64;
        for (k, v) in sorted {
            for b in k.as_bytes() {
                hash ^= *b as u64;
                hash = hash.wrapping_mul(0x100000001b3);
            }
            hash ^= *v;
            hash = hash.wrapping_mul(0x100000001b3);
        }

        format!("W/\"{}-{:016x}-v3.0.1\"", prefix, hash)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lww_register_conflict_resolution() {
        let ts1 = LamportTimestamp { counter: 10, client_id: 1 };
        let ts2 = LamportTimestamp { counter: 12, client_id: 2 };

        let mut reg = LWWRegister::new("Room 201", ts1);
        assert!(!reg.set("Room 303", LamportTimestamp { counter: 8, client_id: 3 }));
        assert_eq!(reg.value, "Room 201");

        assert!(reg.set("Room 404", ts2));
        assert_eq!(reg.value, "Room 404");
    }

    #[test]
    fn test_orset_concurrent_merge() {
        let mut set1 = ORSet::new();
        let mut set2 = ORSet::new();

        let ts = LamportTimestamp { counter: 1, client_id: 1 };
        set1.add("proposal_1", "tag_a".to_string(), ts);
        set2.add("proposal_2", "tag_b".to_string(), ts);

        set1.merge(&set2);
        assert_eq!(set1.elements().len(), 2);

        set1.remove("tag_a");
        assert_eq!(set1.elements().len(), 1);
        assert_eq!(set1.elements()[0], "proposal_2");
    }
}
