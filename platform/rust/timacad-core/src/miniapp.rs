use std::fs;
use std::path::{Component, Path, PathBuf};

const HOST_METHODS: &[&str] = &[
    "host.v1.schedule.read",
    "host.v1.group.read",
    "host.v1.navigate.building",
    "host.v1.thread.read",
    "host.v1.storage.kv",
    "host.v1.duty_roster.write",
];

const FORBIDDEN: &[&str] = &["nfc", "biometrics", "wallet", "host.v1.nfc", "host.v1.biometrics", "host.v1.wallet"];

const KV_QUOTA: u64 = 1024 * 1024;

/// admit_launch is the host gate for a registry status. A revoked release never starts.
#[uniffi::export]
pub fn admit_launch(status: String) -> bool {
    status == "published"
}

/// authorize_call is the only gate on TimHost.call. A method must be on the granted list and not forbidden.
#[uniffi::export]
pub fn authorize_call(allowed_methods: Vec<String>, method: String) -> bool {
    grant(&allowed_methods, &method).is_ok()
}

pub fn grant(allowed: &[String], method: &str) -> Result<(), String> {
    if FORBIDDEN.iter().any(|item| *item == method) || !HOST_METHODS.contains(&method) {
        return Err("method is forbidden".into());
    }
    if !allowed.iter().any(|item| item == method) {
        return Err("method is not granted".into());
    }
    Ok(())
}

/// Sandbox is one directory per mini-app. Keys cannot escape it, and the host database is not a key.
pub struct Sandbox {
    root: PathBuf,
}

impl Sandbox {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn put(&self, app_id: &str, key: &str, value: &[u8]) -> Result<(), String> {
        let path = self.key_path(app_id, key)?;
        let parent = path.parent().ok_or("kv directory is missing")?;
        let mut used = dir_size(parent)?;
        if path.is_file() {
            let current = fs::metadata(&path).map_err(|err| err.to_string())?.len();
            used = used.saturating_sub(current);
        }
        if used.saturating_add(value.len() as u64) > KV_QUOTA {
            return Err("kv quota is 1 MiB".into());
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        fs::write(path, value).map_err(|err| err.to_string())
    }

    pub fn get(&self, app_id: &str, key: &str) -> Result<Vec<u8>, String> {
        let path = self.key_path(app_id, key)?;
        fs::read(path).map_err(|err| err.to_string())
    }

    fn key_path(&self, app_id: &str, key: &str) -> Result<PathBuf, String> {
        if !safe_id(app_id) || !safe_id(key) {
            return Err("app id or key is not a single path segment".into());
        }
        Ok(self.root.join("apps").join(app_id).join("kv").join(key))
    }
}

fn safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        && Path::new(value).components().all(|component| matches!(component, Component::Normal(_)))
}

fn dir_size(path: &Path) -> Result<u64, String> {
    if !path.exists() {
        return Ok(0);
    }
    let mut total = 0u64;
    for entry in fs::read_dir(path).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        total += entry.metadata().map_err(|err| err.to_string())?.len();
    }
    Ok(total)
}

#[cfg(feature = "wasm")]
pub fn run_wasm(bytes: &[u8], fuel: u64) -> Result<(), String> {
    use wasmtime::{Config, Engine, Linker, Module, Store, StoreLimits, StoreLimitsBuilder};

    let mut config = Config::new();
    config.consume_fuel(true);
    let engine = Engine::new(&config).map_err(explain)?;
    let module = Module::new(&engine, bytes).map_err(explain)?;
    let mut store = Store::new(
        &engine,
        StoreLimitsBuilder::new()
            .memory_size(16 * 1024 * 1024)
            .trap_on_grow_failure(true)
            .build(),
    );
    store.set_fuel(fuel).map_err(explain)?;
    store.limiter(|limits: &mut StoreLimits| limits as &mut dyn wasmtime::ResourceLimiter);
    let linker = Linker::new(&engine);
    let instance = linker.instantiate(&mut store, &module).map_err(explain)?;
    let run = instance.get_typed_func::<(), ()>(&mut store, "run").map_err(explain)?;
    run.call(&mut store, ()).map_err(explain)
}

