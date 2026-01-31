use crate::audit_store::StoredRecord;
use crate::schema::EvidenceEvent;
use std::fs::File;
use std::io::{BufRead, BufReader};

pub fn enforce(event: &EvidenceEvent, log_path: &str) -> Result<(), String> {
    match event.event_type.as_str() {
        "data_registered" => enforce_data_registered(event),
        "model_trained" => enforce_model_trained(event, log_path),
        "evaluation_reported" => enforce_evaluation_reported(event),
        "human_approved" => enforce_human_approved(event),
        "model_promoted" => enforce_model_promoted(event, log_path),
        _ => Ok(()),
    }
}

/* ------------------------- schema checks ------------------------- */

fn enforce_data_registered(event: &EvidenceEvent) -> Result<(), String> {
    let p = &event.payload;

    let dataset_ok = p.get("dataset").and_then(|v| v.as_str()).is_some();
    let fp_ok = p
        .get("dataset_fingerprint")
        .and_then(|v| v.as_str())
        .is_some();

    if dataset_ok && fp_ok {
        Ok(())
    } else {
        Err("policy_violation: data_registered payload must include dataset(str) and dataset_fingerprint(str)"
            .to_string())
    }
}

fn enforce_evaluation_reported(event: &EvidenceEvent) -> Result<(), String> {
    let p = &event.payload;

    let metric_ok = p.get("metric").and_then(|v| v.as_str()).is_some();
    let value_ok = p.get("value").and_then(|v| v.as_f64()).is_some();
    let threshold_ok = p.get("threshold").and_then(|v| v.as_f64()).is_some();
    let passed_ok = p.get("passed").and_then(|v| v.as_bool()).is_some();

    if metric_ok && value_ok && threshold_ok && passed_ok {
        Ok(())
    } else {
        Err("policy_violation: evaluation_reported payload must include metric(str), value(number), threshold(number), passed(bool)"
            .to_string())
    }
}

// Required payload:
// - scope: "model_promoted"
// - decision: "approve" | "reject"
// - approver: string (person or role)
// - justification: string
fn enforce_human_approved(event: &EvidenceEvent) -> Result<(), String> {
    let p = &event.payload;

    let scope_ok = matches!(
        p.get("scope").and_then(|v| v.as_str()),
        Some("model_promoted")
    );

    let decision = p.get("decision").and_then(|v| v.as_str());
    let decision_ok = matches!(decision, Some("approve") | Some("reject"));

    let approver_ok = p.get("approver").and_then(|v| v.as_str()).is_some();
    let just_ok = p.get("justification").and_then(|v| v.as_str()).is_some();

    if scope_ok && decision_ok && approver_ok && just_ok {
        Ok(())
    } else {
        Err("policy_violation: human_approved payload must include scope=\"model_promoted\", decision(\"approve\"|\"reject\"), approver(str), justification(str)"
            .to_string())
    }
}

/* ------------------------- ordering / gating ------------------------- */

fn enforce_model_trained(event: &EvidenceEvent, log_path: &str) -> Result<(), String> {
    if has_event_for_run("data_registered", &event.run_id, log_path)? {
        Ok(())
    } else {
        Err("policy_violation: model_trained requires prior data_registered for the same run_id".to_string())
    }
}

fn enforce_model_promoted(event: &EvidenceEvent, log_path: &str) -> Result<(), String> {
    // Gate 1: requires passed evaluation
    if !has_passed_evaluation(&event.run_id, log_path)? {
        return Err(
            "policy_violation: model_promoted requires prior evaluation_reported with passed=true".to_string(),
        );
    }

    // Gate 2: requires explicit human approval for promotion
    match latest_human_approval_decision(&event.run_id, log_path)? {
        Some(Decision::Approve) => Ok(()),
        Some(Decision::Reject) => Err(
            "policy_violation: model_promoted blocked by human_approved decision=reject".to_string(),
        ),
        None => Err("policy_violation: model_promoted requires prior human_approved decision=approve with scope=model_promoted"
            .to_string()),
    }
}

/* ------------------------- log helpers ------------------------- */

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Decision {
    Approve,
    Reject,
}

fn open_reader_if_exists(log_path: &str) -> Result<Option<BufReader<File>>, String> {
    match File::open(log_path) {
        Ok(f) => Ok(Some(BufReader::new(f))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn read_event(rec: StoredRecord) -> Result<EvidenceEvent, String> {
    serde_json::from_str::<EvidenceEvent>(&rec.event_json).map_err(|e| e.to_string())
}

fn has_event_for_run(event_type: &str, run_id: &str, log_path: &str) -> Result<bool, String> {
    let Some(reader) = open_reader_if_exists(log_path)? else {
        return Ok(false);
    };

    for line in reader.lines() {
        let l = line.map_err(|e| e.to_string())?;
        let t = l.trim();
        if t.is_empty() {
            continue;
        }

        let rec: StoredRecord = serde_json::from_str(t).map_err(|e| e.to_string())?;
        let ev = read_event(rec)?;

        if ev.run_id == run_id && ev.event_type == event_type {
            return Ok(true);
        }
    }

    Ok(false)
}

fn has_passed_evaluation(run_id: &str, log_path: &str) -> Result<bool, String> {
    let Some(reader) = open_reader_if_exists(log_path)? else {
        return Ok(false);
    };

    for line in reader.lines() {
        let l = line.map_err(|e| e.to_string())?;
        let t = l.trim();
        if t.is_empty() {
            continue;
        }

        let rec: StoredRecord = serde_json::from_str(t).map_err(|e| e.to_string())?;
        let ev = read_event(rec)?;

        if ev.run_id != run_id {
            continue;
        }
        if ev.event_type != "evaluation_reported" {
            continue;
        }

        let passed = ev
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

fn latest_human_approval_decision(run_id: &str, log_path: &str) -> Result<Option<Decision>, String> {
    let Some(reader) = open_reader_if_exists(log_path)? else {
        return Ok(None);
    };

    let mut latest: Option<Decision> = None;

    for line in reader.lines() {
        let l = line.map_err(|e| e.to_string())?;
        let t = l.trim();
        if t.is_empty() {
            continue;
        }

        let rec: StoredRecord = serde_json::from_str(t).map_err(|e| e.to_string())?;
        let ev = read_event(rec)?;

        if ev.run_id != run_id {
            continue;
        }
        if ev.event_type != "human_approved" {
            continue;
        }

        let scope_ok = ev
            .payload
            .get("scope")
            .and_then(|v| v.as_str())
            .map(|s| s == "model_promoted")
            .unwrap_or(false);

        if !scope_ok {
            continue;
        }

        latest = match ev.payload.get("decision").and_then(|v| v.as_str()) {
            Some("approve") => Some(Decision::Approve),
            Some("reject") => Some(Decision::Reject),
            _ => latest,
        };
    }

    Ok(latest)
}
