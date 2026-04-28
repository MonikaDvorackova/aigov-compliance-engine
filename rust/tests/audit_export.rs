use aigov_audit::{
    api_usage::ApiUsageState,
    govai_api,
    govai_environment::GovaiEnvironment,
    metering::{GovaiPlan, MeteringConfig},
    policy_config::PolicyConfig,
};
use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use http_body_util::BodyExt;
use aigov_audit::{audit_store, schema::EvidenceEvent};
use serde_json::Value;
use tempfile::TempDir;
use tower::ServiceExt;
use std::sync::{Mutex, OnceLock};

fn env_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
}

fn append_event(dir: &TempDir, tenant: &str, event: EvidenceEvent) {
    let filename = format!("audit_log__{}.jsonl", tenant);
    let p = dir.path().join(filename);
    audit_store::append_record(&p.to_string_lossy(), event).unwrap();
}

fn build_app(pool: sqlx::PgPool) -> axum::Router {
    // Policy config is not used by /api/export, but required for router wiring.
    let policy = PolicyConfig::default();
    let api_usage = ApiUsageState::from_env(&pool).unwrap();
    let metering = MeteringConfig {
        enabled: false,
        default_plan: GovaiPlan::Free,
    };
    govai_api::audit_router(
        "audit_log.jsonl",
        "test-policy-v0",
        GovaiEnvironment::Dev,
        policy,
        api_usage,
        pool,
        metering,
    )
}

async fn export_json(app: axum::Router, tenant: &str, run_id: &str) -> (StatusCode, Value) {
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/export/{run_id}"))
        .header(header::AUTHORIZATION, "Bearer testkey")
        .header("x-govai-project", tenant)
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&bytes).unwrap();
    (status, json)
}

#[tokio::test]
async fn export_contains_decision_and_evidence_requirements() {
    let _g = env_lock();
    std::env::set_var("GOVAI_API_KEYS", "testkey");
    let tmp = TempDir::new().unwrap();
    std::env::set_var("GOVAI_LEDGER_DIR", tmp.path().to_string_lossy().to_string());

    let run_id = "run-123";
    let tenant = "tenant-alpha";
    append_event(
        &tmp,
        tenant,
        EvidenceEvent {
            event_id: "e1".to_string(),
            event_type: "ai_discovery_reported".to_string(),
            ts_utc: "2026-01-01T00:00:01Z".to_string(),
            actor: "system".to_string(),
            system: "govai".to_string(),
            run_id: run_id.to_string(),
            environment: None,
            payload: serde_json::json!({ "openai": true, "transformers": false, "model_artifacts": false }),
        },
    );
    append_event(
        &tmp,
        tenant,
        EvidenceEvent {
            event_id: "e2".to_string(),
            event_type: "model_registered".to_string(),
            ts_utc: "2026-01-01T00:00:02Z".to_string(),
            actor: "alice".to_string(),
            system: "govai".to_string(),
            run_id: run_id.to_string(),
            environment: None,
            payload: serde_json::json!({ "model": "gpt-4o-mini" }),
        },
    );
    append_event(
        &tmp,
        tenant,
        EvidenceEvent {
            event_id: "e3".to_string(),
            event_type: "usage_policy_defined".to_string(),
            ts_utc: "2026-01-01T00:00:03Z".to_string(),
            actor: "alice".to_string(),
            system: "govai".to_string(),
            run_id: run_id.to_string(),
            environment: None,
            payload: serde_json::json!({ "policy_id": "up-1" }),
        },
    );
    append_event(
        &tmp,
        tenant,
        EvidenceEvent {
            event_id: "e4".to_string(),
            event_type: "evaluation_reported".to_string(),
            ts_utc: "2026-01-01T00:00:04Z".to_string(),
            actor: "eval-bot".to_string(),
            system: "govai".to_string(),
            run_id: run_id.to_string(),
            environment: None,
            payload: serde_json::json!({ "passed": true }),
        },
    );

    // Lazy pool: DB ops are best-effort in export and ignored.
    let pool = sqlx::PgPool::connect_lazy("postgres://localhost/does_not_exist").unwrap();
    let app = build_app(pool);
    let (status, json) = export_json(app, tenant, run_id).await;
    assert_eq!(status, StatusCode::OK, "unexpected response: {}", json);

    assert_eq!(json.get("schema_version").and_then(|v| v.as_str()), Some("aigov.audit_export.v1"));

    let decision = json.get("decision").unwrap();
    assert!(decision.get("verdict").is_some());

    let reqs = json.get("evidence_requirements").unwrap();
    assert!(reqs.get("required_evidence").is_some());
    assert!(reqs.get("provided_evidence").is_some());
    assert!(reqs.get("missing_evidence").is_some());
}

