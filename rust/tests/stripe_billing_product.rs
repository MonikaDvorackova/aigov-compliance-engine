//! Stripe billing product integration tests (DB-backed). Requires `DATABASE_URL` or `TEST_DATABASE_URL`.
//! Run with `cargo test stripe_billing_product -- --test-threads=1` if other tests race `GOVAI_API_KEYS_JSON` init.

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;

use aigov_audit::api_usage::ApiUsageState;
use aigov_audit::govai_api;
use aigov_audit::govai_environment::{policy_version_for, GovaiEnvironment};
use aigov_audit::metering::{GovaiPlan, MeteringConfig};
use aigov_audit::policy_config::ResolvedPolicyConfig;
use aigov_audit::stripe_billing::{self, BILLING_UNIT_EVIDENCE_EVENT};

mod test_support;
use test_support::env_lock;

fn database_url() -> Option<String> {
    std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .ok()
}

async fn router(pool: sqlx::PgPool) -> Router {
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

#[tokio::test]
async fn stripe_billing_product_suite() {
    let Some(url) = database_url() else {
        eprintln!("skip stripe_billing_product: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };
    let _g = env_lock().await;
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_current_dir(dir.path()).expect("chdir");

    let pool = PgPoolOptions::new()
        .max_connections(4)
        .connect(&url)
        .await
        .expect("connect");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    let tid = format!("stripe_prod_{}", uuid::Uuid::new_v4());
    let raw_key = format!("key-{tid}");
    std::env::set_var(
        "GOVAI_API_KEYS_JSON",
        serde_json::to_string(&serde_json::json!({ raw_key.clone(): tid })).unwrap(),
    );
    if aigov_audit::audit_api_key::init_api_key_tenant_map(GovaiEnvironment::Dev).is_err() {
        eprintln!(
            "skip stripe_billing_product: GOVAI_API_KEYS_JSON already initialized in this process"
        );
        return;
    }

    // --- multi-item mapping + unknown price ---
    std::env::set_var("GOVAI_STRIPE_PRICE_EVIDENCE_EVENT", "price_ev_suite");
    std::env::set_var("GOVAI_STRIPE_PRICE_COMPLIANCE_CHECK", "price_cc_suite");
    sqlx::query("insert into public.tenant_billing_accounts (tenant_id, subscription_status) values ($1, 'active')")
        .bind(&tid)
        .execute(&pool)
        .await
        .expect("insert account");
    let sub = json!({
        "id": "sub_suite",
        "customer": "cus_suite",
        "metadata": { "tenant_id": tid },
        "status": "active",
        "items": { "data": [
            { "id": "si_ev_s", "price": { "id": "price_ev_suite" } },
            { "id": "si_cc_s", "price": { "id": "price_cc_suite" } },
            { "id": "si_bad", "price": { "id": "price_unknown_suite" } }
        ]}
    });
    stripe_billing::process_subscription_object(&pool, &sub, false)
        .await
        .expect("process subscription");
    let n: i64 = sqlx::query_scalar(
        "select count(*)::bigint from public.tenant_billing_subscription_items where tenant_id = $1 and active = true",
    )
    .bind(&tid)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(n, 2);

    // --- billing status includes units ---
    std::env::set_var("GOVAI_API_KEYS", &raw_key);
    let app = router(pool.clone()).await;
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/billing/status")
                .header(header::AUTHORIZATION, format!("Bearer {raw_key}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let v: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(v["ok"], true);
    assert!(v["billing_units"]
        .as_array()
        .map(|a| a.len() >= 2)
        .unwrap_or(false));

    // --- portal without customer ---
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/billing/portal-session")
                .header(header::AUTHORIZATION, format!("Bearer {raw_key}"))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(r#"{"return_url":"https://example.com"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    // We *do* have a Stripe customer id (set by `process_subscription_object`), but we intentionally
    // do not configure `GOVAI_STRIPE_SECRET_KEY` in this test. That is an operator misconfiguration,
    // so the contract is 503 (not 404).
    assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
    let v: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(v["error"]["code"], "STRIPE_NOT_CONFIGURED");

    // --- report usage idempotency (Stripe call fails without real key; row still dedupes) ---
    sqlx::query(
        r#"update public.tenant_billing_accounts set current_period_start = now() - interval '1 day', current_period_end = now() + interval '20 days' where tenant_id = $1"#,
    )
    .bind(&tid)
    .execute(&pool)
    .await
    .unwrap();
    stripe_billing::record_usage_attribution(
        &pool,
        &tid,
        BILLING_UNIT_EVIDENCE_EVENT,
        "run_suite",
        None,
    )
    .await
    .unwrap();
    std::env::set_var("GOVAI_STRIPE_SECRET_KEY", "sk_test_invalid");
    let _ = stripe_billing::report_usage_for_tenant(&pool, &tid, BILLING_UNIT_EVIDENCE_EVENT).await;
    let second = stripe_billing::report_usage_for_tenant(&pool, &tid, BILLING_UNIT_EVIDENCE_EVENT)
        .await
        .expect("second");
    assert!(second.idempotent_hit);
    std::env::remove_var("GOVAI_STRIPE_SECRET_KEY");

    // --- reconciliation tenant isolation ---
    let other = format!("stripe_other_{}", uuid::Uuid::new_v4());
    stripe_billing::record_usage_attribution(
        &pool,
        &other,
        BILLING_UNIT_EVIDENCE_EVENT,
        "run_other",
        None,
    )
    .await
    .unwrap();
    let from = chrono::Utc::now() - chrono::Duration::hours(1);
    let to = chrono::Utc::now() + chrono::Duration::hours(1);
    let ja = stripe_billing::reconciliation_for_tenant(&pool, &tid, from, to, None)
        .await
        .unwrap();
    let mut run_ids: Vec<String> = Vec::new();
    for u in ja["usage"].as_array().unwrap_or(&vec![]) {
        for r in u["runs"].as_array().unwrap_or(&vec![]) {
            if let Some(id) = r["run_id"].as_str() {
                run_ids.push(id.to_string());
            }
        }
    }
    assert!(run_ids.contains(&"run_suite".to_string()));
    assert!(!run_ids.contains(&"run_other".to_string()));

    // --- enforcement off by default: flip on ---
    std::env::set_var("GOVAI_BILLING_ENFORCEMENT", "on");
    let app_enf = router(pool.clone()).await;
    let res = app_enf
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/usage")
                .header(header::AUTHORIZATION, format!("Bearer {raw_key}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    sqlx::query("delete from public.tenant_billing_subscription_items where tenant_id = $1")
        .bind(&tid)
        .execute(&pool)
        .await
        .ok();
    sqlx::query("delete from public.tenant_billing_accounts where tenant_id = $1")
        .bind(&tid)
        .execute(&pool)
        .await
        .ok();
    let res_blk = app_enf
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/usage")
                .header(header::AUTHORIZATION, format!("Bearer {raw_key}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res_blk.status(), StatusCode::FORBIDDEN);
    let vb: Value =
        serde_json::from_slice(&res_blk.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(vb["error"]["code"], "BILLING_INACTIVE");

    sqlx::query(
        r#"insert into public.tenant_billing_accounts (tenant_id, subscription_status) values ($1, 'active')"#,
    )
    .bind(&tid)
    .execute(&pool)
    .await
    .unwrap();
    let app_ok = router(pool.clone()).await;
    let res_ok = app_ok
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/usage")
                .header(header::AUTHORIZATION, format!("Bearer {raw_key}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res_ok.status(), StatusCode::OK);

    std::env::remove_var("GOVAI_BILLING_ENFORCEMENT");
    std::env::remove_var("GOVAI_API_KEYS");
    std::env::remove_var("GOVAI_API_KEYS_JSON");
    std::env::remove_var("GOVAI_STRIPE_PRICE_EVIDENCE_EVENT");
    std::env::remove_var("GOVAI_STRIPE_PRICE_COMPLIANCE_CHECK");
    sqlx::query("delete from public.tenant_billing_usage_attributions where tenant_id = $1 or tenant_id = $2")
        .bind(&tid)
        .bind(&other)
        .execute(&pool)
        .await
        .ok();
    sqlx::query("delete from public.billing_usage_reports where tenant_id = $1")
        .bind(&tid)
        .execute(&pool)
        .await
        .ok();
    sqlx::query(
        "delete from public.tenant_billing_accounts where tenant_id = $1 or tenant_id = $2",
    )
    .bind(&tid)
    .bind(&other)
    .execute(&pool)
    .await
    .ok();
}
