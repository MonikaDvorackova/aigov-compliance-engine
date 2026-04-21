use crate::api_usage::ApiUsageState;
use crate::api_usage::key_fingerprint;
use crate::audit_api_key;
use crate::auth::{AuthConfig, CurrentUser};
use crate::bundle;
use crate::db::{self, DbPool};
use crate::evidence_usage;
use crate::metering::{self, MeteringConfig, MeteringReject, GovaiPlan};
use crate::project;
use crate::govai_environment::GovaiEnvironment;
use crate::policy;
use crate::policy_config::PolicyConfig;
use crate::rbac;
use crate::projection;
use crate::schema::EvidenceEvent;
use crate::verify_chain;

use axum::extract::{Path, Query, Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::{self, Next};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;
use uuid::Uuid;

pub fn core_router(policy_version: &'static str, deployment_env: GovaiEnvironment) -> Router {
    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route(
            "/status",
            get({
                let pv = policy_version;
                let de = deployment_env;
                move || async move { status(pv, de).await }
            }),
        )
}

pub async fn root() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "service": "govai",
            "version": env!("CARGO_PKG_VERSION")
        })),
    )
}

pub async fn health() -> (StatusCode, Json<serde_json::Value>) {
    (StatusCode::OK, Json(json!({ "ok": true })))
}

pub async fn status(policy_version: &'static str, deployment_env: GovaiEnvironment) -> Json<serde_json::Value> {
    Json(json!({
        "ok": true,
        "policy_version": policy_version,
        "environment": deployment_env.as_str(),
    }))
}

#[derive(Deserialize)]
struct BundleQuery {
    run_id: String,
}

#[derive(Deserialize)]
struct BundleHashQuery {
    run_id: String,
}

fn normalize_env_label(raw: &str) -> Option<&'static str> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "dev" | "development" | "local" => Some("dev"),
        "staging" | "stage" => Some("staging"),
        "prod" | "production" => Some("prod"),
        _ => None,
    }
}

/// Reject cross-environment mixing for a run; stamp [`EvidenceEvent::environment`] to the server tier.
fn prepare_event_for_ingest(
    event: &mut EvidenceEvent,
    deployment: GovaiEnvironment,
    log_path: &str,
) -> Result<(), String> {
    let canon = deployment.as_str();
    if let Some(ref claimed) = event.environment {
        let norm = normalize_env_label(claimed).ok_or_else(|| {
            format!("policy_violation: invalid event.environment={claimed:?}")
        })?;
        if norm != canon {
            return Err(format!(
                "policy_violation: event.environment={claimed:?} does not match server deployment {canon}"
            ));
        }
    }

    let existing = bundle::collect_events_for_run(log_path, &event.run_id)?;
    for e in &existing {
        if let Some(ref pe) = e.environment {
            let norm = normalize_env_label(pe).ok_or_else(|| {
                format!(
                    "policy_violation: log contains invalid environment={pe:?} on event_id={}",
                    e.event_id
                )
            })?;
            if norm != canon {
                return Err(format!(
                    "policy_violation: run_id {} already tagged environment={pe:?}; refusing {canon}",
                    event.run_id
                ));
            }
        }
    }

    event.environment = Some(canon.to_string());
    Ok(())
}

fn collect_existing_and_reject_duplicate(
    log_path: &str,
    event: &EvidenceEvent,
) -> Result<Vec<EvidenceEvent>, String> {
    let existing = bundle::collect_events_for_run(log_path, &event.run_id)?;
    if existing.iter().any(|e| e.event_id == event.event_id) {
        return Err(format!(
            "duplicate event_id for run_id: event_id={} run_id={}",
            event.event_id, event.run_id
        ));
    }
    Ok(existing)
}

fn canonicalize_events(mut events: Vec<EvidenceEvent>) -> Vec<EvidenceEvent> {
    let mut seen: HashSet<String> = HashSet::new();
    events.sort_by(|a, b| a.ts_utc.cmp(&b.ts_utc));
    let mut out_rev: Vec<EvidenceEvent> = Vec::with_capacity(events.len());
    for e in events.into_iter().rev() {
        if seen.insert(e.event_id.clone()) {
            out_rev.push(e);
        }
    }
    out_rev.reverse();

    out_rev.sort_by(|a, b| {
        a.ts_utc
            .cmp(&b.ts_utc)
            .then_with(|| a.event_type.cmp(&b.event_type))
            .then_with(|| a.event_id.cmp(&b.event_id))
    });

    out_rev
}

#[derive(Clone)]
struct AuditState {
    log_path: &'static str,
    policy_version: &'static str,
    deployment_env: GovaiEnvironment,
    policy: PolicyConfig,
    pool: DbPool,
    metering: MeteringConfig,
}

