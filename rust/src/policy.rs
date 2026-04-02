use crate::audit_store::StoredRecord;
use crate::schema::EvidenceEvent;
use std::fs::File;
use std::io::{BufRead, BufReader};

pub fn enforce(event: &EvidenceEvent, log_path: &str) -> Result<(), String> {
    match event.event_type.as_str() {
        "data_registered" => enforce_data_registered(event),
        "model_trained" => enforce_model_trained(event, log_path),
        "evaluation_reported" => enforce_evaluation_reported(event),
        "risk_recorded" => enforce_risk_recorded(event),
        "risk_mitigated" => enforce_risk_mitigated(event),
        "risk_reviewed" => enforce_risk_reviewed(event),
        "human_approved" => enforce_human_approved(event, log_path),
        "model_promoted" => enforce_model_promoted(event, log_path),
        _ => Ok(()),
    }
}

/* ------------------------- schema checks ------------------------- */

fn enforce_data_registered(event: &EvidenceEvent) -> Result<(), String> {
    let p = &event.payload;

    let ai_system_id_ok = p
        .get("ai_system_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let dataset_id_ok = p
        .get("dataset_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    let dataset_ok = p
        .get("dataset")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let fp_ok = p
        .get("dataset_fingerprint")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    // Dataset governance commitment and minimum governance metadata.
    let governance_id_ok = p
        .get("dataset_governance_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let governance_commitment_ok = p
        .get("dataset_governance_commitment")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    let dataset_version_ok = p
        .get("dataset_version")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let source_ok = p
        .get("source")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let intended_use_ok = p
        .get("intended_use")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let limitations_ok = p
        .get("limitations")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let quality_summary_ok = p
        .get("quality_summary")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let governance_status_ok = p
        .get("governance_status")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    if dataset_ok
        && fp_ok
        && ai_system_id_ok
        && dataset_id_ok
        && governance_id_ok
        && governance_commitment_ok
        && dataset_version_ok
        && source_ok
        && intended_use_ok
        && limitations_ok
        && quality_summary_ok
        && governance_status_ok
    {
        Ok(())
    } else {
        Err("policy_violation: data_registered payload must include ai_system_id + dataset_id + dataset + dataset_fingerprint + dataset governance fields (id, version, commitment, source, intended_use, limitations, quality_summary, governance_status)"
            .to_string())
    }
}

fn enforce_evaluation_reported(event: &EvidenceEvent) -> Result<(), String> {
    let p = &event.payload;

    let metric_ok = p.get("metric").and_then(|v| v.as_str()).is_some();
    let value_ok = p.get("value").and_then(|v| v.as_f64()).is_some();
    let threshold_ok = p.get("threshold").and_then(|v| v.as_f64()).is_some();
    let passed_ok = p.get("passed").and_then(|v| v.as_bool()).is_some();

    let ai_system_id_ok = p
        .get("ai_system_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let dataset_id_ok = p
        .get("dataset_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let model_version_id_ok = p
        .get("model_version_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    if metric_ok && value_ok && threshold_ok && passed_ok && ai_system_id_ok && dataset_id_ok && model_version_id_ok {
        Ok(())
    } else {
        Err("policy_violation: evaluation_reported payload must include ai_system_id + dataset_id + model_version_id + metric(str), value(number), threshold(number), passed(bool)"
            .to_string())
    }
}

fn enforce_risk_recorded(event: &EvidenceEvent) -> Result<(), String> {
    let p = &event.payload;

    let ai_system_id_ok = p
        .get("ai_system_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let dataset_id_ok = p
        .get("dataset_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let model_version_id_ok = p
        .get("model_version_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    let risk_id_ok = p
        .get("risk_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let assessment_id_ok = p
        .get("assessment_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let dataset_commitment_ok = p
        .get("dataset_governance_commitment")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    let risk_class_ok = p
        .get("risk_class")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    let severity_ok = p.get("severity").and_then(|v| v.as_f64()).is_some();
    let likelihood_ok = p.get("likelihood").and_then(|v| v.as_f64()).is_some();
    let status_ok = p
        .get("status")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let mitigation_ok = p
        .get("mitigation")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let owner_ok = p
        .get("owner")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    if risk_id_ok
        && assessment_id_ok
        && dataset_commitment_ok
        && ai_system_id_ok
        && dataset_id_ok
        && model_version_id_ok
        && risk_class_ok
        && severity_ok
        && likelihood_ok
        && status_ok
        && mitigation_ok
        && owner_ok
    {
        Ok(())
    } else {
        Err("policy_violation: risk_recorded payload must include risk_id, assessment_id, dataset_governance_commitment, risk_class, severity(number), likelihood(number), status(str), mitigation(str), owner(str)".to_string())
    }
}

fn enforce_risk_mitigated(event: &EvidenceEvent) -> Result<(), String> {
    let p = &event.payload;

    let ai_system_id_ok = p
        .get("ai_system_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let dataset_id_ok = p
        .get("dataset_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let model_version_id_ok = p
        .get("model_version_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    let risk_id_ok = p
        .get("risk_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let assessment_id_ok = p
        .get("assessment_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let dataset_commitment_ok = p
        .get("dataset_governance_commitment")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    let status_ok = p
        .get("status")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let mitigation_ok = p
        .get("mitigation")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    if risk_id_ok
        && assessment_id_ok
        && dataset_commitment_ok
        && ai_system_id_ok
        && dataset_id_ok
        && model_version_id_ok
        && status_ok
        && mitigation_ok
    {
        Ok(())
    } else {
        Err("policy_violation: risk_mitigated payload must include ai_system_id + dataset_id + model_version_id + risk_id, assessment_id, dataset_governance_commitment, status(str), mitigation(str)"
            .to_string())
    }
}

fn enforce_risk_reviewed(event: &EvidenceEvent) -> Result<(), String> {
    let p = &event.payload;

    let ai_system_id_ok = p
        .get("ai_system_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let dataset_id_ok = p
        .get("dataset_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let model_version_id_ok = p
        .get("model_version_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    let risk_id_ok = p
        .get("risk_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let assessment_id_ok = p
        .get("assessment_id")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let dataset_commitment_ok = p
        .get("dataset_governance_commitment")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    let decision = p.get("decision").and_then(|v| v.as_str());
    let decision_ok = matches!(decision, Some("approve") | Some("reject"));

    let reviewer_ok = p
        .get("reviewer")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let justification_ok = p
        .get("justification")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    if risk_id_ok
        && assessment_id_ok
        && dataset_commitment_ok
        && ai_system_id_ok
        && dataset_id_ok
        && model_version_id_ok
        && decision_ok
        && reviewer_ok
        && justification_ok
    {
        Ok(())
    } else {
        Err("policy_violation: risk_reviewed payload must include ai_system_id + dataset_id + model_version_id + risk_id, assessment_id, dataset_governance_commitment, decision(approve|reject), reviewer(str), justification(str)".to_string())
    }
}

// Required payload:
// - scope: "model_promoted"
// - decision: "approve" | "reject"
// - approver: string (person or role)
// - justification: string
// - assessment_id, risk_id, dataset_governance_commitment (linkage)
fn enforce_human_approved(event: &EvidenceEvent, log_path: &str) -> Result<(), String> {
    let p = &event.payload;

    let scope_ok = matches!(
        p.get("scope").and_then(|v| v.as_str()),
        Some("model_promoted")
    );

    let decision = p.get("decision").and_then(|v| v.as_str());
    let decision_ok = matches!(decision, Some("approve") | Some("reject"));

    let approver = p
        .get("approver")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let approver_ok = approver.as_ref().map(|s| !s.is_empty()).unwrap_or(false);
    let just_ok = p
        .get("justification")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    let assessment_id = p
        .get("assessment_id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let risk_id = p
        .get("risk_id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let dataset_commitment = p
        .get("dataset_governance_commitment")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());

    let ai_system_id = p
        .get("ai_system_id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let dataset_id = p
        .get("dataset_id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let model_version_id = p
        .get("model_version_id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());

    if !(scope_ok && decision_ok && approver_ok && just_ok) {
        return Err(
            "policy_violation: human_approved payload must include scope=model_promoted, decision(approve|reject), approver(str), justification(str), assessment_id(str), risk_id(str), dataset_governance_commitment(str), ai_system_id(str), dataset_id(str), model_version_id(str)".to_string()
        );
    }

    let (assessment_id, risk_id, dataset_commitment, approver, ai_system_id, dataset_id, model_version_id) = match (
        assessment_id,
        risk_id,
        dataset_commitment,
        approver,
        ai_system_id,
        dataset_id,
        model_version_id,
    ) {
        (Some(a), Some(r), Some(d), Some(ap), Some(ai), Some(di), Some(mvi)) => (a, r, d, ap, ai, di, mvi),
        _ => {
            return Err(
                "policy_violation: human_approved payload missing linkage fields assessment_id/risk_id/dataset_governance_commitment/ai_system_id/dataset_id/model_version_id".to_string()
            )
        }
    };

    // Minimal actor validation: ensure the approver field is within the configured allowlist.
    // This is not full identity verification, but it blocks obviously invalid/typo approvals.
    let allowlist_raw = std::env::var("AIGOV_APPROVER_ALLOWLIST")
        .unwrap_or_else(|_| "compliance_officer,risk_officer".to_string());
    let allowlist: Vec<String> = allowlist_raw
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();
    if !allowlist.iter().any(|a| a == &approver.to_lowercase()) {
        return Err(
            format!(
                "policy_violation: human_approved approver '{}' not in allowlist",
                approver
            ),
        );
    }

    // Risk review must happen before human approval for promotion.
    if !has_risk_reviewed_approved(
        &event.run_id,
        &assessment_id,
        &risk_id,
        &dataset_commitment,
        &ai_system_id,
        &dataset_id,
        &model_version_id,
        log_path,
    )? {
        return Err(
            "policy_violation: human_approved requires prior risk_reviewed decision=approve with matching assessment_id/risk_id/dataset_governance_commitment".to_string()
        );
    }

    Ok(())
}

/* ------------------------- ordering / gating ------------------------- */

fn enforce_model_trained(event: &EvidenceEvent, log_path: &str) -> Result<(), String> {
    if has_event_for_run("data_registered", &event.run_id, log_path)? {
        let p = &event.payload;
        let ai_system_id_ok = p
            .get("ai_system_id")
            .and_then(|v| v.as_str())
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        let dataset_id_ok = p
            .get("dataset_id")
            .and_then(|v| v.as_str())
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        let model_version_id_ok = p
            .get("model_version_id")
            .and_then(|v| v.as_str())
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);

        if ai_system_id_ok && dataset_id_ok && model_version_id_ok {
            Ok(())
        } else {
            Err("policy_violation: model_trained payload must include ai_system_id + dataset_id + model_version_id".to_string())
        }
    } else {
        Err(
            "policy_violation: model_trained requires prior data_registered for the same run_id"
                .to_string(),
        )
    }
}

fn enforce_model_promoted(event: &EvidenceEvent, log_path: &str) -> Result<(), String> {
    let p = &event.payload;

    // Schema + linkage validation first; then cross-event gating checks.
    let artifact_path_ok = p
        .get("artifact_path")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let promotion_reason_ok = p
        .get("promotion_reason")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    let assessment_id = p
        .get("assessment_id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let risk_id = p
        .get("risk_id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let dataset_commitment = p
        .get("dataset_governance_commitment")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let approved_human_event_id = p
        .get("approved_human_event_id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());

    let ai_system_id = p
        .get("ai_system_id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let dataset_id = p
        .get("dataset_id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let model_version_id = p
        .get("model_version_id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());

    if !(artifact_path_ok && promotion_reason_ok) {
        return Err(
            "policy_violation: model_promoted payload must include artifact_path(str) and promotion_reason(str)".to_string()
        );
    }

    let (assessment_id, risk_id, dataset_commitment, approved_human_event_id) = match (
        assessment_id,
        risk_id,
        dataset_commitment,
        approved_human_event_id,
    ) {
        (Some(a), Some(r), Some(d), Some(h)) => (a, r, d, h),
        _ => {
            return Err(
                "policy_violation: model_promoted payload missing linkage fields assessment_id/risk_id/dataset_governance_commitment/approved_human_event_id"
                    .to_string(),
            )
        }
    };

    let (assessment_id, risk_id, dataset_commitment, approved_human_event_id, ai_system_id, dataset_id, model_version_id) =
        match (
            Some(assessment_id),
            Some(risk_id),
            Some(dataset_commitment),
            Some(approved_human_event_id),
            ai_system_id,
            dataset_id,
            model_version_id,
        ) {
            (Some(a), Some(r), Some(d), Some(h), Some(ai), Some(di), Some(mvi)) => {
                (a, r, d, h, ai, di, mvi)
            }
            _ => {
                return Err(
                    "policy_violation: model_promoted payload missing ai_system_id/dataset_id/model_version_id linkage".to_string()
                )
            }
        };

    // Gate 1: requires passed evaluation
    if !has_passed_evaluation(&event.run_id, log_path)? {
        return Err(
            "policy_violation: model_promoted requires prior evaluation_reported with passed=true"
                .to_string(),
        );
    }

    // Gate 2: requires explicit risk approval for promotion
    if !has_risk_reviewed_approved(
        &event.run_id,
        &assessment_id,
        &risk_id,
        &dataset_commitment,
        &ai_system_id,
        &dataset_id,
        &model_version_id,
        log_path,
    )? {
        return Err(
            "policy_violation: model_promoted blocked by missing or rejected risk_reviewed (requires decision=approve with matching assessment_id/risk_id/dataset_governance_commitment/ai_system_id/dataset_id/model_version_id)".to_string(),
        );
    }

    // Gate 3: requires explicit human approval for promotion; must reference the specific approval event.
    if !human_approved_event_ok(
        &event.run_id,
        &approved_human_event_id,
        &assessment_id,
        &risk_id,
        &dataset_commitment,
        &ai_system_id,
        &dataset_id,
        &model_version_id,
        log_path,
    )? {
        return Err(
            "policy_violation: model_promoted requires prior human_approved decision=approve with matching assessment_id/risk_id/dataset_governance_commitment/ai_system_id/dataset_id/model_version_id and approved_human_event_id".to_string(),
        );
    }

    Ok(())
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

fn latest_human_approval_decision(
    run_id: &str,
    log_path: &str,
) -> Result<Option<Decision>, String> {
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

fn has_risk_reviewed_approved(
    run_id: &str,
    assessment_id: &str,
    risk_id: &str,
    dataset_commitment: &str,
    ai_system_id: &str,
    dataset_id: &str,
    model_version_id: &str,
    log_path: &str,
) -> Result<bool, String> {
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
        if ev.event_type != "risk_reviewed" {
            continue;
        }

        let p = &ev.payload;
        let rid = p.get("risk_id").and_then(|v| v.as_str()).unwrap_or("");
        let aid = p
            .get("assessment_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let dgc = p
            .get("dataset_governance_commitment")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let ai = p.get("ai_system_id").and_then(|v| v.as_str()).unwrap_or("");
        let di = p.get("dataset_id").and_then(|v| v.as_str()).unwrap_or("");
        let mvi = p
            .get("model_version_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let decision = p.get("decision").and_then(|v| v.as_str()).unwrap_or("");

        if rid == risk_id
            && aid == assessment_id
            && dgc == dataset_commitment
            && ai == ai_system_id
            && di == dataset_id
            && mvi == model_version_id
            && decision == "approve"
        {
            return Ok(true);
        }
    }

    Ok(false)
}

fn human_approved_event_ok(
    run_id: &str,
    approved_human_event_id: &str,
    assessment_id: &str,
    risk_id: &str,
    dataset_commitment: &str,
    ai_system_id: &str,
    dataset_id: &str,
    model_version_id: &str,
    log_path: &str,
) -> Result<bool, String> {
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
        if ev.event_type != "human_approved" {
            continue;
        }
        if ev.event_id != approved_human_event_id {
            continue;
        }

        let p = &ev.payload;
        let scope_ok = p.get("scope").and_then(|v| v.as_str()).unwrap_or("") == "model_promoted";
        let decision_ok = p.get("decision").and_then(|v| v.as_str()).unwrap_or("") == "approve";
        let aid = p
            .get("assessment_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let rid = p.get("risk_id").and_then(|v| v.as_str()).unwrap_or("");
        let dgc = p
            .get("dataset_governance_commitment")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let ai = p.get("ai_system_id").and_then(|v| v.as_str()).unwrap_or("");
        let di = p.get("dataset_id").and_then(|v| v.as_str()).unwrap_or("");
        let mvi = p
            .get("model_version_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if scope_ok
            && decision_ok
            && aid == assessment_id
            && rid == risk_id
            && dgc == dataset_commitment
            && ai == ai_system_id
            && di == dataset_id
            && mvi == model_version_id
        {
            return Ok(true);
        }
    }

    Ok(false)
}
