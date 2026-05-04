use crate::api_usage::key_fingerprint;
use crate::api_usage::ApiUsageState;
use crate::audit_api_key;
use crate::billing_trace;
use crate::stripe_billing;
use crate::stripe_webhook;
use crate::auth::{AuthConfig, CurrentUser};
use crate::bundle;
use crate::db::{self, DbPool};
use crate::evidence_usage;
use crate::govai_environment::GovaiEnvironment;
use crate::metering::{self, GovaiPlan, MeteringConfig, MeteringReject};
use crate::policy;
use crate::policy_config::PolicyConfig;
use crate::pricing;
use crate::project;
use crate::projection;
use crate::rbac;
use crate::schema::EvidenceEvent;
use crate::verify_chain;

use axum::body::Bytes;
use axum::extract::{Path, Query, Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::{self, Next};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Datelike, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use uuid::Uuid;

use crate::api_error::{api_error, api_error_with};
use crate::ledger_storage;

fn clean_policy_prefix(s: &str) -> &str {
    s.trim()
        .strip_prefix("policy_violation:")
        .map(|x| x.trim())
        .unwrap_or_else(|| s.trim())
}

fn api_err(
    status: StatusCode,
    code: &str,
    message: &str,
    hint: &str,
    details: Option<serde_json::Value>,
    policy_version: Option<&str>,
    extra_top_level: Option<serde_json::Value>,
) -> (StatusCode, Json<serde_json::Value>) {
    let mut extra = serde_json::Map::new();
    if let Some(pv) = policy_version {
        extra.insert(
            "policy_version".to_string(),
            serde_json::Value::String(pv.to_string()),
        );
    }
    if let Some(ex) = extra_top_level {
        if let serde_json::Value::Object(obj) = ex {
            for (k, v) in obj {
                extra.insert(k, v);
            }
        }
    }
    let extra = if extra.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(extra))
    };
    api_error_with(status, code, message, hint, details, extra)
}