/// Ingest phases after [`crate::audit_api_key::gate_audit_routes`]:
/// 1. Prepare + policy validation  
/// 2. Duplicate rejection  
/// 3. Legacy billing tenant ([`project::billing_tenant_id`]) when `GOVAI_METERING` is off — same scope as `GET /usage`  
/// 4. Metering precheck (`GOVAI_METERING=on`) **or** legacy evidence quota  
/// 5. [`crate::audit_store::append_record`]  
/// 6. Metering persist **or** [`evidence_usage::increment_evidence_usage`]
async fn ingest(
    State(audit): State<AuditState>,
    headers: HeaderMap,
    Json(mut event): Json<EvidenceEvent>,
) -> (StatusCode, Json<serde_json::Value>) {
    if let Err(e) = prepare_event_for_ingest(&mut event, audit.deployment_env, audit.log_path) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": e, "policy_version": audit.policy_version })),
        );
    }

    if let Err(e) = policy::enforce(
        &event,
        audit.log_path,
        &audit.policy,
        audit.deployment_env,
    ) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": e, "policy_version": audit.policy_version })),
        );
    }

    let existing = match collect_existing_and_reject_duplicate(audit.log_path, &event) {
        Ok(e) => e,
        Err(e) => {
            return (
                StatusCode::CONFLICT,
                Json(json!({ "ok": false, "error": e, "policy_version": audit.policy_version })),
            );
        }
    };

    // Legacy `govai_usage_counters` tenant (only when `GOVAI_METERING` is off); same scope as `GET /usage`.
    let tenant_id_legacy = if !audit.metering.enabled {
        Some(project::billing_tenant_id(&headers))
    } else {
        None
    };

    let pre_count = existing.len() as u64;
    let next_count = pre_count + 1;
    let is_new_run = pre_count == 0;
    let run_id = event.run_id.clone();

    let metering_team = if audit.metering.enabled {
        let key_hash = match audit_api_key::raw_bearer_token(&headers) {
            None => {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(json!({ "ok": false, "error": "unauthorized" })),
                );
            }
            Some(t) => key_fingerprint(t),
        };
        let team_id = match metering::team_id_for_key_hash(&audit.pool, &key_hash).await {
            Ok(t) => t,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "ok": false, "error": "metering_error", "details": e.to_string(), "policy_version": audit.policy_version })),
                );
            }
        };
        let team_id = match team_id {
            None => {
                return (
                    StatusCode::FORBIDDEN,
                    Json(json!({
                        "ok": false,
                        "error": "team_not_configured_for_api_key",
                        "policy_version": audit.policy_version
                    })),
                );
            }
            Some(t) => t,
        };
        let plan = audit.metering.default_plan;
        let limits = metering::PlanLimits::for_plan(plan);
        let ym = metering::year_month_utc_now();
        let (new_run_ids, evidence_events) = match metering::load_monthly(&audit.pool, team_id, ym).await {
            Ok(x) => x,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "ok": false, "error": "metering_error", "details": e.to_string(), "policy_version": audit.policy_version })),
                );
            }
        };
        if let Err(r) = metering::precheck_ingest(
            plan,
            limits,
            new_run_ids,
            evidence_events,
            is_new_run,
            &run_id,
            next_count,
        ) {
            return match r {
                MeteringReject::MonthlyRunLimit { used, limit } => (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(json!({
                        "ok": false,
                        "error": "monthly_run_limit_exceeded",
                        "used": used,
                        "limit": limit,
                        "year_month": ym,
                        "policy_version": audit.policy_version
                    })),
                ),
                MeteringReject::MonthlyEventLimit { used, limit } => (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(json!({
                        "ok": false,
                        "error": "monthly_event_limit_exceeded",
                        "used": used,
                        "limit": limit,
                        "year_month": ym,
                        "policy_version": audit.policy_version
                    })),
                ),
                MeteringReject::PerRunEventLimit { run_id, would_be, limit } => (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(json!({
                        "ok": false,
                        "error": "per_run_event_limit_exceeded",
                        "run_id": run_id,
                        "event_count": would_be,
                        "limit": limit,
                        "policy_version": audit.policy_version
                    })),
                ),
            };
        }
        Some((team_id, plan, ym, limits, new_run_ids, evidence_events))
    } else {
        None
    };

    if let Some(ref tid) = tenant_id_legacy {
        match evidence_usage::check_evidence_quota(&audit.pool, tid).await {
            Ok(()) => {}
            Err(e) if e == "evidence_quota_exceeded" => {
                return (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(json!({
                        "ok": false,
                        "error": "evidence_quota_exceeded",
                        "limit": evidence_usage::FREE_TIER_EVIDENCE_LIMIT,
                    })),
                );
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({
                        "ok": false,
                        "error": e,
                        "policy_version": audit.policy_version,
                    })),
                );
            }
        }
    }

    match crate::audit_store::append_record(audit.log_path, event) {
        Ok(rec) => {
            if let Some((team_id, plan, ym, limits, new_run_ids, evidence_events)) = metering_team {
                if let Err(e) = metering::record_successful_ingest(
                    &audit.pool,
                    team_id,
                    ym,
                    &run_id,
                    next_count as i64,
                    is_new_run,
                )
                .await
                {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "ok": false,
                            "error": e,
                            "policy_version": audit.policy_version,
                        })),
                    );
                }
                let nr1 = new_run_ids + if is_new_run { 1 } else { 0 };
                let ev1 = evidence_events + 1;
                let warnings = metering::basic_warnings(plan, limits, nr1, ev1, is_new_run);
                let complexity = metering::run_complexity_label(next_count);
                (
                    StatusCode::OK,
                    Json(json!({
                        "ok": true,
                        "record_hash": rec.record_hash,
                        "policy_version": audit.policy_version,
                        "environment": audit.deployment_env.as_str(),
                        "team_id": team_id.to_string(),
                        "plan": plan_id_str(plan),
                        "year_month": ym,
                        "run": {
                            "run_id": run_id,
                            "event_count": next_count,
                            "run_complexity": complexity
                        },
                        "warnings": warnings
                    })),
                )
            } else {
                let tid = tenant_id_legacy
                    .as_ref()
                    .expect("legacy billing tenant when metering is off");
                if let Err(e) = evidence_usage::increment_evidence_usage(&audit.pool, tid).await {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "ok": false,
                            "error": e,
                            "policy_version": audit.policy_version,
                        })),
                    );
                }
                (
                    StatusCode::OK,
                    Json(json!({
                        "ok": true,
                        "record_hash": rec.record_hash,
                        "policy_version": audit.policy_version,
                        "environment": audit.deployment_env.as_str(),
                    })),
                )
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "ok": false, "error": e, "policy_version": audit.policy_version })),
        ),
    }
}

