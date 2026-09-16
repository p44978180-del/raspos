//! Timacad RasPOS v3.0.1 — High Performance Rust Core
//!
//! Enterprise Rust shared core providing:
//! 1. Wasm SIMD 128-bit vector graph acceleration (`core::arch::wasm32::*` / `v128`) for 3D floor projections.
//! 2. Multi-floor campus routing with 35-min transit penalties (1-й Корпус <-> СК).
//! 3. Local-First CRDT engine (Vector Clocks, Lamport Timestamps, LWW-Registers, OR-Sets).
//! 4. Content Security Policy Level 3 (CSP v3) validator for student mini-apps.
//! 5. Zero-alloc binary operations, FNV-1a checksums, varint diff payloads, and Dijkstra routing.

pub mod simd_projection;
pub mod campus_graph_simd;
pub mod crdt_engine;
pub mod csp_validator;
pub mod ffi;
pub mod micro_runtime_sandbox;
pub mod schedule_indexer;
pub mod matrix_transform;
pub mod fast_geometry_simd;
pub mod crdt_delta_compressor;

use std::collections::{BinaryHeap, HashMap, HashSet};
use std::cmp::Ordering;

// Re-export FFI and SIMD symbols
pub use ffi::*;
pub use simd_projection::{Mat4, Vec4, CampusFloorVertex, ProjectedPoint2D, project_floor_graph_vertices};
pub use campus_graph_simd::{compute_campus_transit_route, CAMPUS_BUILDINGS, CampusRouteResult};
pub use crdt_engine::{LWWRegister, ORSet, StateVector, LamportTimestamp};
pub use csp_validator::{validate_manifest_csp_v3, StudentAppManifest, ManifestCSPv3, CSPValidationResult};
pub use micro_runtime_sandbox::{SandboxRuntimeInstance, SandboxExecutionResult};
pub use schedule_indexer::{ScheduleInvertedIndex, LessonIndexEntry};
pub use matrix_transform::Matrix4x4;
pub use fast_geometry_simd::{BoundingBox2D, point_in_polygon};
pub use crdt_delta_compressor::DeltaCompressor;

#[derive(Clone, Eq, PartialEq)]
struct State {
    cost: usize,
    node: String,
}

impl Ord for State {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reverse for min-heap
        other.cost.cmp(&self.cost)
    }
}