fn normalize_error_code(raw: &str) -> String {
    raw.trim()
        .chars()
        .map(|c| match c {
            'a'..='z' => c.to_ascii_uppercase(),
            'A'..='Z' | '0'..='9' => c,
            _ => '_',
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

fn tenant_scoped_not_found_hint() -> &'static str {
    "The resource was not found under the current tenant context. Check the run id, API key, and tenant or project header."
}

/// Backward-compatible shim for older call sites. Prefer `api_err` for new code.
fn json_error(
    status: StatusCode,
    error: &str,
    message: &str,
    policy_version: Option<&str>,
    extra: Option<serde_json::Value>,
) -> (StatusCode, Json<serde_json::Value>) {
    let code = normalize_error_code(error);
    let (details, extra_top) = match extra {
        None => (None, None),
        Some(serde_json::Value::Object(mut obj)) => {
            let details = obj.remove("details");
            let extra = if obj.is_empty() {
                None
            } else {
                Some(serde_json::Value::Object(obj))
            };
            (details, extra)
        }
        Some(v) => (Some(v), None),
    };
    api_err(
        status,
        &code,
        message,
        "Retry. If this persists, contact support.",
        details,
        policy_version,
        extra_top,
    )
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

/// Liveness only (no DB or disk checks). For Postgres + migrations + ledger checks use **`GET /ready`** on the audit router.
pub async fn health() -> (StatusCode, Json<serde_json::Value>) {
    (StatusCode::OK, Json(json!({ "ok": true })))
}

pub async fn status(
    policy_version: &'static str,
    deployment_env: GovaiEnvironment,
) -> Json<serde_json::Value> {
    let base_url = std::env::var("GOVAI_BASE_URL")
        .or_else(|_| std::env::var("AIGOV_BASE_URL"))
        .ok()
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty());
    Json(json!({
        "ok": true,
        "policy_version": policy_version,
        "environment": deployment_env.as_str(),
        "base_url": base_url,
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
) -> Result<Vec<EvidenceEvent>, String> {
    let canon = deployment.as_str();
    if let Some(ref claimed) = event.environment {
        let norm = normalize_env_label(claimed)
            .ok_or_else(|| format!("policy_violation: invalid event.environment={claimed:?}"))?;
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
    Ok(existing)
}

#[derive(Clone)]
pub struct AuditState {
    pub ledger_base: &'static str,
    pub policy_version: &'static str,
    pub deployment_env: GovaiEnvironment,
    pub policy: PolicyConfig,
    pub pool: DbPool,
    pub metering: MeteringConfig,
}

async fn stripe_webhook_route(
    State(audit): State<AuditState>,
    headers: HeaderMap,
    body: Bytes,
) -> (StatusCode, Json<serde_json::Value>) {
    let sig = headers
        .get(axum::http::HeaderName::from_static("stripe-signature"))
        .and_then(|v| v.to_str().ok());
    let (status, j) =
        stripe_webhook::handle_stripe_webhook(&audit.pool, body.as_ref(), sig).await;
    (status, Json(j))
}

async fn billing_enforcement_middleware(
    State(audit): State<AuditState>,
    request: Request,
    next: Next,
) -> axum::response::Response {
    let path = request.uri().path().to_string();
    if stripe_billing::billing_enforcement_exempt_path(path.as_str()) {
        return next.run(request).await;
    }
    if !stripe_billing::billing_enforcement_enabled() {
        return next.run(request).await;
    }
    let headers = request.headers().clone();
    let tenant_res =
        stripe_billing::ledger_tenant_for_billing_headers(&headers, audit.deployment_env);
    let tenant_id = match tenant_res {
        Ok(t) => t,
        Err(_) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "ok": false,
                    "error": {
                        "code": "MISSING_API_KEY",
                        "message": "Missing API key.",
                        "hint": "Provide `Authorization: Bearer <api_key>`."
                    }
                })),
            )
                .into_response();
        }
    };
    match stripe_billing::tenant_subscription_gate(&audit.pool, &tenant_id).await {
        Ok(true) => next.run(request).await,
        Ok(false) => (
            StatusCode::FORBIDDEN,
            Json(json!({
                "ok": false,
                "error": {
                    "code": "BILLING_INACTIVE",
                    "message": "Billing subscription is not active.",
                    "hint": "Update payment details in the billing portal or complete checkout."
                }
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "ok": false,
                "error": {
                    "code": "BILLING_GATE_ERROR",
                    "message": "Could not verify billing state.",
                    "hint": "Retry in a moment. If this persists, contact support.",
                    "details": { "raw": e.to_string() }
                }
            })),
        )
            .into_response(),
    }
}

/// Returns `(ledger_file_path, ledger_tenant_id)`; tenant id is API-key-derived only.
fn tenant_log_path(audit: &AuditState, headers: &HeaderMap) -> Result<(String, String), String> {
    let tenant_id = project::require_tenant_id_for_ledger(headers, audit.deployment_env)?;
    Ok((
        project::resolve_ledger_path(audit.ledger_base, &tenant_id),
        tenant_id,
    ))
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
    let (log_path, ledger_tid) = match tenant_log_path(&audit, &headers) {
        Ok(p) => p,
        Err(e) => {
            return api_err(
                StatusCode::BAD_REQUEST,
                "MISSING_TENANT_CONTEXT",
                "Missing tenant context.",
                "Provide `Authorization: Bearer <api_key>`.",
                Some(serde_json::Value::String(e)),
                Some(audit.policy_version),
                None,
            );
        }
    };

    let existing = match prepare_event_for_ingest(&mut event, audit.deployment_env, &log_path) {
        Ok(x) => x,
        Err(e) => {
            return api_err(
                StatusCode::BAD_REQUEST,
                "POLICY_VIOLATION",
                clean_policy_prefix(&e),
                "Fix the request payload to satisfy the environment/policy constraints and retry.",
                Some(json!({ "raw": e, "policy_code": "environment_policy" })),
                Some(audit.policy_version),
                None,
            );
        }
    };

    if let Err(e) = policy::enforce(&event, &log_path, &audit.policy) {
        return api_err(
            StatusCode::BAD_REQUEST,
            "POLICY_VIOLATION",
            clean_policy_prefix(&e.message),
            "Fix the request payload to satisfy the policy and retry.",
            Some(json!({ "raw": e.message, "policy_code": e.code })),
            Some(audit.policy_version),
            None,
        );
    }

    // Used for usage counters after a successful append (avoid double counting on rejected ingests).
    let is_discovery_scan = event.event_type == "ai_discovery_reported";

    // Legacy `govai_usage_counters` tenant (only when `GOVAI_METERING` is off); same scope as `GET /usage`.
    let tenant_id_legacy = if !audit.metering.enabled {
        Some(project::billing_tenant_id(&headers))
    } else {
        None
    };

    let run_id = event.run_id.clone();

    // Used for metering/quota prechecks (append remains authoritative and atomic).
    let pre_count = existing.len() as u64;
    let next_count = pre_count + 1;
    let is_new_run = pre_count == 0;

    let metering_team = if audit.metering.enabled {
        let key_hash = match audit_api_key::raw_bearer_token(&headers) {
            None => {
                return api_err(
                    StatusCode::UNAUTHORIZED,
                    "MISSING_API_KEY",
                    "Missing API key.",
                    "Provide `Authorization: Bearer <api_key>`.",
                    None,
                    None,
                    None,
                );
            }
            Some(t) => key_fingerprint(t),
        };
        let team_id = match metering::team_id_for_key_hash(&audit.pool, &key_hash).await {
            Ok(t) => t,
            Err(e) => {
                return api_err(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "METERING_ERROR",
                    "We could not load metering information for this API key.",
                    "Retry in a moment. If this persists, contact support (this is a server-side issue).",
                    Some(json!({ "raw": e.to_string() })),
                    Some(audit.policy_version),
                    None,
                );
            }
        };
        let team_id = match team_id {
            None => {
                return api_err(
                    StatusCode::FORBIDDEN,
                    "TEAM_NOT_CONFIGURED",
                    "This API key is valid, but it is not linked to a billing team.",
                    "Ask an admin to configure billing for this API key (or use a key that is linked to a team).",
                    None,
                    Some(audit.policy_version),
                    None,
                );
            }
            Some(t) => t,
        };
        let plan = audit.metering.default_plan;
        let limits = metering::PlanLimits::for_plan(plan);
        let ym = metering::year_month_utc_now();
        let (new_run_ids, evidence_events) = match metering::load_monthly(&audit.pool, team_id, ym)
            .await
        {
            Ok(x) => x,
            Err(e) => {
                return api_err(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "METERING_ERROR",
                    "We could not load metering counters.",
                    "Retry in a moment. If this persists, contact support (this is a server-side issue).",
                    Some(json!({ "raw": e.to_string() })),
                    Some(audit.policy_version),
                    None,
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
                MeteringReject::MonthlyRunLimit { used, limit } => api_err(
                    StatusCode::TOO_MANY_REQUESTS,
                    "MONTHLY_RUN_LIMIT_EXCEEDED",
                    "Monthly run limit exceeded for this team.",
                    "Start a new month, or upgrade your plan.",
                    Some(json!({ "used": used, "limit": limit })),
                    Some(audit.policy_version),
                    Some(json!({
                        "metering": "on",
                        "count_kind": "new_runs_month",
                        "team_id": team_s,
                        "plan": plan_s,
                        "used": used,
                        "limit": limit,
                        "year_month": ym,
                    })),
                ),
                MeteringReject::MonthlyEventLimit { used, limit } => api_err(
                    StatusCode::TOO_MANY_REQUESTS,
                    "MONTHLY_EVENT_LIMIT_EXCEEDED",
                    "Monthly evidence event limit exceeded for this team.",
                    "Start a new month, or upgrade your plan.",
                    Some(json!({ "used": used, "limit": limit })),
                    Some(audit.policy_version),
                    Some(json!({
                        "metering": "on",
                        "count_kind": "evidence_events_month",
                        "team_id": team_s,
                        "plan": plan_s,
                        "used": used,
                        "limit": limit,
                        "year_month": ym,
                    })),
                ),
                MeteringReject::PerRunEventLimit {
                    run_id,
                    would_be,
                    limit,
                } => api_err(
                    StatusCode::TOO_MANY_REQUESTS,
                    "PER_RUN_EVENT_LIMIT_EXCEEDED",
                    "This run has reached its per-run evidence event limit.",
                    "Use a new `run_id`, or upgrade your plan.",
                    Some(
                        json!({ "used": pre_count, "would_be": would_be, "limit": limit, "run_id": run_id }),
                    ),
                    Some(audit.policy_version),
                    Some(json!({
                        "metering": "on",
                        "count_kind": "evidence_events_per_run",
                        "team_id": team_s,
                        "plan": plan_s,
                        "run_id": run_id,
                        "used": pre_count,
                        "event_count": would_be,
                        "limit": limit,
                        "year_month": ym,
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
                    api_err(
                        StatusCode::TOO_MANY_REQUESTS,
                        "MONTHLY_EVENT_LIMIT_EXCEEDED",
                        "Monthly evidence event limit exceeded for this tenant.",
                        "Wait until the next billing period, or enable metering / upgrade your plan.",
                        Some(json!({ "used": q.used, "limit": q.limit, "period_start": q.period_start.format("%Y-%m-%d").to_string() })),
                        Some(audit.policy_version),
                        Some(json!({
                            "metering": "off",
                            "count_kind": "evidence_events",
                            "tenant_id": tid,
                            "used": q.used,
                            "limit": q.limit,
                            "period_start": q.period_start.format("%Y-%m-%d").to_string(),
                        })),
                    )
                    .1,
                );
            }
            Err(evidence_usage::CheckEvidenceQuotaError::Database(e)) => {
                return api_err(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "DB_ERROR",
                    "We could not read usage counters.",
                    "Retry in a moment. If this persists, contact support (this is a server-side issue).",
                    Some(json!({ "raw": e })),
                    Some(audit.policy_version),
                    None,
                );
            }
        }
    }

    match crate::audit_store::append_record_atomic_with_run_count(&log_path, event) {
        Ok((rec, pre_count_usize)) => {
            let pre_count = pre_count_usize as u64;
            let next_count = pre_count + 1;
            let is_new_run = pre_count == 0;
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
                    return api_err(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "METERING_PERSIST_ERROR",
                        "The event was appended, but metering counters could not be updated.",
                        "Retry in a moment. If this persists, contact support (this is a server-side issue).",
                        Some(json!({ "raw": e })),
                        Some(audit.policy_version),
                        None,
                    );
                }

                // Operational usage: discovery scans are counted when discovery evidence is accepted.
                if is_discovery_scan {
                    let _ = metering::increment_team_op_counter(
                        &audit.pool,
                        team_id,
                        ym,
                        metering::TeamOpCounter::DiscoveryScan,
                    )
                    .await;
                }

                billing_trace::record_evidence_ingest_unit(&audit.pool, &ledger_tid, &run_id).await;
                let _ = stripe_billing::record_usage_attribution(
                    &audit.pool,
                    &ledger_tid,
                    stripe_billing::BILLING_UNIT_EVIDENCE_EVENT,
                    &run_id,
                    None,
                )
                .await;
                if is_discovery_scan {
                    let _ = stripe_billing::record_usage_attribution(
                        &audit.pool,
                        &ledger_tid,
                        stripe_billing::BILLING_UNIT_DISCOVERY_SCAN,
                        &run_id,
                        None,
                    )
                    .await;
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
                    return api_err(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "USAGE_PERSIST_ERROR",
                        "The event was appended, but usage counters could not be updated.",
                        "Retry in a moment. If this persists, contact support (this is a server-side issue).",
                        Some(json!({ "raw": e })),
                        Some(audit.policy_version),
                        None,
                    );
                }

                if is_discovery_scan {
                    if let Err(e) =
                        evidence_usage::increment_discovery_scan_usage(&audit.pool, tid).await
                    {
                        return api_err(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "USAGE_PERSIST_ERROR",
                            "The event was appended, but usage counters could not be updated.",
                            "Retry in a moment. If this persists, contact support (this is a server-side issue).",
                            Some(json!({ "raw": e })),
                            Some(audit.policy_version),
                            None,
                        );
                    }
                }

                billing_trace::record_evidence_ingest_unit(&audit.pool, &ledger_tid, &run_id).await;
                let _ = stripe_billing::record_usage_attribution(
                    &audit.pool,
                    &ledger_tid,
                    stripe_billing::BILLING_UNIT_EVIDENCE_EVENT,
                    &run_id,
                    None,
                )
                .await;
                if is_discovery_scan {
                    let _ = stripe_billing::record_usage_attribution(
                        &audit.pool,
                        &ledger_tid,
                        stripe_billing::BILLING_UNIT_DISCOVERY_SCAN,
                        &run_id,
                        None,
                    )
                    .await;
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
        Err(e) => {
            if e.contains("duplicate event_id for run_id") {
                api_err(
                    StatusCode::CONFLICT,
                    "DUPLICATE_EVENT_ID",
                    "This event_id already exists for this run_id.",
                    "Use a new `event_id`, or treat this request as an idempotent retry and stop sending duplicates.",
                    Some(json!({ "raw": e })),
                    Some(audit.policy_version),
                    None,
                )
            } else {
                api_err(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "APPEND_ERROR",
                    "We could not append this evidence event.",
                    "Retry in a moment. If this persists, contact support (this is a server-side issue).",
                    Some(json!({ "raw": e })),
                    Some(audit.policy_version),
                    None,
                )
            }
        }
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
                return api_err(
                    StatusCode::UNAUTHORIZED,
                    "MISSING_API_KEY",
                    "Missing API key.",
                    "Provide `Authorization: Bearer <api_key>`.",
                    None,
                    None,
                    None,
                );
            }
            Some(t) => key_fingerprint(t),
        };
        let team_id = match metering::team_id_for_key_hash(&audit.pool, &key_hash).await {
            Ok(t) => t,
            Err(e) => {
                return api_err(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "METERING_ERROR",
                    "We could not load metering information for this API key.",
                    "Retry in a moment. If this persists, contact support (this is a server-side issue).",
                    Some(json!({ "raw": e.to_string() })),
                    Some(audit.policy_version),
                    None,
                );
            }
        };
        let Some(team_id) = team_id else {
            return api_err(
                StatusCode::FORBIDDEN,
                "TEAM_NOT_CONFIGURED",
                "This API key is valid, but it is not linked to a billing team.",
                "Ask an admin to configure billing for this API key (or use a key that is linked to a team).",
                None,
                Some(audit.policy_version),
                None,
            );
        };
        let plan_name =
            pricing::resolve_plan(audit_api_key::raw_bearer_token(&headers).unwrap_or(""));
        let plan_limits = pricing::plan_limits_by_name(plan_name).unwrap_or(pricing::PlanLimits {
            name: "free",
            evidence_events_per_month: 2_500,
            runs_per_month: 25,
            events_per_run: 1_000,
        });
        let ym = metering::year_month_utc_now();
        let (new_run_ids, evidence_events) = match metering::load_monthly(&audit.pool, team_id, ym)
            .await
        {
            Ok(x) => x,
            Err(e) => {
                return api_err(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "METERING_ERROR",
                    "We could not load metering counters.",
                    "Retry in a moment. If this persists, contact support (this is a server-side issue).",
                    Some(json!({ "raw": e.to_string() })),
                    Some(audit.policy_version),
                    None,
                );
            }
        };
        let (compliance_checks, exports, discovery_scans) = match metering::load_monthly_ops(
            &audit.pool,
            team_id,
            ym,
        )
        .await
        {
            Ok(x) => x,
            Err(e) => {
                return api_err(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "METERING_ERROR",
                        "We could not load usage counters.",
                        "Retry in a moment. If this persists, contact support (this is a server-side issue).",
                        Some(json!({ "raw": e.to_string() })),
                        Some(audit.policy_version),
                        None,
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
                "compliance_checks": compliance_checks,
                "exports": exports,
                "discovery_scans": discovery_scans,
                // Additive normalized usage surface (do not remove existing fields).
                "usage": {
                    "evidence_events": used_events_u64,
                    "runs": used_runs_u64,
                    "compliance_checks": compliance_checks.max(0) as u64,
                    "exports": exports.max(0) as u64,
                    "discovery_scans": discovery_scans.max(0) as u64
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
    match evidence_usage::get_usage_counters(&audit.pool, &tenant_id).await {
        Ok((evidence_count, compliance_checks, exports, discovery_scans, period)) => {
            let used_events_u64 = evidence_count.max(0) as u64;
            let plan_name = "free";
            let plan_limits =
                pricing::plan_limits_by_name(plan_name).unwrap_or(pricing::PlanLimits {
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
                    "evidence_events_count": evidence_count,
                    "compliance_checks_count": compliance_checks,
                    "exports_count": exports,
                    "discovery_scans_count": discovery_scans,
                    "limit": evidence_usage::FREE_TIER_EVIDENCE_LIMIT,
                    // Additive normalized usage surface.
                    "plan": plan_name,
                    "usage": {
                        "evidence_events": used_events_u64,
                        "runs": 0,
                        "compliance_checks": compliance_checks.max(0) as u64,
                        "exports": exports.max(0) as u64,
                        "discovery_scans": discovery_scans.max(0) as u64
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
        Err(e) => api_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "We could not load usage for this tenant.",
            "Retry in a moment. If this persists, contact support (this is a server-side issue).",
            Some(json!({ "raw": e.to_string() })),
            Some(audit.policy_version),
            None,
        ),
    }
}

async fn verify(
    State(audit): State<AuditState>,
    headers: HeaderMap,
) -> (StatusCode, Json<serde_json::Value>) {
    let (log_path, _) = match tenant_log_path(&audit, &headers) {
        Ok(p) => p,
        Err(e) => {
            return api_err(
                StatusCode::BAD_REQUEST,
                "MISSING_TENANT_CONTEXT",
                "Missing tenant context.",
                "Provide `Authorization: Bearer <api_key>`.",
                Some(serde_json::Value::String(e)),
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
        Err(e) => api_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "CHAIN_INVALID",
            "The append-only chain failed verification. The ledger may have been corrupted.",
            "Retry later. If this persists, contact support (this is a server-side integrity issue).",
            Some(json!({ "raw": e })),
            Some(audit.policy_version),
            None,
        ),
    }
}

async fn bundle_route(
    State(audit): State<AuditState>,
    headers: HeaderMap,
    Query(q): Query<BundleQuery>,
) -> (StatusCode, Json<serde_json::Value>) {
    let (log_path, _) = match tenant_log_path(&audit, &headers) {
        Ok(p) => p,
        Err(e) => {
            return api_err(
                StatusCode::BAD_REQUEST,
                "MISSING_TENANT_CONTEXT",
                "Missing tenant context.",
                "Provide `Authorization: Bearer <api_key>`.",
                Some(serde_json::Value::String(e)),
                Some(audit.policy_version),
                None,
            )
        }
    };
    match bundle::collect_events_for_run(&log_path, &q.run_id) {
        Ok(events) => {
            if events.is_empty() {
                return api_err(
                    StatusCode::NOT_FOUND,
                    "RUN_NOT_FOUND",
                    "No events were found for this run_id in the current tenant ledger.",
                    tenant_scoped_not_found_hint(),
                    None,
                    Some(audit.policy_version),
                    Some(json!({ "run_id": q.run_id })),
                );
            }
            let events = bundle::canonicalize_evidence_events(events);
            let lp = format!("rust/{}", log_path);
            let doc = bundle::bundle_document_value(&q.run_id, audit.policy_version, &lp, &events);
            (StatusCode::OK, Json(doc))
        }
        Err(e) => api_err(
            StatusCode::NOT_FOUND,
            "RUN_NOT_FOUND",
            "No events were found for this run_id in the current tenant ledger.",
            tenant_scoped_not_found_hint(),
            Some(json!({ "raw": e })),
            Some(audit.policy_version),
            Some(json!({ "run_id": q.run_id })),
        ),
    }
}

fn payload_get_str(p: &serde_json::Value, key: &str) -> Option<String> {
    p.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
}

fn payload_get_num(p: &serde_json::Value, key: &str) -> Option<f64> {
    p.get(key).and_then(|v| v.as_f64())
}

fn sha256_hex_str(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    hex::encode(h.finalize())
}

#[derive(Debug, Clone)]
struct DiscoveryFindingOut {
    file_path: String,
    detector: String,
    confidence: f64,
    matched_pattern: Option<String>,
    hash: String,
}

fn extract_discovery_findings(events: &[EvidenceEvent]) -> Vec<DiscoveryFindingOut> {
    // Derive only from already-submitted evidence. Never run a scan during export.
    let Some(ev) = events
        .iter()
        .rev()
        .find(|e| e.event_type == "ai_discovery_reported")
    else {
        return Vec::new();
    };

    let p = &ev.payload;
    let Some(arr) = p.get("findings").and_then(|v| v.as_array()) else {
        return Vec::new();
    };

    let mut out: Vec<DiscoveryFindingOut> = Vec::new();
    for v in arr {
        let Some(obj) = v.as_object() else { continue };
        let v = serde_json::Value::Object(obj.clone());

        let Some(file_path) = payload_get_str(&v, "file_path") else {
            continue;
        };
        let detector = payload_get_str(&v, "detector_type")
            .or_else(|| payload_get_str(&v, "detector"))
            .or_else(|| payload_get_str(&v, "detected_ai_usage"))
            .unwrap_or_else(|| "unknown".to_string());
        let Some(confidence) = payload_get_num(&v, "confidence") else {
            continue;
        };

        // Exact matched pattern is not currently stored (Python discovery uses high-level evidence),
        // so keep it null unless explicitly present in the stored payload.
        let matched_pattern = payload_get_str(&v, "matched_pattern");

        // Stable, deterministic hash derived from stored fields only.
        // (Avoid serializing maps where key order can differ.)
        let hash_input = format!(
            "file_path={}\ndetector={}\nconfidence={:.12}\nmatched_pattern={}",
            file_path,
            detector,
            confidence,
            matched_pattern.as_deref().unwrap_or("")
        );
        let hash = sha256_hex_str(&hash_input);

        out.push(DiscoveryFindingOut {
            file_path,
            detector,
            confidence,
            matched_pattern,
            hash,
        });
    }

    // Deterministic ordering contract for auditors/consumers.
    out.sort_by(|a, b| {
        a.file_path
            .cmp(&b.file_path)
            .then_with(|| a.detector.cmp(&b.detector))
            .then_with(|| {
                a.confidence
                    .partial_cmp(&b.confidence)
                    .unwrap_or(Ordering::Equal)
            })
            .then_with(|| a.hash.cmp(&b.hash))
    });

    out
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
        return api_err(
            StatusCode::BAD_REQUEST,
            "RUN_ID_REQUIRED",
            "Missing required path parameter run_id.",
            "Provide a non-empty `run_id` path segment.",
            None,
            Some(audit.policy_version),
            None,
        );
    }

    let (log_path, _) = match tenant_log_path(&audit, &headers) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("export_run_route: tenant_log_path: {e}");
            return api_err(
                StatusCode::BAD_REQUEST,
                "MISSING_TENANT_CONTEXT",
                "Missing tenant context.",
                "Provide `Authorization: Bearer <api_key>`.",
                None,
                Some(audit.policy_version),
                None,
            );
        }
    };
    let ledger_tenant_id =
        match project::require_tenant_id_for_ledger(&headers, audit.deployment_env) {
            Ok(t) => t,
            Err(e) => {
                eprintln!("export_run_route: require_tenant_id_for_ledger: {e}");
                return api_err(
                    StatusCode::BAD_REQUEST,
                    "MISSING_TENANT_CONTEXT",
                    "Missing tenant context.",
                    "Provide `Authorization: Bearer <api_key>`.",
                    None,
                    Some(audit.policy_version),
                    None,
                );
            }
        };
    let billing_tenant_id = project::billing_tenant_id(&headers);

    let events = match bundle::collect_events_for_run(&log_path, &run_id) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("export_run_route: collect_events_for_run: {e}");
            return api_err(
                StatusCode::SERVICE_UNAVAILABLE,
                "EXPORT_NOT_AVAILABLE",
                "export not available",
                "Retry in a moment. If this persists, contact support.",
                Some(json!({ "run_id": run_id })),
                Some(audit.policy_version),
                None,
            );
        }
    };
    if events.is_empty() {
        return api_err(
            StatusCode::NOT_FOUND,
            "RUN_NOT_FOUND",
            "No events were found for this run_id in the current tenant ledger.",
            tenant_scoped_not_found_hint(),
            None,
            Some(audit.policy_version),
            Some(json!({ "run_id": run_id })),
        );
    }

    let events = bundle::canonicalize_evidence_events(events);
    let log_path_report = format!("rust/{}", log_path);
    let bundle_doc =
        bundle::bundle_document_value(&run_id, audit.policy_version, &log_path_report, &events);
    let artifact_path = bundle::find_model_artifact_path(&events);
    let bundle_sha256 = bundle::bundle_sha256(
        &run_id,
        audit.policy_version,
        &log_path_report,
        artifact_path.as_deref(),
        &events,
    );
    let events_content_sha256 = bundle::portable_evidence_digest_v1(&run_id, &events);

    let chain_records = match crate::audit_store::collect_stored_records_for_run(&log_path, &run_id)
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("export_run_route: collect_stored_records_for_run: {e}");
            return api_err(
                StatusCode::SERVICE_UNAVAILABLE,
                "EXPORT_NOT_AVAILABLE",
                "export not available",
                "Retry in a moment. If this persists, contact support.",
                Some(json!({ "run_id": run_id })),
                Some(audit.policy_version),
                None,
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

    let human = bundle_doc
        .get("human_approval")
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let human_ts = human
        .get("ts_utc")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let promo = bundle_doc
        .get("promotion")
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let promo_ts = promo
        .get("ts_utc")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let eval_passed = bundle_doc
        .get("evaluation")
        .and_then(|e| e.get("passed"))
        .and_then(|v| v.as_bool());

    let derived = projection::derive_current_state_from_events_with_context(
        &run_id,
        &events,
        Some(bundle_sha256.clone()),
        last_ts.clone(),
    );
    let verdict = compliance_verdict_from_state(&derived);
    let blocked_reasons = blocked_reasons_from_state(&derived);

    let discovery_findings = extract_discovery_findings(&events)
        .into_iter()
        .map(|f| {
            json!({
                "file_path": f.file_path,
                "detector": f.detector,
                "confidence": f.confidence,
                "matched_pattern": f.matched_pattern,
                "hash": f.hash,
            })
        })
        .collect::<Vec<_>>();

    let out = json!({
        "ok": true,
        "schema_version": "aigov.audit_export.v1",
        "policy_version": audit.policy_version,
        "environment": audit.deployment_env.as_str(),
        // Deterministic: derived from ledger content, not server clock.
        "exported_at_utc": last_ts,
        "tenant": {
            "ledger_tenant_id": ledger_tenant_id,
            "billing_tenant_id": billing_tenant_id
        },
        "run": {
            "run_id": run_id,
            "policy_version": audit.policy_version,
            "log_path": log_path_report,
            "model_artifact_path": bundle_doc.get("model_artifact_path").cloned().unwrap_or(serde_json::Value::Null),
            "identifiers": bundle_doc.get("identifiers").cloned().unwrap_or(serde_json::Value::Null)
        },
        "discovery": {
            "findings": derived.discovery,
            "required_evidence": derived.requirements.required,
            "required_requirements": derived.requirements.required_requirements,
        },
        // Additive: file-level discovery evidence surfaced for auditors.
        // Deterministic ordering; derived only from the stored `ai_discovery_reported` payload.
        "discovery_findings": discovery_findings,
        "evidence_hashes": {
            "bundle_sha256": bundle_sha256,
            "events_content_sha256": events_content_sha256,
            "evidence_digest_schema": "aigov.evidence_digest.v1",
            "chain_head_record_sha256": head_sha256,
            "log_chain": log_chain
        },
        "decision": {
            "human_approval": human,
            "promotion": promo,
            "evaluation_passed": eval_passed,
            "verdict": verdict,
            "blocked_reasons": blocked_reasons
        },
        "evidence_requirements": {
            "required_evidence": derived.requirements.required,
            "provided_evidence": derived.requirements.satisfied,
            "missing_evidence": derived.requirements.missing,
            "required_requirements": derived.requirements.required_requirements,
            "provided_requirements": derived.requirements.satisfied_requirements,
            "missing_requirements": derived.requirements.missing_requirements
        },
        "evidence_events": bundle_doc.get("events").cloned().unwrap_or(serde_json::Value::Null),
        "timestamps": {
            "first_event_ts_utc": first_ts,
            "last_event_ts_utc": derived.evidence.latest_event_ts_utc,
            "human_approval_ts_utc": human_ts,
            "promotion_ts_utc": promo_ts
        }
    });

    if audit.metering.enabled {
        let key_hash = match audit_api_key::raw_bearer_token(&headers) {
            None => {
                return api_err(
                    StatusCode::UNAUTHORIZED,
                    "MISSING_API_KEY",
                    "Missing API key.",
                    "Provide `Authorization: Bearer <api_key>`.",
                    None,
                    None,
                    None,
                );
            }
            Some(t) => key_fingerprint(t),
        };
        let team_id = match metering::team_id_for_key_hash(&audit.pool, &key_hash).await {
            Ok(t) => t,
            Err(e) => {
                eprintln!("export_run_route: team_id_for_key_hash: {e}");
                return api_err(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "METERING_ERROR",
                    "We could not load metering information for this API key.",
                    "Retry in a moment. If this persists, contact support (this is a server-side issue).",
                    None,
                    Some(audit.policy_version),
                    None,
                );
            }
        };
        if let Some(team_id) = team_id {
            let ym = metering::year_month_utc_now();
            let _ = metering::increment_team_op_counter(
                &audit.pool,
                team_id,
                ym,
                metering::TeamOpCounter::Export,
            )
            .await;
        }
    } else {
        let tenant_id = project::billing_tenant_id(&headers);
        let _ = evidence_usage::increment_export_usage(&audit.pool, &tenant_id).await;
    }

    let _ = stripe_billing::record_usage_attribution(
        &audit.pool,
        &ledger_tenant_id,
        stripe_billing::BILLING_UNIT_AUDIT_EXPORT,
        &run_id,
        Some(verdict),
    )
    .await;

    (StatusCode::OK, Json(out))
}

async fn bundle_hash_route(
    State(audit): State<AuditState>,
    headers: HeaderMap,
    Query(q): Query<BundleHashQuery>,
) -> (StatusCode, Json<serde_json::Value>) {
    let (log_path, _) = match tenant_log_path(&audit, &headers) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("bundle_hash_route: tenant_log_path: {e}");
            return api_err(
                StatusCode::BAD_REQUEST,
                "MISSING_TENANT_CONTEXT",
                "Missing tenant context.",
                "Provide `Authorization: Bearer <api_key>`.",
                None,
                Some(audit.policy_version),
                None,
            );
        }
    };
    match bundle::collect_events_for_run(&log_path, &q.run_id) {
        Ok(events) => {
            if events.is_empty() {
                return api_err(
                    StatusCode::NOT_FOUND,
                    "RUN_NOT_FOUND",
                    "No events were found for this run_id in the current tenant ledger.",
                    tenant_scoped_not_found_hint(),
                    None,
                    Some(audit.policy_version),
                    Some(json!({ "run_id": q.run_id })),
                );
            }
            let events = bundle::canonicalize_evidence_events(events);
            let artifact_path = bundle::find_model_artifact_path(&events);
            let lp = format!("rust/{}", log_path);

            let digest = bundle::bundle_sha256(
                &q.run_id,
                audit.policy_version,
                &lp,
                artifact_path.as_deref(),
                &events,
            );
            let events_content_sha256 = bundle::portable_evidence_digest_v1(&q.run_id, &events);

            (
                StatusCode::OK,
                Json(json!({
                    "ok": true,
                    "run_id": q.run_id,
                    "policy_version": audit.policy_version,
                    "bundle_sha256": digest,
                    "events_content_sha256": events_content_sha256,
                    "evidence_digest_schema": "aigov.evidence_digest.v1"
                })),
            )
        }
        Err(e) => {
            eprintln!("bundle_hash_route: collect_events_for_run: {e}");
            api_err(
                StatusCode::SERVICE_UNAVAILABLE,
                "BUNDLE_NOT_AVAILABLE",
                "bundle not available",
                "Retry in a moment. If this persists, contact support.",
                Some(json!({ "run_id": q.run_id })),
                Some(audit.policy_version),
                None,
            )
        }
    }
}

async fn verify_log(
    State(audit): State<AuditState>,
    headers: HeaderMap,
) -> (StatusCode, Json<serde_json::Value>) {
    let (log_path, _) = match tenant_log_path(&audit, &headers) {
        Ok(p) => p,
        Err(e) => {
            return api_err(
                StatusCode::BAD_REQUEST,
                "MISSING_TENANT_CONTEXT",
                "Missing tenant context.",
                "Provide `Authorization: Bearer <api_key>`.",
                Some(serde_json::Value::String(e)),
                Some(audit.policy_version),
                None,
            );
        }
    };
    match verify_chain::verify_chain(&log_path) {
        Ok(_) => (StatusCode::OK, Json(json!({ "ok": true }))),
        Err(e) => api_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "CHAIN_INVALID",
            "The append-only chain failed verification. The ledger may have been corrupted.",
            "Retry later. If this persists, contact support (this is a server-side integrity issue).",
            Some(json!({ "raw": e })),
            Some(audit.policy_version),
            None,
        ),
    }
}

/// Readiness: DB reachable, migrations complete, ledger writable (`GOVAI_LEDGER_DIR` or dev cwd).
async fn readiness_check(State(audit): State<AuditState>) -> (StatusCode, Json<serde_json::Value>) {
    if let Err(e) = sqlx::query("SELECT 1").fetch_one(&audit.pool).await {
        eprintln!("readiness: database_ping failed: {e}");
        return api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "NOT_READY",
            "database not ready",
            "Verify Postgres connectivity and DATABASE_URL / GOVAI_DATABASE_URL.",
            Some(json!({ "checks": { "database_ping": false } })),
        );
    }

    if let Err(e) = db::verify_sqlx_migrations_complete(&audit.pool).await {
        eprintln!("readiness: migrations incomplete: {e}");
        return api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "NOT_READY",
            "database not ready",
            "Apply migrations or enable GOVAI_AUTO_MIGRATE=true for automatic apply.",
            Some(json!({ "checks": { "migrations_complete": false } })),
        );
    }

    let ledger_err = match audit.deployment_env {
        GovaiEnvironment::Staging | GovaiEnvironment::Prod => {
            let Some(dir) = ledger_storage::configured_ledger_dir() else {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "NOT_READY",
                    "ledger not ready",
                    "Set GOVAI_LEDGER_DIR to a writable directory backed by persistent storage.",
                    Some(json!({ "checks": { "ledger_writable": false } })),
                );
            };
            ledger_storage::validate_ledger_dir(dir.as_path())
        }
        GovaiEnvironment::Dev => match ledger_storage::configured_ledger_dir() {
            Some(dir) => ledger_storage::validate_ledger_dir(dir.as_path()),
            None => std::env::current_dir()
                .map_err(|e| format!("cannot read cwd: {}", e))
                .and_then(|cwd| ledger_storage::validate_ledger_dir(&cwd)),
        },
    };

    if let Err(e) = ledger_err {
        eprintln!("readiness: ledger not writable: {e}");
        return api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "NOT_READY",
            "ledger not ready",
            "Ensure GOVAI_LEDGER_DIR exists and is writable (or cwd writable in dev).",
            Some(json!({ "checks": { "ledger_writable": false } })),
        );
    }

    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "ready": true,
            "checks": {
                "database_ping": true,
                "migrations_complete": true,
                "ledger_writable": true
            }
        })),
    )
}

