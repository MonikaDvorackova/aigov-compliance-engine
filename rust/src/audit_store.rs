use crate::schema::EvidenceEvent;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};

const GENESIS: &str = "GENESIS";

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

fn read_last_hash(log_path: &str) -> Result<String, String> {
    let f = match File::open(log_path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(GENESIS.to_string()),
        Err(e) => return Err(e.to_string()),
    };

    let reader = BufReader::new(f);
    let mut last: Option<String> = None;

    for line in reader.lines() {
        let l = line.map_err(|e| e.to_string())?;
        let t = l.trim();
        if t.is_empty() {
            continue;
        }
        let rec: StoredRecord = serde_json::from_str(t).map_err(|e| e.to_string())?;
        last = Some(rec.record_hash);
    }

    Ok(last.unwrap_or_else(|| GENESIS.to_string()))
}

pub fn append_record(log_path: &str, event: EvidenceEvent) -> Result<StoredRecord, String> {
    let prev_hash = read_last_hash(log_path)?;
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

    Ok(rec)
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
