use crate::api_usage::ApiUsageState;
use crate::api_usage::key_fingerprint;
use crate::audit_api_key;
use crate::auth::{AuthConfig, CurrentUser};
use crate::bundle;
use crate::db::{self, DbPool};
use crate::evidence_usage;
use crate::metering::{self, MeteringConfig, MeteringReject, GovaiPlan};
use crate::pricing;
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

fn json_error(
    status: StatusCode,
    error: &str,
    message: &str,
    policy_version: Option<&str>,
    extra: Option<serde_json::Value>,
) -> (StatusCode, Json<serde_json::Value>) {
    let mut m = serde_json::Map::new();
    m.insert("ok".to_string(), serde_json::Value::Bool(false));
    m.insert("error".to_string(), serde_json::Value::String(error.to_string()));
    m.insert(
        "message".to_string(),
        serde_json::Value::String(message.to_string()),
    );
    // `code` is a stable, machine-readable discriminator.
    // For most errors `code == error`; policy violations override with a more specific code.
    m.insert("code".to_string(), serde_json::Value::String(error.to_string()));
    if let Some(pv) = policy_version {
        m.insert(
            "policy_version".to_string(),
            serde_json::Value::String(pv.to_string()),
        );
    }
    if let Some(ex) = extra {
        if let serde_json::Value::Object(obj) = ex {
            for (k, v) in obj {
                m.insert(k, v);
            }
        }
    }
    (status, Json(serde_json::Value::Object(m)))
}

fn clean_policy_prefix(s: &str) -> &str {
    s.trim()
        .strip_prefix("policy_violation:")
        .map(|x| x.trim())
        .unwrap_or_else(|| s.trim())
}