#[derive(Deserialize)]
struct BillingUsageSummaryQuery {
    /// RFC3339 inclusive lower bound (default: first instant of current UTC month).
    #[serde(default)]
    from: Option<String>,
    /// RFC3339 exclusive upper bound (default: now).
    #[serde(default)]
    to: Option<String>,
    /// e.g. `evidence_event`
    #[serde(default = "default_billing_unit_param")]
    unit: String,
}

fn default_billing_unit_param() -> String {
    "evidence_event".to_string()
}

async fn billing_usage_summary_route(
    State(audit): State<AuditState>,
    headers: HeaderMap,
    Query(q): Query<BillingUsageSummaryQuery>,
) -> (StatusCode, Json<serde_json::Value>) {
    let ledger_tid = match project::require_tenant_id_for_ledger(&headers, audit.deployment_env) {
        Ok(t) => t,
        Err(e) => {
            return api_err(
                StatusCode::BAD_REQUEST,
                "MISSING_TENANT_CONTEXT",
                "Missing tenant context.",
                "Provide `Authorization: Bearer <api_key>`.",
                Some(serde_json::Value::String(e)),
                Some(audit.policy_version),
                None,
            );
        }
    };

    let window_end = match q.to.as_deref() {
        Some(s) => match DateTime::parse_from_rfc3339(s) {
            Ok(d) => d.with_timezone(&Utc),
            Err(_) => {
                return api_err(
                    StatusCode::BAD_REQUEST,
                    "INVALID_QUERY",
                    "Invalid `to` timestamp (expected RFC3339).",
                    "Use an ISO-8601 / RFC3339 instant, e.g. 2026-05-01T00:00:00Z.",
                    None,
                    Some(audit.policy_version),
                    None,
                );
            }
        },
        None => Utc::now(),
    };

    let window_start = match q.from.as_deref() {
        Some(s) => match DateTime::parse_from_rfc3339(s) {
            Ok(d) => d.with_timezone(&Utc),
            Err(_) => {
                return api_err(
                    StatusCode::BAD_REQUEST,
                    "INVALID_QUERY",
                    "Invalid `from` timestamp (expected RFC3339).",
                    "Use an ISO-8601 / RFC3339 instant, e.g. 2026-05-01T00:00:00Z.",
                    None,
                    Some(audit.policy_version),
                    None,
                );
            }
        },
        None => Utc
            .with_ymd_and_hms(window_end.year(), window_end.month(), 1, 0, 0, 0)
            .single()
            .unwrap_or_else(Utc::now),
    };

    if window_start >= window_end {
        return api_err(
            StatusCode::BAD_REQUEST,
            "INVALID_QUERY",
            "`from` must be strictly before `to`.",
            "Widen the window or fix the bounds.",
            None,
            Some(audit.policy_version),
            None,
        );
    }

    let unit = {
        let u = q.unit.trim();
        if u.is_empty() {
            "evidence_event"
        } else {
            u
        }
    };
    match billing_trace::usage_summary_for_tenant(
        &audit.pool,
        &ledger_tid,
        unit,
        window_start,
        window_end,
    )
    .await
    {
        Ok(s) => (
            StatusCode::OK,
            Json(json!({
                "ok": true,
                "tenant_id": s.tenant_id,
                "billing_unit": s.billing_unit,
                "usage_count": s.count,
                "time_window": {
                    "start": s.window_start.to_rfc3339(),
                    "end": s.window_end.to_rfc3339()
                },
                "traces": s.traces.iter().map(|t| json!({
                    "tenant_id": t.tenant_id,
                    "run_id": t.run_id,
                    "occurred_at": t.occurred_at.to_rfc3339()
                })).collect::<Vec<_>>()
            })),
        ),
        Err(e) => api_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Could not load billing usage summary.",
            "Retry in a moment. If this persists, contact support.",
            Some(json!({ "raw": e.to_string() })),
            Some(audit.policy_version),
            None,
        ),
    }
}

