use crate::audit_store::StoredRecord;
use serde_json::Value;
use std::fs::File;
use std::io::{BufRead, BufReader};

pub fn collect_events_for_run(log_path: &str, run_id: &str) -> Result<Vec<Value>, String> {
  let f = match File::open(log_path) {
    Ok(f) => f,
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
    Err(e) => return Err(e.to_string()),
  };

  let reader = BufReader::new(f);
  let mut out: Vec<Value> = vec![];

  for line in reader.lines() {
    let l = line.map_err(|e| e.to_string())?;
    let rec: StoredRecord = serde_json::from_str(&l).map_err(|e| e.to_string())?;

    if rec.event.run_id == run_id {
      out.push(serde_json::to_value(&rec.event).map_err(|e| e.to_string())?);
    }
  }

  Ok(out)
}

pub fn find_model_artifact_path(events: &[Value]) -> Option<String> {
  for ev in events {
    let et = ev.get("event_type").and_then(|v| v.as_str())?;
    if et != "model_promoted" {
      continue;
    }
    let p = ev.get("payload")?;
    let ap = p.get("artifact_path").and_then(|v| v.as_str())?;
    return Some(ap.to_string());
  }
  None
}
