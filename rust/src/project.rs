//! Minimal project isolation: resolve ledger file path from `X-GovAI-Project`.

use axum::http::HeaderMap;

const HDR: &str = "x-govai-project";

/// Reads `X-GovAI-Project`; empty or missing → `"default"`.
pub fn project_id_from_headers(headers: &HeaderMap) -> String {
    let raw = headers
        .get(HDR)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .trim();
    if raw.is_empty() {
        "default".to_string()
    } else {
        raw.to_string()
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

/// `ledger_base` is e.g. `audit_log.jsonl`. For project `default`, returns that path unchanged.
pub fn resolve_ledger_path(ledger_base: &str, project_id: &str) -> String {
    if project_id == "default" {
        return ledger_base.to_string();
    }
    let stem = ledger_base.strip_suffix(".jsonl").unwrap_or(ledger_base);
    let safe = sanitize_project_segment(project_id);
    format!("{}__{}.jsonl", stem, safe)
}
