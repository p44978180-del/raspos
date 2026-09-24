#[cfg(test)]
mod duty;
mod campus;
mod miniapp;
mod hash;
mod personal;

#[cfg(test)]
mod alloc_track;

#[cfg(test)]
#[global_allocator]
static TRACK_ALLOC: alloc_track::TrackAlloc = alloc_track::TrackAlloc;

pub use miniapp::Sandbox;
#[cfg(feature = "wasm")]
pub use miniapp::run_wasm;
pub use personal::{compact_doc, personal_fixture_bytes, CompactedSnapshot};

pub use hash::{canonical_snapshot_hash, canonical_snapshot_hash_hex, CanonicalLesson};

uniffi::setup_scaffolding!();

#[uniffi::export]
pub fn core_snapshot_hash_hex(lessons: Vec<CanonicalLesson>) -> String {
    hash::canonical_snapshot_hash_hex(&lessons)
}

/// Identity of the linked core. Callers use this to prove the native library is the real crate.
#[uniffi::export]
pub fn core_hello() -> String {
    "timacad-core".to_string()
}

#[cfg(test)]
mod tests {
    use super::core_hello;

    #[test]
    fn hello_names_the_crate() {
        assert_eq!(core_hello(), "timacad-core");
    }
}