fn plan_id_str(p: GovaiPlan) -> &'static str {
    match p {
        GovaiPlan::Free => "free",
        GovaiPlan::Team => "team",
        GovaiPlan::Growth => "growth",
        GovaiPlan::Enterprise => "enterprise",
    }
}

async fn usage_route(
    State(audit): State<AuditState>,
    headers: HeaderMap,
) -> (StatusCode, Json<serde_json::Value>) {
    if audit.metering.enabled {
        let key_hash = match audit_api_key::raw_bearer_token(&headers) {
            None => {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(json!({ "ok": false, "error": "unauthorized" })),
                );
            }
            Some(t) => key_fingerprint(t),
        };
        let team_id = match metering::team_id_for_key_hash(&audit.pool, &key_hash).await {
            Ok(t) => t,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "ok": false, "error": e.to_string() })),
                );
            }
        };
        let Some(team_id) = team_id else {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "ok": false, "error": "team_not_configured_for_api_key" })),
            );
        };
        let plan = audit.metering.default_plan;
        let limits = metering::PlanLimits::for_plan(plan);
        let ym = metering::year_month_utc_now();
        let (new_run_ids, evidence_events) = match metering::load_monthly(&audit.pool, team_id, ym).await {
            Ok(x) => x,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "ok": false, "error": e.to_string() })),
                );
            }
        };
        return (
            StatusCode::OK,
            Json(json!({
                "metering": "on",
                "team_id": team_id.to_string(),
                "year_month": ym,
                "plan": plan_id_str(plan),
                "new_run_ids": new_run_ids,
                "evidence_events": evidence_events,
                "limits": {
                    "max_runs_per_month": limits.max_runs_per_month,
                    "max_events_per_month": limits.max_events_per_month,
                    "max_events_per_run": limits.max_events_per_run
                }
            })),
        );
    }

    let tenant_id = project::billing_tenant_id(&headers);
    match evidence_usage::get_evidence_usage(&audit.pool, &tenant_id).await {
        Ok((count, period)) => (
            StatusCode::OK,
            Json(json!({
                "metering": "off",
                "tenant_id": tenant_id,
                "period_start": period.format("%Y-%m-%d").to_string(),
                "evidence_events_count": count,
                "limit": evidence_usage::FREE_TIER_EVIDENCE_LIMIT,
            })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "ok": false, "error": e })),
        ),
    }
}

