//! Contract tests: auth requirements and HTTP error semantics for core endpoints.

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

fn database_url() -> Option<String> {
    std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .ok()
}

/// Minimal env guard: isolate ledger storage and auth vars.
struct TestEnv {
    _dir: tempfile::TempDir,
    original_cwd: std::path::PathBuf,
}

impl TestEnv {
    fn new() -> Self {
        let original_cwd = std::env::current_dir().expect("getcwd");
        let dir = tempfile::tempdir().expect("tempdir");
        std::env::set_current_dir(dir.path()).expect("chdir temp");
        std::env::set_var("GOVAI_LEDGER_DIR", dir.path());
        Self {
            _dir: dir,
            original_cwd,
        }
    }
}

impl Drop for TestEnv {
    fn drop(&mut self) {
        let _ = std::env::set_current_dir(&self.original_cwd);
        std::env::remove_var("GOVAI_LEDGER_DIR");
        std::env::remove_var("GOVAI_API_KEYS_JSON");
        std::env::remove_var("GOVAI_API_KEYS");
    }
}

fn ensure_dev_api_key_tenant_map() {
    std::env::set_var("GOVAI_API_KEYS_JSON", r#"{"key_default":"default"}"#);
    if audit_api_key::api_key_tenant_map_is_initialized() {
        return;
    }
    let _ = audit_api_key::init_api_key_tenant_map(GovaiEnvironment::Dev);
}

fn seed_empty_tenant_ledger(tenant_id: &str) {
    let ledger_path = project::resolve_ledger_path("audit_log.jsonl", tenant_id);
    if let Some(parent) = std::path::Path::new(&ledger_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&ledger_path, "").expect("seed ledger");
}

async fn test_router(pool: sqlx::PgPool) -> Router {
    let api_usage = ApiUsageState::from_env(&pool).expect("api usage");
    let metering = MeteringConfig {
        enabled: false,
        default_plan: GovaiPlan::Free,
    };
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
        metering,
    )
}

async fn read_json(res: axum::response::Response) -> (StatusCode, Value) {
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let raw = String::from_utf8_lossy(&bytes).to_string();
    let v: Value = serde_json::from_slice(&bytes).unwrap_or_else(|_| json!({ "raw": raw }));
    (status, v)
}

#[tokio::test]
async fn verify_log_requires_auth_when_api_keys_configured() {
    let Some(url) = database_url() else {
        eprintln!("skip api_contract_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };
    let _g = env_lock().await;
    let _env = TestEnv::new();

    ensure_dev_api_key_tenant_map();
    std::env::set_var("GOVAI_API_KEYS", "key_default");
    seed_empty_tenant_ledger("default");

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    let app = test_router(pool).await;

    // Without Authorization, should be 401 with standard error shape.
    let res = app
        .clone()
        .oneshot(Request::builder().method("GET").uri("/verify-log").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let (status, v) = read_json(res).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(v["error"]["code"], "MISSING_API_KEY");

    // With key, should succeed (even on empty ledger).
    let res2 = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/verify-log")
                .header(header::AUTHORIZATION, "Bearer key_default")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let (status2, v2) = read_json(res2).await;
    assert_eq!(status2, StatusCode::OK);
    assert_eq!(v2["ok"], true);
}

#[tokio::test]
async fn bundle_hash_requires_auth_and_uses_http_errors() {
    let Some(url) = database_url() else {
        eprintln!("skip api_contract_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };
    let _g = env_lock().await;
    let _env = TestEnv::new();

    ensure_dev_api_key_tenant_map();
    std::env::set_var("GOVAI_API_KEYS", "key_default");
    seed_empty_tenant_ledger("default");

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    let app = test_router(pool).await;

    // 401 without key
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/bundle-hash?run_id=does-not-exist")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let (s1, v1) = read_json(res).await;
    assert_eq!(s1, StatusCode::UNAUTHORIZED);
    assert_eq!(v1["error"]["code"], "MISSING_API_KEY");

    // 404 when run not found (hard failure: proper HTTP code, not 200 ok:false)
    let res2 = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/bundle-hash?run_id=does-not-exist")
                .header(header::AUTHORIZATION, "Bearer key_default")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let (s2, v2) = read_json(res2).await;
    assert_eq!(s2, StatusCode::NOT_FOUND);
    assert_eq!(v2["ok"], false);
    assert_eq!(v2["error"]["code"], "RUN_NOT_FOUND");
}

