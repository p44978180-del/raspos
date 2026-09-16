//! Student Mini-App Isolated Micro-Runtime Sandbox
//! Provides fine-grained capability checks, RPC message validation, and memory quota control.

use crate::csp_validator::{ManifestCSPv3, StudentAppManifest, validate_manifest_csp_v3};
use std::collections::HashSet;

#[derive(Debug, Clone)]
pub struct SandboxRuntimeInstance {
    pub app_id: String,
    pub permissions: HashSet<String>,
    pub csp: ManifestCSPv3,
    pub max_memory_bytes: usize,
    pub is_active: bool,
}

#[derive(Debug, PartialEq)]
pub enum SandboxExecutionResult {
    Allowed,
    DeniedPermission(String),
    BlockedByCSP(String),
    QuotaExceeded,
}

impl SandboxRuntimeInstance {
    pub fn new(manifest: &StudentAppManifest) -> Result<Self, String> {
        let report = validate_manifest_csp_v3(manifest);
        if !report.is_valid {
            return Err(format!("Manifest rejected: {:?}", report.errors));
        }

        let perms: HashSet<String> = manifest.permissions.iter().cloned().collect();
        Ok(Self {
            app_id: manifest.id.clone(),
            permissions: perms,
            csp: manifest.csp.clone(),
            max_memory_bytes: 16 * 1024 * 1024, // 16 MB sandbox limit
            is_active: true,
        })
    }

    pub fn check_rpc_capability(&self, method: &str, target_domain: Option<&str>) -> SandboxExecutionResult {
        if !self.is_active {
            return SandboxExecutionResult::BlockedByCSP("Sandbox inactive".into());
        }

        match method {
            "nfc.emulateTurnstile" => {
                if !self.permissions.contains("nfc.transit") {
                    return SandboxExecutionResult::DeniedPermission("nfc.transit required".into());
                }
            }
            "biometrics.authenticate" => {
                if !self.permissions.contains("biometrics") {
                    return SandboxExecutionResult::DeniedPermission("biometrics required".into());
                }
            }
            "fetch" => {
                if let Some(domain) = target_domain {
                    let allowed = self.csp.connect_src.iter().any(|src| src == "*" || src.contains(domain));
                    if !allowed {
                        return SandboxExecutionResult::BlockedByCSP(format!("Domain '{}' not in connect-src", domain));
                    }
                }
            }
            _ => {}
        }

        SandboxExecutionResult::Allowed
    }
}