async fn verify(State(audit): State<AuditState>) -> Json<serde_json::Value> {
    match crate::audit_store::verify_chain(audit.log_path) {
        Ok(_) => Json(json!({ "ok": true, "policy_version": audit.policy_version })),
        Err(e) => Json(json!({ "ok": false, "error": e, "policy_version": audit.policy_version })),
    }
}

async fn bundle_route(
    State(audit): State<AuditState>,
    Query(q): Query<BundleQuery>,
) -> Json<serde_json::Value> {
    match bundle::collect_events_for_run(audit.log_path, &q.run_id) {
        Ok(events) => {
            let events = canonicalize_events(events);
            let log_path = format!("rust/{}", audit.log_path);
            let doc = bundle::bundle_document_value(&q.run_id, audit.policy_version, &log_path, &events);
            Json(doc)
        }
        Err(e) => Json(json!({ "ok": false, "error": e, "policy_version": audit.policy_version })),
    }
}

/// Machine-readable audit export: metadata, chain hashes, bundle digest, decision extracts, and timestamps.
/// Uses `bundle::bundle_document_value` and `bundle::bundle_sha256` (same as `/bundle` and `/bundle-hash`).
async fn export_run_route(
    State(audit): State<AuditState>,
    Path(run_id): Path<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    let run_id = run_id.trim().to_string();
    if run_id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": "run_id_required", "policy_version": audit.policy_version })),
        );
    }

    let events = match bundle::collect_events_for_run(audit.log_path, &run_id) {
        Ok(e) => e,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "ok": false, "error": e, "policy_version": audit.policy_version, "run_id": run_id })),
            );
        }
    };
    if events.is_empty() {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "ok": false, "error": "run_not_found", "policy_version": audit.policy_version, "run_id": run_id })),
        );
    }

    let events = canonicalize_events(events);
    let log_path = format!("rust/{}", audit.log_path);
    let bundle_doc = bundle::bundle_document_value(&run_id, audit.policy_version, &log_path, &events);
    let artifact_path = bundle::find_model_artifact_path(&events);
    let bundle_sha256 = bundle::bundle_sha256(
        &run_id,
        audit.policy_version,
        &log_path,
        artifact_path.as_deref(),
        &events,
    );

    let chain_records = match crate::audit_store::collect_stored_records_for_run(audit.log_path, &run_id) {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "ok": false, "error": e, "policy_version": audit.policy_version, "run_id": run_id })),
            );
        }
    };

    let head_sha256 = chain_records.last().map(|r| r.record_hash.clone());
    let log_chain: Vec<serde_json::Value> = chain_records
        .iter()
        .filter_map(|rec| {
            let ev: Result<crate::schema::EvidenceEvent, _> = serde_json::from_str(&rec.event_json);
            let ev = ev.ok()?;
            Some(json!({
                "event_id": ev.event_id,
                "ts_utc": ev.ts_utc,
                "event_type": ev.event_type,
                "prev_hash": rec.prev_hash,
                "record_hash": rec.record_hash
            }))
        })
        .collect();

    let first_ts = events.first().map(|e| e.ts_utc.clone());
    let last_ts = events.last().map(|e| e.ts_utc.clone());

    let human = bundle_doc.get("human_approval").cloned().unwrap_or(serde_json::Value::Null);
    let human_ts = human
        .get("ts_utc")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let promo = bundle_doc.get("promotion").cloned().unwrap_or(serde_json::Value::Null);
    let promo_ts = promo.get("ts_utc").and_then(|v| v.as_str()).map(|s| s.to_string());

    let eval_passed = bundle_doc
        .get("evaluation")
        .and_then(|e| e.get("passed"))
        .and_then(|v| v.as_bool());

    let out = json!({
        "ok": true,
        "schema_version": "aigov.audit_export.v1",
        "policy_version": audit.policy_version,
        "environment": audit.deployment_env.as_str(),
        "exported_at_utc": Utc::now().to_rfc3339(),
        "run": {
            "run_id": run_id,
            "policy_version": audit.policy_version,
            "log_path": log_path,
            "model_artifact_path": bundle_doc.get("model_artifact_path").cloned().unwrap_or(serde_json::Value::Null),
            "identifiers": bundle_doc.get("identifiers").cloned().unwrap_or(serde_json::Value::Null)
        },
        "evidence_hashes": {
            "bundle_sha256": bundle_sha256,
            "chain_head_record_sha256": head_sha256,
            "log_chain": log_chain
        },
        "decision": {
            "human_approval": human,
            "promotion": promo,
            "evaluation_passed": eval_passed
        },
        "timestamps": {
            "first_event_ts_utc": first_ts,
            "last_event_ts_utc": last_ts,
            "human_approval_ts_utc": human_ts,
            "promotion_ts_utc": promo_ts
        }
    });

    (StatusCode::OK, Json(out))
}

