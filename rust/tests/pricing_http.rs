use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

use aigov_audit::govai_api;
use aigov_audit::govai_environment::GovaiEnvironment;

#[tokio::test]
async fn pricing_endpoint_returns_plans_and_units() {
    let app = govai_api::core_router("test-policy", GovaiEnvironment::Dev);

    let res = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/pricing")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&bytes).expect("json");
    assert_eq!(v["units"]["primary"], "evidence_event");
    assert_eq!(v["units"]["secondary"], "run");
    assert!(v["definitions"]["evidence_event"].as_str().is_some());
    assert!(v["definitions"]["run"].as_str().is_some());
    assert!(v["plans"].is_array());
    assert_eq!(v["plans"].as_array().map(|a| a.len()), Some(3));

    let plans = v["plans"].as_array().unwrap();
    let free = plans.iter().find(|p| p["name"] == "free").unwrap();
    let pro = plans.iter().find(|p| p["name"] == "pro").unwrap();
    let team = plans.iter().find(|p| p["name"] == "team").unwrap();

    let fe = free["evidence_events_per_month"].as_u64().unwrap();
    let pe = pro["evidence_events_per_month"].as_u64().unwrap();
    let te = team["evidence_events_per_month"].as_u64().unwrap();
    assert!(te > pe && pe > fe);

    let fr = free["runs_per_month"].as_u64().unwrap();
    let pr = pro["runs_per_month"].as_u64().unwrap();
    let tr = team["runs_per_month"].as_u64().unwrap();
    assert!(tr > pr && pr > fr);

    let fpr = free["events_per_run"].as_u64().unwrap();
    let ppr = pro["events_per_run"].as_u64().unwrap();
    let tpr = team["events_per_run"].as_u64().unwrap();
    assert!(tpr > ppr && ppr > fpr);
}