pub fn core_router(policy_version: &'static str, deployment_env: GovaiEnvironment) -> Router {
    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route(
            "/pricing",
            get({
                let pv = policy_version;
                move || async move { pricing(pv).await }
            }),
        )
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

pub async fn pricing(policy_version: &'static str) -> (StatusCode, Json<serde_json::Value>) {
    let _ = policy_version;
    let plans = pricing::get_plans()
        .into_iter()
        .map(|p| {
            json!({
                "name": p.name,
                "evidence_events_per_month": p.evidence_events_per_month,
                "runs_per_month": p.runs_per_month,
                "events_per_run": p.events_per_run
            })
        })
        .collect::<Vec<_>>();

    (
        StatusCode::OK,
        Json(json!({
            "units": {
                "primary": "evidence_event",
                "secondary": "run"
            },
            "definitions": {
                "evidence_event": "successful POST /evidence append",
                "run": "unique run_id with at least one event per month"
            },
            "plans": plans
        })),
    )
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
    ledger_base: &'static str,
    policy_version: &'static str,
    deployment_env: GovaiEnvironment,
    policy: PolicyConfig,
    pool: DbPool,
    metering: MeteringConfig,
}

fn tenant_log_path(audit: &AuditState, headers: &HeaderMap) -> Result<String, String> {
    let tenant_id = project::require_tenant_id_for_ledger(headers, audit.deployment_env)?;
    Ok(project::resolve_ledger_path(audit.ledger_base, &tenant_id))
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
    let log_path = match tenant_log_path(&audit, &headers) {
        Ok(p) => p,
        Err(e) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                &e,
                "Missing tenant context. Provide `X-GovAI-Project` header (recommended) or a bearer API key (tenant fingerprint fallback).",
                Some(audit.policy_version),
                None,
            );
        }
    };

    if let Err(e) = prepare_event_for_ingest(&mut event, audit.deployment_env, &log_path) {
        return json_error(
            StatusCode::BAD_REQUEST,
            "policy_violation",
            clean_policy_prefix(&e),
            Some(audit.policy_version),
            Some(json!({ "details": e, "code": "environment_policy" })),
        );
    }

    if let Err(e) = policy::enforce(
        &event,
        &log_path,
        &audit.policy,
    ) {
        return json_error(
            StatusCode::BAD_REQUEST,
            "policy_violation",
            clean_policy_prefix(&e.message),
            Some(audit.policy_version),
            Some(json!({ "details": e.message, "code": e.code })),
        );
    }

    let existing = match collect_existing_and_reject_duplicate(&log_path, &event) {
        Ok(e) => e,
        Err(e) => {
            return json_error(
                StatusCode::CONFLICT,
                "duplicate_event",
                "This event_id already exists for this run_id. Use a new event_id or retry with idempotency handling.",
                Some(audit.policy_version),
                Some(json!({ "details": e })),
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
                return json_error(
                    StatusCode::UNAUTHORIZED,
                    "unauthorized",
                    "Missing or invalid Authorization bearer token.",
                    None,
                    None,
                );
            }
            Some(t) => key_fingerprint(t),
        };
        let team_id = match metering::team_id_for_key_hash(&audit.pool, &key_hash).await {
            Ok(t) => t,
            Err(e) => {
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "metering_error",
                    "We could not load metering information for this API key. Please retry; if it persists, contact support.",
                    Some(audit.policy_version),
                    Some(json!({ "details": e.to_string() })),
                );
            }
        };
        let team_id = match team_id {
            None => {
                return json_error(
                    StatusCode::FORBIDDEN,
                    "team_not_configured_for_api_key",
                    "This API key is valid, but it is not linked to a billing team. Ask an admin to configure billing for this key.",
                    Some(audit.policy_version),
                    None,
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
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "metering_error",
                    "We could not load metering counters. Please retry; if it persists, contact support.",
                    Some(audit.policy_version),
                    Some(json!({ "details": e.to_string() })),
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
            let team_s = team_id.to_string();
            let plan_s = plan_id_str(plan);
            return match r {
                MeteringReject::MonthlyRunLimit { used, limit } => (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(json!({
                        "ok": false,
                        "error": "monthly_run_limit_exceeded",
                        "code": "monthly_run_limit_exceeded",
                        "message": "Monthly run limit exceeded for this team. Start a new month or upgrade your plan.",
                        "metering": "on",
                        "count_kind": "new_runs_month",
                        "team_id": team_s,
                        "plan": plan_s,
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
                        "code": "monthly_event_limit_exceeded",
                        "message": "Monthly evidence event limit exceeded for this team. Start a new month or upgrade your plan.",
                        "metering": "on",
                        "count_kind": "evidence_events_month",
                        "team_id": team_s,
                        "plan": plan_s,
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
                        "code": "per_run_event_limit_exceeded",
                        "message": "This run has reached its per-run evidence event limit. Use a new run_id or upgrade your plan.",
                        "metering": "on",
                        "count_kind": "evidence_events_per_run",
                        "team_id": team_s,
                        "plan": plan_s,
                        "run_id": run_id,
                        "used": pre_count,
                        "event_count": would_be,
                        "limit": limit,
                        "year_month": ym,
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
            Err(evidence_usage::CheckEvidenceQuotaError::Exceeded(q)) => {
                return (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(json!({
                        "ok": false,
                        "error": "evidence_quota_exceeded",
                        "code": "evidence_quota_exceeded",
                        "message": "Monthly evidence event limit exceeded for this tenant. Wait until the next billing period or enable metering / upgrade your plan.",
                        "metering": "off",
                        "count_kind": "evidence_events",
                        "tenant_id": tid,
                        "used": q.used,
                        "limit": q.limit,
                        "period_start": q.period_start.format("%Y-%m-%d").to_string(),
                        "policy_version": audit.policy_version,
                    })),
                );
            }
            Err(evidence_usage::CheckEvidenceQuotaError::Database(e)) => {
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "db_error",
                    "We could not read usage counters. Please retry; if it persists, contact support.",
                    Some(audit.policy_version),
                    Some(json!({ "details": e })),
                );
            }
        }
    }

    match crate::audit_store::append_record(&log_path, event) {
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
                    return json_error(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "metering_persist_error",
                        "The event was appended, but metering counters could not be updated. Please retry; if it persists, contact support.",
                        Some(audit.policy_version),
                        Some(json!({ "details": e })),
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
                    return json_error(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "usage_persist_error",
                        "The event was appended, but usage counters could not be updated. Please retry; if it persists, contact support.",
                        Some(audit.policy_version),
                        Some(json!({ "details": e })),
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
        Err(e) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "append_error",
            "We could not append this evidence event. Please retry; if it persists, contact support.",
            Some(audit.policy_version),
            Some(json!({ "details": e })),
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
                return json_error(
                    StatusCode::UNAUTHORIZED,
                    "unauthorized",
                    "Missing or invalid Authorization bearer token.",
                    None,
                    None,
                );
            }
            Some(t) => key_fingerprint(t),
        };
        let team_id = match metering::team_id_for_key_hash(&audit.pool, &key_hash).await {
            Ok(t) => t,
            Err(e) => {
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "metering_error",
                    "We could not load metering information for this API key. Please retry; if it persists, contact support.",
                    Some(audit.policy_version),
                    Some(json!({ "details": e.to_string() })),
                );
            }
        };
        let Some(team_id) = team_id else {
            return json_error(
                StatusCode::FORBIDDEN,
                "team_not_configured_for_api_key",
                "This API key is valid, but it is not linked to a billing team. Ask an admin to configure billing for this key.",
                Some(audit.policy_version),
                None,
            );
        };
        let plan_name = pricing::resolve_plan(audit_api_key::raw_bearer_token(&headers).unwrap_or(""));
        let plan_limits = pricing::plan_limits_by_name(plan_name).unwrap_or(pricing::PlanLimits {
            name: "free",
            evidence_events_per_month: 2_500,
            runs_per_month: 25,
            events_per_run: 1_000,
        });
        let ym = metering::year_month_utc_now();
        let (new_run_ids, evidence_events) = match metering::load_monthly(&audit.pool, team_id, ym).await {
            Ok(x) => x,
            Err(e) => {
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "metering_error",
                    "We could not load metering counters. Please retry; if it persists, contact support.",
                    Some(audit.policy_version),
                    Some(json!({ "details": e.to_string() })),
                );
            }
        };
        let used_runs_u64 = new_run_ids.max(0) as u64;
        let used_events_u64 = evidence_events.max(0) as u64;
        let rem_runs = plan_limits.runs_per_month.saturating_sub(used_runs_u64);
        let rem_events = plan_limits
            .evidence_events_per_month
            .saturating_sub(used_events_u64);
        let metering_limits = metering::PlanLimits::for_plan(audit.metering.default_plan);
        return (
            StatusCode::OK,
            Json(json!({
                "metering": "on",
                "team_id": team_id.to_string(),
                "year_month": ym,
                "plan": plan_name,
                "new_run_ids": new_run_ids,
                "evidence_events": evidence_events,
                // Additive normalized usage surface (do not remove existing fields).
                "usage": {
                    "evidence_events": used_events_u64,
                    "runs": used_runs_u64
                },
                "limits": {
                    "evidence_events": plan_limits.evidence_events_per_month,
                    "runs": plan_limits.runs_per_month,
                    "events_per_run": plan_limits.events_per_run
                },
                "remaining": {
                    "evidence_events": rem_events,
                    "runs": rem_runs
                },
                "legacy_metering_limits": {
                    "max_runs_per_month": metering_limits.max_runs_per_month,
                    "max_events_per_month": metering_limits.max_events_per_month,
                    "max_events_per_run": metering_limits.max_events_per_run
                }
            })),
        );
    }

    let tenant_id = project::billing_tenant_id(&headers);
    match evidence_usage::get_evidence_usage(&audit.pool, &tenant_id).await {
        Ok((count, period)) => {
            let used_events_u64 = count.max(0) as u64;
            let plan_name = "free";
            let plan_limits = pricing::plan_limits_by_name(plan_name).unwrap_or(pricing::PlanLimits {
                name: "free",
                evidence_events_per_month: 2_500,
                runs_per_month: 25,
                events_per_run: 1_000,
            });
            let rem_events = plan_limits
                .evidence_events_per_month
                .saturating_sub(used_events_u64);
            let rem_runs = plan_limits.runs_per_month;
            (
                StatusCode::OK,
                Json(json!({
                "metering": "off",
                "tenant_id": tenant_id,
                "period_start": period.format("%Y-%m-%d").to_string(),
                "evidence_events_count": count,
                "limit": evidence_usage::FREE_TIER_EVIDENCE_LIMIT,
                // Additive normalized usage surface.
                "plan": plan_name,
                "usage": {
                    "evidence_events": used_events_u64,
                    "runs": 0
                },
                "limits": {
                    "evidence_events": plan_limits.evidence_events_per_month,
                    "runs": plan_limits.runs_per_month,
                    "events_per_run": plan_limits.events_per_run
                },
                "remaining": {
                    "evidence_events": rem_events,
                    "runs": rem_runs
                }
            })),
            )
        }
        Err(e) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            "We could not load usage for this tenant. Please retry; if it persists, contact support.",
            Some(audit.policy_version),
            Some(json!({ "details": e })),
        ),
    }
}

async fn verify(
    State(audit): State<AuditState>,
    headers: HeaderMap,
) -> (StatusCode, Json<serde_json::Value>) {
    let log_path = match tenant_log_path(&audit, &headers) {
        Ok(p) => p,
        Err(e) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                &e,
                "Missing tenant context. Provide `X-GovAI-Project` header (recommended) or a bearer API key (tenant fingerprint fallback).",
                Some(audit.policy_version),
                None,
            );
        }
    };
    match crate::audit_store::verify_chain(&log_path) {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "ok": true, "policy_version": audit.policy_version })),
        ),
        Err(e) => (
            StatusCode::OK,
            Json(json!({
                "ok": false,
                "error": "chain_invalid",
                "code": "chain_invalid",
                "message": "The append-only chain failed verification. The ledger may have been corrupted.",
                "details": e,
                "policy_version": audit.policy_version
            })),
        ),
    }
}