#[derive(Deserialize)]
struct BillingCheckoutRequest {
    price_id: String,
    success_url: String,
    cancel_url: String,
}

#[derive(Deserialize)]
struct BillingReportUsageBody {
    #[serde(default = "default_report_usage_unit")]
    billing_unit: String,
}

fn default_report_usage_unit() -> String {
    stripe_billing::BILLING_UNIT_EVIDENCE_EVENT.to_string()
}

#[derive(Deserialize)]
struct BillingPortalBody {
    return_url: String,
}

#[derive(Deserialize)]
struct BillingReconciliationQuery {
    from: String,
    to: String,
    billing_unit: Option<String>,
}

async fn billing_checkout_session_route(
    State(audit): State<AuditState>,
    headers: HeaderMap,
    Json(body): Json<BillingCheckoutRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let tenant_id =
        match stripe_billing::ledger_tenant_for_billing_headers(&headers, audit.deployment_env) {
            Ok(t) => t,
            Err(_) => {
                return api_err(
                    StatusCode::UNAUTHORIZED,
                    "MISSING_API_KEY",
                    "Missing API key.",
                    "Provide `Authorization: Bearer <api_key>`.",
                    None,
                    Some(audit.policy_version),
                    None,
                );
            }
        };
    let sk = match stripe_billing::stripe_secret_key() {
        Ok(s) => s,
        Err(msg) => {
            return api_err(
                StatusCode::SERVICE_UNAVAILABLE,
                "STRIPE_NOT_CONFIGURED",
                "Stripe API is not configured on this server.",
                "Set GOVAI_STRIPE_SECRET_KEY to your Stripe secret key (sk_live_… or sk_test_…).",
                Some(json!({ "detail": msg })),
                Some(audit.policy_version),
                None,
            );
        }
    };
    let price = body.price_id.trim();
    if price.is_empty() || !price.starts_with("price_") {
        return api_err(
            StatusCode::BAD_REQUEST,
            "INVALID_PRICE_ID",
            "price_id must be a non-empty Stripe Price id (price_…).",
            "Pass a subscription recurring price from the Stripe Dashboard.",
            None,
            Some(audit.policy_version),
            None,
        );
    }
    if body.success_url.trim().is_empty() || body.cancel_url.trim().is_empty() {
        return api_err(
            StatusCode::BAD_REQUEST,
            "INVALID_URL",
            "success_url and cancel_url must be non-empty absolute URLs.",
            "Provide https://… URLs where Stripe should redirect after checkout.",
            None,
            Some(audit.policy_version),
            None,
        );
    }
    match stripe_billing::stripe_create_checkout_session(
        &sk,
        price,
        body.success_url.trim(),
        body.cancel_url.trim(),
        &tenant_id,
    )
    .await
    {
        Ok((session_id, checkout_url)) => (
            StatusCode::OK,
            Json(json!({
                "ok": true,
                "tenant_id": tenant_id,
                "session_id": session_id,
                "checkout_url": checkout_url,
            })),
        ),
        Err(e) => api_err(
            StatusCode::BAD_GATEWAY,
            "STRIPE_CHECKOUT_FAILED",
            "Stripe refused or failed to create the Checkout Session.",
            "Verify price_id, account mode (test vs live), and Stripe logs; then retry.",
            Some(json!({ "detail": e })),
            Some(audit.policy_version),
            None,
        ),
    }
}

