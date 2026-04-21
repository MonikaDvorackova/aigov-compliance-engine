//! Optional shared-secret gate for core audit HTTP routes (`GOVAI_API_KEYS`).

use axum::extract::Request;
use axum::http::{header, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use std::collections::HashSet;
use std::sync::Arc;

#[derive(Clone)]
pub struct AuditApiKeyConfig {
    /// When `None`, authentication is disabled (legacy local behavior).
    pub keys: Option<Arc<HashSet<String>>>,
}

impl AuditApiKeyConfig {
    pub fn from_env() -> Self {
        let Ok(raw) = std::env::var("GOVAI_API_KEYS") else {
            return Self { keys: None };
        };
        let raw = raw.trim();
        if raw.is_empty() {
            return Self { keys: None };
        }
        let set: HashSet<String> = raw
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if set.is_empty() {
            Self { keys: None }
        } else {
            Self {
                keys: Some(Arc::new(set)),
            }
        }
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

pub async fn gate_audit_routes(cfg: AuditApiKeyConfig, request: Request, next: Next) -> Response {
    if let Some(keys) = &cfg.keys {
        let auth = request
            .headers()
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let token = bearer_token(auth);
        if !keys.contains(token) {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "ok": false, "error": "unauthorized" })),
            )
                .into_response();
        }
    }
    next.run(request).await
}