async fn bundle_route(
    State(audit): State<AuditState>,
    headers: HeaderMap,
    Query(q): Query<BundleQuery>,
) -> (StatusCode, Json<serde_json::Value>) {
    let log_path = match tenant_log_path(&audit, &headers) {
        Ok(p) => p,
        Err(e) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                &e,
                "Missing tenant context. Provide `X-GovAI-Project` header (recommended) or a bearer API key (tenant fingerprint fallback).",
                Some(audit.policy_version),
                None,
            )
        }
    };
    match bundle::collect_events_for_run(&log_path, &q.run_id) {
        Ok(events) => {
            let events = canonicalize_events(events);
            let lp = format!("rust/{}", log_path);
            let doc = bundle::bundle_document_value(&q.run_id, audit.policy_version, &lp, &events);
            (StatusCode::OK, Json(doc))
        }
        Err(e) => (
            StatusCode::OK,
            Json(json!({
                "ok": false,
                "error": "run_not_found",
                "code": "run_not_found",
                "message": "No events were found for this run_id in the current tenant ledger.",
                "details": e,
                "policy_version": audit.policy_version
            })),
        ),
    }
}

/// Machine-readable audit export: metadata, chain hashes, bundle digest, decision extracts, and timestamps.
/// Uses `bundle::bundle_document_value` and `bundle::bundle_sha256` (same as `/bundle` and `/bundle-hash`).
async fn export_run_route(
    State(audit): State<AuditState>,
    headers: HeaderMap,
    Path(run_id): Path<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    let run_id = run_id.trim().to_string();
    if run_id.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "run_id_required",
            "Missing required path parameter run_id.",
            Some(audit.policy_version),
            None,
        );
    }

    let log_path = match tenant_log_path(&audit, &headers) {
        Ok(p) => p,
        Err(e) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                &e,
                "Missing tenant context. Provide `X-GovAI-Project` header (recommended) or a bearer API key (tenant fingerprint fallback).",
                Some(audit.policy_version),
                None,
            );
        }
    };

    let events = match bundle::collect_events_for_run(&log_path, &run_id) {
        Ok(e) => e,
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "bundle_read_error",
                "We could not read events for this run_id. Please retry; if it persists, contact support.",
                Some(audit.policy_version),
                Some(json!({ "run_id": run_id, "details": e })),
            );
        }
    };
    if events.is_empty() {
        return json_error(
            StatusCode::NOT_FOUND,
            "run_not_found",
            "No events were found for this run_id in the current tenant ledger.",
            Some(audit.policy_version),
            Some(json!({ "run_id": run_id })),
        );
    }

    let events = canonicalize_events(events);
    let log_path_report = format!("rust/{}", log_path);
    let bundle_doc = bundle::bundle_document_value(&run_id, audit.policy_version, &log_path_report, &events);
    let artifact_path = bundle::find_model_artifact_path(&events);
    let bundle_sha256 = bundle::bundle_sha256(
        &run_id,
        audit.policy_version,
        &log_path_report,
        artifact_path.as_deref(),
        &events,
    );

    let chain_records = match crate::audit_store::collect_stored_records_for_run(&log_path, &run_id) {
        Ok(r) => r,
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "chain_read_error",
                "We could not load chain records for this run_id. Please retry; if it persists, contact support.",
                Some(audit.policy_version),
                Some(json!({ "run_id": run_id, "details": e })),
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
            "log_path": log_path_report,
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
    headers: HeaderMap,
    Query(q): Query<BundleHashQuery>,
) -> (StatusCode, Json<serde_json::Value>) {
    let log_path = match tenant_log_path(&audit, &headers) {
        Ok(p) => p,
        Err(e) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                &e,
                "Missing tenant context. Provide `X-GovAI-Project` header (recommended) or a bearer API key (tenant fingerprint fallback).",
                Some(audit.policy_version),
                None,
            )
        }
    };
    match bundle::collect_events_for_run(&log_path, &q.run_id) {
        Ok(events) => {
            let events = canonicalize_events(events);
            let artifact_path = bundle::find_model_artifact_path(&events);
            let lp = format!("rust/{}", log_path);

            let digest = bundle::bundle_sha256(
                &q.run_id,
                audit.policy_version,
                &lp,
                artifact_path.as_deref(),
                &events,
            );

            (StatusCode::OK, Json(json!({
                "ok": true,
                "run_id": q.run_id,
                "policy_version": audit.policy_version,
                "bundle_sha256": digest
            })))
        }
        Err(e) => (
            StatusCode::OK,
            Json(json!({
                "ok": false,
                "error": "run_not_found",
                "code": "run_not_found",
                "message": "No events were found for this run_id in the current tenant ledger.",
                "details": e,
                "policy_version": audit.policy_version
            })),
        ),
    }
}

