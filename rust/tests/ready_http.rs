//! GET /ready probes DB, migrations table, and ledger writability.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use std::sync::Mutex;
use tower::ServiceExt;

use aigov_audit::govai_api;
use aigov_audit::govai_environment::{policy_version_for, GovaiEnvironment};
use aigov_audit::metering::{GovaiPlan, MeteringConfig};
use aigov_audit::policy_config::ResolvedPolicyConfig;

static CWD_LOCK: Mutex<()> = Mutex::new(());

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
    govai_api::audit_router(
        "audit_log.jsonl",
        policy_version_for(GovaiEnvironment::Dev),
        GovaiEnvironment::Dev,
        ResolvedPolicyConfig::all_defaults().config,
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

    let _lock = CWD_LOCK.lock().expect("lock");
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
}
