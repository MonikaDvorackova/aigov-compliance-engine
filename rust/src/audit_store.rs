use crate::schema::EvidenceEvent;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};

#[derive(Debug, Serialize, Deserialize)]
pub struct StoredRecord {
    pub prev_hash: String,
    pub record_hash: String,
    pub event: EvidenceEvent,
}

fn hash_record(prev_hash: &str, event: &EvidenceEvent) -> String {
    let mut hasher = Sha256::new();
    hasher.update(prev_hash.as_bytes());
    hasher.update(serde_json::to_vec(event).expect("serialize").as_slice());
    hex::encode(hasher.finalize())
}

pub fn append_record(path: &str, event: EvidenceEvent) -> Result<StoredRecord, String> {
    let prev_hash = last_hash(path).unwrap_or_else(|| "GENESIS".to_string());
    let record_hash = hash_record(&prev_hash, &event);

    let record = StoredRecord {
        prev_hash,
        record_hash,
        event,
    };

    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;

    let line = serde_json::to_string(&record).map_err(|e| e.to_string())?;
    writeln!(f, "{}", line).map_err(|e| e.to_string())?;

    Ok(record)
}

fn last_hash(path: &str) -> Option<String> {
    let f = File::open(path).ok()?;
    let reader = BufReader::new(f);
    let mut last_line: Option<String> = None;

    for line in reader.lines() {
        if let Ok(l) = line {
            last_line = Some(l);
        }
    }

    let last = last_line?;
    let rec: StoredRecord = serde_json::from_str(&last).ok()?;
    Some(rec.record_hash)
}

pub fn verify_chain(path: &str) -> Result<(), String> {
    let f = match File::open(path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };

    let reader = BufReader::new(f);

    let mut prev_hash = "GENESIS".to_string();
    for line in reader.lines() {
        let l = line.map_err(|e| e.to_string())?;
        let rec: StoredRecord = serde_json::from_str(&l).map_err(|e| e.to_string())?;

        if rec.prev_hash != prev_hash {
            return Err("prev_hash mismatch".to_string());
        }

        let expected = hash_record(&prev_hash, &rec.event);
        if expected != rec.record_hash {
            return Err("record_hash mismatch".to_string());
        }

        prev_hash = rec.record_hash;
    }

    Ok(())
}
