use crate::schema::EvidenceEvent;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Integration / manual tests only: when `AIGOV_TEST_APPEND_FAIL=1`, [`append_record`] errors before I/O.
fn append_fail_test_hook_active() -> bool {
    matches!(
        std::env::var("AIGOV_TEST_APPEND_FAIL").as_deref(),
        Ok("1") | Ok("true")
    )
}

const GENESIS: &str = "GENESIS";

static LEDGER_LOCKS: Lazy<Mutex<HashMap<String, Arc<Mutex<()>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredRecord {
    pub prev_hash: String,
    pub record_hash: String,
    pub event_json: String,
}

fn sha256_hex(input: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input);
    let out = hasher.finalize();
    hex::encode(out)
}

fn compute_record_hash(prev_hash: &str, event_json: &str) -> String {
    let mut bytes = Vec::with_capacity(prev_hash.len() + 1 + event_json.len());
    bytes.extend_from_slice(prev_hash.as_bytes());
    bytes.push(b'\n');
    bytes.extend_from_slice(event_json.as_bytes());
    sha256_hex(&bytes)
}

fn canonical_ledger_key(log_path: &str) -> Result<String, String> {
    let p = Path::new(log_path);
    if let Ok(canon) = std::fs::canonicalize(p) {
        return Ok(canon.to_string_lossy().to_string());
    }

    let parent = p.parent().unwrap_or_else(|| Path::new("."));
    let parent_canon = std::fs::canonicalize(parent).map_err(|e| e.to_string())?;
    let joined: PathBuf = parent_canon.join(p.file_name().unwrap_or_default());
    Ok(joined.to_string_lossy().to_string())
}

fn lock_for_ledger(log_path: &str) -> Result<Arc<Mutex<()>>, String> {
    let key = canonical_ledger_key(log_path)?;
    let mut map = LEDGER_LOCKS.lock().map_err(|_| "ledger lock poisoned".to_string())?;
    Ok(map
        .entry(key)
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone())
}

pub fn append_record(log_path: &str, event: EvidenceEvent) -> Result<StoredRecord, String> {
    Ok(append_record_atomic_with_run_count(log_path, event)?.0)
}

/// Atomically append a record to the ledger with single-writer semantics per ledger path.
/// Returns `(stored_record, pre_count_for_run_id)` on success.
pub fn append_record_atomic_with_run_count(
    log_path: &str,
    event: EvidenceEvent,
) -> Result<(StoredRecord, usize), String> {
    if append_fail_test_hook_active() {
        return Err("test_simulated_append_failure".to_string());
    }

    let lock = lock_for_ledger(log_path)?;
    let _guard = lock.lock().map_err(|_| "ledger lock poisoned".to_string())?;

    // Critical section (single-writer per ledger):
    // 1) read existing events for the run
    // 2) reject duplicate event_id
    // 3) read last hash
    // 4) write record
    // 5) flush/sync
    let (prev_hash, pre_count) = scan_run_and_last_hash_and_reject_duplicate(
        log_path,
        &event.run_id,
        &event.event_id,
    )?;

    let event_json = serde_json::to_string(&event).map_err(|e| e.to_string())?;
    let record_hash = compute_record_hash(&prev_hash, &event_json);

    let rec = StoredRecord {
        prev_hash,
        record_hash,
        event_json,
    };

    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|e| e.to_string())?;

    let line = serde_json::to_string(&rec).map_err(|e| e.to_string())?;
    f.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    f.write_all(b"\n").map_err(|e| e.to_string())?;

    f.flush().map_err(|e| e.to_string())?;
    // Best-effort durable semantics: sync file data and metadata as supported.
    // If sync fails, surface the error (do not silently continue).
    f.sync_data().map_err(|e| e.to_string())?;

    Ok((rec, pre_count))
}

fn scan_run_and_last_hash_and_reject_duplicate(
    log_path: &str,
    run_id: &str,
    event_id: &str,
) -> Result<(String, usize), String> {
    let f = match File::open(log_path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok((GENESIS.to_string(), 0)),
        Err(e) => return Err(e.to_string()),
    };

    let reader = BufReader::new(f);
    let mut last: Option<String> = None;
    let mut pre_count: usize = 0;

    for line in reader.lines() {
        let l = line.map_err(|e| e.to_string())?;
        let t = l.trim();
        if t.is_empty() {
            continue;
        }
        let rec: StoredRecord = serde_json::from_str(t).map_err(|e| e.to_string())?;
        last = Some(rec.record_hash.clone());

        let ev: EvidenceEvent = serde_json::from_str(&rec.event_json).map_err(|e| e.to_string())?;
        if ev.run_id == run_id {
            if ev.event_id == event_id {
                return Err(format!(
                    "duplicate event_id for run_id: event_id={} run_id={}",
                    event_id, run_id
                ));
            }
            pre_count += 1;
        }
    }

    Ok((last.unwrap_or_else(|| GENESIS.to_string()), pre_count))
}

