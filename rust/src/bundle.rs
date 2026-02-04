use crate::audit_store::StoredRecord;
use crate::schema::EvidenceEvent;
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::fs::File;
use std::io::{BufRead, BufReader};
use serde::Serialize;

fn canonical_json_bytes<T: Serialize>(value: &T) -> Vec<u8> {
    // serde_json keeps insertion order, but we need canonical ordering
    // Convert to Value, sort keys recursively, then serialize
    let v = serde_json::to_value(value).expect("to_value");
    let sorted = sort_json_value(v);
    serde_json::to_vec(&sorted).expect("to_vec")
}

fn sort_json_value(v: serde_json::Value) -> serde_json::Value {
    match v {
        serde_json::Value::Object(map) => {
            let mut items: Vec<(String, serde_json::Value)> = map.into_iter().collect();
            items.sort_by(|a, b| a.0.cmp(&b.0));
            let mut out = serde_json::Map::new();
            for (k, vv) in items {
                out.insert(k, sort_json_value(vv));
            }
            serde_json::Value::Object(out)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.into_iter().map(sort_json_value).collect())
        }
        other => other,
    }
}

pub fn collect_events_for_run(log_path: &str, run_id: &str) -> Result<Vec<EvidenceEvent>, String> {
    let f = File::open(log_path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            format!("log not found: {}", log_path)
        } else {
            e.to_string()
        }
    })?;

    let reader = BufReader::new(f);
    let mut out: Vec<EvidenceEvent> = Vec::new();

    for line in reader.lines() {
        let l = line.map_err(|e| e.to_string())?;
        let t = l.trim();
        if t.is_empty() {
            continue;
        }

        let rec: StoredRecord = serde_json::from_str(t).map_err(|e| e.to_string())?;

        // Prefer the stored JSON to avoid re serialization differences
        let ev: EvidenceEvent = serde_json::from_str(&rec.event_json).map_err(|e| e.to_string())?;

        if ev.run_id == run_id {
            out.push(ev);
        }
    }

    // Stable ordering for exports and hashing
    out.sort_by(stable_event_order);

    Ok(out)
}

pub fn find_model_artifact_path(events: &[EvidenceEvent]) -> Option<String> {
    for e in events.iter().rev() {
        if e.event_type == "model_promoted" {
            if let Some(ap) = e.payload.get("artifact_path").and_then(|v| v.as_str()) {
                let ap = ap.trim();
                if !ap.is_empty() {
                    return Some(ap.to_string());
                }
            }
        }
    }
    None
}

fn stable_event_order(a: &EvidenceEvent, b: &EvidenceEvent) -> Ordering {
    // primary timestamp
    let t = a.ts_utc.cmp(&b.ts_utc);
    if t != Ordering::Equal {
        return t;
    }

    // secondary event_type
    let et = a.event_type.cmp(&b.event_type);
    if et != Ordering::Equal {
        return et;
    }

    // tertiary event_id
    a.event_id.cmp(&b.event_id)
}

fn canonicalize_json(v: &mut serde_json::Value) {
    match v {
        serde_json::Value::Object(map) => {
            let mut keys: Vec<String> = map.keys().cloned().collect();
            keys.sort();

            let mut new_map = serde_json::Map::with_capacity(map.len());
            for k in keys {
                let mut val = map.remove(&k).unwrap();
                canonicalize_json(&mut val);
                new_map.insert(k, val);
            }
            *map = new_map;
        }
        serde_json::Value::Array(arr) => {
            // Keep array order as is, event order is handled separately
            for x in arr.iter_mut() {
                canonicalize_json(x);
            }
        }
        _ => {}
    }
}

fn canonical_bundle_value(
    run_id: &str,
    policy_version: &str,
    log_path: &str,
    model_artifact_path: Option<&str>,
    events: &[EvidenceEvent],
) -> serde_json::Value {
    let mut v = serde_json::json!({
        "ok": true,
        "run_id": run_id,
        "policy_version": policy_version,
        "log_path": log_path,
        "model_artifact_path": model_artifact_path,
        "events": events
    });

    canonicalize_json(&mut v);
    v
}

pub fn bundle_sha256(
    run_id: &str,
    policy_version: &str,
    log_path: &str,
    model_artifact_path: Option<&str>,
    events: &[EvidenceEvent],
) -> String {
    let v = canonical_bundle_value(
        run_id,
        policy_version,
        log_path,
        model_artifact_path,
        events,
    );

    // Serialize with canonical key ordering
    let bytes = canonical_json_bytes(&v);

    let mut h = Sha256::new();
    h.update(bytes);
    hex::encode(h.finalize())
}