async fn bundle_hash_route(
    State(audit): State<AuditState>,
    Query(q): Query<BundleHashQuery>,
) -> Json<serde_json::Value> {
    match bundle::collect_events_for_run(audit.log_path, &q.run_id) {
        Ok(events) => {
            let events = canonicalize_events(events);
            let artifact_path = bundle::find_model_artifact_path(&events);
            let log_path = format!("rust/{}", audit.log_path);

            let digest = bundle::bundle_sha256(
                &q.run_id,
                audit.policy_version,
                &log_path,
                artifact_path.as_deref(),
                &events,
            );

            Json(json!({
                "ok": true,
                "run_id": q.run_id,
                "policy_version": audit.policy_version,
                "bundle_sha256": digest
            }))
        }
        Err(e) => Json(json!({ "ok": false, "error": e, "policy_version": audit.policy_version })),
    }
}

async fn verify_log(State(audit): State<AuditState>) -> (StatusCode, String) {
    match verify_chain::verify_chain(audit.log_path) {
        Ok(_) => (StatusCode::OK, "{\"ok\":true}".to_string()),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            format!(
                "{{\"ok\":false,\"error\":{}}}",
                serde_json::to_string(&e).unwrap_or_else(|_| "\"serialization_error\"".to_string())
            ),
        ),
    }
}

pub fn audit_router(
    log_path: &'static str,
    policy_version: &'static str,
    deployment_env: GovaiEnvironment,
    policy: PolicyConfig,
    api_usage: ApiUsageState,
    pool: DbPool,
    metering: MeteringConfig,
) -> Router {
    let state = AuditState {
        log_path,
        policy_version,
        deployment_env,
        policy,
        pool,
        metering,
    };
    let api_key_cfg = crate::audit_api_key::AuditApiKeyConfig::from_env();
    let u = api_usage;
    let audit_key_layer = middleware::from_fn(move |request: Request, next: Next| {
        let cfg = api_key_cfg.clone();
        let usage = u.clone();
        async move { crate::audit_api_key::gate_audit_routes(cfg, usage, request, next).await }
    });

    let gated = Router::new()
        .route("/evidence", post(ingest))
        .route("/usage", get(usage_route))
        .route("/verify", get(verify))
        .route("/bundle", get(bundle_route))
        .route("/compliance-summary", get(compliance_summary_route))
        .route("/api/export/:run_id", get(export_run_route))
        .layer(audit_key_layer)
        .with_state(state.clone());

    let open = Router::new()
        .route("/bundle-hash", get(bundle_hash_route))
        .route("/verify-log", get(verify_log))
        .with_state(state);

    Router::new().merge(gated).merge(open)
}

#[derive(Deserialize)]
struct ComplianceSummaryQuery {
    run_id: String,
}

async fn compliance_summary_route(
    State(audit): State<AuditState>,
    Query(q): Query<ComplianceSummaryQuery>,
) -> Json<serde_json::Value> {
    match bundle::collect_events_for_run(audit.log_path, &q.run_id) {
        Ok(events) => {
            let events = canonicalize_events(events);
            let artifact_path = bundle::find_model_artifact_path(&events);
            let log_path = format!("rust/{}", audit.log_path);
            let bundle_hash = bundle::bundle_sha256(
                &q.run_id,
                audit.policy_version,
                &log_path,
                artifact_path.as_deref(),
                &events,
            );
            let derived = projection::derive_current_state_from_events_with_context(
                &q.run_id,
                &events,
                Some(bundle_hash),
                None,
            );
            Json(json!({
                "ok": true,
                "schema_version": "aigov.compliance_summary.v2",
                "policy_version": audit.policy_version,
                "run_id": q.run_id,
                "current_state": derived,
            }))
        }
        Err(e) => Json(json!({
            "ok": false,
            "schema_version": "aigov.compliance_summary.v2",
            "error": e,
            "policy_version": audit.policy_version,
            "run_id": q.run_id,
        })),
    }
}

#[derive(Clone)]
pub struct AppState {
    pub pool: DbPool,
}

#[derive(Deserialize)]
pub struct CreateAssessmentBody {
    pub system_name: String,
    pub intended_purpose: String,
    pub risk_class: String,
}

#[derive(Serialize)]
pub struct AssessmentOut {
    pub id: String,
    pub team_id: String,
    pub created_by: String,
    pub created_at: String,
    pub status: String,
    pub system_name: Option<String>,
    pub intended_purpose: Option<String>,
    pub risk_class: Option<String>,
}

