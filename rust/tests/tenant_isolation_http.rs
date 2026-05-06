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
use tower::ServiceExt;

use aigov_audit::api_usage::ApiUsageState;
use aigov_audit::audit_api_key;
use aigov_audit::govai_api;
use aigov_audit::govai_environment::{policy_version_for, GovaiEnvironment};
use aigov_audit::metering::{GovaiPlan, MeteringConfig};
use aigov_audit::policy_config::ResolvedPolicyConfig;
use aigov_audit::project;

mod test_support;
use test_support::env_lock;

fn ensure_test_tenant_map() {
    if audit_api_key::api_key_tenant_map_is_initialized() {
        return;
    }
    std::env::set_var(
        "GOVAI_API_KEYS_JSON",
        r#"{
          "key_default": "default",
          "key_github_actions": "github-actions",
          "key_tenant_a": "tenant-a",
          "key_tenant_b": "tenant-b"
        }"#,
    );
    // Ignore errors if another test raced to init first.
    let _ = audit_api_key::init_api_key_tenant_map(GovaiEnvironment::Dev);
}

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

fn sample_ai_discovery_reported_minimal(run_id: &str, event_id: &str) -> Value {
    json!({
        "event_id": event_id,
        "event_type": "ai_discovery_reported",
        "ts_utc": "2026-04-21T12:00:00Z",
        "actor": "test",
        "system": "tenant-isolation-test",
        "run_id": run_id,
        "payload": { "openai": false, "transformers": false, "model_artifacts": false }
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
async fn first_evidence_event_creates_tenant_ledger_from_api_key_mapping() {
    let Some(url) = database_url() else {
        eprintln!("skip tenant_isolation_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(dir.path()).expect("chdir");

    ensure_test_tenant_map();

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

    let tenant = "github-actions";
    let ledger_path = project::resolve_ledger_path("audit_log.jsonl", tenant);
    assert!(
        !std::path::Path::new(&ledger_path).exists(),
        "precondition: tenant ledger must not exist"
    );

    let run_id = "test_project_context_1";
    let ev_id = uuid::Uuid::new_v4().to_string();
    let body = serde_json::to_string(&sample_ai_discovery_reported_minimal(run_id, &ev_id)).unwrap();

    let r = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/evidence")
                .header(header::AUTHORIZATION, "Bearer key_github_actions")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-govai-project", "spoofed-does-not-matter")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    let s = r.status();
    let bytes = r.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(s, StatusCode::OK, "unexpected /evidence response: {v}");

    assert!(
        std::path::Path::new(&ledger_path).exists(),
        "tenant ledger should be created on first append"
    );
    let raw = std::fs::read_to_string(&ledger_path).unwrap_or_default();
    assert!(raw.contains(run_id), "tenant ledger should contain run_id");
}

#[tokio::test]
async fn ingest_writes_only_to_tenant_ledger_and_reads_are_isolated() {
    let Some(url) = database_url() else {
        eprintln!("skip tenant_isolation_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(dir.path()).expect("chdir");

    ensure_test_tenant_map();

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

    let tenant_a = "tenant-a".to_string();
    let tenant_b = "tenant-b".to_string();
    seed_empty_tenant_ledger(&tenant_a);
    seed_empty_tenant_ledger(&tenant_b);

    let run_id = uuid::Uuid::new_v4().to_string();
    let ev_id = uuid::Uuid::new_v4().to_string();
    let body = serde_json::to_string(&sample_data_registered(&run_id, &ev_id)).unwrap();

    // Write to tenant A (derived from API key mapping)
    let r = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::AUTHORIZATION, "Bearer key_tenant_a")
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
                .header(header::AUTHORIZATION, "Bearer key_tenant_b")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    // Tenant B should not be able to observe tenant A runs; surfaced as not-found.
    assert_eq!(bundle_b.status(), StatusCode::NOT_FOUND);
    let v: Value =
        serde_json::from_slice(&bundle_b.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(v["ok"], false);
    assert_eq!(v["error"]["code"], "RUN_NOT_FOUND");
    assert!(v["error"]["message"].as_str().unwrap_or("").trim().len() > 0);
    assert!(v["error"]["hint"].as_str().unwrap_or("").trim().len() > 0);

    let summary_b = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/compliance-summary?run_id={run_id}"))
                .header(header::AUTHORIZATION, "Bearer key_tenant_b")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(summary_b.status(), StatusCode::NOT_FOUND);
    let vb: Value =
        serde_json::from_slice(&summary_b.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(vb["ok"], false, "unexpected /compliance-summary: {vb}");
    assert_eq!(vb["error"]["code"], "RUN_NOT_FOUND");
    assert!(vb["error"]["message"].as_str().unwrap_or("").trim().len() > 0);
    assert!(vb["error"]["hint"].as_str().unwrap_or("").trim().len() > 0);

    let export_b = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/export/{run_id}"))
                .header(header::AUTHORIZATION, "Bearer key_tenant_b")
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

    let _g = env_lock().await;
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(dir.path()).expect("chdir");

    ensure_test_tenant_map();

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
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    let v: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(v["ok"], false);
    assert_eq!(v["error"]["code"], "MISSING_API_KEY");
    assert!(v["error"]["message"].as_str().unwrap_or("").trim().len() > 0);
    assert!(v["error"]["hint"].as_str().unwrap_or("").trim().len() > 0);
}

#[tokio::test]
async fn spoofing_x_govai_project_has_no_effect_on_ledger_tenant() {
    let Some(url) = database_url() else {
        eprintln!("skip tenant_isolation_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(dir.path()).expect("chdir");

    ensure_test_tenant_map();

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
    seed_empty_tenant_ledger("tenant-a");
    seed_empty_tenant_ledger("tenant-b");

    let run_id = uuid::Uuid::new_v4().to_string();
    let ev_id = uuid::Uuid::new_v4().to_string();
    let body = serde_json::to_string(&sample_data_registered(&run_id, &ev_id)).unwrap();

    // Attempt to spoof the header to "tenant-b", but use key mapped to tenant-a.
    let r = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::AUTHORIZATION, "Bearer key_tenant_a")
                .header("x-govai-project", "tenant-b")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    let s = r.status();
    let bytes = r.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(s, StatusCode::OK, "unexpected /evidence response: {v}");

    let raw_a = std::fs::read_to_string(project::resolve_ledger_path("audit_log.jsonl", "tenant-a"))
        .unwrap_or_default();
    let raw_b = std::fs::read_to_string(project::resolve_ledger_path("audit_log.jsonl", "tenant-b"))
        .unwrap_or_default();
    assert!(
        raw_a.contains(&run_id),
        "tenant-a ledger should contain run_id"
    );
    assert!(
        !raw_b.contains(&run_id),
        "tenant-b ledger must not contain tenant-a run_id (spoofed header ignored)"
    );
}

#[tokio::test]
async fn dev_defaults_to_default_tenant_ledger_without_headers() {
    let Some(url) = database_url() else {
        eprintln!("skip tenant_isolation_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(dir.path()).expect("chdir");
    seed_empty_tenant_ledger("default");

    ensure_test_tenant_map();

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
                .header(header::AUTHORIZATION, "Bearer key_default")
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

    let _g = env_lock().await;
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(dir.path()).expect("chdir");

    ensure_test_tenant_map();

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
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(v["ok"], false);
    assert_eq!(v["error"]["code"], "MISSING_API_KEY");
    assert!(v["error"]["message"].as_str().unwrap_or("").trim().len() > 0);
    assert!(v["error"]["hint"].as_str().unwrap_or("").trim().len() > 0);
}
