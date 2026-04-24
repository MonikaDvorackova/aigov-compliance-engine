//! Shared-secret gate for core audit HTTP routes (`GOVAI_API_KEYS`).
//! Optional per-key request caps: `key:limit` entries and/or `GOVAI_API_KEY_DEFAULT_LIMIT`.
//! Usage (POST /evidence, GET /compliance-summary) is tracked in `api_usage` via
//! [`UsageChannel::EvidenceIngest`] / [`UsageChannel::ComplianceSummaryRead`].
//! `request_count` is still incremented (legacy); split columns are preferred for new diagnostics.
//! Billable run/event enforcement is in [`crate::metering`] when `GOVAI_METERING=on`.

use crate::api_usage::{self, ApiUsageState, UsageChannel};

use axum::extract::Request;
use axum::http::{header, HeaderMap, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone)]
pub struct AuditApiKeyConfig {
    /// When `None`, authentication is disabled (legacy local behavior).
    /// Key = raw bearer token; value = max billable/tracked requests for that key (`None` = unlimited, still counted).
    pub keys: Option<Arc<HashMap<String, Option<u64>>>>,
}

/// One comma-separated entry: `rawsecret` or `rawsecret:max_requests` (per-key cap).
/// Optional `GOVAI_API_KEY_DEFAULT_LIMIT` applies to entries without `:number`.
impl AuditApiKeyConfig {
    pub fn from_env() -> Self {
        let default_cap = std::env::var("GOVAI_API_KEY_DEFAULT_LIMIT")
            .ok()
            .and_then(|s| s.parse::<u64>().ok());
        let Ok(raw) = std::env::var("GOVAI_API_KEYS") else {
            return Self { keys: None };
        };
        let raw = raw.trim();
        if raw.is_empty() {
            return Self { keys: None };
        }
        let mut m: HashMap<String, Option<u64>> = HashMap::new();
        for part in raw.split(',') {
            let (k, mut cap) = parse_key_entry(part);
            if k.is_empty() {
                continue;
            }
            if cap.is_none() {
                cap = default_cap;
            }
            m.insert(k, cap);
        }
        if m.is_empty() {
            Self { keys: None }
        } else {
            Self {
                keys: Some(Arc::new(m)),
            }
        }
    }
}

fn parse_key_entry(part: &str) -> (String, Option<u64>) {
    let s = part.trim();
    if s.is_empty() {
        return (String::new(), None);
    }
    if let Some(i) = s.rfind(':') {
        if let Ok(n) = s[i + 1..].trim().parse::<u64>() {
            let k = s[..i].trim();
            if !k.is_empty() {
                return (k.to_string(), Some(n));
            }
        }
    }
    (s.to_string(), None)
}

/// Raw bearer secret for tenant resolution (same parsing as the API key gate).
pub fn raw_bearer_token(headers: &HeaderMap) -> Option<&str> {
    let auth = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let t = bearer_token(auth);
    if t.is_empty() {
        None
    } else {
        Some(t)
    }
}

fn bearer_token(authorization: &str) -> &str {
    let auth = authorization.trim();
    const PREFIX: &str = "Bearer ";
    if auth.len() >= PREFIX.len() && auth[..PREFIX.len()].eq_ignore_ascii_case(PREFIX) {
        auth[PREFIX.len()..].trim()
    } else {
        ""
    }
}

fn is_usage_routed_path(method: &Method, path: &str) -> bool {
    (path == "/evidence" && method == Method::POST) || (path == "/compliance-summary" && method == Method::GET)
}

pub async fn gate_audit_routes(
    cfg: AuditApiKeyConfig,
    usage: ApiUsageState,
    request: Request,
    next: Next,
) -> Response {
    if let Some(key_map) = &cfg.keys {
        let auth = request
            .headers()
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let token = bearer_token(auth);
        if !key_map.contains_key(token) {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "ok": false,
                    "error": "unauthorized",
                    "code": "unauthorized",
                    "message": "Missing or invalid Authorization bearer token."
                })),
            )
                .into_response();
        }

        let cap = key_map
            .get(token)
            .copied()
            .flatten();
        if is_usage_routed_path(request.method(), request.uri().path()) {
            let ch = if request.method() == Method::POST && request.uri().path() == "/evidence" {
                UsageChannel::EvidenceIngest
            } else {
                UsageChannel::ComplianceSummaryRead
            };
            if let Err(e) = usage.try_increment(token, cap, ch).await {
                return match e {
                    api_usage::UsageError::QuotaExceeded { limit, current } => (
                        StatusCode::TOO_MANY_REQUESTS,
                        Json(json!({
                            "ok": false,
                            "error": "usage_limit_exceeded",
                            "code": "usage_limit_exceeded",
                            "message": "This API key has exceeded its request limit. Wait for the quota reset or use a key with a higher limit.",
                            "metering": "n/a",
                            "count_kind": "api_key_total_requests",
                            "operation": match ch {
                                UsageChannel::EvidenceIngest => "post_evidence",
                                UsageChannel::ComplianceSummaryRead => "get_compliance_summary",
                            },
                            "limit": limit,
                            "used": current,
                            "current": current,
                        })),
                    )
                        .into_response(),
                    api_usage::UsageError::Database(d) => (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "ok": false,
                            "error": "usage_tracking_error",
                            "code": "usage_tracking_error",
                            "message": "We could not track API usage for this key. Please retry; if it persists, contact support.",
                            "details": d
                        })),
                    )
                        .into_response(),
                };
            }
        }
    }
    next.run(request).await
}