async fn billing_status_route(
    State(audit): State<AuditState>,
    headers: HeaderMap,
) -> (StatusCode, Json<serde_json::Value>) {
    let tenant =
        match stripe_billing::ledger_tenant_for_billing_headers(&headers, audit.deployment_env) {
            Ok(t) => t,
            Err(_) => {
                return api_err(
                    StatusCode::UNAUTHORIZED,
                    "MISSING_API_KEY",
                    "Missing API key.",
                    "Provide `Authorization: Bearer <api_key>`.",
                    None,
                    Some(audit.policy_version),
                    None,
                );
            }
        };
    match stripe_billing::billing_status_for_tenant(&audit.pool, &tenant).await {
        Ok(j) => {
            let mut v = serde_json::to_value(&j).unwrap_or_else(|_| json!({}));
            if let Some(obj) = v.as_object_mut() {
                obj.insert("ok".to_string(), json!(true));
            }
            (StatusCode::OK, Json(v))
        }
        Err(e) => api_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "BILLING_STATUS_ERROR",
            "Could not load billing status.",
            "Retry in a moment. If this persists, contact support.",
            Some(json!({ "raw": e.to_string() })),
            Some(audit.policy_version),
            None,
        ),
    }
}

async fn billing_report_usage_route(
    State(audit): State<AuditState>,
    headers: HeaderMap,
    Json(body): Json<BillingReportUsageBody>,
) -> (StatusCode, Json<serde_json::Value>) {
    let tenant =
        match stripe_billing::ledger_tenant_for_billing_headers(&headers, audit.deployment_env) {
            Ok(t) => t,
            Err(_) => {
                return api_err(
                    StatusCode::UNAUTHORIZED,
                    "MISSING_API_KEY",
                    "Missing API key.",
                    "Provide `Authorization: Bearer <api_key>`.",
                    None,
                    Some(audit.policy_version),
                    None,
                );
            }
        };
    let unit = body.billing_unit.trim();
    if unit.is_empty() || !stripe_billing::ALL_BILLING_UNITS.iter().any(|u| *u == unit) {
        return api_err(
            StatusCode::BAD_REQUEST,
            "INVALID_BILLING_UNIT",
            "Unknown billing_unit.",
            "Use one of: evidence_event, compliance_check, audit_export, discovery_scan.",
            None,
            Some(audit.policy_version),
            None,
        );
    }
    match stripe_billing::report_usage_for_tenant(&audit.pool, &tenant, unit).await {
        Ok(out) => (
            StatusCode::OK,
            Json(json!({
                "ok": true,
                "tenant_id": tenant,
                "billing_unit": unit,
                "idempotent_hit": out.idempotent_hit,
                "report_id": out.report_id,
                "quantity": out.quantity,
                "period_start": out.period_start,
                "period_end": out.period_end,
                "status": out.status,
                "stripe_usage_record_id": out.stripe_usage_record_id,
            })),
        ),
        Err(e) => api_err(
            StatusCode::BAD_GATEWAY,
            "STRIPE_USAGE_REPORT_FAILED",
            "Usage was recorded locally but reporting to Stripe failed.",
            "Fix Stripe configuration or subscription item id, then POST again (idempotent for the same period).",
            Some(json!({ "detail": e })),
            Some(audit.policy_version),
            None,
        ),
    }
}

