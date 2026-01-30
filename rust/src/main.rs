mod audit_store;
mod bundle;
mod policy;
mod schema;

use axum::{extract::Query, routing::get, routing::post, Json, Router};
use schema::EvidenceEvent;
use serde::Deserialize;
use serde_json::json;
use std::net::SocketAddr;

const LOG_PATH: &str = "audit_log.jsonl";
const POLICY_VERSION: &str = "v0.4_human_approval";

#[derive(Deserialize)]
struct BundleQuery {
  run_id: String,
}

async fn ingest(Json(event): Json<EvidenceEvent>) -> Json<serde_json::Value> {
  if let Err(e) = policy::enforce(&event, LOG_PATH) {
    return Json(json!({ "ok": false, "error": e, "policy_version": POLICY_VERSION }));
  }

  match audit_store::append_record(LOG_PATH, event) {
    Ok(rec) => Json(json!({ "ok": true, "record_hash": rec.record_hash, "policy_version": POLICY_VERSION })),
    Err(e) => Json(json!({ "ok": false, "error": e, "policy_version": POLICY_VERSION })),
  }
}

async fn verify() -> Json<serde_json::Value> {
  match audit_store::verify_chain(LOG_PATH) {
    Ok(_) => Json(json!({ "ok": true, "policy_version": POLICY_VERSION })),
    Err(e) => Json(json!({ "ok": false, "error": e, "policy_version": POLICY_VERSION })),
  }
}

async fn status() -> Json<serde_json::Value> {
  Json(json!({ "ok": true, "policy_version": POLICY_VERSION }))
}

async fn bundle(Query(q): Query<BundleQuery>) -> Json<serde_json::Value> {
  match bundle::collect_events_for_run(LOG_PATH, &q.run_id) {
    Ok(events) => {
      let artifact_path = bundle::find_model_artifact_path(&events);
      Json(json!({
        "ok": true,
        "run_id": q.run_id,
        "policy_version": POLICY_VERSION,
        "log_path": format!("rust/{}", LOG_PATH),
        "model_artifact_path": artifact_path,
        "events": events
      }))
    }
    Err(e) => Json(json!({ "ok": false, "error": e, "policy_version": POLICY_VERSION })),
  }
}

#[tokio::main]
async fn main() {
  let app = Router::new()
    .route("/evidence", post(ingest))
    .route("/verify", get(verify))
    .route("/status", get(status))
    .route("/bundle", get(bundle));

  let addr = SocketAddr::from(([127, 0, 0, 1], 8088));
  println!("aigov_audit listening on http://{}", addr);

  axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app)
    .await
    .unwrap();
}
