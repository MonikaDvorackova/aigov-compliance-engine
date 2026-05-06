//! HTTP-level billing tests: canonical counter `govai_usage_counters` (all modes).
//! Also **environment separation E2E** (staging stamp, mismatch rejection, compliance-summary fields).
//! Requires `DATABASE_URL` or `TEST_DATABASE_URL` and applies migrations from `rust/migrations/`.

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;
use uuid::Uuid;

use aigov_audit::api_usage::{key_fingerprint, ApiUsageState};
use aigov_audit::audit_api_key;
use aigov_audit::evidence_usage::FREE_TIER_EVIDENCE_LIMIT;
use aigov_audit::govai_api;
use aigov_audit::govai_environment::{policy_version_for, GovaiEnvironment};
use aigov_audit::metering::{self, GovaiPlan, MeteringConfig};
use aigov_audit::policy_config::ResolvedPolicyConfig;
use aigov_audit::project;
use aigov_audit::schema::EvidenceEvent;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::collections::{HashMap, HashSet};
use std::ffi::{OsStr, OsString};

mod test_support;
use test_support::env_lock;

const TEST_DEFAULT_API_KEY: &str = "key_default";

/// Same key→tenant mapping contract as `tenant_isolation_http` tests (init once per process).
fn ensure_dev_api_key_tenant_map(env: &mut TestEnv) {
    // Make the test mapping explicit and deterministic. Initialization itself is still once-per-process.
    env.set_var(
        "GOVAI_API_KEYS_JSON",
        r#"{"key_default":"default","key_github_actions":"github-actions","key_tenant_a":"tenant-a","key_tenant_b":"tenant-b"}"#,
    );
    if audit_api_key::api_key_tenant_map_is_initialized() {
        return;
    }
    let _ = audit_api_key::init_api_key_tenant_map(GovaiEnvironment::Dev);
}

/// Test env guard: isolates ledger storage + auth env vars per-test.
struct TestEnv {
    _ledger_dir: tempfile::TempDir,
    original_cwd: std::path::PathBuf,
    original_vars: HashMap<&'static str, Option<OsString>>,
    touched_vars: HashSet<&'static str>,
}

impl TestEnv {
    fn new() -> Self {
        let original_cwd = std::env::current_dir().expect("getcwd");
        let dir = tempfile::tempdir().expect("tempdir");
        let ledger_dir_path = dir.path().to_path_buf();
        std::env::set_current_dir(dir.path()).expect("chdir temp");
        let mut env = Self {
            _ledger_dir: dir,
            original_cwd,
            original_vars: HashMap::new(),
            touched_vars: HashSet::new(),
        };
        env.set_var("GOVAI_LEDGER_DIR", ledger_dir_path);
        env
    }

    fn touch(&mut self, key: &'static str) {
        if self.touched_vars.insert(key) {
            let prev = std::env::var_os(key);
            self.original_vars.insert(key, prev);
        }
    }

    fn set_var(&mut self, key: &'static str, value: impl AsRef<OsStr>) {
        self.touch(key);
        std::env::set_var(key, value);
    }

    fn remove_var(&mut self, key: &'static str) {
        self.touch(key);
        std::env::remove_var(key);
    }
}

impl Drop for TestEnv {
    fn drop(&mut self) {
        // Restore only vars this test touched; never clobber unrelated concurrent tests.
        for (k, prev) in self.original_vars.drain() {
            match prev {
                Some(v) => std::env::set_var(k, v),
                None => std::env::remove_var(k),
            }
        }
        let _ = std::env::set_current_dir(&self.original_cwd);
    }
}

fn authz_default(req: axum::http::request::Builder) -> axum::http::request::Builder {
    req.header(header::AUTHORIZATION, format!("Bearer {TEST_DEFAULT_API_KEY}"))
}

async fn read_json_response(res: axum::response::Response) -> (StatusCode, Value, String) {
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let raw = String::from_utf8_lossy(&bytes).to_string();
    let json: Value = serde_json::from_slice(&bytes).unwrap_or_else(|_| json!({ "raw": raw }));
    (status, json, raw)
}

fn database_url() -> Option<String> {
    std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .ok()
}

