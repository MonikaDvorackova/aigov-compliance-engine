//! HTTP-level billing tests: canonical counter `govai_usage_counters` (all modes).
//! Also **environment separation E2E** (staging stamp, mismatch rejection, compliance-summary fields).
//! Requires `DATABASE_URL` or `TEST_DATABASE_URL` and applies migrations from `rust/migrations/`.

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use std::sync::Mutex;
use tower::ServiceExt;

use aigov_audit::api_usage::ApiUsageState;
use aigov_audit::evidence_usage::FREE_TIER_EVIDENCE_LIMIT;
use aigov_audit::govai_api;
use aigov_audit::govai_environment::{policy_version_for, GovaiEnvironment};
use aigov_audit::metering::{GovaiPlan, MeteringConfig};
use aigov_audit::policy_config::ResolvedPolicyConfig;
use aigov_audit::project;
use aigov_audit::schema::EvidenceEvent;

static CWD_LOCK: Mutex<()> = Mutex::new(());

fn database_url() -> Option<String> {
    std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .ok()
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

fn read_policy_decisions(log_path: &str, run_id: &str) -> Vec<Value> {
    let raw = std::fs::read_to_string(log_path).unwrap_or_default();
    raw.lines()
        .filter_map(|l| {
            let t = l.trim();
            if t.is_empty() {
                return None;
            }
            let rec: aigov_audit::audit_store::StoredRecord = serde_json::from_str(t).ok()?;
            let ev: EvidenceEvent = serde_json::from_str(&rec.event_json).ok()?;
            if ev.run_id != run_id || ev.event_type != "policy_decision" {
                return None;
            }
            Some(ev.payload)
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

    let _lock = CWD_LOCK.lock().expect("lock");
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(dir.path()).expect("chdir");

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
            Request::builder()
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
            Request::builder()
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
            Request::builder()
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
    assert_eq!(v["error"], "evidence_quota_exceeded");
    assert_eq!(v["limit"].as_u64(), Some(FREE_TIER_EVIDENCE_LIMIT));
    let c3 = aigov_audit::evidence_usage::get_evidence_usage(&pool, &tenant)
        .await
        .unwrap()
        .0;
    assert_eq!(c3, FREE_TIER_EVIDENCE_LIMIT as i64);

    // 4) GET /usage uses same tenant scope as ingest (`x-govai-project`)
    let ur = app
        .oneshot(
            Request::builder()
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

    let _lock = CWD_LOCK.lock().expect("lock");
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(dir.path()).expect("chdir");

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

    std::env::set_var("AIGOV_TEST_APPEND_FAIL", "1");
    let app = test_router(pool.clone()).await;
    let run_id = uuid::Uuid::new_v4().to_string();
    let event_id = uuid::Uuid::new_v4().to_string();
    let body = serde_json::to_string(&sample_data_registered(&run_id, &event_id)).unwrap();

    let r = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-govai-project", &tenant)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    std::env::remove_var("AIGOV_TEST_APPEND_FAIL");

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

    let app = staging_test_router(pool).await;
    let run_id = uuid::Uuid::new_v4().to_string();
    let e1 = uuid::Uuid::new_v4().to_string();
    let body1 = serde_json::to_string(&sample_data_registered(&run_id, &e1)).unwrap();

    let r1 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body1))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(r1.status(), StatusCode::OK);
    let b1: Value = serde_json::from_slice(&r1.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(b1["environment"], "staging");

    let e2 = uuid::Uuid::new_v4().to_string();
    let body2 = serde_json::to_string(&run_started_wrong_env(&run_id, &e2)).unwrap();
    let r2 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body2))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(r2.status(), StatusCode::BAD_REQUEST);
    let b2: Value = serde_json::from_slice(&r2.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let err = b2["error"].as_str().unwrap_or("");
    assert!(
        err.contains("does not match") && err.contains("staging"),
        "unexpected error: {err}"
    );

    let r3 = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/compliance-summary?run_id={run_id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(r3.status(), StatusCode::OK);
    let b3: Value = serde_json::from_slice(&r3.into_body().collect().await.unwrap().to_bytes()).unwrap();
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

    let _lock = CWD_LOCK.lock().expect("lock");
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(dir.path()).expect("chdir");

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
            Request::builder()
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&bytes).unwrap();
    assert!(v.get("error").is_some());
    assert_eq!(v["code"], "missing_data_registered");
    assert!(v["message"].as_str().unwrap_or("").contains("model_trained"));

    // Decision is persisted into the same audit log (replayable / regulator-readable).
    let log_path = project::resolve_ledger_path("audit_log.jsonl", "default");
    let decisions = read_policy_decisions(&log_path, &run_id);
    assert!(!decisions.is_empty(), "expected policy_decision records");
    let last = decisions.last().cloned().unwrap_or(Value::Null);
    assert_eq!(last["decision"], "rejected");
    assert_eq!(last["event_type"], "model_trained");
    assert_eq!(last["policy_environment"], "dev");
    assert_eq!(last["policy_version"], policy_version_for(GovaiEnvironment::Dev));
    assert_eq!(last["violation"]["code"], v["code"]);
}

#[tokio::test]
async fn allowed_ingest_emits_policy_decision_record() {
    let Some(url) = database_url() else {
        eprintln!("skip billing_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _lock = CWD_LOCK.lock().expect("lock");
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(dir.path()).expect("chdir");

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
            Request::builder()
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let log_path = project::resolve_ledger_path("audit_log.jsonl", "default");
    let decisions = read_policy_decisions(&log_path, &run_id);
    assert!(!decisions.is_empty(), "expected policy_decision records");
    let last = decisions.last().cloned().unwrap_or(Value::Null);
    assert_eq!(last["decision"], "allowed");
    assert_eq!(last["event_type"], "data_registered");
    assert_eq!(last["policy_environment"], "dev");
    assert_eq!(last["policy_version"], policy_version_for(GovaiEnvironment::Dev));
    assert!(last["violation"].is_null());
}