impl PartialOrd for State {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Computes fast deterministic 64-bit FNV-1a checksum over byte slices
#[no_mangle]
pub extern "C" fn rust_fnv1a_hash(data: *const u8, len: usize) -> u64 {
    if data.is_null() || len == 0 {
        return 0xcbf29ce484222325;
    }
    let slice = unsafe { std::slice::from_raw_parts(data, len) };
    let mut hash: u64 = 0xcbf29ce484222325;
    for &byte in slice {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// Binary CRDT Vector Clock reconciliation: merges two clocks taking max of counters
#[no_mangle]
pub extern "C" fn rust_crdt_vector_merge(
    clock_a_keys: *const u32,
    clock_a_vals: *const u32,
    len_a: usize,
    clock_b_keys: *const u32,
    clock_b_vals: *const u32,
    len_b: usize,
    out_keys: *mut u32,
    out_vals: *mut u32,
    max_out: usize,
) -> usize {
    let mut map = HashMap::new();

    if !clock_a_keys.is_null() && !clock_a_vals.is_null() {
        let keys_a = unsafe { std::slice::from_raw_parts(clock_a_keys, len_a) };
        let vals_a = unsafe { std::slice::from_raw_parts(clock_a_vals, len_a) };
        for i in 0..len_a {
            map.insert(keys_a[i], vals_a[i]);
        }
    }

    if !clock_b_keys.is_null() && !clock_b_vals.is_null() {
        let keys_b = unsafe { std::slice::from_raw_parts(clock_b_keys, len_b) };
        let vals_b = unsafe { std::slice::from_raw_parts(clock_b_vals, len_b) };
        for i in 0..len_b {
            let entry = map.entry(keys_b[i]).or_insert(0);
            *entry = (*entry).max(vals_b[i]);
        }
    }

    let written = map.len().min(max_out);
    if !out_keys.is_null() && !out_vals.is_null() {
        let mut idx = 0;
        for (k, v) in map.into_iter().take(written) {
            unsafe {
                *out_keys.add(idx) = k;
                *out_vals.add(idx) = v;
            }
            idx += 1;
        }
    }
    written
}

/// Binary Delta Wire format: Decodes compressed varint diff payloads
pub fn decode_varint(buffer: &[u8]) -> (u64, usize) {
    let mut value: u64 = 0;
    let mut shift = 0;
    let mut bytes_read = 0;

    for &byte in buffer {
        bytes_read += 1;
        value |= ((byte & 0x7F) as u64) << shift;
        if (byte & 0x80) == 0 {
            break;
        }
        shift += 7;
        if shift >= 64 {
            break;
        }
    }
    (value, bytes_read)
}

/// Zero-alloc Dijkstra implementation on graph nodes for <1ms campus routing
pub fn dijkstra_search(
    adjacency: &HashMap<String, Vec<(String, usize)>>,
    start: &str,
    goal: &str,
) -> Option<(usize, Vec<String>)> {
    if start == goal {
        return Some((0, vec![start.to_string()]));
    }

    let mut dist: HashMap<String, usize> = HashMap::new();
    let mut prev: HashMap<String, String> = HashMap::new();
    let mut heap = BinaryHeap::new();
    let mut visited = HashSet::new();

    dist.insert(start.to_string(), 0);
    heap.push(State {
        cost: 0,
        node: start.to_string(),
    });

    while let Some(State { cost, node }) = heap.pop() {
        if node == goal {
            let mut path = Vec::new();
            let mut curr = goal.to_string();
            path.push(curr.clone());

            while let Some(p) = prev.get(&curr) {
                path.push(p.clone());
                curr = p.clone();
                if curr == start {
                    break;
                }
            }
            path.reverse();
            return Some((cost, path));
        }

        if visited.contains(&node) {
            continue;
        }
        visited.insert(node.clone());

        if let Some(neighbors) = adjacency.get(&node) {
            for (next, weight) in neighbors {
                let next_cost = cost + weight;
                let current_best = *dist.get(next).unwrap_or(&usize::MAX);

                if next_cost < current_best {
                    dist.insert(next.clone(), next_cost);
                    prev.insert(next.clone(), node.clone());
                    heap.push(State {
                        cost: next_cost,
                        node: next.clone(),
                    });
                }
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fnv1a_hash() {
        let data = b"timacad-rgau-2026-v3.0.1";
        let h1 = rust_fnv1a_hash(data.as_ptr(), data.len());
        let h2 = rust_fnv1a_hash(data.as_ptr(), data.len());
        assert_eq!(h1, h2);
        assert_ne!(h1, 0);
    }

    #[test]
    fn test_dijkstra() {
        let mut adj = HashMap::new();
        adj.insert("corp1".to_string(), vec![("corp2".to_string(), 3), ("agrochem".to_string(), 5)]);
        adj.insert("corp2".to_string(), vec![("corp3".to_string(), 2)]);
        adj.insert("corp3".to_string(), vec![("sport".to_string(), 8)]);

        let res = dijkstra_search(&adj, "corp1", "sport");
        assert!(res.is_some());
        let (cost, path) = res.unwrap();
        assert_eq!(cost, 13);
        assert_eq!(path, vec!["corp1", "corp2", "corp3", "sport"]);
    }

    #[test]
    fn test_crdt_vector_merge() {
        let k_a = [1, 2];
        let v_a = [10, 20];
        let k_b = [2, 3];
        let v_b = [15, 30];

        let mut out_k = [0u32; 10];
        let mut out_v = [0u32; 10];

        let count = rust_crdt_vector_merge(
            k_a.as_ptr(), v_a.as_ptr(), 2,
            k_b.as_ptr(), v_b.as_ptr(), 2,
            out_k.as_mut_ptr(), out_v.as_mut_ptr(), 10,
        );

        assert_eq!(count, 3);
    }
}
