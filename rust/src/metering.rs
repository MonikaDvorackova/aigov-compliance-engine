//! Team-scoped metering: runs (monthly new run_ids) and evidence events (per month + per run).
//! Enabled via `GOVAI_METERING=on`. Plan limits are code constants; default plan from `GOVAI_DEFAULT_PLAN`.

use crate::db::DbPool;
use chrono::{Datelike, Utc};
use sqlx::Row;
use uuid::Uuid;

pub const METERING_ENV_ON: &str = "on";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MeteringConfig {
    pub enabled: bool,
    pub default_plan: GovaiPlan,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GovaiPlan {
    Free,
    Team,
    Growth,
    Enterprise,
}

/// Monthly / per-run caps. `None` = unlimited (Enterprise).
#[derive(Clone, Copy, Debug)]
pub struct PlanLimits {
    pub max_runs_per_month: Option<u64>,
    pub max_events_per_month: Option<u64>,
    pub max_events_per_run: Option<u64>,
}

impl PlanLimits {
    pub fn for_plan(plan: GovaiPlan) -> Self {
        match plan {
            GovaiPlan::Free => Self {
                max_runs_per_month: Some(25),
                max_events_per_month: Some(2_500),
                max_events_per_run: Some(1_000),
            },
            GovaiPlan::Team => Self {
                max_runs_per_month: Some(500),
                max_events_per_month: Some(50_000),
                max_events_per_run: Some(5_000),
            },
            GovaiPlan::Growth => Self {
                max_runs_per_month: Some(2_500),
                max_events_per_month: Some(250_000),
                max_events_per_run: Some(10_000),
            },
            GovaiPlan::Enterprise => Self {
                max_runs_per_month: None,
                max_events_per_month: None,
                max_events_per_run: None,
            },
        }
    }
}

impl MeteringConfig {
    /// `GOVAI_METERING`: `off` (default) or `on`.
    /// `GOVAI_DEFAULT_PLAN`: `free` | `team` | `growth` | `enterprise` (default: free).
    pub fn from_env() -> Self {
        let enabled = std::env::var("GOVAI_METERING")
            .map(|s| s.trim().eq_ignore_ascii_case(METERING_ENV_ON))
            .unwrap_or(false);
        let default_plan = std::env::var("GOVAI_DEFAULT_PLAN")
            .map(|s| match s.trim().to_ascii_lowercase().as_str() {
                "team" => GovaiPlan::Team,
                "growth" => GovaiPlan::Growth,
                "enterprise" => GovaiPlan::Enterprise,
                _ => GovaiPlan::Free,
            })
            .unwrap_or(GovaiPlan::Free);
        Self {
            enabled,
            default_plan,
        }
    }
}

/// UTC `year * 100 + month` (e.g. 202604).
pub fn year_month_utc_now() -> i32 {
    let now = Utc::now().date_naive();
    now.year() * 100 + now.month() as i32
}

pub fn run_complexity_label(event_count: u64) -> &'static str {
    match event_count {
        0..=100 => "light",
        101..=1_000 => "standard",
        1_001..=5_000 => "heavy",
        _ => "extreme",
    }
}

pub async fn team_id_for_key_hash(
    pool: &DbPool,
    key_hash: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        select team_id
        from public.govai_api_key_billing
        where key_hash = $1
        "#,
    )
    .bind(key_hash)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| r.get("team_id")))
}

#[derive(Debug)]
pub enum MeteringReject {
    MonthlyRunLimit {
        used: u64,
        limit: u64,
    },
    MonthlyEventLimit {
        used: u64,
        limit: u64,
    },
    PerRunEventLimit {
        run_id: String,
        would_be: u64,
        limit: u64,
    },
}

/// Read current monthly row (missing row => zeros). No side effects.
pub async fn load_monthly(
    pool: &DbPool,
    team_id: Uuid,
    year_month: i32,
) -> Result<(i64, i64), sqlx::Error> {
    let row = sqlx::query(
        r#"
        select new_run_ids, evidence_events
        from public.govai_team_usage_monthly
        where team_id = $1 and year_month = $2
        "#,
    )
    .bind(team_id)
    .bind(year_month)
    .fetch_optional(pool)
    .await?;
    match row {
        None => Ok((0, 0)),
        Some(r) => Ok((r.get("new_run_ids"), r.get("evidence_events"))),
    }
}

