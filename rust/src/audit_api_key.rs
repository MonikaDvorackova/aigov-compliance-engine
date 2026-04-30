//! Shared-secret gate for core audit HTTP routes (`GOVAI_API_KEYS`).
//! Optional per-key request caps: `key:limit` entries and/or `GOVAI_API_KEY_DEFAULT_LIMIT`.
//! Usage (POST /evidence, GET /compliance-summary) is tracked in `api_usage` via
//! [`UsageChannel::EvidenceIngest`] / [`UsageChannel::ComplianceSummaryRead`].
//! `request_count` is still incremented (legacy); split columns are preferred for new diagnostics.
//! Billable run/event enforcement is in [`crate::metering`] when `GOVAI_METERING=on`.

use crate::api_usage::{self, ApiUsageState, UsageChannel};
use crate::govai_environment::GovaiEnvironment;

use axum::extract::Request;
use axum::http::{header, HeaderMap, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use std::collections::HashMap;
use std::sync::Arc;

use crate::api_error::{api_error, api_error_with};
use once_cell::sync::OnceCell;

static API_KEY_TENANT_MAP: OnceCell<Arc<HashMap<String, String>>> = OnceCell::new();

pub fn api_key_tenant_map_is_initialized() -> bool {
    API_KEY_TENANT_MAP.get().is_some()
}

/// Initialize `GOVAI_API_KEYS_JSON` (api_key -> tenant_id) mapping once at startup.
///
/// - **Dev**: missing/empty config is allowed (ledger tenant defaults to `"default"`).
/// - **Staging/Prod**: missing/invalid/empty config fails startup.
pub fn init_api_key_tenant_map(deployment_env: GovaiEnvironment) -> Result<(), String> {
    let raw = std::env::var("GOVAI_API_KEYS_JSON").ok();
    let raw = raw.as_deref().unwrap_or("").trim();

    if raw.is_empty() {
        return match deployment_env {
            GovaiEnvironment::Dev => Ok(()),
            GovaiEnvironment::Staging | GovaiEnvironment::Prod => Err(
                "GOVAI_API_KEYS_JSON is required in staging/prod (JSON object mapping api_key -> tenant_id)"
                    .to_string(),
            ),
        };
    }

    let parsed: HashMap<String, String> = serde_json::from_str(raw).map_err(|e| {
        format!(
            "Invalid GOVAI_API_KEYS_JSON (expected JSON object mapping api_key -> tenant_id): {e}"
        )
    })?;

    let mut cleaned: HashMap<String, String> = HashMap::new();
    for (k, v) in parsed.into_iter() {
        let k = k.trim().to_string();
        let v = v.trim().to_string();
        if k.is_empty() || v.is_empty() {
            continue;
        }
        cleaned.insert(k, v);
    }

    if cleaned.is_empty() {
        return match deployment_env {
            GovaiEnvironment::Dev => Ok(()),
            GovaiEnvironment::Staging | GovaiEnvironment::Prod => Err(
                "GOVAI_API_KEYS_JSON must contain at least one api_key -> tenant_id entry"
                    .to_string(),
            ),
        };
    }

    API_KEY_TENANT_MAP
        .set(Arc::new(cleaned))
        .map_err(|_| "GOVAI_API_KEYS_JSON was initialized more than once".to_string())?;
    Ok(())
}

/// Server-controlled tenant id for the tenant-isolated ledger.
///
/// Tenant identity is derived **only** from the API key (never from headers like `x-govai-project`).
pub fn require_tenant_id_from_api_key_for_ledger(
    headers: &HeaderMap,
    deployment_env: GovaiEnvironment,
) -> Result<String, String> {
    let Some(map) = API_KEY_TENANT_MAP.get() else {
        return match deployment_env {
            GovaiEnvironment::Dev => Ok("default".to_string()),
            GovaiEnvironment::Staging | GovaiEnvironment::Prod => {
                Err("missing_api_key_tenant_map".to_string())
            }
        };
    };

    let token = raw_bearer_token(headers).ok_or_else(|| "missing_api_key".to_string())?;
    map.get(token)
        .cloned()
        .ok_or_else(|| "unknown_api_key".to_string())
}

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
    (path == "/evidence" && method == Method::POST)
        || (path == "/compliance-summary" && method == Method::GET)
}

