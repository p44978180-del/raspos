//! Content Security Policy Level 3 (CSP v3) Validator for Student Mini-Apps
//!
//! Validates third-party student repository manifests against strict security policies:
//! 1. Disallows `unsafe-inline` scripts without SHA-256 integrity hash.
//! 2. Requires HTTPS for all network connect-src endpoints; forbids wildcard `*`.
//! 3. Permits `'wasm-unsafe-eval'` for high-speed WebAssembly engines while forbidding raw `'unsafe-eval'`.
//! 4. Enforces iframe sandbox restrictions (`allow-scripts`, no `allow-same-origin` escape).

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ManifestCSPv3 {
    pub default_src: Vec<String>,
    pub script_src: Vec<String>,
    pub connect_src: Vec<String>,
    pub style_src: Vec<String>,
    pub img_src: Vec<String>,
    pub sandbox: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StudentAppManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub repository_url: String,
    pub integrity_hash: String, // sha256-...
    pub csp: ManifestCSPv3,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CSPValidationResult {
    pub is_valid: bool,
    pub security_score: u32,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub effective_csp_header: String,
}

/// Validates student mini-app manifest per CSP v3 standards
pub fn validate_manifest_csp_v3(manifest: &StudentAppManifest) -> CSPValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut score: u32 = 100;

    // 1. Validate default-src
    if !manifest.csp.default_src.contains(&"'none'".to_string()) && !manifest.csp.default_src.contains(&"'self'".to_string()) {
        errors.push("CSP v3: 'default-src' must specify either 'none' or 'self'".to_string());
        score = score.saturating_sub(25);
    }

    // 2. Validate script-src
    let mut has_safe_script = false;
    for src in &manifest.csp.script_src {
        if src == "'unsafe-eval'" {
            errors.push("CSP v3 Violation: 'unsafe-eval' is forbidden in production sandbox. Use 'wasm-unsafe-eval' instead.".to_string());
            score = score.saturating_sub(40);
        }
        if src == "'unsafe-inline'" {
            errors.push("CSP v3 Violation: Unrestricted 'unsafe-inline' in script-src is forbidden. Scripts must be hashed with sha256.".to_string());
            score = score.saturating_sub(35);
        }
        if src == "'self'" || src == "'wasm-unsafe-eval'" || src.starts_with("'sha256-") {
            has_safe_script = true;
        }
    }
    if !has_safe_script {
        errors.push("CSP v3: script-src must contain 'self' or a valid 'sha256-...' hash".to_string());
        score = score.saturating_sub(20);
    }

    // 3. Validate connect-src
    for conn in &manifest.csp.connect_src {
        if conn == "*" {
            errors.push("CSP v3 Violation: Wildcard '*' in connect-src is strictly forbidden. Endpoints must be explicitly scoped.".to_string());
            score = score.saturating_sub(30);
        } else if !conn.starts_with("https://") && conn != "'self'" && !conn.starts_with("wss://") {
            errors.push(format!("CSP v3 Violation: Insecure endpoint '{}'. Only HTTPS or WSS protocols are allowed.", conn));
            score = score.saturating_sub(25);
        }
    }

    // 4. Validate sandbox directives
    if !manifest.csp.sandbox.contains(&"allow-scripts".to_string()) {
        warnings.push("Mini-app sandbox does not request 'allow-scripts' — UI may be static".to_string());
    }
    if manifest.csp.sandbox.contains(&"allow-same-origin".to_string()) && manifest.csp.sandbox.contains(&"allow-scripts".to_string()) {
        warnings.push("Warning: Combining 'allow-scripts' and 'allow-same-origin' allows iframe sandbox breakout. Restricted by runtime.".to_string());
        score = score.saturating_sub(15);
    }

    // 5. Validate integrity hash format
    if !manifest.integrity_hash.starts_with("sha256-") {
        errors.push("Integrity hash must be in 'sha256-<base64>' format".to_string());
        score = score.saturating_sub(20);
    }

    // Build standard CSP v3 header string
    let effective_csp_header = format!(
        "default-src {}; script-src {}; connect-src {}; style-src {}; img-src {}; sandbox {}",
        manifest.csp.default_src.join(" "),
        manifest.csp.script_src.join(" "),
        manifest.csp.connect_src.join(" "),
        manifest.csp.style_src.join(" "),
        manifest.csp.img_src.join(" "),
        manifest.csp.sandbox.join(" ")
    );

    let is_valid = errors.is_empty();

    CSPValidationResult {
        is_valid,
        security_score: score,
        errors,
        warnings,
        effective_csp_header,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_student_manifest() {
        let manifest = StudentAppManifest {
            id: "timacad_greenhouse".to_string(),
            name: "Умная Теплица".to_string(),
            version: "1.0.0".to_string(),
            author: "СНО Агрономии".to_string(),
            repository_url: "https://github.com/timacad/greenhouse".to_string(),
            integrity_hash: "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=".to_string(),
            csp: ManifestCSPv3 {
                default_src: vec!["'none'".to_string()],
                script_src: vec!["'self'".to_string(), "'wasm-unsafe-eval'".to_string()],
                connect_src: vec!["https://iot.timacad.ru".to_string()],
                style_src: vec!["'unsafe-inline'".to_string()],
                img_src: vec!["https:".to_string(), "data:".to_string()],
                sandbox: vec!["allow-scripts".to_string(), "allow-forms".to_string()],
            },
            permissions: vec!["storage".to_string(), "schedule".to_string()],
        };

        let result = validate_manifest_csp_v3(&manifest);
        assert!(result.is_valid);
        assert_eq!(result.security_score, 100);
        assert!(result.errors.is_empty());
        assert!(result.effective_csp_header.contains("wasm-unsafe-eval"));
    }

    #[test]
    fn test_reject_unsafe_eval_and_wildcard() {
        let manifest = StudentAppManifest {
            id: "insecure_app".to_string(),
            name: "Insecure".to_string(),
            version: "0.1".to_string(),
            author: "Unknown".to_string(),
            repository_url: "http://insecure.site".to_string(),
            integrity_hash: "invalid-hash".to_string(),
            csp: ManifestCSPv3 {
                default_src: vec!["*".to_string()],
                script_src: vec!["'unsafe-eval'".to_string(), "'unsafe-inline'".to_string()],
                connect_src: vec!["*".to_string()],
                style_src: vec!["*".to_string()],
                img_src: vec!["*".to_string()],
                sandbox: vec![],
            },
            permissions: vec![],
        };

        let result = validate_manifest_csp_v3(&manifest);
        assert!(!result.is_valid);
        assert!(result.errors.len() >= 3);
        assert!(result.security_score < 50);
    }
}