async fn verify_log(
    State(audit): State<AuditState>,
    headers: HeaderMap,
) -> (StatusCode, String) {
    let log_path = match tenant_log_path(&audit, &headers) {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                json!({
                    "ok": false,
                    "error": e,
                    "code": e,
                    "message": "Missing tenant context. Provide `X-GovAI-Project` header (recommended) or a bearer API key (tenant fingerprint fallback).",
                    "policy_version": audit.policy_version
                })
                .to_string(),
            )
        }
    };
    match verify_chain::verify_chain(&log_path) {
        Ok(_) => (StatusCode::OK, "{\"ok\":true}".to_string()),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            json!({
                "ok": false,
                "error": "chain_invalid",
                "code": "chain_invalid",
                "message": "The append-only chain failed verification. The ledger may have been corrupted.",
                "details": e
            })
            .to_string(),
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
        ledger_base: log_path,
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
    headers: HeaderMap,
    Query(q): Query<ComplianceSummaryQuery>,
) -> (StatusCode, Json<serde_json::Value>) {
    let log_path = match tenant_log_path(&audit, &headers) {
        Ok(p) => p,
        Err(e) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                &e,
                "Missing tenant context. Provide `X-GovAI-Project` header (recommended) or a bearer API key (tenant fingerprint fallback).",
                Some(audit.policy_version),
                Some(json!({ "run_id": q.run_id })),
            )
        }
    };
    match bundle::collect_events_for_run(&log_path, &q.run_id) {
        Ok(events) => {
            let events = canonicalize_events(events);
            let artifact_path = bundle::find_model_artifact_path(&events);
            let lp = format!("rust/{}", log_path);
            let bundle_hash = bundle::bundle_sha256(
                &q.run_id,
                audit.policy_version,
                &lp,
                artifact_path.as_deref(),
                &events,
            );
            let derived = projection::derive_current_state_from_events_with_context(
                &q.run_id,
                &events,
                Some(bundle_hash),
                None,
            );
            let verdict = compliance_verdict_from_state(&derived);
            (StatusCode::OK, Json(json!({
                "ok": true,
                "schema_version": "aigov.compliance_summary.v2",
                "policy_version": audit.policy_version,
                "run_id": q.run_id,
                "verdict": verdict,
                "current_state": derived,
            })))
        }
        Err(e) => (
            StatusCode::OK,
            Json(json!({
                "ok": false,
                "schema_version": "aigov.compliance_summary.v2",
                "error": "run_not_found",
                "code": "run_not_found",
                "message": "No events were found for this run_id in the current tenant ledger.",
                "details": e,
                "policy_version": audit.policy_version,
                "run_id": q.run_id,
            })),
        ),
    }
}

