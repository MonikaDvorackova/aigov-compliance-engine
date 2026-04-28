//! Tenant isolation tests for the audit ledger.
//!
//! Confirms:
//! - evidence ingest writes only to tenant-specific ledger
//! - tenant A cannot read tenant B data (bundle/export/compliance-summary)
//! - missing tenant context is rejected in non-dev (prod)

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
        "system": "tenant-isolation-test",
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

async fn test_router(pool: sqlx::PgPool, env: GovaiEnvironment) -> Router {
    let api_usage = ApiUsageState::from_env(&pool).expect("api usage");
    let metering = MeteringConfig {
        enabled: false,
        default_plan: GovaiPlan::Free,
    };
    govai_api::audit_router(
        "audit_log.jsonl",
        policy_version_for(env),
        env,
        ResolvedPolicyConfig::all_defaults().config,
        api_usage,
        pool,
        metering,
    )
}

#[tokio::test]
async fn ingest_writes_only_to_tenant_ledger_and_reads_are_isolated() {
    let Some(url) = database_url() else {
        eprintln!("skip tenant_isolation_http: set DATABASE_URL or TEST_DATABASE_URL");
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

    let app = test_router(pool, GovaiEnvironment::Dev).await;

    let tenant_a = format!("tenant_a_{}", uuid::Uuid::new_v4());
    let tenant_b = format!("tenant_b_{}", uuid::Uuid::new_v4());
    seed_empty_tenant_ledger(&tenant_a);
    seed_empty_tenant_ledger(&tenant_b);

    let run_id = uuid::Uuid::new_v4().to_string();
    let ev_id = uuid::Uuid::new_v4().to_string();
    let body = serde_json::to_string(&sample_data_registered(&run_id, &ev_id)).unwrap();

    // Write to tenant A
    let r = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-govai-project", &tenant_a)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    let s = r.status();
    let bytes = r.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(s, StatusCode::OK, "unexpected /evidence response: {v}");

    // Evidence must exist only in tenant A ledger
    let lp_a = project::resolve_ledger_path("audit_log.jsonl", &tenant_a);
    let lp_b = project::resolve_ledger_path("audit_log.jsonl", &tenant_b);
    let raw_a = std::fs::read_to_string(&lp_a).unwrap_or_default();
    let raw_b = std::fs::read_to_string(&lp_b).unwrap_or_default();
    assert!(
        raw_a.contains(&run_id),
        "tenant A ledger should contain run_id"
    );
    assert!(
        !raw_b.contains(&run_id),
        "tenant B ledger should not contain tenant A run_id"
    );

    // Tenant B must not be able to read tenant A's run.
    let bundle_b = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/bundle?run_id={run_id}"))
                .header("x-govai-project", &tenant_b)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(bundle_b.status(), StatusCode::OK);
    let v: Value =
        serde_json::from_slice(&bundle_b.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(v["ok"], false);

    let summary_b = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/compliance-summary?run_id={run_id}"))
                .header("x-govai-project", &tenant_b)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(summary_b.status(), StatusCode::OK);
    let vb: Value =
        serde_json::from_slice(&summary_b.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(vb["ok"], false, "unexpected /compliance-summary: {vb}");
    assert_eq!(vb["error"], "run_not_found");

    let export_b = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/export/{run_id}"))
                .header("x-govai-project", &tenant_b)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(export_b.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn missing_tenant_context_is_rejected_in_prod() {
    let Some(url) = database_url() else {
        eprintln!("skip tenant_isolation_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _lock = CWD_LOCK.lock().expect("lock");
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(dir.path()).expect("chdir");

    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    let app = test_router(pool, GovaiEnvironment::Prod).await;
    let run_id = uuid::Uuid::new_v4().to_string();

    let res = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/bundle-hash?run_id={run_id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    let v: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(v["ok"], false);
    assert_eq!(v["error"], "missing_tenant_context");
    assert_eq!(v["code"], "missing_tenant_context");
    assert!(v["message"].as_str().unwrap_or("").trim().len() > 0);
}

#[tokio::test]
async fn bearer_fingerprint_fallback_selects_tenant_ledger_at_route_level() {
    let Some(url) = database_url() else {
        eprintln!("skip tenant_isolation_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _lock = CWD_LOCK.lock().expect("lock");
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(dir.path()).expect("chdir");

    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    // Use prod to ensure missing-tenant enforcement is active; bearer provides tenant context via fingerprint fallback.
    let app = test_router(pool, GovaiEnvironment::Prod).await;
    let token = "mysecret";
    let tenant = aigov_audit::api_usage::key_fingerprint(token);
    seed_empty_tenant_ledger(&tenant);

    let run_id = uuid::Uuid::new_v4().to_string();
    let ev_id = uuid::Uuid::new_v4().to_string();
    let body = serde_json::to_string(&sample_data_registered(&run_id, &ev_id)).unwrap();

    let r = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::AUTHORIZATION, format!("Bearer {}", token))
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    let s = r.status();
    let bytes = r.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(s, StatusCode::OK, "unexpected /evidence response: {v}");

    let lp = project::resolve_ledger_path("audit_log.jsonl", &tenant);
    let raw = std::fs::read_to_string(&lp).unwrap_or_default();
    assert!(
        raw.contains(&run_id),
        "fingerprint tenant ledger should contain run_id"
    );
}

#[tokio::test]
async fn dev_defaults_to_default_tenant_ledger_without_headers() {
    let Some(url) = database_url() else {
        eprintln!("skip tenant_isolation_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _lock = CWD_LOCK.lock().expect("lock");
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(dir.path()).expect("chdir");
    seed_empty_tenant_ledger("default");

    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    let app = test_router(pool, GovaiEnvironment::Dev).await;

    let run_id = uuid::Uuid::new_v4().to_string();
    let ev_id = uuid::Uuid::new_v4().to_string();
    let body = serde_json::to_string(&sample_data_registered(&run_id, &ev_id)).unwrap();

    let r = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    let s = r.status();
    let bytes = r.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(s, StatusCode::OK, "unexpected /evidence response: {v}");

    let lp = project::resolve_ledger_path("audit_log.jsonl", "default");
    let raw = std::fs::read_to_string(&lp).unwrap_or_default();
    assert!(
        raw.contains(&run_id),
        "default tenant ledger should contain run_id"
    );
}

#[tokio::test]
async fn verify_log_missing_tenant_context_is_rejected_in_prod() {
    let Some(url) = database_url() else {
        eprintln!("skip tenant_isolation_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _lock = CWD_LOCK.lock().expect("lock");
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(dir.path()).expect("chdir");

    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    let app = test_router(pool, GovaiEnvironment::Prod).await;

    let res = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/verify-log")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(v["ok"], false);
    assert_eq!(v["error"], "missing_tenant_context");
    assert_eq!(v["code"], "missing_tenant_context");
    assert!(v["message"].as_str().unwrap_or("").trim().len() > 0);
}