pub async fn gate_audit_routes(
    cfg: AuditApiKeyConfig,
    usage: ApiUsageState,
    request: Request,
    next: Next,
) -> Response {
    let auth = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let token = bearer_token(auth);

    // Primary allowlist for audit routes: server-controlled key -> tenant mapping.
    // When present, all audit routes require an API key and it must exist in the mapping.
    if let Some(tenant_map) = API_KEY_TENANT_MAP.get() {
        if token.is_empty() {
            return api_error(
                StatusCode::UNAUTHORIZED,
                "MISSING_API_KEY",
                "Missing API key.",
                "Provide `Authorization: Bearer <api_key>`.",
                None,
            )
            .into_response();
        }
        if !tenant_map.contains_key(token) {
            return api_error(
                StatusCode::UNAUTHORIZED,
                "INVALID_API_KEY",
                "Invalid API key.",
                "Verify you’re using the correct GovAI API key (and not a JWT). If you rotated keys, update your integration and retry.",
                None,
            )
            .into_response();
        }
    }

    if let Some(key_map) = &cfg.keys {
        // Optional per-key usage caps: when configured, require token to be present and allowlisted.
        if token.is_empty() {
            return api_error(
                StatusCode::UNAUTHORIZED,
                "MISSING_API_KEY",
                "Missing API key.",
                "Provide `Authorization: Bearer <api_key>`.",
                None,
            )
            .into_response();
        }
        if !key_map.contains_key(token) {
            return api_error(
                StatusCode::UNAUTHORIZED,
                "INVALID_API_KEY",
                "Invalid API key.",
                "Verify you’re using the correct GovAI API key (and not a JWT). If you rotated keys, update your integration and retry.",
                None,
            )
            .into_response();
        }

        let cap = key_map.get(token).copied().flatten();
        if is_usage_routed_path(request.method(), request.uri().path()) {
            let ch = if request.method() == Method::POST && request.uri().path() == "/evidence" {
                UsageChannel::EvidenceIngest
            } else {
                UsageChannel::ComplianceSummaryRead
            };
            if let Err(e) = usage.try_increment(token, cap, ch).await {
                return match e {
                    api_usage::UsageError::QuotaExceeded { limit, current } => api_error_with(
                        StatusCode::TOO_MANY_REQUESTS,
                        "USAGE_LIMIT_EXCEEDED",
                        "This API key has exceeded its request limit.",
                        "Wait for the quota reset or use an API key with a higher limit.",
                        Some(serde_json::json!({ "limit": limit, "used": current })),
                        Some(serde_json::json!({
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
                    api_usage::UsageError::Database(d) => api_error(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "USAGE_TRACKING_ERROR",
                        "We could not track API usage for this key.",
                        "Retry in a moment. If this persists, contact support (this is a server-side issue).",
                        Some(serde_json::Value::String(d)),
                    )
                    .into_response(),
                };
            }
        }
    }
    next.run(request).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use axum::routing::get;
    use axum::{middleware, Router};
    use serde_json::Value;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tower::ServiceExt;

    fn usage_state_for_tests() -> ApiUsageState {
        let pool = sqlx::PgPool::connect_lazy("postgres://postgres:postgres@localhost/postgres")
            .expect("connect_lazy should not contact the database");
        ApiUsageState::from_env(&pool).expect("usage state should initialize in memory mode")
    }

    #[tokio::test]
    async fn missing_api_key_returns_standard_error() {
        let usage = usage_state_for_tests();
        let cfg = AuditApiKeyConfig {
            keys: Some(Arc::new(HashMap::from([("good-key".to_string(), None)]))),
        };

        let app = Router::new()
            .route("/bundle", get(|| async { "ok" }))
            .layer(middleware::from_fn(move |req, next| {
                let cfg = cfg.clone();
                let usage = usage.clone();
                async move { gate_audit_routes(cfg, usage, req, next).await }
            }));

        let resp = app
            .oneshot(Request::builder().uri("/bundle").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
        let bytes = http_body_util::BodyExt::collect(resp.into_body())
            .await
            .unwrap()
            .to_bytes();
        let v: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(v.pointer("/error/code").and_then(Value::as_str), Some("MISSING_API_KEY"));
    }

    #[tokio::test]
    async fn invalid_api_key_returns_standard_error() {
        let usage = usage_state_for_tests();
        let cfg = AuditApiKeyConfig {
            keys: Some(Arc::new(HashMap::from([("good-key".to_string(), None)]))),
        };

        let app = Router::new()
            .route("/bundle", get(|| async { "ok" }))
            .layer(middleware::from_fn(move |req, next| {
                let cfg = cfg.clone();
                let usage = usage.clone();
                async move { gate_audit_routes(cfg, usage, req, next).await }
            }));

        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/bundle")
                    .header("Authorization", "Bearer bad-key")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
        let bytes = http_body_util::BodyExt::collect(resp.into_body())
            .await
            .unwrap()
            .to_bytes();
        let v: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(v.pointer("/error/code").and_then(Value::as_str), Some("INVALID_API_KEY"));
    }
}
