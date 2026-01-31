use crate::audit_store::StoredRecord;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufRead, BufReader};

fn sha256_hex(s: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    let out = hasher.finalize();
    hex::encode(out)
}

// Recompute each record_hash from (prev_hash + "\n" + canonical_event_json)
pub fn verify_chain(log_path: &str) -> Result<(), String> {
    let f = File::open(log_path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(f);

    let mut expected_prev = "GENESIS".to_string();
    let mut line_no: usize = 0;

    for line in reader.lines() {
        line_no += 1;
        let l = line.map_err(|e| e.to_string())?;
        let rec: StoredRecord = serde_json::from_str(&l).map_err(|e| e.to_string())?;

        if rec.prev_hash != expected_prev {
            return Err(format!(
                "hash_chain_broken at line {}: prev_hash mismatch expected={} actual={}",
                line_no, expected_prev, rec.prev_hash
            ));
        }

        let event_json = serde_json::to_string(&rec.event).map_err(|e| e.to_string())?;
        let recomputed = sha256_hex(&format!("{}\n{}", rec.prev_hash, event_json));

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
