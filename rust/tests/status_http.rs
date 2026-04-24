//! GET `/status` — basic service status with environment and policy version.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

use aigov_audit::govai_api;
use aigov_audit::govai_environment::GovaiEnvironment;

#[tokio::test]
async fn status_includes_environment_and_policy_version() {
    let app: Router = govai_api::core_router("v0.5_test", GovaiEnvironment::Staging);

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
    assert_eq!(v["environment"], "staging");
}

#[tokio::test]
async fn status_defaults_shape_for_dev() {
    let app: Router = govai_api::core_router("v0.5_dev", GovaiEnvironment::Dev);

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
    assert_eq!(v["policy_version"], "v0.5_dev");
    assert_eq!(v["environment"], "dev");
}
