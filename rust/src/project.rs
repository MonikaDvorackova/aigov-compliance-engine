//! Tenant/project isolation helpers: resolve tenant id and ledger path per request.

use crate::api_usage;
use crate::audit_api_key;
use crate::govai_environment::GovaiEnvironment;
use axum::http::HeaderMap;

const HDR: &str = "x-govai-project";

/// Reads `X-GovAI-Project`; empty or missing → `"default"`.
/// Single entry for billing / `GET /usage` tenant scope: header + bearer (see [`tenant_id_for_usage`]).
pub fn billing_tenant_id(headers: &HeaderMap) -> String {
    tenant_id_for_usage(headers, audit_api_key::raw_bearer_token(headers))
}

/// Stable tenant id for usage / quotas: `X-GovAI-Project` (if set), else API key fingerprint, else `default`.
pub fn tenant_id_for_usage(headers: &HeaderMap, bearer_token: Option<&str>) -> String {
    let raw = headers
        .get(HDR)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .trim();
    if !raw.is_empty() {
        return sanitize_project_segment(raw);
    }
    if let Some(t) = bearer_token {
        let t = t.trim();
        if !t.is_empty() {
            return api_usage::key_fingerprint(t);
        }
    }
    "default".to_string()
}

/// Canonical tenant id for tenant-isolated ledger access.
///
/// Rules:
/// - Primary: `x-govai-project` (sanitized)
/// - Fallback (safe + already supported elsewhere): API key fingerprint (if bearer token present)
/// - In non-dev (`staging` / `prod`): return `Err` when neither is present (missing tenant context).
pub fn require_tenant_id_for_ledger(
    headers: &HeaderMap,
    deployment_env: GovaiEnvironment,
) -> Result<String, String> {
    let raw = headers
        .get(HDR)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .trim();
    if !raw.is_empty() {
        return Ok(sanitize_project_segment(raw));
    }

    if let Some(t) = audit_api_key::raw_bearer_token(headers) {
        let t = t.trim();
        if !t.is_empty() {
            return Ok(api_usage::key_fingerprint(t));
        }
    }

    match deployment_env {
        GovaiEnvironment::Dev => Ok("default".to_string()),
        GovaiEnvironment::Staging | GovaiEnvironment::Prod => {
            Err("missing_tenant_context".to_string())
        }
    }
}

fn sanitize_project_segment(project_id: &str) -> String {
    let s: String = project_id
        .chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' => c,
            _ => '_',
        })
        .take(128)
        .collect();
    if s.is_empty() {
        "_".to_string()
    } else {
        s
    }
}

/// Deterministic tenant-scoped ledger path.
///
/// `ledger_base` is e.g. `audit_log.jsonl`. Always returns a tenant-specific `.jsonl` file.
pub fn resolve_ledger_path(ledger_base: &str, tenant_id: &str) -> String {
    let stem = ledger_base.strip_suffix(".jsonl").unwrap_or(ledger_base);
    let safe = sanitize_project_segment(tenant_id);
    format!("{}__{}.jsonl", stem, safe)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn billing_tenant_prefers_x_govai_project() {
        let mut h = HeaderMap::new();
        h.insert("x-govai-project", HeaderValue::from_static("team-alpha"));
        assert_eq!(billing_tenant_id(&h), "team-alpha");
    }

    #[test]
    fn billing_tenant_falls_back_to_key_fingerprint() {
        let mut h = HeaderMap::new();
        h.insert("Authorization", HeaderValue::from_static("Bearer mysecret"));
        let tid = billing_tenant_id(&h);
        assert_ne!(tid, "default");
        assert_eq!(tid, crate::api_usage::key_fingerprint("mysecret"));
    }

    #[test]
    fn billing_tenant_default_without_header_or_bearer() {
        let h = HeaderMap::new();
        assert_eq!(billing_tenant_id(&h), "default");
    }

    #[test]
    fn require_tenant_id_for_ledger_header_primary() {
        let mut h = HeaderMap::new();
        h.insert("x-govai-project", HeaderValue::from_static("team-alpha"));
        let tid = require_tenant_id_for_ledger(&h, GovaiEnvironment::Prod).unwrap();
        assert_eq!(tid, "team-alpha");
    }

    #[test]
    fn require_tenant_id_for_ledger_falls_back_to_key_fingerprint() {
        let mut h = HeaderMap::new();
        h.insert("Authorization", HeaderValue::from_static("Bearer mysecret"));
        let tid = require_tenant_id_for_ledger(&h, GovaiEnvironment::Prod).unwrap();
        assert_eq!(tid, crate::api_usage::key_fingerprint("mysecret"));
    }

    #[test]
    fn require_tenant_id_for_ledger_missing_rejected_in_prod() {
        let h = HeaderMap::new();
        let err = require_tenant_id_for_ledger(&h, GovaiEnvironment::Prod).unwrap_err();
        assert_eq!(err, "missing_tenant_context");
    }

    #[test]
    fn ledger_path_is_always_tenant_scoped() {
        assert_eq!(
            resolve_ledger_path("audit_log.jsonl", "default"),
            "audit_log__default.jsonl"
        );
    }
}
