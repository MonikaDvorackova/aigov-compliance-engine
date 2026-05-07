//! GET /ready probes DB, migrations table, and ledger writability.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;

use aigov_audit::govai_api;
use aigov_audit::govai_environment::{policy_version_for, GovaiEnvironment};
use aigov_audit::metering::{GovaiPlan, MeteringConfig};
use aigov_audit::policy_config::ResolvedPolicyConfig;

mod test_support;
use test_support::env_lock;

fn database_url() -> Option<String> {
    std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .ok()
}

async fn audit_app(pool: sqlx::PgPool, ledger: &std::path::Path) -> Router {
    std::env::set_var(
        "GOVAI_LEDGER_DIR",
        ledger.to_string_lossy().into_owned(),
    );

    let api_usage = aigov_audit::api_usage::ApiUsageState::from_env(&pool).expect("api usage");
    let resolved = ResolvedPolicyConfig::all_defaults();
    let policy_store =
        aigov_audit::policy_store::PolicyStore::load_for_deployment(GovaiEnvironment::Dev, resolved)
            .expect("policy store");
    govai_api::audit_router(
        "audit_log.jsonl",
        policy_version_for(GovaiEnvironment::Dev),
        GovaiEnvironment::Dev,
        policy_store,
        api_usage,
        pool,
        MeteringConfig {
            enabled: false,
            default_plan: GovaiPlan::Free,
        },
    )
}

#[tokio::test]
async fn ready_ok_when_db_migrated_and_ledger_writable() {
    let Some(url) = database_url() else {
        eprintln!("skip ready_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let cwd = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(cwd.path()).expect("chdir");
    let ledger = cwd.path().join("govai-led");
    std::fs::create_dir_all(&ledger).unwrap();

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    let app = audit_app(pool, &ledger).await;

    let res = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/ready")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(v.get("ready").and_then(Value::as_bool), Some(true));
    assert_eq!(
        v.pointer("/checks/tenant_ledger_probe")
            .and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        v.pointer("/checks/ledger_writable").and_then(Value::as_bool),
        Some(true)
    );
}

#[cfg(unix)]
#[tokio::test]
async fn ready_not_ready_when_tenant_ledger_probe_path_cannot_be_created() {
    let Some(url) = database_url() else {
        eprintln!("skip ready_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let cwd = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(cwd.path()).expect("chdir");
    let ledger = cwd.path().join("govai-led");
    std::fs::create_dir_all(&ledger).unwrap();

    // Deterministic failure on Linux CI: make the probe path's parent a *regular file*.
    // Then `create_dir_all(parent)` must fail with "Not a directory".
    let not_a_dir = cwd.path().join("not_a_dir");
    std::fs::write(&not_a_dir, "not a directory").unwrap();
    let bad_probe_path = not_a_dir.join("audit_log__probe.jsonl");

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    // Configure the app normally (sets GOVAI_LEDGER_DIR).
    let app = audit_app(pool, &ledger).await;

    // Override the probe path in /ready (test-only hook).
    std::env::set_var(
        "GOVAI_TEST_READY_TENANT_PROBE_PATH",
        bad_probe_path.to_string_lossy().to_string(),
    );

    let res = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/ready")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    std::env::remove_var("GOVAI_TEST_READY_TENANT_PROBE_PATH");

    assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(v.pointer("/error/code").and_then(Value::as_str), Some("NOT_READY"));
    assert_eq!(
        v.pointer("/error/details/checks/tenant_ledger_probe")
            .and_then(Value::as_bool),
        Some(false)
    );
    assert_eq!(
        v.pointer("/error/details/details/probe_path")
            .and_then(Value::as_str),
        Some(bad_probe_path.to_string_lossy().as_ref())
    );
}
