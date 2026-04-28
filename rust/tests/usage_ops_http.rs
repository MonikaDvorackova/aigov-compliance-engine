//! Usage operation counters: evidence ingest + compliance checks + tenant scoping.

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use std::sync::Mutex;
use tower::ServiceExt;

use aigov_audit::api_usage::ApiUsageState;
use aigov_audit::govai_api;
use aigov_audit::govai_environment::{policy_version_for, GovaiEnvironment};
use aigov_audit::metering::{GovaiPlan, MeteringConfig};
use aigov_audit::policy_config::ResolvedPolicyConfig;
use aigov_audit::project;

static CWD_LOCK: Mutex<()> = Mutex::new(());

fn database_url() -> Option<String> {
    std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .ok()
}

fn seed_empty_tenant_ledger(tenant_id: &str) {
    let ledger_path = project::resolve_ledger_path("audit_log.jsonl", tenant_id);
    if let Some(parent) = std::path::Path::new(&ledger_path).parent() {
        std::fs::create_dir_all(parent).expect("create ledger dir");
    }
    std::fs::write(&ledger_path, "").expect("seed empty tenant ledger");
}

fn sample_data_registered(run_id: &str, event_id: &str) -> Value {
    json!({
        "event_id": event_id,
        "event_type": "data_registered",
        "ts_utc": "2026-04-21T12:00:00Z",
        "actor": "test",
        "system": "usage-ops-test",
        "run_id": run_id,
        "payload": {
            "ai_system_id": "sys1",
            "dataset_id": "ds1",
            "dataset": "d",
            "dataset_fingerprint": "fp",
            "dataset_governance_id": "g1",
            "dataset_governance_commitment": "c",
            "dataset_version": "v1",
            "source": "s",
            "intended_use": "u",
            "limitations": "l",
            "quality_summary": "q",
            "governance_status": "gs"
        }
    })
}

async fn test_router(pool: sqlx::PgPool) -> Router {
    let api_usage = ApiUsageState::from_env(&pool).expect("api usage");
    let metering = MeteringConfig {
        enabled: false,
        default_plan: GovaiPlan::Free,
    };
    govai_api::audit_router(
        "audit_log.jsonl",
        policy_version_for(GovaiEnvironment::Dev),
        GovaiEnvironment::Dev,
        ResolvedPolicyConfig::all_defaults().config,
        api_usage,
        pool,
        metering,
    )
}

async fn get_usage(app: &Router, api_key: &str, tenant: &str) -> Value {
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/usage")
                .header(header::AUTHORIZATION, format!("Bearer {api_key}"))
                .header("x-govai-project", tenant)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).expect("usage json")
}

#[tokio::test]
async fn usage_increments_on_evidence_and_check_and_is_tenant_scoped() {
    let Some(url) = database_url() else {
        eprintln!("skip usage_ops_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _lock = CWD_LOCK.lock().expect("lock");
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(dir.path()).expect("chdir");

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    const KEY: &str = "usage_ops_http_key";
    std::env::set_var("GOVAI_API_KEYS", KEY);
    let app = test_router(pool).await;

    let tenant_a = format!("usage_ops_a_{}", uuid::Uuid::new_v4());
    let tenant_b = format!("usage_ops_b_{}", uuid::Uuid::new_v4());
    seed_empty_tenant_ledger(&tenant_a);
    seed_empty_tenant_ledger(&tenant_b);

    let before_a = get_usage(&app, KEY, &tenant_a).await;
    let before_b = get_usage(&app, KEY, &tenant_b).await;
    assert_eq!(before_a["evidence_events_count"].as_i64().unwrap_or(-1), 0);
    assert_eq!(before_a["compliance_checks_count"].as_i64().unwrap_or(-1), 0);
    assert_eq!(before_b["evidence_events_count"].as_i64().unwrap_or(-1), 0);
    assert_eq!(before_b["compliance_checks_count"].as_i64().unwrap_or(-1), 0);

    let run_id = uuid::Uuid::new_v4().to_string();
    let ev_id = uuid::Uuid::new_v4().to_string();
    let body = serde_json::to_string(&sample_data_registered(&run_id, &ev_id)).unwrap();

    // Evidence submission increments evidence usage only for tenant A.
    let ingest = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/evidence")
                .header(header::AUTHORIZATION, format!("Bearer {KEY}"))
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-govai-project", &tenant_a)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    let ingest_status = ingest.status();
    let ingest_bytes = ingest.into_body().collect().await.unwrap().to_bytes();
    let ingest_v: Value = serde_json::from_slice(&ingest_bytes).unwrap();
    assert_eq!(ingest_status, StatusCode::OK, "unexpected ingest: {ingest_v}");

    // Compliance check increments compliance_checks only for tenant A.
    let summary = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/compliance-summary?run_id={run_id}"))
                .header(header::AUTHORIZATION, format!("Bearer {KEY}"))
                .header("x-govai-project", &tenant_a)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(summary.status(), StatusCode::OK);

    let after_a = get_usage(&app, KEY, &tenant_a).await;
    let after_b = get_usage(&app, KEY, &tenant_b).await;

    assert_eq!(after_a["evidence_events_count"].as_i64().unwrap_or(-1), 1);
    assert_eq!(after_a["compliance_checks_count"].as_i64().unwrap_or(-1), 1);
    assert_eq!(after_b["evidence_events_count"].as_i64().unwrap_or(-1), 0);
    assert_eq!(after_b["compliance_checks_count"].as_i64().unwrap_or(-1), 0);

    std::env::remove_var("GOVAI_API_KEYS");
}