async fn billing_portal_route(
    State(audit): State<AuditState>,
    headers: HeaderMap,
    Json(body): Json<BillingPortalBody>,
) -> (StatusCode, Json<serde_json::Value>) {
    let tenant =
        match stripe_billing::ledger_tenant_for_billing_headers(&headers, audit.deployment_env) {
            Ok(t) => t,
            Err(_) => {
                return api_err(
                    StatusCode::UNAUTHORIZED,
                    "MISSING_API_KEY",
                    "Missing API key.",
                    "Provide `Authorization: Bearer <api_key>`.",
                    None,
                    Some(audit.policy_version),
                    None,
                );
            }
        };
    let customer_id: Option<String> = match sqlx::query_scalar::<sqlx::Postgres, Option<String>>(
        r#"select stripe_customer_id from public.tenant_billing_accounts where tenant_id = $1"#,
    )
    .bind(&tenant)
    .fetch_optional(&audit.pool)
    .await
    {
        Ok(Some(inner)) => inner,
        Ok(None) | Err(_) => None,
    };
    let Some(customer_id) = customer_id.filter(|s| !s.trim().is_empty()) else {
        return api_err(
            StatusCode::NOT_FOUND,
            "BILLING_ACCOUNT_NOT_FOUND",
            "No Stripe customer is associated with this tenant.",
            "Create checkout session first.",
            None,
            Some(audit.policy_version),
            None,
        );
    };
    let secret = match stripe_billing::stripe_secret_key() {
        Ok(s) => s,
        Err(e) => {
            return api_err(
                StatusCode::SERVICE_UNAVAILABLE,
                "STRIPE_NOT_CONFIGURED",
                "Stripe is not configured on this server.",
                "Contact the operator to configure GOVAI_STRIPE_SECRET_KEY.",
                Some(json!({ "raw": e })),
                Some(audit.policy_version),
                None,
            );
        }
    };
    match stripe_billing::stripe_create_billing_portal_session(
        &secret,
        customer_id.trim(),
        body.return_url.trim(),
    )
    .await
    {
        Ok(url) => (
            StatusCode::OK,
            Json(json!({ "ok": true, "tenant_id": tenant, "portal_url": url })),
        ),
        Err(e) => api_err(
            StatusCode::BAD_GATEWAY,
            "STRIPE_PORTAL_FAILED",
            "Could not create billing portal session.",
            "Verify Stripe customer id and portal configuration.",
            Some(json!({ "raw": e })),
            Some(audit.policy_version),
            None,
        ),
    }
}

async fn billing_invoices_route(
    State(audit): State<AuditState>,
    headers: HeaderMap,
) -> (StatusCode, Json<serde_json::Value>) {
    let tenant =
        match stripe_billing::ledger_tenant_for_billing_headers(&headers, audit.deployment_env) {
            Ok(t) => t,
            Err(_) => {
                return api_err(
                    StatusCode::UNAUTHORIZED,
                    "MISSING_API_KEY",
                    "Missing API key.",
                    "Provide `Authorization: Bearer <api_key>`.",
                    None,
                    Some(audit.policy_version),
                    None,
                );
            }
        };
    let customer_id: Option<String> = match sqlx::query_scalar::<sqlx::Postgres, Option<String>>(
        r#"select stripe_customer_id from public.tenant_billing_accounts where tenant_id = $1"#,
    )
    .bind(&tenant)
    .fetch_optional(&audit.pool)
    .await
    {
        Ok(Some(inner)) => inner,
        Ok(None) | Err(_) => None,
    };
    let Some(customer_id) = customer_id.filter(|s| !s.trim().is_empty()) else {
        return api_err(
            StatusCode::NOT_FOUND,
            "BILLING_ACCOUNT_NOT_FOUND",
            "No Stripe customer is associated with this tenant.",
            "Create checkout session first.",
            None,
            Some(audit.policy_version),
            None,
        );
    };
    let secret = match stripe_billing::stripe_secret_key() {
        Ok(s) => s,
        Err(e) => {
            return api_err(
                StatusCode::SERVICE_UNAVAILABLE,
                "STRIPE_NOT_CONFIGURED",
                "Stripe is not configured on this server.",
                "Contact the operator to configure GOVAI_STRIPE_SECRET_KEY.",
                Some(json!({ "raw": e })),
                Some(audit.policy_version),
                None,
            );
        }
    };
    match stripe_billing::stripe_list_invoices(&secret, customer_id.trim(), 20).await {
        Ok(rows) => (
            StatusCode::OK,
            Json(json!({
                "ok": true,
                "tenant_id": tenant,
                "invoices": rows
            })),
        ),
        Err(e) => api_err(
            StatusCode::BAD_GATEWAY,
            "STRIPE_INVOICES_FAILED",
            "Could not list invoices from Stripe.",
            "Retry in a moment. If this persists, contact support.",
            Some(json!({ "raw": e })),
            Some(audit.policy_version),
            None,
        ),
    }
}

async fn billing_reconciliation_route(
    State(audit): State<AuditState>,
    headers: HeaderMap,
    Query(q): Query<BillingReconciliationQuery>,
) -> (StatusCode, Json<serde_json::Value>) {
    let tenant =
        match stripe_billing::ledger_tenant_for_billing_headers(&headers, audit.deployment_env) {
            Ok(t) => t,
            Err(_) => {
                return api_err(
                    StatusCode::UNAUTHORIZED,
                    "MISSING_API_KEY",
                    "Missing API key.",
                    "Provide `Authorization: Bearer <api_key>`.",
                    None,
                    Some(audit.policy_version),
                    None,
                );
            }
        };
    let from = match DateTime::parse_from_rfc3339(q.from.trim()) {
        Ok(d) => d.with_timezone(&Utc),
        Err(_) => {
            return api_err(
                StatusCode::BAD_REQUEST,
                "INVALID_FROM",
                "Query parameter `from` must be RFC3339.",
                "Example: 2026-05-01T00:00:00Z",
                None,
                Some(audit.policy_version),
                None,
            );
        }
    };
    let to = match DateTime::parse_from_rfc3339(q.to.trim()) {
        Ok(d) => d.with_timezone(&Utc),
        Err(_) => {
            return api_err(
                StatusCode::BAD_REQUEST,
                "INVALID_TO",
                "Query parameter `to` must be RFC3339.",
                "Example: 2026-05-31T23:59:59Z",
                None,
                Some(audit.policy_version),
                None,
            );
        }
    };
    if from >= to {
        return api_err(
            StatusCode::BAD_REQUEST,
            "INVALID_RANGE",
            "Parameter `from` must be before `to`.",
            "Adjust the time range and retry.",
            None,
            Some(audit.policy_version),
            None,
        );
    }
    if let Some(ref u) = q.billing_unit {
        let u = u.trim();
        if !u.is_empty() && !stripe_billing::ALL_BILLING_UNITS.iter().any(|x| *x == u) {
            return api_err(
                StatusCode::BAD_REQUEST,
                "INVALID_BILLING_UNIT",
                "Unknown billing_unit.",
                "Use one of: evidence_event, compliance_check, audit_export, discovery_scan.",
                None,
                Some(audit.policy_version),
                None,
            );
        }
    }
    let unit = q.billing_unit.as_deref().filter(|s| !s.trim().is_empty());
    match stripe_billing::reconciliation_for_tenant(&audit.pool, &tenant, from, to, unit).await {
        Ok(v) => (StatusCode::OK, Json(v)),
        Err(e) => api_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "RECONCILIATION_ERROR",
            "Could not build reconciliation.",
            "Retry in a moment. If this persists, contact support.",
            Some(json!({ "raw": e.to_string() })),
            Some(audit.policy_version),
            None,
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
    let billing_enforcement_layer =
        middleware::from_fn_with_state(state.clone(), billing_enforcement_middleware);

    let unauthenticated = Router::new()
        .route("/ready", get(readiness_check))
        .route("/stripe/webhook", post(stripe_webhook_route))
        .with_state(state.clone());

    let gated = Router::new()
        .route("/evidence", post(ingest))
        .route("/usage", get(usage_route))
        .route("/billing/usage-summary", get(billing_usage_summary_route))
        .route("/billing/checkout-session", post(billing_checkout_session_route))
        .route("/billing/status", get(billing_status_route))
        .route("/billing/report-usage", post(billing_report_usage_route))
        .route("/verify", get(verify))
        .route("/bundle", get(bundle_route))
        .route("/bundle-hash", get(bundle_hash_route))
        .route("/verify-log", get(verify_log))
        .route("/compliance-summary", get(compliance_summary_route))
        .route("/api/export/:run_id", get(export_run_route))
        .route("/billing/portal-session", post(billing_portal_route))
        .route("/billing/invoices", get(billing_invoices_route))
        .route("/billing/reconciliation", get(billing_reconciliation_route))
        .layer(billing_enforcement_layer)
        .layer(audit_key_layer)
        .with_state(state.clone());

    Router::new().merge(unauthenticated).merge(gated)
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
    let (log_path, _) = match tenant_log_path(&audit, &headers) {
        Ok(p) => p,
        Err(e) => {
            return api_err(
                StatusCode::BAD_REQUEST,
                "MISSING_TENANT_CONTEXT",
                "Missing tenant context.",
                "Provide `Authorization: Bearer <api_key>`.",
                Some(serde_json::Value::String(e)),
                Some(audit.policy_version),
                Some(json!({
                    "schema_version": "aigov.compliance_summary.v2",
                    "run_id": q.run_id,
                })),
            )
        }
    };
    match bundle::collect_events_for_run(&log_path, &q.run_id) {
        Ok(events) => {
            if events.is_empty() {
                return api_err(
                    StatusCode::NOT_FOUND,
                    "RUN_NOT_FOUND",
                    "No events were found for this run_id in the current tenant ledger.",
                    tenant_scoped_not_found_hint(),
                    None,
                    Some(audit.policy_version),
                    Some(json!({
                        "schema_version": "aigov.compliance_summary.v2",
                        "run_id": q.run_id,
                    })),
                );
            }
            let events = bundle::canonicalize_evidence_events(events);
            let deployment_environment = audit.deployment_env.as_str();
            let ledger_environment = events
                .last()
                .and_then(|e| e.environment.as_deref())
                .unwrap_or(deployment_environment);
            let ledger_environment_note = if ledger_environment == deployment_environment {
                serde_json::Value::Null
            } else {
                json!(format!(
                    "ledger environment ({ledger_environment}) does not match deployment ({deployment_environment})"
                ))
            };
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
            let requirements = json!({
                "required": derived.requirements.required,
                "satisfied": derived.requirements.satisfied,
                "missing": derived.requirements.missing,
                "required_requirements": derived.requirements.required_requirements,
                "satisfied_requirements": derived.requirements.satisfied_requirements,
                "missing_requirements": derived.requirements.missing_requirements
            });
            let blocked_reasons = blocked_reasons_from_state(&derived);

            if audit.metering.enabled {
                let key_hash = match audit_api_key::raw_bearer_token(&headers) {
                    None => {
                        return api_err(
                            StatusCode::UNAUTHORIZED,
                            "MISSING_API_KEY",
                            "Missing API key.",
                            "Provide `Authorization: Bearer <api_key>`.",
                            None,
                            None,
                            None,
                        );
                    }
                    Some(t) => key_fingerprint(t),
                };
                let team_id = match metering::team_id_for_key_hash(&audit.pool, &key_hash).await {
                    Ok(t) => t,
                    Err(e) => {
                        return api_err(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "METERING_ERROR",
                            "We could not load metering information for this API key.",
                            "Retry in a moment. If this persists, contact support (this is a server-side issue).",
                            Some(json!({ "raw": e.to_string() })),
                            Some(audit.policy_version),
                            None,
                        );
                    }
                };
                if let Some(team_id) = team_id {
                    let ym = metering::year_month_utc_now();
                    let _ = metering::increment_team_op_counter(
                        &audit.pool,
                        team_id,
                        ym,
                        metering::TeamOpCounter::ComplianceCheck,
                    )
                    .await;
                }
            } else {
                let tenant_id = project::billing_tenant_id(&headers);
                let _ =
                    evidence_usage::increment_compliance_check_usage(&audit.pool, &tenant_id).await;
            }

            let ledger_tid = project::require_tenant_id_for_ledger(&headers, audit.deployment_env)
                .unwrap_or_else(|_| "default".to_string());
            let _ = stripe_billing::record_usage_attribution(
                &audit.pool,
                &ledger_tid,
                stripe_billing::BILLING_UNIT_COMPLIANCE_CHECK,
                &q.run_id,
                Some(verdict),
            )
            .await;

            (
                StatusCode::OK,
                Json(json!({
                    "ok": true,
                    "schema_version": "aigov.compliance_summary.v2",
                    "policy_version": audit.policy_version,
                    "deployment_environment": deployment_environment,
                    "ledger_environment": ledger_environment,
                    "ledger_environment_note": ledger_environment_note,
                    "run_id": q.run_id,
                    "verdict": verdict,
                    "requirements": requirements,
                    "blocked_reasons": blocked_reasons,
                    "current_state": derived,
                })),
            )
        }
        Err(e) => api_err(
            StatusCode::NOT_FOUND,
            "RUN_NOT_FOUND",
            "No events were found for this run_id in the current tenant ledger.",
            tenant_scoped_not_found_hint(),
            Some(json!({ "raw": e })),
            Some(audit.policy_version),
            Some(json!({
                "schema_version": "aigov.compliance_summary.v2",
                "run_id": q.run_id,
            })),
        ),
    }
}

fn compliance_verdict_from_state(state: &projection::ComplianceCurrentState) -> &'static str {
    // Authoritative rule order (server-side): evaluation → approval → promotion.
    // - INVALID: evaluation explicitly failed.
    // - VALID: evaluation passed, risk reviewed + human approved (approve), and promotion executed.
    // - BLOCKED: anything else (missing prerequisites / missing required evidence / not yet promoted).
    if state.model.evaluation_passed == Some(false) {
        return "INVALID";
    }

    // Discovery-driven evidence gates (and mandatory discovery completion): additive enforcement.
    if !state.requirements.missing.is_empty() {
        return "BLOCKED";
    }

    let eval_ok = state.model.evaluation_passed == Some(true);
    let risk_ok = state.approval.risk_review_decision.as_deref() == Some("approve");
    let approval_ok = state.approval.human_approval_decision.as_deref() == Some("approve");
    let promoted =
        state.model.promotion.model_promoted_present && state.model.promotion.state == "promoted";

    if eval_ok && risk_ok && approval_ok && promoted {
        "VALID"
    } else {
        "BLOCKED"
    }
}

