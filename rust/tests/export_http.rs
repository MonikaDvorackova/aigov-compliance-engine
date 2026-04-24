//! HTTP tests for the machine-readable audit export (`GET /api/export/{run_id}`).

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

static CWD_LOCK: Mutex<()> = Mutex::new(());

fn database_url() -> Option<String> {
    std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .ok()
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

#[tokio::test]
async fn export_run_includes_decision_and_hashes() {
    let Some(url) = database_url() else {
        eprintln!("skip export_http: set DATABASE_URL or TEST_DATABASE_URL");
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

    let app = test_router(pool).await;

    let tenant = format!("export_tenant_{}", uuid::Uuid::new_v4());
    let run_id = uuid::Uuid::new_v4().to_string();
    let event_id = uuid::Uuid::new_v4().to_string();

    let audit_log_path = format!("audit_log__{tenant}.jsonl");
    std::fs::write(&audit_log_path, "").expect("create tenant audit log");

    let evidence = json!({
        "event_id": event_id,
        "event_type": "data_registered",
        "ts_utc": "2026-04-21T12:00:00Z",
        "actor": "test",
        "system": "export-http-test",
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
    });

    let ingest_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/evidence")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-govai-project", &tenant)
                .body(Body::from(serde_json::to_string(&evidence).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    let ingest_status = ingest_res.status();
    let ingest_body = ingest_res.into_body().collect().await.unwrap().to_bytes();

    assert_eq!(ingest_status, StatusCode::OK);

    let ingest_v: Value = serde_json::from_slice(&ingest_body).unwrap();
    let record_hash = ingest_v["record_hash"]
        .as_str()
        .expect("record_hash")
        .to_string();

    let export_res = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/export/{run_id}"))
                .header(header::ACCEPT, "application/json")
                .header("x-govai-project", &tenant)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let export_status = export_res.status();
    let export_body = export_res.into_body().collect().await.unwrap().to_bytes();

    assert_eq!(export_status, StatusCode::OK);

    let export_v: Value = serde_json::from_slice(&export_body).unwrap();

    assert_eq!(export_v["ok"], true);
    assert_eq!(export_v["schema_version"], "aigov.audit_export.v1");
    assert_eq!(export_v["run"]["run_id"], run_id);

    let bundle_sha = export_v["evidence_hashes"]["bundle_sha256"]
        .as_str()
        .expect("bundle_sha256");
    assert_eq!(bundle_sha.len(), 64, "bundle_sha256 should be hex sha256");

    let head = export_v["evidence_hashes"]["chain_head_record_sha256"]
        .as_str()
        .expect("chain_head_record_sha256");
    assert_eq!(head, record_hash);

    assert!(
        export_v["decision"].is_object(),
        "decision object must exist"
    );
    assert!(
        export_v["timestamps"].is_object(),
        "timestamps object must exist"
    );
}