#[derive(Serialize)]
pub struct TeamOut {
    pub id: String,
    pub name: String,
    /// Raw value from `team_members.role` (may be a legacy alias).
    pub role: String,
    /// Normalized enterprise role id (`admin`, `compliance_officer`, …).
    pub effective_role: String,
    pub permissions: rbac::ProductPermissions,
}

#[derive(Serialize)]
pub struct MeOut {
    pub user_id: String,
    pub teams: Vec<TeamOut>,
}

async fn me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> (StatusCode, Json<serde_json::Value>) {
    let cfg = match AuthConfig::from_env() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
    };

    let user = match crate::auth::require_user(&cfg, &headers).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let teams = match db::list_user_teams(&state.pool, &user.user_id).await {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "DB_ERROR", "details": e.to_string() })),
            )
        }
    };

    let out = MeOut {
        user_id: user.user_id.to_string(),
        teams: teams
            .into_iter()
            .map(|t| {
                let nr = rbac::normalize_role(&t.role);
                TeamOut {
                    id: t.team_id.to_string(),
                    name: t.team_name,
                    effective_role: rbac::canonical_role_id(nr).to_string(),
                    permissions: rbac::permissions_for(nr),
                    role: t.role,
                }
            })
            .collect(),
    };

    (StatusCode::OK, Json(json!(out)))
}

async fn resolve_team_id(
    pool: &DbPool,
    user: &CurrentUser,
    headers: &HeaderMap,
) -> Result<Uuid, (StatusCode, Json<serde_json::Value>)> {
    let team_hdr = headers
        .get("x-govai-team-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string());

    if let Some(team_str) = team_hdr {
        let team_id = match Uuid::parse_str(&team_str) {
            Ok(t) => t,
            Err(_) => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": "INVALID_TEAM_ID" })),
                ))
            }
        };

        let ok = match db::is_team_member(pool, team_id, user.user_id).await {
            Ok(b) => b,
            Err(e) => {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "DB_ERROR", "details": e.to_string() })),
                ))
            }
        };

        if !ok {
            return Err((StatusCode::FORBIDDEN, Json(json!({ "error": "NOT_TEAM_MEMBER" }))));
        }

        return Ok(team_id);
    }

    match db::get_default_team_for_user(pool, user.user_id).await {
        Ok(Some(team_id)) => Ok(team_id),
        Ok(None) => match db::bootstrap_team_for_user(pool, user.user_id).await {
            Ok(team_id) => Ok(team_id),
            Err(e) => Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "DB_ERROR", "details": e.to_string() })),
            )),
        },
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "DB_ERROR", "details": e.to_string() })),
        )),
    }
}

async fn team_product_permissions(
    pool: &DbPool,
    team_id: Uuid,
    user_id: Uuid,
) -> Result<rbac::ProductPermissions, (StatusCode, Json<serde_json::Value>)> {
    let role_raw = match db::get_team_member_role(pool, team_id, user_id).await {
        Ok(Some(r)) => r,
        Ok(None) => {
            return Err((
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "NOT_TEAM_MEMBER" })),
            ))
        }
        Err(e) => {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "DB_ERROR", "details": e.to_string() })),
            ))
        }
    };
    Ok(rbac::permissions_for_db_role(&role_raw))
}

async fn create_assessment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateAssessmentBody>,
) -> (StatusCode, Json<serde_json::Value>) {
    let cfg = match AuthConfig::from_env() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
    };

    let user = match crate::auth::require_user(&cfg, &headers).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let team_id = match resolve_team_id(&state.pool, &user, &headers).await {
        Ok(t) => t,
        Err(resp) => return resp,
    };

    let perms = match team_product_permissions(&state.pool, team_id, user.user_id).await {
        Ok(p) => p,
        Err(resp) => return resp,
    };
    if !perms.decision_submit {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "FORBIDDEN",
                "reason": "INSUFFICIENT_ROLE",
                "required_permission": "decision_submit"
            })),
        );
    }

    let rec = match db::insert_assessment(
        &state.pool,
        team_id,
        user.user_id,
        body.system_name,
        body.intended_purpose,
        body.risk_class,
    )
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "DB_ERROR", "details": e.to_string() })),
            )
        }
    };

    let out = AssessmentOut {
        id: rec.id.to_string(),
        team_id: rec.team_id.to_string(),
        created_by: rec.created_by.to_string(),
        created_at: rec.created_at.to_rfc3339(),
        status: rec.status,
        system_name: rec.system_name,
        intended_purpose: rec.intended_purpose,
        risk_class: rec.risk_class,
    };

    (StatusCode::OK, Json(json!(out)))
}