#[derive(Debug, Serialize)]
struct BlockedReason {
    code: String,
    message: String,
}

fn blocked_reasons_from_state(state: &projection::ComplianceCurrentState) -> Vec<BlockedReason> {
    let missing: std::collections::BTreeSet<&str> = state
        .requirements
        .missing
        .iter()
        .map(|s| s.as_str())
        .collect();

    // Stable order and stable messages (contract).
    let mut out: Vec<BlockedReason> = Vec::new();
    let ordered: [(&str, &str); 5] = [
        (
            "ai_discovery_completed",
            "AI discovery scan must be completed before compliance decision.",
        ),
        (
            "model_registered",
            "Detected OpenAI usage requires model registration.",
        ),
        (
            "usage_policy_defined",
            "Detected OpenAI usage requires usage policy definition.",
        ),
        (
            "evaluation_completed",
            "Detected AI system requires evaluation evidence.",
        ),
        (
            "model_artifact_documented",
            "Detected model artifact requires documentation.",
        ),
    ];

    for (code, message) in ordered {
        if missing.contains(code) {
            out.push(BlockedReason {
                code: code.to_string(),
                message: message.to_string(),
            });
        }
    }

    // Additive: lifecycle / promotion gates.
    //
    // `compliance_verdict_from_state` can return BLOCKED even when discovery-driven evidence is
    // complete (missing is empty). In that case we must surface why the run is blocked.
    //
    // Stable order contract:
    // evaluation → risk review → human approval → promotion execution.
    if compliance_verdict_from_state(state) == "BLOCKED" && missing.is_empty() {
        if state.model.evaluation_passed.is_none() {
            out.push(BlockedReason {
                code: "evaluation_required".to_string(),
                message: "Evaluation must be reported (passed=true) before promotion readiness."
                    .to_string(),
            });
        }

        if state.approval.risk_review_decision.as_deref() != Some("approve") {
            out.push(BlockedReason {
                code: "awaiting_risk_review".to_string(),
                message: "Risk assessment review must be approved before promotion readiness."
                    .to_string(),
            });
        }

        if state.approval.human_approval_decision.as_deref() != Some("approve") {
            out.push(BlockedReason {
                code: "approval_required".to_string(),
                message: "Human approval is required before promotion readiness.".to_string(),
            });
        }

        if !(state.model.promotion.model_promoted_present
            && state.model.promotion.state == "promoted")
        {
            let code = match state.model.promotion.state.as_str() {
                "awaiting_risk_review" => "awaiting_risk_review",
                "awaiting_human_approval" => "approval_required",
                "awaiting_evaluation_passed" => "evaluation_required",
                "awaiting_promotion_execution" => "awaiting_promotion_execution",
                _ => "promotion_not_ready",
            };
            let message = match state.model.promotion.state.as_str() {
                "awaiting_promotion_execution" => {
                    "Promotion evidence (model_promoted) has not been recorded yet.".to_string()
                }
                "promoted" => "Promotion has been executed.".to_string(),
                other => format!("Promotion is not complete: state={other}."),
            };
            // Avoid duplicating the same code when earlier gates already emitted it.
            if !out.iter().any(|r| r.code == code) {
                out.push(BlockedReason {
                    code: code.to_string(),
                    message,
                });
            }
        }
    }
    out
}

#[cfg(test)]
mod discovery_enforcement_tests {
    use super::*;
    use crate::schema::EvidenceEvent;
    use serde_json::json;

    fn ev(
        run_id: &str,
        event_type: &str,
        event_id: &str,
        payload: serde_json::Value,
    ) -> EvidenceEvent {
        EvidenceEvent {
            event_id: event_id.to_string(),
            event_type: event_type.to_string(),
            ts_utc: "2026-04-21T12:00:00Z".to_string(),
            actor: "test".to_string(),
            system: "unit".to_string(),
            run_id: run_id.to_string(),
            environment: Some("dev".to_string()),
            payload,
        }
    }

    fn base_valid_bundle(run_id: &str) -> Vec<EvidenceEvent> {
        vec![
            ev(
                run_id,
                "evaluation_reported",
                "e1",
                json!({
                    "ai_system_id": "ai1",
                    "dataset_id": "d1",
                    "model_version_id": "m1",
                    "metric": "acc",
                    "value": 0.9,
                    "threshold": 0.8,
                    "passed": true,
                }),
            ),
            ev(
                run_id,
                "risk_reviewed",
                "r1",
                json!({
                    "ai_system_id": "ai1",
                    "dataset_id": "d1",
                    "model_version_id": "m1",
                    "risk_id": "risk-1",
                    "assessment_id": "assess-1",
                    "dataset_governance_commitment": "commit-1",
                    "decision": "approve",
                    "reviewer": "compliance",
                    "justification": "ok",
                }),
            ),
            ev(
                run_id,
                "human_approved",
                "h1",
                json!({
                    "scope": "model_promoted",
                    "decision": "approve",
                    "approver": "compliance_officer",
                    "justification": "ok",
                    "assessment_id": "assess-1",
                    "risk_id": "risk-1",
                    "dataset_governance_commitment": "commit-1",
                    "ai_system_id": "ai1",
                    "dataset_id": "d1",
                    "model_version_id": "m1",
                }),
            ),
            ev(
                run_id,
                "model_promoted",
                "p1",
                json!({
                    "artifact_path": "s3://bucket/model",
                    "promotion_reason": "ok",
                    "assessment_id": "assess-1",
                    "risk_id": "risk-1",
                    "dataset_governance_commitment": "commit-1",
                    "approved_human_event_id": "h1",
                    "ai_system_id": "ai1",
                    "dataset_id": "d1",
                    "model_version_id": "m1",
                }),
            ),
        ]
    }

    #[test]
    fn discovery_only_run_never_returns_blocked_without_reasons() {
        let run_id = "run_discovery_only";
        let events = vec![ev(
            run_id,
            "ai_discovery_reported",
            "d1",
            json!({ "openai": false, "transformers": false, "model_artifacts": false }),
        )];

        let state =
            projection::derive_current_state_from_events_with_context(run_id, &events, None, None);
        assert!(state.requirements.missing.is_empty());

        let verdict = compliance_verdict_from_state(&state);
        let reasons = blocked_reasons_from_state(&state);

        assert!(
            verdict == "VALID" || !reasons.is_empty(),
            "discovery-only run must be VALID or BLOCKED with explicit reasons"
        );
        assert!(
            !(verdict == "BLOCKED" && state.requirements.missing.is_empty() && reasons.is_empty()),
            "invariant: never BLOCKED with empty missing and empty blocked_reasons"
        );
    }

