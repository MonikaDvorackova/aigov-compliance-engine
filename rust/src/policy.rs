use crate::audit_store::StoredRecord;
use crate::schema::EvidenceEvent;
use std::fs::File;
use std::io::{BufRead, BufReader};

pub fn enforce(event: &EvidenceEvent, log_path: &str) -> Result<(), String> {
  match event.event_type.as_str() {
    "data_registered" => enforce_data_registered(event),
    "model_trained" => enforce_model_trained(event, log_path),
    "evaluation_reported" => enforce_evaluation_reported(event),
    "model_promoted" => enforce_model_promoted(event, log_path),
    _ => Ok(()),
  }
}

fn enforce_data_registered(event: &EvidenceEvent) -> Result<(), String> {
  let p = &event.payload;

  let dataset_ok = p.get("dataset").and_then(|v| v.as_str()).is_some();
  let fp_ok = p
    .get("dataset_fingerprint")
    .and_then(|v| v.as_str())
    .map(|s| !s.trim().is_empty())
    .unwrap_or(false);

  if dataset_ok && fp_ok {
    return Ok(());
  }

  Err(
    "policy_violation: data_registered payload must include dataset(str) and dataset_fingerprint(str)"
      .to_string(),
  )
}

fn enforce_model_trained(event: &EvidenceEvent, log_path: &str) -> Result<(), String> {
  if has_event_type_for_run(&event.run_id, "data_registered", log_path)? {
    return Ok(());
  }

  Err("policy_violation: model_trained requires prior data_registered for the same run_id".to_string())
}

fn enforce_model_promoted(event: &EvidenceEvent, log_path: &str) -> Result<(), String> {
  if has_passed_evaluation(&event.run_id, log_path)? {
    return Ok(());
  }
  Err("policy_violation: model_promoted requires prior evaluation_reported with passed=true".to_string())
}

fn enforce_evaluation_reported(event: &EvidenceEvent) -> Result<(), String> {
  let p = &event.payload;

  let metric_ok = p.get("metric").and_then(|v| v.as_str()).is_some();
  let value_ok = p.get("value").and_then(|v| v.as_f64()).is_some();
  let threshold_ok = p.get("threshold").and_then(|v| v.as_f64()).is_some();
  let passed_ok = p.get("passed").and_then(|v| v.as_bool()).is_some();

  if metric_ok && value_ok && threshold_ok && passed_ok {
    return Ok(());
  }

  Err("policy_violation: evaluation_reported payload must include metric(str), value(number), threshold(number), passed(bool)".to_string())
}

fn has_event_type_for_run(run_id: &str, event_type: &str, log_path: &str) -> Result<bool, String> {
  let f = match File::open(log_path) {
    Ok(f) => f,
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
    Err(e) => return Err(e.to_string()),
  };

  let reader = BufReader::new(f);

  for line in reader.lines() {
    let l = line.map_err(|e| e.to_string())?;
    let rec: StoredRecord = serde_json::from_str(&l).map_err(|e| e.to_string())?;

    if rec.event.run_id != run_id {
      continue;
    }

    if rec.event.event_type == event_type {
      return Ok(true);
    }
  }

  Ok(false)
}

fn has_passed_evaluation(run_id: &str, log_path: &str) -> Result<bool, String> {
  let f = match File::open(log_path) {
    Ok(f) => f,
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
    Err(e) => return Err(e.to_string()),
  };

  let reader = BufReader::new(f);

  for line in reader.lines() {
    let l = line.map_err(|e| e.to_string())?;
    let rec: StoredRecord = serde_json::from_str(&l).map_err(|e| e.to_string())?;

    if rec.event.run_id != run_id {
      continue;
    }

    if rec.event.event_type != "evaluation_reported" {
      continue;
    }

    let passed = rec
      .event
      .payload
      .get("passed")
      .and_then(|v| v.as_bool())
      .unwrap_or(false);

    if passed {
      return Ok(true);
    }
  }

  Ok(false)
}