fn force_explicit_db_url_for_process_helpers(env: &mut TestEnv, url: &str) {
    // Some code paths (especially app wiring) may read DB URLs from env. In CI, we must not
    // allow falling back to libpq defaults (e.g. OS user "runner") due to missing/partial vars.
    env.set_var("TEST_DATABASE_URL", url);
    env.set_var("GOVAI_DATABASE_URL", url);
    env.set_var("DATABASE_URL", url);
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
        "system": "billing-test",
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

async fn staging_test_router(pool: sqlx::PgPool) -> Router {
    let api_usage = ApiUsageState::from_env(&pool).expect("api usage");
    let metering = MeteringConfig {
        enabled: false,
        default_plan: GovaiPlan::Free,
    };
    govai_api::audit_router(
        "audit_log.jsonl",
        policy_version_for(GovaiEnvironment::Staging),
        GovaiEnvironment::Staging,
        ResolvedPolicyConfig::all_defaults().config,
        api_usage,
        pool,
        metering,
    )
}

fn sample_model_trained(run_id: &str, event_id: &str) -> Value {
    json!({
        "event_id": event_id,
        "event_type": "model_trained",
        "ts_utc": "2026-04-21T12:10:00Z",
        "actor": "test",
        "system": "billing-test",
        "run_id": run_id,
        "payload": {
            "ai_system_id": "sys1",
            "dataset_id": "ds1",
            "model_version_id": "mv1"
        }
    })
}

fn read_events_for_run(log_path: &str, run_id: &str) -> Vec<EvidenceEvent> {
    let raw = std::fs::read_to_string(log_path).unwrap_or_default();
    raw.lines()
        .filter_map(|l| {
            let t = l.trim();
            if t.is_empty() {
                return None;
            }
            let rec: aigov_audit::audit_store::StoredRecord = serde_json::from_str(t).ok()?;
            let ev: EvidenceEvent = serde_json::from_str(&rec.event_json).ok()?;
            if ev.run_id != run_id {
                return None;
            }
            Some(ev)
        })
        .collect()
}

fn run_started_wrong_env(run_id: &str, event_id: &str) -> Value {
    json!({
        "event_id": event_id,
        "event_type": "run_started",
        "ts_utc": "2026-04-21T12:01:00Z",
        "actor": "env-e2e",
        "system": "env-e2e",
        "run_id": run_id,
        "environment": "prod",
        "payload": {}
    })
}

#[tokio::test]
async fn canonical_evidence_billing_http() {
    let Some(url) = database_url() else {
        eprintln!("skip billing_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let mut env = TestEnv::new();
    force_explicit_db_url_for_process_helpers(&mut env, &url);
    ensure_dev_api_key_tenant_map(&mut env);
    seed_empty_tenant_ledger("default");
    env.set_var("GOVAI_API_KEYS", TEST_DEFAULT_API_KEY);

    let pool = PgPoolOptions::new()
        .max_connections(3)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    let tenant = format!("billing_http_{}", uuid::Uuid::new_v4());
    let period = aigov_audit::evidence_usage::current_period_start_utc();
    sqlx::query("DELETE FROM govai_usage_counters WHERE tenant_id = $1 AND period_start = $2")
        .bind(&tenant)
        .bind(period)
        .execute(&pool)
        .await
        .ok();

    let app = test_router(pool.clone()).await;
    let run_id = uuid::Uuid::new_v4().to_string();
    let event_id = uuid::Uuid::new_v4().to_string();
    let body = serde_json::to_string(&sample_data_registered(&run_id, &event_id)).unwrap();

    // 1) Successful append → usage +1
    let r1 = app
        .clone()
        .oneshot(
            authz_default(Request::builder())
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-govai-project", &tenant)
                .body(Body::from(body.clone()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(r1.status(), StatusCode::OK);
    let c1 = aigov_audit::evidence_usage::get_evidence_usage(&pool, &tenant)
        .await
        .unwrap()
        .0;
    assert_eq!(c1, 1);

    // 2) Duplicate → 409, counter unchanged
    let r2 = app
        .clone()
        .oneshot(
            authz_default(Request::builder())
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-govai-project", &tenant)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(r2.status(), StatusCode::CONFLICT);
    let c2 = aigov_audit::evidence_usage::get_evidence_usage(&pool, &tenant)
        .await
        .unwrap()
        .0;
    assert_eq!(c2, 1);

    // 3) At monthly limit → 429, stable body, no increment (new run / new event)
    sqlx::query(
        r#"
        INSERT INTO govai_usage_counters (tenant_id, period_start, evidence_events_count)
        VALUES ($1, $2, $3)
        ON CONFLICT (tenant_id, period_start)
        DO UPDATE SET evidence_events_count = EXCLUDED.evidence_events_count
        "#,
    )
    .bind(&tenant)
    .bind(period)
    .bind(FREE_TIER_EVIDENCE_LIMIT as i64)
    .execute(&pool)
    .await
    .expect("seed quota");

    let run2 = uuid::Uuid::new_v4().to_string();
    let ev2 = uuid::Uuid::new_v4().to_string();
    let body2 = serde_json::to_string(&sample_data_registered(&run2, &ev2)).unwrap();
    let r3 = app
        .clone()
        .oneshot(
            authz_default(Request::builder())
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-govai-project", &tenant)
                .body(Body::from(body2))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(r3.status(), StatusCode::TOO_MANY_REQUESTS);
    let bytes = r3.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&bytes).expect("json body");
    assert_eq!(v["ok"], false);
    assert_eq!(v["error"]["code"], "MONTHLY_EVENT_LIMIT_EXCEEDED");
    assert!(v["error"]["message"].as_str().unwrap_or("").trim().len() > 0);
    assert!(v["error"]["hint"].as_str().unwrap_or("").trim().len() > 0);
    assert_eq!(
        v["error"]["details"]["used"].as_u64(),
        Some(FREE_TIER_EVIDENCE_LIMIT)
    );
    assert_eq!(
        v["error"]["details"]["limit"].as_u64(),
        Some(FREE_TIER_EVIDENCE_LIMIT)
    );
    assert!(v["error"]["details"]["period_start"].as_str().is_some());
    assert_eq!(v["metering"], "off");
    assert_eq!(v["count_kind"], "evidence_events");
    assert_eq!(v["tenant_id"], json!(tenant));
    assert_eq!(v["used"].as_u64(), Some(FREE_TIER_EVIDENCE_LIMIT));
    assert_eq!(v["limit"].as_u64(), Some(FREE_TIER_EVIDENCE_LIMIT));
    assert!(v["period_start"].as_str().is_some());
    let c3 = aigov_audit::evidence_usage::get_evidence_usage(&pool, &tenant)
        .await
        .unwrap()
        .0;
    assert_eq!(c3, FREE_TIER_EVIDENCE_LIMIT as i64);

    // 4) GET /usage uses same tenant scope as ingest (`x-govai-project`)
    let ur = app
        .oneshot(
            authz_default(Request::builder())
                .method("GET")
                .uri("/usage")
                .header("x-govai-project", &tenant)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(ur.status(), StatusCode::OK);
    let ub = ur.into_body().collect().await.unwrap().to_bytes();
    let uv: Value = serde_json::from_slice(&ub).unwrap();
    assert_eq!(uv["tenant_id"], json!(tenant));
    assert_eq!(
        uv["evidence_events_count"].as_i64(),
        Some(FREE_TIER_EVIDENCE_LIMIT as i64)
    );
}

#[tokio::test]
async fn append_failure_does_not_increment_billing_counter() {
    let Some(url) = database_url() else {
        eprintln!("skip billing_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let mut env = TestEnv::new();
    force_explicit_db_url_for_process_helpers(&mut env, &url);
    ensure_dev_api_key_tenant_map(&mut env);
    seed_empty_tenant_ledger("default");
    env.set_var("GOVAI_API_KEYS", TEST_DEFAULT_API_KEY);

    let pool = PgPoolOptions::new()
        .max_connections(3)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    let tenant = format!("append_fail_{}", uuid::Uuid::new_v4());
    let period = aigov_audit::evidence_usage::current_period_start_utc();
    sqlx::query("DELETE FROM govai_usage_counters WHERE tenant_id = $1 AND period_start = $2")
        .bind(&tenant)
        .bind(period)
        .execute(&pool)
        .await
        .ok();

    env.set_var("AIGOV_TEST_APPEND_FAIL", "1");
    let app = test_router(pool.clone()).await;
    let run_id = uuid::Uuid::new_v4().to_string();
    let event_id = uuid::Uuid::new_v4().to_string();
    let body = serde_json::to_string(&sample_data_registered(&run_id, &event_id)).unwrap();

    let r = app
        .oneshot(
            authz_default(Request::builder())
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-govai-project", &tenant)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    env.remove_var("AIGOV_TEST_APPEND_FAIL");

    assert_eq!(r.status(), StatusCode::INTERNAL_SERVER_ERROR);
    let c = aigov_audit::evidence_usage::get_evidence_usage(&pool, &tenant)
        .await
        .unwrap()
        .0;
    assert_eq!(c, 0, "billing counter must not move when append fails");
}

/// Staging-tier router: event without `environment` is stamped; client `environment` ≠ server is rejected;
/// compliance-summary exposes deployment + ledger tier.
#[tokio::test]
async fn environment_staging_e2e_stamp_mismatch_compliance_summary() {
    let Some(url) = database_url() else {
        eprintln!("skip environment_staging_e2e: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let mut env = TestEnv::new();
    force_explicit_db_url_for_process_helpers(&mut env, &url);
    ensure_dev_api_key_tenant_map(&mut env);
    seed_empty_tenant_ledger("default");
    env.set_var("GOVAI_API_KEYS", TEST_DEFAULT_API_KEY);

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    let app = staging_test_router(pool).await;
    let run_id = uuid::Uuid::new_v4().to_string();
    let e1 = uuid::Uuid::new_v4().to_string();
    let body1 = serde_json::to_string(&sample_data_registered(&run_id, &e1)).unwrap();

    let r1 = app
        .clone()
        .oneshot(
            authz_default(Request::builder())
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-govai-project", "default")
                .body(Body::from(body1))
                .unwrap(),
        )
        .await
        .unwrap();
    let s1 = r1.status();
    let b1_bytes = r1.into_body().collect().await.unwrap().to_bytes();
    let b1: Value = serde_json::from_slice(&b1_bytes).unwrap();
    assert_eq!(s1, StatusCode::OK, "unexpected /evidence: {b1}");
    assert_eq!(b1["environment"], "staging");

    let e2 = uuid::Uuid::new_v4().to_string();
    let body2 = serde_json::to_string(&run_started_wrong_env(&run_id, &e2)).unwrap();
    let r2 = app
        .clone()
        .oneshot(
            authz_default(Request::builder())
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-govai-project", "default")
                .body(Body::from(body2))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(r2.status(), StatusCode::BAD_REQUEST);
    let b2: Value =
        serde_json::from_slice(&r2.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(b2["ok"], false);
    assert_eq!(b2["error"]["code"], "POLICY_VIOLATION");
    assert!(b2["error"]["hint"].as_str().unwrap_or("").trim().len() > 0);
    let err = b2["error"]["message"].as_str().unwrap_or("");
    assert!(
        err.contains("does not match") && err.contains("staging"),
        "unexpected error: {err}"
    );

    let r3 = app
        .oneshot(
            authz_default(Request::builder())
                .method("GET")
                .uri(format!("/compliance-summary?run_id={run_id}"))
                .header("x-govai-project", "default")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let s3 = r3.status();
    let b3_bytes = r3.into_body().collect().await.unwrap().to_bytes();
    let b3: Value = serde_json::from_slice(&b3_bytes).unwrap();
    assert_eq!(s3, StatusCode::OK, "unexpected /compliance-summary: {b3}");
    assert_eq!(b3["deployment_environment"], "staging");
    assert_eq!(b3["ledger_environment"], "staging");
    assert!(b3["ledger_environment_note"].is_null());
}

#[tokio::test]
async fn ingest_policy_violation_includes_code_and_message() {
    let Some(url) = database_url() else {
        eprintln!("skip billing_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let mut env = TestEnv::new();
    force_explicit_db_url_for_process_helpers(&mut env, &url);
    ensure_dev_api_key_tenant_map(&mut env);
    seed_empty_tenant_ledger("default");
    env.set_var("GOVAI_API_KEYS", TEST_DEFAULT_API_KEY);

    let pool = PgPoolOptions::new()
        .max_connections(3)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    let app = test_router(pool).await;
    let run_id = uuid::Uuid::new_v4().to_string();
    let event_id = uuid::Uuid::new_v4().to_string();
    let body = serde_json::to_string(&sample_model_trained(&run_id, &event_id)).unwrap();

    let res = app
        .oneshot(
            authz_default(Request::builder())
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-govai-project", "default")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(v["ok"], false);
    assert_eq!(v["error"]["code"], "POLICY_VIOLATION");
    assert!(v["error"]["message"].as_str().unwrap_or("").trim().len() > 0);
    assert!(v["error"]["hint"].as_str().unwrap_or("").trim().len() > 0);
    assert_eq!(v["error"]["details"]["policy_code"], "missing_data_registered");
    assert!(v["error"]["message"]
        .as_str()
        .unwrap_or("")
        .contains("model_trained"));

    // Rejected ingests must not mutate the immutable ledger for this run.
    let log_path = project::resolve_ledger_path("audit_log.jsonl", "default");
    let events = read_events_for_run(&log_path, &run_id);
    assert!(
        events.is_empty(),
        "expected no persisted events for rejected ingest"
    );
}

#[tokio::test]
async fn allowed_ingest_emits_policy_decision_record() {
    let Some(url) = database_url() else {
        eprintln!("skip billing_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let mut env = TestEnv::new();
    force_explicit_db_url_for_process_helpers(&mut env, &url);
    ensure_dev_api_key_tenant_map(&mut env);
    seed_empty_tenant_ledger("default");
    env.set_var("GOVAI_API_KEYS", TEST_DEFAULT_API_KEY);

    let pool = PgPoolOptions::new()
        .max_connections(3)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    let app = test_router(pool).await;
    let run_id = uuid::Uuid::new_v4().to_string();
    let event_id = uuid::Uuid::new_v4().to_string();
    let body = serde_json::to_string(&sample_data_registered(&run_id, &event_id)).unwrap();

    let res = app
        .oneshot(
            authz_default(Request::builder())
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-govai-project", "default")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let log_path = project::resolve_ledger_path("audit_log.jsonl", "default");
    let events = read_events_for_run(&log_path, &run_id);
    assert!(!events.is_empty(), "expected persisted evidence records");
    let last = events.last().cloned().expect("last event");
    assert_eq!(last.event_type, "data_registered");
    assert_eq!(last.event_id, event_id);
    assert_eq!(last.environment.as_deref(), Some("dev"));
}

/// `GOVAI_METERING=on` path: monthly **new run** cap uses the same `team_id` as `GET /usage` for the API key.
#[tokio::test]
async fn metering_on_monthly_new_runs_limit_429_includes_scope() {
    let Some(url) = database_url() else {
        eprintln!("skip metering_on_monthly_new_runs_limit: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let mut env = TestEnv::new();
    force_explicit_db_url_for_process_helpers(&mut env, &url);
    seed_empty_tenant_ledger("default");

    let pool = PgPoolOptions::new()
        .max_connections(3)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    let team_id = Uuid::new_v4();
    sqlx::query("INSERT INTO public.teams (id, name) VALUES ($1, $2)")
        .bind(team_id)
        .bind("metering HTTP test team")
        .execute(&pool)
        .await
        .expect("insert team");

    // Use a key present in the global `GOVAI_API_KEYS_JSON` tenant map. Once that map is
    // initialized, all audit routes require the bearer token to be present in it (401 otherwise).
    ensure_dev_api_key_tenant_map(&mut env);
    const RAW_KEY: &str = "key_default";
    env.set_var("GOVAI_API_KEYS", RAW_KEY);
    let api_usage = ApiUsageState::from_env(&pool).expect("api usage");
    let metering_cfg = MeteringConfig {
        enabled: true,
        default_plan: GovaiPlan::Free,
    };
    let app = govai_api::audit_router(
        "audit_log.jsonl",
        policy_version_for(GovaiEnvironment::Dev),
        GovaiEnvironment::Dev,
        ResolvedPolicyConfig::all_defaults().config,
        api_usage,
        pool.clone(),
        metering_cfg,
    );

    let kh = key_fingerprint(RAW_KEY);
    seed_empty_tenant_ledger("default");
    sqlx::query("DELETE FROM public.govai_api_key_billing WHERE key_hash = $1")
        .bind(&kh)
        .execute(&pool)
        .await
        .ok();
    sqlx::query("INSERT INTO public.govai_api_key_billing (key_hash, team_id) VALUES ($1, $2)")
        .bind(&kh)
        .bind(team_id)
        .execute(&pool)
        .await
        .expect("key billing");

    let ym = metering::year_month_utc_now();
    sqlx::query(
        "DELETE FROM public.govai_team_usage_monthly WHERE team_id = $1 AND year_month = $2",
    )
    .bind(team_id)
    .bind(ym)
    .execute(&pool)
    .await
    .ok();
    sqlx::query(
        r#"
        INSERT INTO public.govai_team_usage_monthly (team_id, year_month, new_run_ids, evidence_events)
        VALUES ($1, $2, 25, 0)
        "#,
    )
    .bind(team_id)
    .bind(ym)
    .execute(&pool)
    .await
    .expect("seed monthly");

    let run_id = uuid::Uuid::new_v4().to_string();
    let ev_id = uuid::Uuid::new_v4().to_string();
    let body = serde_json::to_string(&sample_data_registered(&run_id, &ev_id)).unwrap();

    let res = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::AUTHORIZATION, format!("Bearer {RAW_KEY}"))
                .header("x-govai-project", "default")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    let (status, v, raw) = read_json_response(res).await;
    if status != StatusCode::TOO_MANY_REQUESTS {
        eprintln!("metering_on_monthly_new_runs_limit response {status}: {raw}");
    }
    env.remove_var("GOVAI_API_KEYS");
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(v["ok"], false);
    assert_eq!(v["error"]["code"], "MONTHLY_RUN_LIMIT_EXCEEDED");
    assert!(v["error"]["message"].as_str().unwrap_or("").trim().len() > 0);
    assert!(v["error"]["hint"].as_str().unwrap_or("").trim().len() > 0);
    assert_eq!(v["error"]["details"]["used"], json!(25));
    assert_eq!(v["error"]["details"]["limit"], json!(25));
    assert_eq!(v["metering"], "on");
    assert_eq!(v["count_kind"], "new_runs_month");
    assert_eq!(v["team_id"], json!(team_id.to_string()));
    assert_eq!(v["used"], json!(25));
    assert_eq!(v["limit"], json!(25));
    assert_eq!(v["plan"], "free");
}

#[tokio::test]
async fn stripe_webhook_secret_missing_returns_503() {
    let Some(url) = database_url() else {
        eprintln!("skip stripe_webhook_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let mut env = TestEnv::new();
    force_explicit_db_url_for_process_helpers(&mut env, &url);
    seed_empty_tenant_ledger("default");
    env.remove_var("GOVAI_STRIPE_WEBHOOK_SECRET");

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
    let res = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/stripe/webhook")
                .body(Body::from(r#"{"id":"evt_x","type":"invoice.paid"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
}

#[tokio::test]
async fn stripe_webhook_signed_idempotent_and_billing_usage_summary() {
    let Some(url) = database_url() else {
        eprintln!("skip stripe_webhook_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let mut env = TestEnv::new();
    force_explicit_db_url_for_process_helpers(&mut env, &url);
    ensure_dev_api_key_tenant_map(&mut env);
    env.set_var("GOVAI_API_KEYS", TEST_DEFAULT_API_KEY);
    seed_empty_tenant_ledger("default");
    env.remove_var("GOVAI_STRIPE_WEBHOOK_SECRET");
    env.set_var("GOVAI_STRIPE_WEBHOOK_SECRET", "plain_webhook_secret");

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

    // Minimal valid Stripe event shape for `invoice.paid`:
    // handler requires `data.object` to exist; invoice processing reads `customer` if present.
    let body = br#"{"id":"evt_stripe_integration_1","type":"invoice.paid","data":{"object":{"customer":"cus_test_1"}}}"#;
    let t = chrono::Utc::now().timestamp();
    let signed = format!("{}.{t}", String::from_utf8_lossy(body));
    let mut mac = Hmac::<Sha256>::new_from_slice(b"plain_webhook_secret").expect("hmac key");
    mac.update(signed.as_bytes());
    let sig = hex::encode(mac.finalize().into_bytes());
    let hdr = format!("t={t},v1={sig}");

    let r1 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/stripe/webhook")
                .header("Stripe-Signature", hdr.as_str())
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body.as_slice()))
                .unwrap(),
        )
        .await
        .unwrap();
    let (s1, b1, raw1) = read_json_response(r1).await;
    if s1 != StatusCode::OK {
        eprintln!("stripe_webhook r1 {s1}: {raw1}");
    }
    assert_eq!(s1, StatusCode::OK, "unexpected webhook response: {b1}");

    let r2 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/stripe/webhook")
                .header("Stripe-Signature", hdr.as_str())
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body.as_slice()))
                .unwrap(),
        )
        .await
        .unwrap();
    let (s2, b2, raw2) = read_json_response(r2).await;
    if s2 != StatusCode::OK {
        eprintln!("stripe_webhook r2 {s2}: {raw2}");
    }
    assert_eq!(s2, StatusCode::OK, "unexpected webhook response: {b2}");
    assert_eq!(b2["duplicate"], true);

    let run_id = Uuid::new_v4().to_string();
    let ev_id = Uuid::new_v4().to_string();
    let ev_body = serde_json::to_string(&sample_data_registered(&run_id, &ev_id)).unwrap();
    let r3 = app
        .clone()
        .oneshot(
            authz_default(Request::builder())
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(ev_body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(r3.status(), StatusCode::OK);

    let r4 = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/billing/usage-summary?unit=evidence_event")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(r4.status(), StatusCode::OK);
    let v: Value = serde_json::from_slice(&r4.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert!(v["usage_count"].as_i64().unwrap() >= 1);
    assert!(!v["traces"].as_array().unwrap().is_empty());

    env.remove_var("GOVAI_STRIPE_WEBHOOK_SECRET");
}

#[tokio::test]
async fn billing_checkout_session_missing_stripe_secret_returns_503() {
    let Some(url) = database_url() else {
        eprintln!("skip billing_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let mut env = TestEnv::new();
    force_explicit_db_url_for_process_helpers(&mut env, &url);
    ensure_dev_api_key_tenant_map(&mut env);
    seed_empty_tenant_ledger("default");

    env.set_var("GOVAI_API_KEYS", "key_default");
    env.remove_var("GOVAI_STRIPE_SECRET_KEY");

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
    let body = json!({
        "price_id": "price_test123",
        "success_url": "https://example.com/success",
        "cancel_url": "https://example.com/cancel"
    });
    let res = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/billing/checkout-session")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::AUTHORIZATION, "Bearer key_default")
                .body(Body::from(serde_json::to_string(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
    let v: Value = serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(v["ok"], false);
    assert_eq!(v["error"]["code"], "STRIPE_NOT_CONFIGURED");

    env.remove_var("GOVAI_API_KEYS");
}

#[tokio::test]
async fn billing_checkout_session_requires_api_key_when_keys_configured() {
    let Some(url) = database_url() else {
        eprintln!("skip billing_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let mut env = TestEnv::new();
    force_explicit_db_url_for_process_helpers(&mut env, &url);
    ensure_dev_api_key_tenant_map(&mut env);
    seed_empty_tenant_ledger("default");

    env.set_var("GOVAI_API_KEYS", "key_default");
    env.set_var("GOVAI_STRIPE_SECRET_KEY", "sk_test_fake_for_auth_gate");

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
    let body = json!({
        "price_id": "price_test123",
        "success_url": "https://example.com/success",
        "cancel_url": "https://example.com/cancel"
    });
    let res = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/billing/checkout-session")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

    env.remove_var("GOVAI_API_KEYS");
    env.remove_var("GOVAI_STRIPE_SECRET_KEY");
}

#[tokio::test]
async fn stripe_webhook_subscription_updated_upserts_tenant_billing_account() {
    let Some(url) = database_url() else {
        eprintln!("skip billing_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let mut env = TestEnv::new();
    force_explicit_db_url_for_process_helpers(&mut env, &url);
    seed_empty_tenant_ledger("default");
    env.set_var("GOVAI_STRIPE_WEBHOOK_SECRET", "plain_webhook_secret_sub_upd");

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    let app = test_router(pool.clone()).await;

    let payload = json!({
        "id": "evt_sub_webhook_integration_42",
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_webhook_test_42",
                "customer": "cus_webhook_42",
                "status": "active",
                "current_period_start": 1710000000_i64,
                "current_period_end": 1712678400_i64,
                "metadata": { "tenant_id": "stripe_webhook_tid_42" },
                "items": { "data": [ { "id": "si_webhook_item_42", "object": "subscription_item" } ] }
            }
        }
    });
    let body_bytes = serde_json::to_vec(&payload).unwrap();
    let t = chrono::Utc::now().timestamp();
    let signed = format!("{}.{t}", String::from_utf8_lossy(&body_bytes));
    let mut mac = Hmac::<Sha256>::new_from_slice(b"plain_webhook_secret_sub_upd").expect("hmac");
    mac.update(signed.as_bytes());
    let sig = hex::encode(mac.finalize().into_bytes());
    let hdr = format!("t={t},v1={sig}");

    let res = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/stripe/webhook")
                .header("Stripe-Signature", hdr.as_str())
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body_bytes))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK, "webhook body");

    let row: (String, Option<String>, Option<String>, String) = sqlx::query_as(
        r#"
        select tenant_id, stripe_customer_id, stripe_subscription_id, subscription_status
        from public.tenant_billing_accounts
        where tenant_id = 'stripe_webhook_tid_42'
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("tenant billing row");
    assert_eq!(row.0, "stripe_webhook_tid_42");
    assert_eq!(row.1.as_deref(), Some("cus_webhook_42"));
    assert_eq!(row.2.as_deref(), Some("sub_webhook_test_42"));
    assert_eq!(row.3, "active");

    env.remove_var("GOVAI_STRIPE_WEBHOOK_SECRET");
}

#[tokio::test]
async fn billing_status_returns_none_before_checkout() {
    let Some(url) = database_url() else {
        eprintln!("skip billing_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let mut env = TestEnv::new();
    force_explicit_db_url_for_process_helpers(&mut env, &url);
    ensure_dev_api_key_tenant_map(&mut env);
    env.set_var("GOVAI_API_KEYS", "key_github_actions");
    seed_empty_tenant_ledger("github-actions");

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
    let res = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/billing/status")
                .header(header::AUTHORIZATION, "Bearer key_github_actions")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let v: Value = serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(v["ok"], true);
    assert_eq!(v["tenant_id"], "github-actions");
    assert_eq!(v["subscription_status"], "none");
    assert!(v["stripe_customer_id"].is_null());

    env.remove_var("GOVAI_API_KEYS");
}

#[tokio::test]
async fn billing_report_usage_is_idempotent_without_stripe_item() {
    let Some(url) = database_url() else {
        eprintln!("skip billing_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let mut env = TestEnv::new();
    force_explicit_db_url_for_process_helpers(&mut env, &url);
    ensure_dev_api_key_tenant_map(&mut env);
    env.set_var("GOVAI_API_KEYS", "key_tenant_b");
    seed_empty_tenant_ledger("tenant-b");

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    // Ensure `report-usage` uses a stable (period_start, period_end) across both calls.
    // Otherwise it falls back to (month_start..now), which changes every call and breaks idempotency.
    let period_start = chrono::Utc::now() - chrono::Duration::days(2);
    let period_end = chrono::Utc::now() + chrono::Duration::days(20);
    sqlx::query(
        r#"
        insert into public.tenant_billing_accounts (tenant_id, subscription_status, current_period_start, current_period_end)
        values ('tenant-b', 'active', $1, $2)
        on conflict (tenant_id) do update set
          subscription_status = excluded.subscription_status,
          current_period_start = excluded.current_period_start,
          current_period_end = excluded.current_period_end,
          updated_at = now()
        "#,
    )
    .bind(period_start)
    .bind(period_end)
    .execute(&pool)
    .await
    .expect("seed billing period");

    let app = test_router(pool).await;
    let r1 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/billing/report-usage")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::AUTHORIZATION, "Bearer key_tenant_b")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await
        .unwrap();
    let (s1, b1, raw1) = read_json_response(r1).await;
    if s1 != StatusCode::OK {
        eprintln!("billing_report_usage r1 {s1}: {raw1}");
    }
    assert_eq!(s1, StatusCode::OK, "unexpected report-usage response: {b1}");
    assert_eq!(b1["idempotent_hit"], false);

    let r2 = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/billing/report-usage")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::AUTHORIZATION, "Bearer key_tenant_b")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await
        .unwrap();
    let (s2, b2, raw2) = read_json_response(r2).await;
    if s2 != StatusCode::OK {
        eprintln!("billing_report_usage r2 {s2}: {raw2}");
    }
    assert_eq!(s2, StatusCode::OK, "unexpected report-usage response: {b2}");
    assert_eq!(b2["idempotent_hit"], true);
    assert_eq!(b1["report_id"], b2["report_id"]);

    env.remove_var("GOVAI_API_KEYS");
}

#[tokio::test]
async fn billing_enforcement_blocks_evidence_when_subscription_inactive() {
    let Some(url) = database_url() else {
        eprintln!("skip billing_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let mut env = TestEnv::new();
    force_explicit_db_url_for_process_helpers(&mut env, &url);
    ensure_dev_api_key_tenant_map(&mut env);
    env.set_var("GOVAI_API_KEYS", "key_tenant_a");
    env.set_var("GOVAI_BILLING_ENFORCEMENT", "on");
    seed_empty_tenant_ledger("tenant-a");

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
    let run_id = Uuid::new_v4().to_string();
    let ev_id = Uuid::new_v4().to_string();
    let body = serde_json::to_string(&sample_data_registered(&run_id, &ev_id)).unwrap();
    let res = app
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
    assert_eq!(res.status(), StatusCode::FORBIDDEN);
    let v: Value = serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(v["error"]["code"], "BILLING_INACTIVE");

    env.remove_var("GOVAI_API_KEYS");
    env.remove_var("GOVAI_BILLING_ENFORCEMENT");
}

#[tokio::test]
async fn billing_enforcement_allows_evidence_when_subscription_active() {
    let Some(url) = database_url() else {
        eprintln!("skip billing_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;
    let mut env = TestEnv::new();
    force_explicit_db_url_for_process_helpers(&mut env, &url);
    ensure_dev_api_key_tenant_map(&mut env);
    env.set_var("GOVAI_API_KEYS", "key_tenant_b");
    env.set_var("GOVAI_BILLING_ENFORCEMENT", "on");
    seed_empty_tenant_ledger("tenant-b");

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    sqlx::query(
        r#"
        insert into public.tenant_billing_accounts
          (tenant_id, stripe_customer_id, stripe_subscription_id, subscription_status, updated_at)
        values ('tenant-b', 'cus_x', 'sub_x', 'active', now())
        on conflict (tenant_id) do update set subscription_status = 'active', updated_at = now()
        "#,
    )
    .execute(&pool)
    .await
    .expect("seed billing");

    let app = test_router(pool).await;
    let run_id = Uuid::new_v4().to_string();
    let ev_id = Uuid::new_v4().to_string();
    let body = serde_json::to_string(&sample_data_registered(&run_id, &ev_id)).unwrap();
    let res = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::AUTHORIZATION, "Bearer key_tenant_b")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    env.remove_var("GOVAI_API_KEYS");
    env.remove_var("GOVAI_BILLING_ENFORCEMENT");
}
