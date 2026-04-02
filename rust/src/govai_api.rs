use crate::auth::{AuthConfig, CurrentUser};
use crate::bundle;
use crate::db::{self, DbPool};
use crate::policy;
use crate::rbac;
use crate::projection;
use crate::schema::EvidenceEvent;
use crate::verify_chain;

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;
use uuid::Uuid;

pub fn core_router(policy_version: &'static str) -> Router {
    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route(
            "/status",
            get({
                let pv = policy_version;
                move || async move { status(pv).await }
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

pub async fn status(policy_version: &'static str) -> Json<serde_json::Value> {
    Json(json!({ "ok": true, "policy_version": policy_version }))
}

#[derive(Deserialize)]
struct BundleQuery {
    run_id: String,
}

#[derive(Deserialize)]
struct BundleHashQuery {
    run_id: String,
}

fn reject_duplicate_event_id(log_path: &str, event: &EvidenceEvent) -> Result<(), String> {
    let existing = bundle::collect_events_for_run(log_path, &event.run_id)?;
    if existing.iter().any(|e| e.event_id == event.event_id) {
        return Err(format!(
            "duplicate event_id for run_id: event_id={} run_id={}",
            event.event_id, event.run_id
        ));
    }
    Ok(())
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
}

async fn ingest(
    State(audit): State<AuditState>,
    Json(event): Json<EvidenceEvent>,
) -> (StatusCode, Json<serde_json::Value>) {
    if let Err(e) = policy::enforce(&event, audit.log_path) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": e, "policy_version": audit.policy_version })),
        );
    }

    if let Err(e) = reject_duplicate_event_id(audit.log_path, &event) {
        return (
            StatusCode::CONFLICT,
            Json(json!({ "ok": false, "error": e, "policy_version": audit.policy_version })),
        );
    }

    match crate::audit_store::append_record(audit.log_path, event) {
        Ok(rec) => (
            StatusCode::OK,
            Json(json!({
                "ok": true,
                "record_hash": rec.record_hash,
                "policy_version": audit.policy_version
            })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "ok": false, "error": e, "policy_version": audit.policy_version })),
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

pub fn audit_router(log_path: &'static str, policy_version: &'static str) -> Router {
    let state = AuditState {
        log_path,
        policy_version,
    };

    Router::new()
        .route("/evidence", post(ingest))
        .route("/verify", get(verify))
        .route("/bundle", get(bundle_route))
        .route("/bundle-hash", get(bundle_hash_route))
        .route("/verify-log", get(verify_log))
        .route("/compliance-summary", get(compliance_summary_route))
        .with_state(state)
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
    (StatusCode::OK, Json(json!({ "ok": true, "items": out })))
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

    (
        StatusCode::OK,
        Json(json!({ "ok": true, "workflow": workflow_to_out(rec) })),
    )
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
        Some(r) => (StatusCode::OK, Json(json!({ "ok": true, "workflow": workflow_to_out(r) }))),
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
        Some(r) => (
            StatusCode::OK,
            Json(json!({ "ok": true, "workflow": workflow_to_out(r) })),
        ),
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