    #[test]
    fn no_ai_discovery_reported_blocks_with_missing_ai_discovery_completed() {
        let run_id = "run_no_discovery_event";
        let events = base_valid_bundle(run_id);
        let state =
            projection::derive_current_state_from_events_with_context(run_id, &events, None, None);
        assert_eq!(
            state.requirements.required,
            vec!["ai_discovery_completed".to_string()]
        );
        assert_eq!(state.requirements.satisfied, Vec::<String>::new());
        assert_eq!(
            state.requirements.missing,
            vec!["ai_discovery_completed".to_string()]
        );
        assert_eq!(compliance_verdict_from_state(&state), "BLOCKED");
        let reasons = blocked_reasons_from_state(&state);
        assert_eq!(reasons.len(), 1);
        assert_eq!(reasons[0].code, "ai_discovery_completed");
    }

    #[test]
    fn ai_discovery_reported_with_no_findings_adds_no_extra_requirements() {
        let run_id = "run_discovery_no_findings";
        let mut events = base_valid_bundle(run_id);
        events.push(ev(
            run_id,
            "ai_discovery_reported",
            "d1",
            json!({ "openai": false, "transformers": false, "model_artifacts": false }),
        ));
        let state =
            projection::derive_current_state_from_events_with_context(run_id, &events, None, None);
        assert_eq!(
            state.requirements.required,
            vec!["ai_discovery_completed".to_string()]
        );
        assert_eq!(
            state.requirements.satisfied,
            vec!["ai_discovery_completed".to_string()]
        );
        assert!(state.requirements.missing.is_empty());
        assert_eq!(compliance_verdict_from_state(&state), "VALID");
        assert!(blocked_reasons_from_state(&state).is_empty());
    }

    #[test]
    fn openai_discovery_without_evidence_blocks() {
        let run_id = "run_openai_blocked";
        let mut events = base_valid_bundle(run_id);
        events.push(ev(
            run_id,
            "ai_discovery_reported",
            "d1",
            json!({ "openai": true, "transformers": false, "model_artifacts": false }),
        ));
        let state =
            projection::derive_current_state_from_events_with_context(run_id, &events, None, None);
        assert!(state
            .requirements
            .required
            .contains(&"ai_discovery_completed".to_string()));
        assert!(state
            .requirements
            .satisfied
            .contains(&"ai_discovery_completed".to_string()));
        assert!(state
            .requirements
            .missing
            .contains(&"model_registered".to_string()));
        assert!(state
            .requirements
            .missing
            .contains(&"usage_policy_defined".to_string()));
        assert_eq!(compliance_verdict_from_state(&state), "BLOCKED");
        let reasons = blocked_reasons_from_state(&state);
        let codes: Vec<String> = reasons.into_iter().map(|r| r.code).collect();
        assert_eq!(
            codes,
            vec![
                "model_registered".to_string(),
                "usage_policy_defined".to_string()
            ]
        );
    }

    #[test]
    fn openai_discovery_with_required_evidence_can_pass() {
        let run_id = "run_openai_ok";
        let mut events = base_valid_bundle(run_id);
        events.push(ev(
            run_id,
            "ai_discovery_reported",
            "d1",
            json!({ "openai": true, "transformers": false, "model_artifacts": false }),
        ));
        events.push(ev(
            run_id,
            "model_registered",
            "mr1",
            json!({ "ref": "registry://model" }),
        ));
        events.push(ev(
            run_id,
            "usage_policy_defined",
            "up1",
            json!({ "policy_id": "pol-1" }),
        ));
        let state =
            projection::derive_current_state_from_events_with_context(run_id, &events, None, None);
        assert!(state.requirements.missing.is_empty());
        assert_eq!(compliance_verdict_from_state(&state), "VALID");
        assert!(blocked_reasons_from_state(&state).is_empty());
    }

    #[test]
    fn model_artifact_discovery_without_documentation_blocks() {
        let run_id = "run_artifact_blocked";
        let mut events = base_valid_bundle(run_id);
        events.push(ev(
            run_id,
            "ai_discovery_reported",
            "d1",
            json!({ "openai": false, "transformers": false, "model_artifacts": true }),
        ));
        let state =
            projection::derive_current_state_from_events_with_context(run_id, &events, None, None);
        assert!(state
            .requirements
            .required
            .contains(&"model_artifact_documented".to_string()));
        assert!(state
            .requirements
            .required
            .contains(&"evaluation_completed".to_string()));
        assert!(state
            .requirements
            .satisfied
            .contains(&"evaluation_completed".to_string()));
        assert_eq!(
            state.requirements.missing,
            vec!["model_artifact_documented".to_string()]
        );
        assert_eq!(compliance_verdict_from_state(&state), "BLOCKED");
        let reasons = blocked_reasons_from_state(&state);
        assert_eq!(reasons.len(), 1);
        assert_eq!(reasons[0].code, "model_artifact_documented");
    }

    #[test]
    fn later_failed_evaluation_overrides_pass_and_invalidates() {
        let run_id = "run_eval_fail_overrides";
        let mut events = base_valid_bundle(run_id);
        events.push(ev(
            run_id,
            "ai_discovery_reported",
            "d1",
            json!({ "openai": false, "transformers": false, "model_artifacts": false }),
        ));
        // Last `evaluation_reported` wins for `evaluation_passed`.
        events.push(ev(
            run_id,
            "evaluation_reported",
            "e2",
            json!({
                "ai_system_id": "ai1",
                "dataset_id": "d1",
                "model_version_id": "m1",
                "metric": "acc",
                "value": 0.1,
                "threshold": 0.8,
                "passed": false,
            }),
        ));
        let state =
            projection::derive_current_state_from_events_with_context(run_id, &events, None, None);
        assert!(state.requirements.missing.is_empty());
        assert_eq!(state.model.evaluation_passed, Some(false));
        assert_eq!(compliance_verdict_from_state(&state), "INVALID");
        assert!(blocked_reasons_from_state(&state).is_empty());
    }

    #[test]
    fn single_explicit_failed_evaluation_is_invalid() {
        let run_id = "run_eval_fail_only";
        let events = vec![
            ev(
                run_id,
                "ai_discovery_reported",
                "d0",
                json!({ "openai": false, "transformers": false, "model_artifacts": false }),
            ),
            ev(
                run_id,
                "evaluation_reported",
                "e1",
                json!({
                    "ai_system_id": "ai1",
                    "dataset_id": "d1",
                    "model_version_id": "m1",
                    "metric": "acc",
                    "value": 0.1,
                    "threshold": 0.8,
                    "passed": false,
                }),
            ),
        ];
        let state =
            projection::derive_current_state_from_events_with_context(run_id, &events, None, None);
        assert_eq!(state.model.evaluation_passed, Some(false));
        assert_eq!(compliance_verdict_from_state(&state), "INVALID");
    }
}

#[cfg(test)]
mod api_error_response_tests {
    use super::*;
    use axum::http::HeaderValue;
    use serde_json::Value;

    const TENANT_SCOPED_NOT_FOUND_HINT: &str =
        "The resource was not found under the current tenant context. Check the run id, API key, and tenant or project header.";

    fn pool_lazy_for_tests() -> DbPool {
        sqlx::PgPool::connect_lazy("postgres://postgres:postgres@localhost/postgres")
            .expect("connect_lazy should not contact the database")
    }

    #[tokio::test]
    async fn compliance_summary_run_not_found_is_404_with_standard_error_shape() {
        let tmp = tempfile::tempdir().unwrap();
        let ledger_base = tmp.path().join("audit_log.jsonl");
        let ledger_base_static: &'static str =
            Box::leak(ledger_base.to_str().unwrap().to_string().into_boxed_str());
        let policy_version = "test_policy_v1";

        // Create an empty tenant-scoped ledger file so bundle reads succeed but return 0 events.
        let tenant_id = "team-alpha";
        let tenant_ledger = project::resolve_ledger_path(ledger_base.to_str().unwrap(), tenant_id);
        std::fs::write(&tenant_ledger, "").unwrap();

        let state = AuditState {
            ledger_base: ledger_base_static,
            policy_version,
            deployment_env: GovaiEnvironment::Dev,
            policy: crate::policy_config::load_with_env("dev").config,
            pool: pool_lazy_for_tests(),
            metering: crate::metering::MeteringConfig {
                enabled: false,
                default_plan: crate::metering::GovaiPlan::Free,
            },
        };

        let mut headers = HeaderMap::new();
        headers.insert("x-govai-project", HeaderValue::from_static("team-alpha"));

        let (status, Json(body)) = compliance_summary_route(
            State(state),
            headers,
            Query(ComplianceSummaryQuery {
                run_id: "missing-run".to_string(),
            }),
        )
        .await;

        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body.get("ok").and_then(Value::as_bool), Some(false));
        assert_eq!(
            body.pointer("/error/code").and_then(Value::as_str),
            Some("RUN_NOT_FOUND")
        );
        assert_eq!(
            body.pointer("/error/hint").and_then(Value::as_str),
            Some(TENANT_SCOPED_NOT_FOUND_HINT)
        );
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
            return api_err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "CONFIG_ERROR",
                "Server authentication is not configured correctly.",
                "Contact support (this is a server-side configuration issue).",
                Some(json!({ "raw": e })),
                None,
                None,
            )
        }
    };

    let user = match crate::auth::require_user(&cfg, &headers).await {
        Ok(u) => u,
        Err(resp) => return resp,
    };

    let teams = match db::list_user_teams(&state.pool, &user.user_id).await {
        Ok(t) => t,
        Err(e) => return api_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "We could not load your teams.",
            "Retry in a moment. If this persists, contact support (this is a server-side issue).",
            Some(json!({ "raw": e.to_string() })),
            None,
            None,
        ),
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

    let rec =
        match db::transition_workflow_review(&state.pool, team_id, &rid, user.user_id, approve)
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

    let rec =
        match db::transition_workflow_promotion(&state.pool, team_id, &rid, user.user_id, allow)
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
        .route(
            "/api/compliance-workflow",
            get(list_compliance_workflow).post(register_compliance_workflow),
        )
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