pub fn verify_chain(log_path: &str) -> Result<(), String> {
    let f = File::open(log_path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(f);

    let mut expected_prev = GENESIS.to_string();
    let mut line_no: usize = 0;

    for line in reader.lines() {
        let l = line.map_err(|e| e.to_string())?;
        let t = l.trim();
        if t.is_empty() {
            continue;
        }
        line_no += 1;

        let rec: StoredRecord = serde_json::from_str(t).map_err(|e| e.to_string())?;

        if rec.prev_hash != expected_prev {
            return Err(format!(
                "hash_chain_broken at line {}: prev_hash mismatch expected={} actual={}",
                line_no, expected_prev, rec.prev_hash
            ));
        }

        let expected_hash = compute_record_hash(&rec.prev_hash, &rec.event_json);
        if rec.record_hash != expected_hash {
            return Err(format!(
                "hash_chain_broken at line {}: record_hash mismatch expected={} actual={}",
                line_no, expected_hash, rec.record_hash
            ));
        }

        expected_prev = rec.record_hash.clone();
    }

    Ok(())
}

/// All append-only log records for a `run_id`, in file order (chain order).
pub fn collect_stored_records_for_run(
    log_path: &str,
    run_id: &str,
) -> Result<Vec<StoredRecord>, String> {
    let f = File::open(log_path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            format!("log not found: {}", log_path)
        } else {
            e.to_string()
        }
    })?;

    let reader = BufReader::new(f);
    let mut out: Vec<StoredRecord> = Vec::new();

    for line in reader.lines() {
        let l = line.map_err(|e| e.to_string())?;
        let t = l.trim();
        if t.is_empty() {
            continue;
        }

        let rec: StoredRecord = serde_json::from_str(t).map_err(|e| e.to_string())?;
        let ev: EvidenceEvent = serde_json::from_str(&rec.event_json).map_err(|e| e.to_string())?;
        if ev.run_id == run_id {
            out.push(rec);
        }
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::Arc;
    use std::thread;

    fn mk_event(run_id: &str, event_id: &str, ts: &str) -> EvidenceEvent {
        EvidenceEvent {
            event_id: event_id.to_string(),
            event_type: "test".to_string(),
            ts_utc: ts.to_string(),
            actor: "tester".to_string(),
            system: "unit".to_string(),
            run_id: run_id.to_string(),
            environment: None,
            payload: json!({"k":"v"}),
        }
    }

    #[test]
    fn concurrent_distinct_events_preserve_hash_chain() {
        let dir = tempfile::tempdir().expect("tempdir");
        let log_path = dir.path().join("ledger.jsonl");
        let log_path = log_path.to_string_lossy().to_string();

        let run_id = "r1";
        let n: usize = 32;
        let p = Arc::new(log_path);
        let mut handles = Vec::with_capacity(n);
        for i in 0..n {
            let p1 = Arc::clone(&p);
            handles.push(thread::spawn(move || {
                let ev = mk_event(run_id, &format!("e{i}"), &format!("2026-01-01T00:00:{i:02}Z"));
                append_record(&p1, ev).expect("append");
            }));
        }
        for h in handles {
            h.join().expect("thread join");
        }

        verify_chain(&p).expect("chain valid");
    }

    #[test]
    fn concurrent_duplicate_event_id_is_rejected_deterministically() {
        let dir = tempfile::tempdir().expect("tempdir");
        let log_path = dir.path().join("ledger.jsonl");
        let log_path = log_path.to_string_lossy().to_string();

        let run_id = "rdup";
        let event_id = "same";
        let n: usize = 16;
        let p = Arc::new(log_path);
        let mut handles = Vec::with_capacity(n);

        for i in 0..n {
            let p1 = Arc::clone(&p);
            handles.push(thread::spawn(move || {
                let ev = mk_event(run_id, event_id, &format!("2026-01-01T00:00:{i:02}Z"));
                append_record(&p1, ev)
            }));
        }

        let mut ok = 0usize;
        let mut dup = 0usize;
        for h in handles {
            match h.join().expect("thread join") {
                Ok(_) => ok += 1,
                Err(e) => {
                    if e.contains("duplicate event_id for run_id") {
                        dup += 1;
                    } else {
                        panic!("unexpected error: {e}");
                    }
                }
            }
        }
        assert_eq!(ok, 1, "exactly one append should succeed");
        assert_eq!(dup, n - 1, "all other appends should be rejected as duplicates");

        let stored = collect_stored_records_for_run(&p, run_id).expect("collect records");
        let mut matches = 0usize;
        for rec in stored {
            let ev: EvidenceEvent =
                serde_json::from_str(&rec.event_json).expect("parse event_json");
            if ev.event_id == event_id {
                matches += 1;
            }
        }
        assert_eq!(matches, 1, "ledger must contain exactly one duplicate event_id");
        verify_chain(&p).expect("chain valid");
    }
}
