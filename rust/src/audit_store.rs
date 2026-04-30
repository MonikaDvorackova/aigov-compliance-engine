use crate::schema::EvidenceEvent;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Seek, SeekFrom, Write};
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrailingCorruption {
    pub line_no: usize,
    pub byte_offset_start: u64,
    pub byte_offset_end: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LedgerScanDiagnostics {
    pub trailing_corruption: Option<TrailingCorruption>,
}

#[derive(Debug, Clone)]
struct LedgerScan {
    records: Vec<StoredRecord>,
    diagnostics: LedgerScanDiagnostics,
    /// Byte offset immediately after the last valid (or ignorable blank) line.
    last_valid_byte_end: u64,
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

fn ensure_parent_dir_exists(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    let parent = match p.parent() {
        Some(pp) if !pp.as_os_str().is_empty() && pp != Path::new(".") => pp,
        _ => return Ok(()),
    };
    std::fs::create_dir_all(parent).map_err(|e| {
        format!(
            "Failed to create ledger parent directory {}: {e}",
            parent.display()
        )
    })?;
    Ok(())
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

    // Ensure the ledger directory exists *before* we canonicalize for locking or open the file.
    // This avoids surprising "No such file or directory" failures when GOVAI_LEDGER_DIR points to
    // a not-yet-created path (common in CI/container environments).
    ensure_parent_dir_exists(log_path)?;

    let lock = lock_for_ledger(log_path)?;
    let _guard = lock.lock().map_err(|_| "ledger lock poisoned".to_string())?;

    // Critical section (single-writer per ledger):
    // 1) read existing events for the run
    // 2) reject duplicate event_id
    // 3) read last hash
    // 4) write record
    // 5) flush/sync
    // If a crash happened mid-append, a trailing partial JSONL line can remain.
    // Repair it deterministically under the same ledger lock before scanning hashes.
    let repaired = repair_trailing_partial_record(log_path)?;
    if repaired {
        eprintln!(
            "ledger_repair: truncated recoverable trailing partial record for {}",
            log_path
        );
    }

    let (prev_hash, pre_count) =
        scan_run_and_last_hash_and_reject_duplicate(log_path, &event.run_id, &event.event_id)?;

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

/// Scan a JSONL ledger file and tolerate exactly one trailing partial/corrupted line.
///
/// Behavior:
/// - Valid JSON lines parse into [`StoredRecord`].
/// - Blank/whitespace-only lines are ignored.
/// - If a JSON parse error occurs on the final line (EOF), it is treated as a
///   *recoverable trailing corruption*: it is ignored for scans but reported in diagnostics.
/// - If a JSON parse error occurs before the final line, it is treated as *hard corruption*
///   and scanning fails.
fn scan_ledger_records_tolerant(log_path: &str) -> Result<LedgerScan, String> {
    let f = match File::open(log_path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(LedgerScan {
                records: Vec::new(),
                diagnostics: LedgerScanDiagnostics {
                    trailing_corruption: None,
                },
                last_valid_byte_end: 0,
            });
        }
        Err(e) => return Err(e.to_string()),
    };

    let mut reader = BufReader::new(f);
    let mut buf: Vec<u8> = Vec::new();
    let mut records: Vec<StoredRecord> = Vec::new();
    let mut offset: u64 = 0;
    let mut last_valid_byte_end: u64 = 0;
    let mut line_no: usize = 0;
    let mut trailing: Option<TrailingCorruption> = None;

    loop {
        buf.clear();
        let start_offset = offset;
        let n = reader
            .read_until(b'\n', &mut buf)
            .map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        offset = offset
            .checked_add(n as u64)
            .ok_or_else(|| "ledger scan offset overflow".to_string())?;

        // Remove UTF-8 BOM or ensure UTF-8? Ledger is expected to be UTF-8 JSON.
        let line = std::str::from_utf8(&buf).map_err(|e| {
            format!(
                "ledger contains non-utf8 bytes at offset {}: {}",
                start_offset, e
            )
        })?;
        let t = line.trim();
        if t.is_empty() {
            // Blank lines are ignorable but still "valid" from a truncation safety perspective.
            last_valid_byte_end = offset;
            continue;
        }

        line_no += 1;
        match serde_json::from_str::<StoredRecord>(t) {
            Ok(rec) => {
                records.push(rec);
                last_valid_byte_end = offset;
            }
            Err(e) => {
                // Determine whether this is the final line (EOF).
                let at_eof = reader.fill_buf().map_err(|e| e.to_string())?.is_empty();
                if at_eof {
                    trailing = Some(TrailingCorruption {
                        line_no,
                        byte_offset_start: start_offset,
                        byte_offset_end: offset,
                    });
                    // Do not update last_valid_byte_end; do not push a record.
                    // Ignore for scan results.
                    break;
                }
                return Err(format!(
                    "ledger corruption before EOF at line {} (offset {}): {}",
                    line_no, start_offset, e
                ));
            }
        }
    }

    Ok(LedgerScan {
        records,
        diagnostics: LedgerScanDiagnostics {
            trailing_corruption: trailing,
        },
        last_valid_byte_end,
    })
}

/// Public/shared ledger scan entrypoint.
///
/// Returns `(records, diagnostics)`. If `diagnostics.trailing_corruption` is present,
/// the returned `records` contain only the valid committed records before the corrupted tail.
pub fn scan_ledger_records(log_path: &str) -> Result<(Vec<StoredRecord>, LedgerScanDiagnostics), String> {
    let scan = scan_ledger_records_tolerant(log_path)?;
    Ok((scan.records, scan.diagnostics))
}

/// Repair a JSONL ledger that contains exactly one trailing partial/corrupted line.
///
/// Returns:
/// - `Ok(true)` if a trailing partial record was detected and truncated.
/// - `Ok(false)` if the ledger is already clean (or missing).
/// - `Err(_)` if non-tail corruption exists.
///
/// IMPORTANT: callers must hold the per-ledger lock (see [`lock_for_ledger`]) so truncation
/// cannot race with concurrent appends.
pub fn repair_trailing_partial_record(log_path: &str) -> Result<bool, String> {
    // If the file doesn't exist, nothing to repair.
    let mut f = match OpenOptions::new().read(true).write(true).open(log_path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(e.to_string()),
    };

    let scan = scan_ledger_records_tolerant(log_path)?;

    let trailing = match scan.diagnostics.trailing_corruption {
        Some(t) => t,
        None => return Ok(false),
    };

    // Sanity: never truncate valid bytes, only remove the trailing invalid tail.
    // `last_valid_byte_end` points to the last known-good boundary.
    let new_len = scan.last_valid_byte_end;
    if new_len > trailing.byte_offset_start {
        // This can happen if the last valid line had trailing whitespace and was considered valid.
        // Truncate to the recorded last-valid byte end regardless.
    }

    f.set_len(new_len).map_err(|e| e.to_string())?;
    // Ensure the file cursor doesn't point past EOF for any subsequent operations.
    f.seek(SeekFrom::End(0)).map_err(|e| e.to_string())?;
    f.flush().map_err(|e| e.to_string())?;
    f.sync_data().map_err(|e| e.to_string())?;

    Ok(true)
}

fn scan_run_and_last_hash_and_reject_duplicate(
    log_path: &str,
    run_id: &str,
    event_id: &str,
) -> Result<(String, usize), String> {
    let scan = scan_ledger_records_tolerant(log_path)?;
    let mut last: Option<String> = None;
    let mut pre_count: usize = 0;

    for rec in scan.records {
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
    let mut expected_prev = GENESIS.to_string();
    let mut line_no: usize = 0;
    let scan = scan_ledger_records_tolerant(log_path)?;

    for rec in scan.records {
        line_no += 1;

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
    // Preserve prior behavior: missing file is an error for this call.
    let _ = File::open(log_path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            format!("log not found: {}", log_path)
        } else {
            e.to_string()
        }
    })?;

    let scan = scan_ledger_records_tolerant(log_path)?;

    let mut out: Vec<StoredRecord> = Vec::new();
    for rec in scan.records {
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

    #[test]
    fn append_creates_missing_parent_dir_before_canonicalization_and_open() {
        let dir = tempfile::tempdir().expect("tempdir");
        let nested = dir.path().join("missing_parent").join("ledger.jsonl");
        assert!(
            !nested.parent().unwrap().exists(),
            "precondition: parent dir should not exist"
        );

        let log_path = nested.to_string_lossy().to_string();
        let ev = mk_event("r_parent", "e1", "2026-01-01T00:00:00Z");
        append_record(&log_path, ev).expect("append should create parent dir and succeed");

        assert!(
            nested.parent().unwrap().exists(),
            "append should create missing parent directory"
        );
        assert!(nested.exists(), "append should create ledger file");
        verify_chain(&log_path).expect("chain valid");
    }

    #[test]
    fn trailing_partial_line_is_repaired_and_append_succeeds() {
        let dir = tempfile::tempdir().expect("tempdir");
        let log_path = dir.path().join("ledger.jsonl");
        let log_path_s = log_path.to_string_lossy().to_string();

        // Seed a valid record.
        let ev1 = mk_event("r1", "e1", "2026-01-01T00:00:00Z");
        append_record(&log_path_s, ev1).expect("append ev1");

        let before = std::fs::read_to_string(&log_path).expect("read");
        assert!(before.lines().count() >= 1);

        // Simulate a crash mid-append by writing a partial JSON object without newline.
        {
            let mut f = OpenOptions::new()
                .append(true)
                .open(&log_path)
                .expect("open append");
            f.write_all(b"{\"prev_hash\":").expect("write partial");
            f.flush().expect("flush");
        }

        // Append should repair tail and succeed.
        let ev2 = mk_event("r1", "e2", "2026-01-01T00:00:01Z");
        append_record(&log_path_s, ev2).expect("append ev2");

        // Chain should still be valid.
        verify_chain(&log_path_s).expect("chain valid after repair+append");

        // Scan should report no trailing corruption and yield exactly two records.
        let (records, diag) = scan_ledger_records(&log_path_s).expect("scan");
        assert!(
            diag.trailing_corruption.is_none(),
            "expected trailing corruption to be repaired"
        );
        assert_eq!(records.len(), 2, "expected exactly two stored records");

        // File ends with a newline (JSONL invariant after a successful append).
        let after_bytes = std::fs::read(&log_path).expect("read bytes");
        assert!(
            after_bytes.last() == Some(&b'\n'),
            "expected ledger to end with newline after append"
        );
    }

    #[test]
    fn non_tail_corruption_still_fails() {
        let dir = tempfile::tempdir().expect("tempdir");
        let log_path = dir.path().join("ledger.jsonl");

        // Two valid records.
        let ev1 = mk_event("r1", "e1", "2026-01-01T00:00:00Z");
        let ev2 = mk_event("r1", "e2", "2026-01-01T00:00:01Z");
        append_record(log_path.to_str().unwrap(), ev1).expect("append ev1");
        append_record(log_path.to_str().unwrap(), ev2).expect("append ev2");

        // Corrupt the middle by injecting a bad line between them.
        let raw = std::fs::read_to_string(&log_path).expect("read");
        let mut lines: Vec<&str> = raw.lines().collect();
        assert!(lines.len() >= 2);
        lines.insert(1, "{not json}");
        let rebuilt = lines.join("\n") + "\n";
        std::fs::write(&log_path, rebuilt).expect("write corrupted");

        let err = verify_chain(log_path.to_str().unwrap()).expect_err("must fail");
        assert!(
            err.contains("ledger corruption before EOF"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn trailing_partial_line_is_detected_by_scan() {
        let dir = tempfile::tempdir().expect("tempdir");
        let log_path = dir.path().join("ledger.jsonl");
        let log_path_s = log_path.to_string_lossy().to_string();

        // Seed a valid record.
        let ev1 = mk_event("r1", "e1", "2026-01-01T00:00:00Z");
        append_record(&log_path_s, ev1).expect("append ev1");

        // Add a partial tail.
        {
            let mut f = OpenOptions::new()
                .append(true)
                .open(&log_path)
                .expect("open append");
            f.write_all(b"{\"garbage\":").expect("write partial");
            f.flush().expect("flush");
        }

        let (_records, diag) = scan_ledger_records(&log_path_s).expect("scan ok");
        assert!(
            diag.trailing_corruption.is_some(),
            "expected trailing corruption diagnostics"
        );
    }

    #[test]
    fn repair_errors_on_non_tail_corruption() {
        let dir = tempfile::tempdir().expect("tempdir");
        let log_path = dir.path().join("ledger.jsonl");
        let log_path_s = log_path.to_string_lossy().to_string();

        let ev1 = mk_event("r1", "e1", "2026-01-01T00:00:00Z");
        let ev2 = mk_event("r1", "e2", "2026-01-01T00:00:01Z");
        append_record(&log_path_s, ev1).expect("append ev1");
        append_record(&log_path_s, ev2).expect("append ev2");

        let raw = std::fs::read_to_string(&log_path).expect("read");
        let mut lines: Vec<&str> = raw.lines().collect();
        lines.insert(1, "{not json}");
        let rebuilt = lines.join("\n") + "\n";
        std::fs::write(&log_path, rebuilt).expect("write corrupted");

        let err = repair_trailing_partial_record(&log_path_s).expect_err("must error");
        assert!(
            err.contains("ledger corruption before EOF"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn duplicate_event_id_still_rejected_after_tail_repair() {
        let dir = tempfile::tempdir().expect("tempdir");
        let log_path = dir.path().join("ledger.jsonl");
        let log_path_s = log_path.to_string_lossy().to_string();

        // Seed one valid record.
        let ev_seed = mk_event("rdup2", "seed", "2026-01-01T00:00:00Z");
        append_record(&log_path_s, ev_seed).expect("append seed");

        // Add a partial tail to simulate crash.
        {
            let mut f = OpenOptions::new()
                .append(true)
                .open(&log_path)
                .expect("open append");
            f.write_all(b"{").expect("write partial");
            f.flush().expect("flush");
        }

        // Concurrent duplicate event_id appends.
        let n: usize = 8;
        let p = Arc::new(log_path_s);
        let mut handles = Vec::with_capacity(n);
        for i in 0..n {
            let p1 = Arc::clone(&p);
            handles.push(thread::spawn(move || {
                let ev = mk_event("rdup2", "same", &format!("2026-01-01T00:00:{i:02}Z"));
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

        verify_chain(&p).expect("chain valid");
    }
}
