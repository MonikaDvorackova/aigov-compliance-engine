//! Product-layer RBAC (team scope). Does not replace evidence `policy.rs` / core contracts.

use serde::Serialize;

/// Enterprise roles stored in `team_members.role` (plus legacy aliases).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProductRole {
    Admin,
    ComplianceOfficer,
    RiskOfficer,
    Reviewer,
    Viewer,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProductPermissions {
    pub review_queue_view: bool,
    pub artifact_view: bool,
    pub decision_submit: bool,
    pub promotion_action: bool,
    pub admin_override: bool,
}

/// Map DB string → canonical role. Unknown values default to most restrictive (`Viewer`).
pub fn normalize_role(raw: &str) -> ProductRole {
    match raw.trim().to_ascii_lowercase().as_str() {
        "admin" | "owner" => ProductRole::Admin,
        "compliance_officer" | "compliance" => ProductRole::ComplianceOfficer,
        "risk_officer" | "risk" => ProductRole::RiskOfficer,
        "reviewer" => ProductRole::Reviewer,
        "viewer" => ProductRole::Viewer,
        // Legacy default from `0001_govai_core.sql`; treat as workflow participant.
        "member" => ProductRole::Reviewer,
        _ => ProductRole::Viewer,
    }
}

pub fn permissions_for(role: ProductRole) -> ProductPermissions {
    match role {
        ProductRole::Admin => ProductPermissions {
            review_queue_view: true,
            artifact_view: true,
            decision_submit: true,
            promotion_action: true,
            admin_override: true,
        },
        ProductRole::ComplianceOfficer => ProductPermissions {
            review_queue_view: true,
            artifact_view: true,
            decision_submit: true,
            promotion_action: true,
            admin_override: false,
        },
        ProductRole::RiskOfficer => ProductPermissions {
            review_queue_view: true,
            artifact_view: true,
            decision_submit: true,
            promotion_action: true,
            admin_override: false,
        },
        ProductRole::Reviewer => ProductPermissions {
            review_queue_view: true,
            artifact_view: true,
            decision_submit: true,
            promotion_action: false,
            admin_override: false,
        },
        ProductRole::Viewer => ProductPermissions {
            review_queue_view: true,
            artifact_view: true,
            decision_submit: false,
            promotion_action: false,
            admin_override: false,
        },
    }
}

pub fn permissions_for_db_role(raw: &str) -> ProductPermissions {
    permissions_for(normalize_role(raw))
}

pub fn canonical_role_id(role: ProductRole) -> &'static str {
    match role {
        ProductRole::Admin => "admin",
        ProductRole::ComplianceOfficer => "compliance_officer",
        ProductRole::RiskOfficer => "risk_officer",
        ProductRole::Reviewer => "reviewer",
        ProductRole::Viewer => "viewer",
    }
}
