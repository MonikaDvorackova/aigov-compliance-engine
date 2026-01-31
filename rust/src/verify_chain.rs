use crate::audit_store::StoredRecord;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufRead, BufReader};

fn sha256_hex_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let out = hasher.finalize();
    hex::encode(out)
}

fn compute_record_hash(prev_hash: &str, event_json: &str) -> String {
    let mut bytes = Vec::with_capacity(prev_hash.len() + 1 + event_json.len());
    bytes.extend_from_slice(prev_hash.as_bytes());
    bytes.push(b'\n');
    bytes.extend_from_slice(event_json.as_bytes());
    sha256_hex_bytes(&bytes)
}

// Verify each record_hash from (prev_hash + "\n" + event_json_as_stored)
pub fn verify_chain(log_path: &str) -> Result<(), String> {
    let f = File::open(log_path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(f);

    let mut expected_prev = "GENESIS".to_string();
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

        // IMPORTANT: use the stored JSON bytes, do not reserialize a struct
        let recomputed = compute_record_hash(&rec.prev_hash, &rec.event_json);

        if rec.record_hash != recomputed {
            return Err(format!(
                "hash_chain_broken at line {}: record_hash mismatch expected={} actual={}",
                line_no, recomputed, rec.record_hash
            ));
        }

        expected_prev = rec.record_hash.clone();
    }

    Ok(())
}