#[tokio::test]
async fn export_includes_discovery_generated_requirements() {
    let _g = env_lock();
    std::env::set_var("GOVAI_API_KEYS", "testkey");
    let tmp = TempDir::new().unwrap();
    std::env::set_var("GOVAI_LEDGER_DIR", tmp.path().to_string_lossy().to_string());

    let run_id = "run-discovery";
    let tenant = "tenant-beta";
    append_event(
        &tmp,
        tenant,
        EvidenceEvent {
            event_id: "d1".to_string(),
            event_type: "ai_discovery_reported".to_string(),
            ts_utc: "2026-01-02T00:00:01Z".to_string(),
            actor: "system".to_string(),
            system: "govai".to_string(),
            run_id: run_id.to_string(),
            environment: None,
            payload: serde_json::json!({ "openai": true, "transformers": false, "model_artifacts": false }),
        },
    );

    let pool = sqlx::PgPool::connect_lazy("postgres://localhost/does_not_exist").unwrap();
    let app = build_app(pool);
    let (status, json) = export_json(app, tenant, run_id).await;
    assert_eq!(status, StatusCode::OK, "unexpected response: {}", json);

    let reqs = json
        .get("evidence_requirements")
        .and_then(|v| v.get("required_evidence"))
        .and_then(|v| v.as_array())
        .unwrap();
    let codes: Vec<String> = reqs.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect();

    // Baseline + discovery-driven additions for OpenAI.
    assert!(codes.contains(&"ai_discovery_completed".to_string()));
    assert!(codes.contains(&"model_registered".to_string()));
    assert!(codes.contains(&"usage_policy_defined".to_string()));
}

#[tokio::test]
async fn export_respects_tenant_isolation() {
    let _g = env_lock();
    std::env::set_var("GOVAI_API_KEYS", "testkey");
    let tmp = TempDir::new().unwrap();
    std::env::set_var("GOVAI_LEDGER_DIR", tmp.path().to_string_lossy().to_string());

    let run_id = "run-shared";
    append_event(
        &tmp,
        "tenant-a",
        EvidenceEvent {
            event_id: "ta-only".to_string(),
            event_type: "ai_discovery_reported".to_string(),
            ts_utc: "2026-01-03T00:00:01Z".to_string(),
            actor: "system".to_string(),
            system: "govai".to_string(),
            run_id: run_id.to_string(),
            environment: None,
            payload: serde_json::json!({ "openai": false, "transformers": false, "model_artifacts": false }),
        },
    );
    append_event(
        &tmp,
        "tenant-b",
        EvidenceEvent {
            event_id: "tb-only".to_string(),
            event_type: "ai_discovery_reported".to_string(),
            ts_utc: "2026-01-03T00:00:02Z".to_string(),
            actor: "system".to_string(),
            system: "govai".to_string(),
            run_id: run_id.to_string(),
            environment: None,
            payload: serde_json::json!({ "openai": false, "transformers": false, "model_artifacts": false }),
        },
    );

    let pool = sqlx::PgPool::connect_lazy("postgres://localhost/does_not_exist").unwrap();
    let app = build_app(pool);

    let (status, json) = export_json(app, "tenant-b", run_id).await;
    assert_eq!(status, StatusCode::OK, "unexpected response: {}", json);

    let events = json.get("evidence_events").and_then(|v| v.as_array()).unwrap();
    let ids: Vec<String> = events
        .iter()
        .filter_map(|e| e.get("event_id").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .collect();

    assert!(ids.contains(&"tb-only".to_string()));
    assert!(!ids.contains(&"ta-only".to_string()));

    let tenant_obj = json.get("tenant").unwrap();
    assert_eq!(
        tenant_obj.get("ledger_tenant_id").and_then(|v| v.as_str()),
        Some("tenant-b")
    );
}