fn compliance_verdict_from_state(state: &projection::ComplianceCurrentState) -> &'static str {
    // Authoritative rule order (server-side): evaluation → approval → promotion.
    // - INVALID: evaluation explicitly failed.
    // - VALID: evaluation passed, risk reviewed + human approved (approve), and promotion executed.
    // - BLOCKED: anything else (missing prerequisites / not yet promoted).
    if state.model.evaluation_passed == Some(false) {
        return "INVALID";
    }

    let eval_ok = state.model.evaluation_passed == Some(true);
    let risk_ok = state.approval.risk_review_decision.as_deref() == Some("approve");
    let approval_ok = state.approval.human_approval_decision.as_deref() == Some("approve");
    let promoted = state.model.promotion.model_promoted_present && state.model.promotion.state == "promoted";

    if eval_ok && risk_ok && approval_ok && promoted {
        "VALID"
    } else {
        "BLOCKED"
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
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "config_error",
                "Server authentication is not configured correctly.",
                None,
                Some(json!({ "details": e })),
            )
        }
    };

    let user = match crate::auth::require_user(&cfg, &headers).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let teams = match db::list_user_teams(&state.pool, &user.user_id).await {
        Ok(t) => t,
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "db_error",
                "We could not load your teams. Please retry.",
                None,
                Some(json!({ "details": e.to_string() })),
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
                    Json(json!({
                        "ok": false,
                        "error": "invalid_team_id",
                        "code": "invalid_team_id",
                        "message": "`x-govai-team-id` must be a valid UUID."
                    })),
                ))
            }
        };

        let ok = match db::is_team_member(pool, team_id, user.user_id).await {
            Ok(b) => b,
            Err(e) => {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({
                        "ok": false,
                        "error": "db_error",
                        "code": "db_error",
                        "message": "We could not verify team membership. Please retry.",
                        "details": e.to_string()
                    })),
                ))
            }
        };

        if !ok {
            return Err((
                StatusCode::FORBIDDEN,
                Json(json!({
                    "ok": false,
                    "error": "not_team_member",
                    "code": "not_team_member",
                    "message": "You are not a member of the selected team."
                })),
            ));
        }

        return Ok(team_id);
    }

    match db::get_default_team_for_user(pool, user.user_id).await {
        Ok(Some(team_id)) => Ok(team_id),
        Ok(None) => match db::bootstrap_team_for_user(pool, user.user_id).await {
            Ok(team_id) => Ok(team_id),
            Err(e) => Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "ok": false,
                    "error": "db_error",
                    "code": "db_error",
                    "message": "We could not create a default team for this user.",
                    "details": e.to_string()
                })),
            )),
        },
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "ok": false,
                "error": "db_error",
                "code": "db_error",
                "message": "We could not load your default team.",
                "details": e.to_string()
            })),
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
                Json(json!({
                    "ok": false,
                    "error": "not_team_member",
                    "code": "not_team_member",
                    "message": "You are not a member of the selected team."
                })),
            ))
        }
        Err(e) => {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "ok": false,
                    "error": "db_error",
                    "code": "db_error",
                    "message": "We could not load your permissions. Please retry.",
                    "details": e.to_string()
                })),
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
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "config_error",
                "Server authentication is not configured correctly.",
                None,
                Some(json!({ "details": e })),
            )
        }
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
                "ok": false,
                "error": "forbidden",
                "code": "insufficient_role",
                "message": "You do not have permission to perform this action.",
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
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "db_error",
                "We could not create the assessment. Please retry.",
                None,
                Some(json!({ "details": e.to_string() })),
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
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "config_error",
                "Server authentication is not configured correctly.",
                None,
                Some(json!({ "details": e })),
            )
        }
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
                "ok": false,
                "error": "forbidden",
                "code": "insufficient_role",
                "message": "You do not have permission to perform this action.",
                "reason": "INSUFFICIENT_ROLE",
                "required_permission": "review_queue_view"
            })),
        );
    }

    let filter = q.state.as_deref().filter(|s| !s.trim().is_empty());
    let rows = match db::list_compliance_workflow(&state.pool, team_id, filter).await {
        Ok(r) => r,
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "db_error",
                "We could not load workflow items. Please retry.",
                None,
                Some(json!({ "details": e.to_string() })),
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
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "config_error",
                "Server authentication is not configured correctly.",
                None,
                Some(json!({ "details": e })),
            )
        }
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
                "ok": false,
                "error": "forbidden",
                "code": "insufficient_role",
                "message": "You do not have permission to perform this action.",
                "reason": "INSUFFICIENT_ROLE",
                "required_permission": "decision_submit"
            })),
        );
    }

    let run_id = body.run_id.trim().to_string();
    if run_id.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "run_id_required",
            "Missing required field `run_id`.",
            None,
            None,
        );
    }

    let rec = match db::upsert_workflow_pending(&state.pool, team_id, &run_id, user.user_id).await {
        Ok(r) => r,
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "db_error",
                "We could not register this run in the workflow. Please retry.",
                None,
                Some(json!({ "details": e.to_string() })),
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
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "config_error",
                "Server authentication is not configured correctly.",
                None,
                Some(json!({ "details": e })),
            )
        }
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
                "ok": false,
                "error": "forbidden",
                "code": "insufficient_role",
                "message": "You do not have permission to perform this action.",
                "reason": "INSUFFICIENT_ROLE",
                "required_permission": "review_queue_view"
            })),
        );
    }

    let rid = run_id.trim();
    let rec = match db::get_compliance_workflow(&state.pool, team_id, rid).await {
        Ok(r) => r,
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "db_error",
                "We could not load this workflow item. Please retry.",
                None,
                Some(json!({ "details": e.to_string() })),
            )
        }
    };

    match rec {
        Some(r) => (StatusCode::OK, Json(json_ok_workflow(workflow_to_out(r)))),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({
                "ok": false,
                "error": "not_found",
                "code": "not_found",
                "message": "Workflow item not found for this run_id."
            })),
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
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "config_error",
                "Server authentication is not configured correctly.",
                None,
                Some(json!({ "details": e })),
            )
        }
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
                "ok": false,
                "error": "forbidden",
                "code": "insufficient_role",
                "message": "You do not have permission to perform this action.",
                "reason": "INSUFFICIENT_ROLE",
                "required_permission": "decision_submit"
            })),
        );
    }

    let rid = run_id.trim().to_string();
    if rid.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "run_id_required",
            "Missing required path parameter run_id.",
            None,
            None,
        );
    }

    let approve = match body.decision.trim() {
        "approve" => true,
        "reject" => false,
        _ => {
            return json_error(
                StatusCode::BAD_REQUEST,
                "invalid_decision",
                "Invalid decision. Expected `approve` or `reject`.",
                None,
                Some(json!({ "expected": ["approve", "reject"] })),
            )
        }
    };

    let rec = match db::transition_workflow_review(&state.pool, team_id, &rid, user.user_id, approve)
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "db_error",
                "We could not persist the review decision. Please retry.",
                None,
                Some(json!({ "details": e.to_string() })),
            )
        }
    };

    match rec {
        Some(r) => (StatusCode::OK, Json(json_ok_workflow(workflow_to_out(r)))),
        None => (
            StatusCode::CONFLICT,
            Json(json!({
                "ok": false,
                "error": "invalid_state",
                "code": "invalid_state",
                "message": "Invalid workflow state: expected pending_review for review decision."
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
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "config_error",
                "Server authentication is not configured correctly.",
                None,
                Some(json!({ "details": e })),
            )
        }
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
                "ok": false,
                "error": "forbidden",
                "code": "insufficient_role",
                "message": "You do not have permission to perform this action.",
                "reason": "INSUFFICIENT_ROLE",
                "required_permission": "promotion_action"
            })),
        );
    }

    let rid = run_id.trim().to_string();
    if rid.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "run_id_required",
            "Missing required path parameter run_id.",
            None,
            None,
        );
    }

    let allow = match body.decision.trim() {
        "allow" => true,
        "block" => false,
        _ => {
            return json_error(
                StatusCode::BAD_REQUEST,
                "invalid_decision",
                "Invalid decision. Expected `allow` or `block`.",
                None,
                Some(json!({ "expected": ["allow", "block"] })),
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
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "db_error",
                "We could not persist the promotion decision. Please retry.",
                None,
                Some(json!({ "details": e.to_string() })),
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
                "ok": false,
                "error": "invalid_state",
                "code": "invalid_state",
                "message": "Invalid workflow state: expected approved for promotion decision."
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