pub fn assessments_router(pool: DbPool) -> Router {
    let state = AppState { pool };

    Router::new()
        .route("/api/me", get(me))
        .route("/api/assessments", post(create_assessment))
        .with_state(state)
}

#[derive(Serialize)]
pub struct ComplianceWorkflowOut {
    pub id: String,
    pub team_id: String,
    pub run_id: String,
    pub state: String,
    pub created_at: String,
    pub updated_at: String,
    pub created_by: String,
    pub updated_by: Option<String>,
}

fn workflow_to_out(r: db::ComplianceWorkflowRow) -> ComplianceWorkflowOut {
    ComplianceWorkflowOut {
        id: r.id.to_string(),
        team_id: r.team_id.to_string(),
        run_id: r.run_id,
        state: r.state,
        created_at: r.created_at.to_rfc3339(),
        updated_at: r.updated_at.to_rfc3339(),
        created_by: r.created_by.to_string(),
        updated_by: r.updated_by.map(|u| u.to_string()),
    }
}

/// Declares that authoritative promotion readiness comes only from the ledger projection (`GET /compliance-summary`).
/// `compliance_workflow` is an operational queue / org override layer, not a second source of compliance truth.
fn decision_authority_object() -> serde_json::Value {
    json!({
        "primary": "ledger_projection",
        "pipeline": ["immutable_ledger", "bundle", "projection", "compliance_summary"],
        "workflow_role": "operational_queue_override",
        "note": "compliance_workflow rows do not replace immutable evidence; reconcile with GET /compliance-summary."
    })
}

fn json_ok_workflow(workflow: ComplianceWorkflowOut) -> serde_json::Value {
    json!({
        "ok": true,
        "workflow": workflow,
        "decision_authority": decision_authority_object(),
    })
}

#[derive(Deserialize)]
pub struct ListWorkflowQuery {
    pub state: Option<String>,
}

#[derive(Deserialize)]
pub struct RegisterWorkflowBody {
    pub run_id: String,
}

#[derive(Deserialize)]
pub struct ReviewDecisionBody {
    /// `"approve"` or `"reject"`
    pub decision: String,
}

#[derive(Deserialize)]
pub struct PromotionDecisionBody {
    /// `"allow"` or `"block"`
    pub decision: String,
}

async fn list_compliance_workflow(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ListWorkflowQuery>,
) -> (StatusCode, Json<serde_json::Value>) {
    let cfg = match AuthConfig::from_env() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
    };

    let user = match crate::auth::require_user(&cfg, &headers).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let team_id = match resolve_team_id(&state.pool, &user, &headers).await {
        Ok(t) => t,
        Err(resp) => return resp,
    };

    let perms = match team_product_permissions(&state.pool, team_id, user.user_id).await {
        Ok(p) => p,
        Err(resp) => return resp,
    };
    if !perms.review_queue_view {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "FORBIDDEN",
                "reason": "INSUFFICIENT_ROLE",
                "required_permission": "review_queue_view"
            })),
        );
    }

    let filter = q.state.as_deref().filter(|s| !s.trim().is_empty());
    let rows = match db::list_compliance_workflow(&state.pool, team_id, filter).await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "DB_ERROR", "details": e.to_string() })),
            )
        }
    };

    let out: Vec<ComplianceWorkflowOut> = rows.into_iter().map(workflow_to_out).collect();
    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "items": out,
            "decision_authority": decision_authority_object(),
        })),
    )
}

async fn register_compliance_workflow(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<RegisterWorkflowBody>,
) -> (StatusCode, Json<serde_json::Value>) {
    let cfg = match AuthConfig::from_env() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
    };

    let user = match crate::auth::require_user(&cfg, &headers).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let team_id = match resolve_team_id(&state.pool, &user, &headers).await {
        Ok(t) => t,
        Err(resp) => return resp,
    };

    let perms = match team_product_permissions(&state.pool, team_id, user.user_id).await {
        Ok(p) => p,
        Err(resp) => return resp,
    };
    if !perms.decision_submit {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "FORBIDDEN",
                "reason": "INSUFFICIENT_ROLE",
                "required_permission": "decision_submit"
            })),
        );
    }

    let run_id = body.run_id.trim().to_string();
    if run_id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "RUN_ID_REQUIRED" })),
        );
    }

    let rec = match db::upsert_workflow_pending(&state.pool, team_id, &run_id, user.user_id).await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "DB_ERROR", "details": e.to_string() })),
            )
        }
    };

    (StatusCode::OK, Json(json_ok_workflow(workflow_to_out(rec))))
}

