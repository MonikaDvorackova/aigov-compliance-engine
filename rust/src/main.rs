mod audit_store;
mod bundle;
mod policy;
mod schema;
mod verify_chain;

use axum::{extract::Query, routing::get, routing::post, Json, Router};
use schema::EvidenceEvent;
use serde::Deserialize;
use serde_json::json;
use std::collections::HashSet;
use std::net::SocketAddr;

const LOG_PATH: &str = "audit_log.jsonl";
const POLICY_VERSION: &str = "v0.4_human_approval";

#[derive(Deserialize)]
struct BundleQuery {
    run_id: String,
}

#[derive(Deserialize)]
struct BundleHashQuery {
    run_id: String,
}

/// Best effort guard: prevent duplicated event_id per run_id.
/// Implementation reads existing run events and checks for matching event_id.
/// This is deterministic and sufficient for a single-process local audit server.
/// If you later run multiple instances, move this check into audit_store as an atomic append guard.
fn reject_duplicate_event_id(log_path: &str, event: &EvidenceEvent) -> Result<(), String> {
    let existing = bundle::collect_events_for_run(log_path, &event.run_id)?;
    if existing.iter().any(|e| e.event_id == event.event_id) {
        return Err(format!(
            "duplicate event_id for run_id: event_id={} run_id={}",
            event.event_id, event.run_id
        ));
    }
    Ok(())
}

/// Ensure bundle output is stable for auditors:
/// - if there are duplicate event_id values, keep only the latest by ts_utc
/// - then sort by ts_utc ascending, tie-break by event_type and event_id
fn canonicalize_events(mut events: Vec<EvidenceEvent>) -> Vec<EvidenceEvent> {
    // Deduplicate by event_id by keeping the latest timestamp per id.
    // We do this via a set + reverse scan to keep the last occurrence.
    let mut seen: HashSet<String> = HashSet::new();
    events.sort_by(|a, b| a.ts_utc.cmp(&b.ts_utc));
    let mut out_rev: Vec<EvidenceEvent> = Vec::with_capacity(events.len());
    for e in events.into_iter().rev() {
        if seen.insert(e.event_id.clone()) {
            out_rev.push(e);
        }
    }
    out_rev.reverse();

    // Final stable ordering
    out_rev.sort_by(|a, b| {
        a.ts_utc
            .cmp(&b.ts_utc)
            .then_with(|| a.event_type.cmp(&b.event_type))
            .then_with(|| a.event_id.cmp(&b.event_id))
    });

    out_rev
}

async fn ingest(
    Json(event): Json<EvidenceEvent>,
) -> (axum::http::StatusCode, Json<serde_json::Value>) {
    // Enforce policy first
    if let Err(e) = policy::enforce(&event, LOG_PATH) {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": e, "policy_version": POLICY_VERSION })),
        );
    }

    // Idempotency guard: reject duplicate event_id per run_id
    if let Err(e) = reject_duplicate_event_id(LOG_PATH, &event) {
        return (
            axum::http::StatusCode::CONFLICT,
            Json(json!({ "ok": false, "error": e, "policy_version": POLICY_VERSION })),
        );
    }

    match audit_store::append_record(LOG_PATH, event) {
        Ok(rec) => (
            axum::http::StatusCode::OK,
            Json(json!({
                "ok": true,
                "record_hash": rec.record_hash,
                "policy_version": POLICY_VERSION
            })),
        ),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "ok": false, "error": e, "policy_version": POLICY_VERSION })),
        ),
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

async fn bundle_route(Query(q): Query<BundleQuery>) -> Json<serde_json::Value> {
    match bundle::collect_events_for_run(LOG_PATH, &q.run_id) {
        Ok(events) => {
            let events = canonicalize_events(events);
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

async fn bundle_hash_route(Query(q): Query<BundleHashQuery>) -> Json<serde_json::Value> {
    match bundle::collect_events_for_run(LOG_PATH, &q.run_id) {
        Ok(events) => {
            let events = canonicalize_events(events);
            let artifact_path = bundle::find_model_artifact_path(&events);
            let log_path = format!("rust/{}", LOG_PATH);

            // bundle::bundle_sha256 should compute a canonical hash of the bundle content.
            // We ensure the inputs (events ordering and duplicates) are canonical here.
            let digest = bundle::bundle_sha256(
                &q.run_id,
                POLICY_VERSION,
                &log_path,
                artifact_path.as_deref(),
                &events,
            );

            Json(json!({
                "ok": true,
                "run_id": q.run_id,
                "policy_version": POLICY_VERSION,
                "bundle_sha256": digest
            }))
        }
        Err(e) => Json(json!({ "ok": false, "error": e, "policy_version": POLICY_VERSION })),
    }
}

async fn verify_log() -> (axum::http::StatusCode, String) {
    match verify_chain::verify_chain(LOG_PATH) {
        Ok(_) => (axum::http::StatusCode::OK, "{\"ok\":true}".to_string()),
        Err(e) => (
            axum::http::StatusCode::BAD_REQUEST,
            format!(
                "{{\"ok\":false,\"error\":{}}}",
                serde_json::to_string(&e).unwrap()
            ),
        ),
    }
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/evidence", post(ingest))
        .route("/verify", get(verify))
        .route("/status", get(status))
        .route("/bundle", get(bundle_route))
        .route("/bundle-hash", get(bundle_hash_route))
        .route("/verify-log", get(verify_log));

    let addr = SocketAddr::from(([127, 0, 0, 1], 8088));
    println!("aigov_audit listening on http://{}", addr);

    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app)
        .await
        .unwrap();
}
