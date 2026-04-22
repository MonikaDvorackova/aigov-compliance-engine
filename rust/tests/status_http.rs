//! GET `/status` — effective policy, environment, and resolved policy source (startup snapshot).

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

use aigov_audit::govai_api;
use aigov_audit::govai_environment::GovaiEnvironment;
use aigov_audit::policy_config::{
    PolicyConfig, PolicySource, PolicySourceKind, ResolvedPolicyConfig,
};

#[tokio::test]
async fn status_includes_environment_and_effective_policy() {
    let config = PolicyConfig {
        require_approval: false,
        block_if_missing_evidence: true,
        require_passed_evaluation_for_promotion: true,
        require_risk_review_for_approval: false,
        require_risk_review_for_promotion: true,
        ..Default::default()
    };
    let at_startup = ResolvedPolicyConfig {
        config: config.clone(),
        source: PolicySource {
            kind: PolicySourceKind::EnvFile,
            path: Some("policy.staging.json".to_string()),
        },
    };
    let app: Router = govai_api::core_router(
        "v0.5_test",
        GovaiEnvironment::Staging,
        at_startup.clone(),
    );

    let res = app
        .oneshot(
            Request::builder()
                .uri("/status")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(v["ok"], true);
    assert_eq!(v["policy_version"], "v0.5_test");
    assert!(v.get("environment").is_some());
    assert_eq!(v["environment"], "staging");
    assert!(v.get("policy").is_some());
    assert!(v["policy"].get("require_approval").is_some());
    assert!(v["policy"].get("block_if_missing_evidence").is_some());
    assert!(v["policy"].get("enforce_approver_allowlist").is_some());
    assert!(v["policy"].get("approver_allowlist").is_some());
    assert_eq!(v["policy"]["require_approval"], config.require_approval);
    assert_eq!(
        v["policy"]["block_if_missing_evidence"],
        config.block_if_missing_evidence
    );
    assert_eq!(
        v["policy"]["require_passed_evaluation_for_promotion"],
        config.require_passed_evaluation_for_promotion
    );
    assert_eq!(
        v["policy"]["require_risk_review_for_approval"],
        config.require_risk_review_for_approval
    );
    assert_eq!(
        v["policy"]["require_risk_review_for_promotion"],
        config.require_risk_review_for_promotion
    );
    assert_eq!(
        v["policy"]["enforce_approver_allowlist"],
        config.enforce_approver_allowlist
    );
    let al: Vec<String> =
        serde_json::from_value(v["policy"]["approver_allowlist"].clone()).unwrap();
    assert_eq!(al, config.approver_allowlist);

    assert!(v["policy"].get("source").is_some());
    assert_eq!(v["policy"]["source"]["kind"], "env_file");
    assert_eq!(v["policy"]["source"]["path"], "policy.staging.json");

    let src_json = v["policy"]["source"].clone();
    let from_status: PolicySource = serde_json::from_value(src_json).unwrap();
    assert_eq!(from_status, at_startup.source);
}

#[tokio::test]
async fn status_defaults_source_shape() {
    let at_startup = ResolvedPolicyConfig::all_defaults();
    let app: Router = govai_api::core_router(
        "v0.5_dev",
        GovaiEnvironment::Dev,
        at_startup.clone(),
    );

    let res = app
        .oneshot(
            Request::builder()
                .uri("/status")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(v["policy"]["source"]["kind"], "defaults");
    assert_eq!(v["policy"]["source"]["path"], Value::Null);
    assert_eq!(v["policy"]["enforce_approver_allowlist"], true);
    assert_eq!(v["policy"]["require_passed_evaluation_for_promotion"], true);
    assert_eq!(v["policy"]["require_risk_review_for_approval"], true);
    assert_eq!(v["policy"]["require_risk_review_for_promotion"], true);
    let al: Vec<String> =
        serde_json::from_value(v["policy"]["approver_allowlist"].clone()).unwrap();
    assert_eq!(al, PolicyConfig::default().approver_allowlist);

    let from_status: PolicySource =
        serde_json::from_value(v["policy"]["source"].clone()).unwrap();
    assert_eq!(from_status, at_startup.source);
}
