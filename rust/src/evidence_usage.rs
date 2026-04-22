//! Legacy monthly counter when `GOVAI_METERING=off` (`govai_usage_counters`).
//! When `GOVAI_METERING=on`, quotas are enforced via [`crate::metering`] and `govai_team_usage_monthly` instead.

use crate::db::DbPool;
use chrono::{Datelike, NaiveDate, Utc};

pub const FREE_TIER_EVIDENCE_LIMIT: u64 = 1000;

pub fn current_period_start_utc() -> NaiveDate {
    let now = Utc::now().date_naive();
    NaiveDate::from_ymd_opt(now.year(), now.month(), 1).expect("valid month day")
}

pub async fn check_evidence_quota(pool: &DbPool, tenant_id: &str) -> Result<(), String> {
    let period = current_period_start_utc();
    let count: Option<i64> = sqlx::query_scalar(
        r#"
        SELECT evidence_events_count
        FROM govai_usage_counters
        WHERE tenant_id = $1 AND period_start = $2
        "#,
    )
    .bind(tenant_id)
    .bind(period)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let n = count.unwrap_or(0).max(0) as u64;
    if n >= FREE_TIER_EVIDENCE_LIMIT {
        return Err("evidence_quota_exceeded".to_string());
    }
    Ok(())
}

pub async fn increment_evidence_usage(pool: &DbPool, tenant_id: &str) -> Result<(), String> {
    let period = current_period_start_utc();
    sqlx::query(
        r#"
        INSERT INTO govai_usage_counters (tenant_id, period_start, evidence_events_count)
        VALUES ($1, $2, 1)
        ON CONFLICT (tenant_id, period_start)
        DO UPDATE SET
            evidence_events_count = govai_usage_counters.evidence_events_count + 1,
            last_updated_at = now()
        "#,
    )
    .bind(tenant_id)
    .bind(period)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_evidence_usage(pool: &DbPool, tenant_id: &str) -> Result<(i64, NaiveDate), String> {
    let period = current_period_start_utc();
    let count: Option<i64> = sqlx::query_scalar(
        r#"
        SELECT evidence_events_count
        FROM govai_usage_counters
        WHERE tenant_id = $1 AND period_start = $2
        "#,
    )
    .bind(tenant_id)
    .bind(period)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok((count.unwrap_or(0), period))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbPool;
    use sqlx::postgres::PgPoolOptions;

    async fn pool() -> Option<DbPool> {
        let url = std::env::var("TEST_DATABASE_URL")
            .or_else(|_| std::env::var("DATABASE_URL"))
            .ok()?;
        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect(&url)
            .await
            .ok()?;
        sqlx::migrate!("./migrations").run(&pool).await.ok()?;
        Some(pool)
    }

    #[tokio::test]
    async fn increment_increments_counter_by_one() {
        let Some(pool) = pool().await else {
            return;
        };
        let tid = format!("ev_usage_{}", uuid::Uuid::new_v4());
        let p = current_period_start_utc();
        sqlx::query("DELETE FROM govai_usage_counters WHERE tenant_id = $1 AND period_start = $2")
            .bind(&tid)
            .bind(p)
            .execute(&pool)
            .await
            .ok();
        increment_evidence_usage(&pool, &tid).await.expect("inc");
        let (c, _) = get_evidence_usage(&pool, &tid).await.expect("get");
        assert_eq!(c, 1);
    }

    #[tokio::test]
    async fn check_fails_at_free_tier_limit() {
        let Some(pool) = pool().await else {
            return;
        };
        let tid = format!("ev_quota_{}", uuid::Uuid::new_v4());
        let p = current_period_start_utc();
        sqlx::query(
            r#"
            INSERT INTO govai_usage_counters (tenant_id, period_start, evidence_events_count)
            VALUES ($1, $2, $3)
            ON CONFLICT (tenant_id, period_start)
            DO UPDATE SET evidence_events_count = EXCLUDED.evidence_events_count
            "#,
        )
        .bind(&tid)
        .bind(p)
        .bind(FREE_TIER_EVIDENCE_LIMIT as i64)
        .execute(&pool)
        .await
        .expect("seed");
        assert_eq!(
            check_evidence_quota(&pool, &tid).await,
            Err("evidence_quota_exceeded".to_string())
        );
    }
}