#[cfg(feature = "wasm")]
fn explain(err: wasmtime::Error) -> String {
    format!("{err:?}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn call_rejects_ungranted_and_forbidden_methods() {
        let granted = vec!["host.v1.schedule.read".to_string(), "nfc".to_string()];
        assert!(authorize_call(granted.clone(), "host.v1.schedule.read".into()));
        assert!(!authorize_call(granted.clone(), "host.v1.thread.read".into()));
        assert!(!authorize_call(granted, "nfc".into()));
        assert!(!authorize_call(vec!["host.v1.wallet".into()], "host.v1.wallet".into()));
        assert!(admit_launch("published".into()));
        assert!(!admit_launch("revoked".into()));
        assert!(!admit_launch("review".into()));
    }

    #[test]
    fn kv_of_one_app_cannot_read_another_or_the_host_database() {
        let root = std::env::temp_dir().join(format!("timacad-miniapp-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let host_db = root.join("host").join("platform.db");
        fs::create_dir_all(host_db.parent().unwrap()).unwrap();
        fs::write(&host_db, b"sqlite-host").unwrap();
        let sandbox = Sandbox::new(&root);
        sandbox.put("bulletin", "note", b"announcement").unwrap();
        sandbox.put("duties", "monday", b"anna").unwrap();
        assert_eq!(sandbox.get("bulletin", "note").unwrap(), b"announcement");
        assert!(sandbox.get("duties", "note").is_err());
        assert!(sandbox.get("bulletin", "../host/platform.db").is_err());
        assert!(sandbox.get("bulletin", "..").is_err());
        assert_eq!(fs::read(&host_db).unwrap(), b"sqlite-host");
        let full = vec![7u8; KV_QUOTA as usize];
        sandbox.put("quota", "blob", &full).unwrap();
        assert!(sandbox.put("quota", "extra", &[1]).is_err());
        sandbox.put("other", "blob", &full).unwrap();
        sandbox.put("quota", "blob", b"shorter").unwrap();
        let _ = fs::remove_dir_all(&root);
    }

    #[cfg(feature = "wasm")]
    #[test]
    fn infinite_loop_exhausts_fuel_and_returns() {
        let wasm = wat::parse_str("(module (func (export \"run\") (loop (br 0))))").unwrap();
        let wasm_for_thread = wasm.clone();
        let (sender, receiver) = std::sync::mpsc::channel();
        std::thread::spawn(move || sender.send(run_wasm(&wasm_for_thread, 1_000)));
        let result = receiver.recv_timeout(Duration::from_secs(2)).expect("wasm loop hung the host");
        let err = result.expect_err("loop returned");
        assert!(err.to_lowercase().contains("fuel"), "{err}");
    }

    #[cfg(feature = "wasm")]
    #[test]
    fn wasm_import_of_the_filesystem_is_not_linked() {
        let wasm = wat::parse_str(
            r#"(module (import "wasi_snapshot_preview1" "fd_read" (func (param i32 i32 i32 i32) (result i32))) (func (export "run")))"#,
        )
        .unwrap();
        let err = run_wasm(&wasm, 1_000).expect_err("wasi was linked");
        assert!(err.to_lowercase().contains("wasi") || err.to_lowercase().contains("import") || err.to_lowercase().contains("unknown"), "{err}");
    }

    #[cfg(feature = "wasm")]
    #[test]
    fn wasm_memory_above_16_mib_is_refused() {
        let pages = 16 * 1024 * 1024 / (64 * 1024);
        let big = wat::parse_str(format!("(module (memory {}) (func (export \"run\")))", pages + 1)).unwrap();
        let err = run_wasm(&big, 10_000).expect_err("16 MiB memory limit was ignored");
        assert!(err.to_lowercase().contains("memory"), "{err}");
        let small = wat::parse_str("(module (memory 1) (func (export \"run\")))").unwrap();
        run_wasm(&small, 10_000).expect("1 page module");
    }
}
