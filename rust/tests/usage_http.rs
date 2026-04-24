//! Tests for normalized `/usage` fields (commercial surface).
//! These are additive assertions: existing legacy fields must remain.

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use std::sync::Mutex;
use tower::ServiceExt;
use uuid::Uuid;

use aigov_audit::api_usage::{key_fingerprint, ApiUsageState};
use aigov_audit::govai_api;
use aigov_audit::govai_environment::{policy_version_for, GovaiEnvironment};
use aigov_audit::metering::{self, GovaiPlan, MeteringConfig};
use aigov_audit::policy_config::ResolvedPolicyConfig;

static CWD_LOCK: Mutex<()> = Mutex::new(());

fn database_url() -> Option<String> {
    std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .ok()
}

async fn test_router(pool: sqlx::PgPool, metering: MeteringConfig) -> Router {
    let api_usage = ApiUsageState::from_env(&pool).expect("api usage");
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
async fn usage_metering_off_includes_normalized_plan_limits_remaining() {
    let Some(url) = database_url() else {
        eprintln!("skip usage_http: set DATABASE_URL or TEST_DATABASE_URL");
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

    let metering_cfg = MeteringConfig {
        enabled: false,
        default_plan: GovaiPlan::Free,
    };
    let app = test_router(pool, metering_cfg).await;

    let res = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/usage")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&bytes).expect("json");

    assert_eq!(v["metering"], "off");
    assert_eq!(v["plan"], "free");
    assert!(v["usage"]["evidence_events"].is_number());
    assert_eq!(v["usage"]["runs"], 0);
    assert_eq!(v["limits"]["evidence_events"], 2500);
    assert_eq!(v["limits"]["runs"], 25);
    assert_eq!(v["limits"]["events_per_run"], 1000);
    assert!(v["remaining"]["evidence_events"].is_number());
    assert_eq!(v["remaining"]["runs"], 25);
}

#[tokio::test]
async fn usage_metering_on_includes_normalized_and_legacy_metering_limits() {
    let Some(url) = database_url() else {
        eprintln!("skip usage_http: set DATABASE_URL or TEST_DATABASE_URL");
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

    let team_id = Uuid::new_v4();
    sqlx::query("INSERT INTO public.teams (id, name) VALUES ($1, $2)")
        .bind(team_id)
        .bind("usage_http team")
        .execute(&pool)
        .await
        .expect("insert team");

    const RAW_KEY: &str = "usage_http_metering_on_secret";
    std::env::set_var("GOVAI_API_KEYS", RAW_KEY);

    let metering_cfg = MeteringConfig {
        enabled: true,
        default_plan: GovaiPlan::Free,
    };
    let app = test_router(pool.clone(), metering_cfg).await;

    let kh = key_fingerprint(RAW_KEY);
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
        VALUES ($1, $2, 3, 10)
        "#,
    )
    .bind(team_id)
    .bind(ym)
    .execute(&pool)
    .await
    .expect("seed monthly");

    let res = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/usage")
                .header(header::AUTHORIZATION, format!("Bearer {RAW_KEY}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    std::env::remove_var("GOVAI_API_KEYS");

    assert_eq!(res.status(), StatusCode::OK);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&bytes).expect("json");

    assert_eq!(v["metering"], "on");
    assert_eq!(v["plan"], "free"); // resolve_plan is temporary static
    assert_eq!(v["usage"]["evidence_events"], 10);
    assert_eq!(v["usage"]["runs"], 3);
    assert_eq!(v["limits"]["evidence_events"], 2500);
    assert_eq!(v["limits"]["runs"], 25);
    assert_eq!(v["limits"]["events_per_run"], 1000);
    assert!(
        v["legacy_metering_limits"]["max_events_per_month"].is_number()
            || v["legacy_metering_limits"]["max_events_per_month"].is_null()
    );
    assert!(
        v["legacy_metering_limits"]["max_runs_per_month"].is_number()
            || v["legacy_metering_limits"]["max_runs_per_month"].is_null()
    );
    assert!(
        v["legacy_metering_limits"]["max_events_per_run"].is_number()
            || v["legacy_metering_limits"]["max_events_per_run"].is_null()
    );
}