async fn get_compliance_workflow_one(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(run_id): Path<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    let cfg = match AuthConfig::from_env() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
    };

    let user = match crate::auth::require_user(&cfg, &headers).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let team_id = match resolve_team_id(&state.pool, &user, &headers).await {
        Ok(t) => t,
        Err(resp) => return resp,
    };

    let perms = match team_product_permissions(&state.pool, team_id, user.user_id).await {
        Ok(p) => p,
        Err(resp) => return resp,
    };
    if !perms.review_queue_view {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "FORBIDDEN",
                "reason": "INSUFFICIENT_ROLE",
                "required_permission": "review_queue_view"
            })),
        );
    }

    let rid = run_id.trim();
    let rec = match db::get_compliance_workflow(&state.pool, team_id, rid).await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "DB_ERROR", "details": e.to_string() })),
            )
        }
    };

    match rec {
        Some(r) => (StatusCode::OK, Json(json_ok_workflow(workflow_to_out(r)))),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "NOT_FOUND" })),
        ),
    }
}

async fn post_review_decision(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(run_id): Path<String>,
    Json(body): Json<ReviewDecisionBody>,
) -> (StatusCode, Json<serde_json::Value>) {
    let cfg = match AuthConfig::from_env() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
    };

    let user = match crate::auth::require_user(&cfg, &headers).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let team_id = match resolve_team_id(&state.pool, &user, &headers).await {
        Ok(t) => t,
        Err(resp) => return resp,
    };

    let perms = match team_product_permissions(&state.pool, team_id, user.user_id).await {
        Ok(p) => p,
        Err(resp) => return resp,
    };
    if !perms.decision_submit {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "FORBIDDEN",
                "reason": "INSUFFICIENT_ROLE",
                "required_permission": "decision_submit"
            })),
        );
    }

    let rid = run_id.trim().to_string();
    if rid.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "RUN_ID_REQUIRED" })),
        );
    }

    let approve = match body.decision.trim() {
        "approve" => true,
        "reject" => false,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "INVALID_DECISION", "expected": ["approve", "reject"] })),
            )
        }
    };

    let rec = match db::transition_workflow_review(&state.pool, team_id, &rid, user.user_id, approve)
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "DB_ERROR", "details": e.to_string() })),
            )
        }
    };

    match rec {
        Some(r) => (StatusCode::OK, Json(json_ok_workflow(workflow_to_out(r)))),
        None => (
            StatusCode::CONFLICT,
            Json(json!({
                "error": "INVALID_STATE",
                "message": "expected pending_review for review decision"
            })),
        ),
    }
}

async fn post_promotion_decision(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(run_id): Path<String>,
    Json(body): Json<PromotionDecisionBody>,
) -> (StatusCode, Json<serde_json::Value>) {
    let cfg = match AuthConfig::from_env() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
    };

    let user = match crate::auth::require_user(&cfg, &headers).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let team_id = match resolve_team_id(&state.pool, &user, &headers).await {
        Ok(t) => t,
        Err(resp) => return resp,
    };

    let perms = match team_product_permissions(&state.pool, team_id, user.user_id).await {
        Ok(p) => p,
        Err(resp) => return resp,
    };
    if !perms.promotion_action {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "FORBIDDEN",
                "reason": "INSUFFICIENT_ROLE",
                "required_permission": "promotion_action"
            })),
        );
    }

    let rid = run_id.trim().to_string();
    if rid.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "RUN_ID_REQUIRED" })),
        );
    }

    let allow = match body.decision.trim() {
        "allow" => true,
        "block" => false,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "INVALID_DECISION", "expected": ["allow", "block"] })),
            )
        }
    };

    let rec = match db::transition_workflow_promotion(
        &state.pool,
        team_id,
        &rid,
        user.user_id,
        allow,
    )
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "DB_ERROR", "details": e.to_string() })),
            )
        }
    };

    match rec {
        Some(r) => (
            StatusCode::OK,
            Json(json!({ "ok": true, "workflow": workflow_to_out(r) })),
        ),
        None => (
            StatusCode::CONFLICT,
            Json(json!({
                "error": "INVALID_STATE",
                "message": "expected approved for promotion decision"
            })),
        ),
    }
}

pub fn compliance_workflow_router(pool: DbPool) -> Router {
    let state = AppState { pool };

    Router::new()
        .route("/api/compliance-workflow", get(list_compliance_workflow).post(register_compliance_workflow))
        .route(
            "/api/compliance-workflow/:run_id",
            get(get_compliance_workflow_one),
        )
        .route(
            "/api/compliance-workflow/:run_id/review",
            post(post_review_decision),
        )
        .route(
            "/api/compliance-workflow/:run_id/promotion",
            post(post_promotion_decision),
        )
        .with_state(state)
}
