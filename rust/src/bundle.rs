use crate::audit_store::StoredRecord;
use crate::schema::EvidenceEvent;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufRead, BufReader};

pub fn collect_events_for_run(log_path: &str, run_id: &str) -> Result<Vec<EvidenceEvent>, String> {
    let f = match File::open(log_path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(format!("log not found: {}", log_path));
        }
        Err(e) => return Err(e.to_string()),
    };

    let reader = BufReader::new(f);
    let mut out: Vec<EvidenceEvent> = Vec::new();

    for line in reader.lines() {
        let l = line.map_err(|e| e.to_string())?;
        if l.trim().is_empty() {
            continue;
        }

        let rec: StoredRecord = serde_json::from_str(&l).map_err(|e| e.to_string())?;

        if rec.event.run_id == run_id {
            out.push(rec.event);
        }
    }

    // hezké exporty a stabilní pořadí
    out.sort_by(|a, b| a.ts_utc.cmp(&b.ts_utc));

    Ok(out)
}

pub fn find_model_artifact_path(events: &[EvidenceEvent]) -> Option<String> {
    for e in events.iter().rev() {
        if e.event_type == "model_promoted" {
            if let Some(ap) = e.payload.get("artifact_path").and_then(|v| v.as_str()) {
                if !ap.trim().is_empty() {
                    return Some(ap.to_string());
                }
            }
        }
    }
    None
}

fn canonical_bundle_json(
    run_id: &str,
    policy_version: &str,
    log_path: &str,
    model_artifact_path: Option<&str>,
    events: &[EvidenceEvent],
) -> serde_json::Value {
    serde_json::json!({
        "ok": true,
        "run_id": run_id,
        "policy_version": policy_version,
        "log_path": log_path,
        "model_artifact_path": model_artifact_path,
        "events": events
    })
}

pub fn bundle_sha256(
    run_id: &str,
    policy_version: &str,
    log_path: &str,
    model_artifact_path: Option<&str>,
    events: &[EvidenceEvent],
) -> String {
    let v = canonical_bundle_json(run_id, policy_version, log_path, model_artifact_path, events);
    let bytes = serde_json::to_vec(&v).expect("serialize bundle");
    let mut h = Sha256::new();
    h.update(bytes);
    let out = h.finalize();
    hex::encode(out)
}