/// Plan-limit guard used in unit tests only. **Ingest enforcement** uses `govai_usage_counters`
/// ([`crate::evidence_usage`]); team tables here are updated **after** append for telemetry.
pub fn precheck_ingest(
    plan: GovaiPlan,
    limits: PlanLimits,
    new_run_ids: i64,
    evidence_events: i64,
    is_new_run: bool,
    run_id: &str,
    next_count: u64,
) -> Result<(), MeteringReject> {
    if plan == GovaiPlan::Enterprise {
        return Ok(());
    }

    if let Some(lim) = limits.max_events_per_run {
        if next_count > lim {
            return Err(MeteringReject::PerRunEventLimit {
                run_id: run_id.to_string(),
                would_be: next_count,
                limit: lim,
            });
        }
    }

    if let Some(lim) = limits.max_events_per_month {
        let next_ev = (evidence_events + 1).max(0) as u64;
        if next_ev > lim {
            return Err(MeteringReject::MonthlyEventLimit {
                used: evidence_events.max(0) as u64,
                limit: lim,
            });
        }
    }

    if is_new_run {
        if let Some(lim) = limits.max_runs_per_month {
            let next_runs = (new_run_ids + 1).max(0) as u64;
            if next_runs > lim {
                return Err(MeteringReject::MonthlyRunLimit {
                    used: new_run_ids.max(0) as u64,
                    limit: lim,
                });
            }
        }
    }

    Ok(())
}

/// After successful ledger append, persist counters.
pub async fn record_successful_ingest(
    pool: &DbPool,
    team_id: Uuid,
    year_month: i32,
    run_id: &str,
    next_count: i64,
    is_new_run: bool,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let new_run_delta: i64 = if is_new_run { 1 } else { 0 };

    sqlx::query(
        r#"
        insert into public.govai_team_usage_monthly
          (team_id, year_month, new_run_ids, evidence_events, updated_at)
        values ($1, $2, $3, 1, now())
        on conflict (team_id, year_month) do update set
          new_run_ids = public.govai_team_usage_monthly.new_run_ids + excluded.new_run_ids,
          evidence_events = public.govai_team_usage_monthly.evidence_events + 1,
          updated_at = now()
        "#,
    )
    .bind(team_id)
    .bind(year_month)
    .bind(new_run_delta)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        insert into public.govai_run_meters
          (run_id, team_id, event_count, first_ingest_at)
        values ($1, $2, $3, now())
        on conflict (run_id) do update set
          event_count = $3,
          team_id = $2
        "#,
    )
    .bind(run_id)
    .bind(team_id)
    .bind(next_count)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Nearing limit warnings (80% of monthly events or runs) — basic UX.
/// `evidence_events_after` / `new_run_ids_after` are values **after** this successful ingest.
pub fn basic_warnings(
    plan: GovaiPlan,
    limits: PlanLimits,
    new_run_ids_after: i64,
    evidence_events_after: i64,
    is_new_run: bool,
) -> Vec<serde_json::Value> {
    if plan == GovaiPlan::Enterprise {
        return vec![];
    }
    let mut w = vec![];
    if let Some(lim) = limits.max_events_per_month {
        let u = evidence_events_after.max(0) as f64;
        if (u / lim as f64) >= 0.8 {
            w.push(serde_json::json!({
                "code": "nearing_monthly_event_limit",
                "used": evidence_events_after.max(0),
                "limit": lim
            }));
        }
    }
    if let (Some(lim), true) = (limits.max_runs_per_month, is_new_run) {
        let u = new_run_ids_after.max(0) as f64;
        if (u / lim as f64) >= 0.8 {
            w.push(serde_json::json!({
                "code": "nearing_monthly_run_limit",
                "used": new_run_ids_after.max(0),
                "limit": lim
            }));
        }
    }
    w
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn precheck_blocks_per_run() {
        let l = PlanLimits::for_plan(GovaiPlan::Free);
        let e = precheck_ingest(
            GovaiPlan::Free,
            l,
            0,
            0,
            true,
            "r1",
            1001,
        );
        assert!(e.is_err());
    }

    #[test]
    fn precheck_allows_enterprise() {
        let l = PlanLimits::for_plan(GovaiPlan::Enterprise);
        assert!(precheck_ingest(
            GovaiPlan::Enterprise,
            l,
            0,
            0,
            true,
            "r1",
            999_999,
        )
        .is_ok());
    }
}
