use chrono::{DateTime, Utc};
use sqlx::{postgres::PgPoolOptions, PgPool};
use uuid::Uuid;
use sqlx::Row;

pub type DbPool = PgPool;

pub async fn init_pool_from_env() -> Result<DbPool, String> {
    let database_url =
        std::env::var("DATABASE_URL").map_err(|_| "DATABASE_URL missing".to_string())?;
    PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .map_err(|e| format!("DB connect failed: {}", e))
}

pub struct UserTeamRow {
    pub team_id: Uuid,
    pub team_name: String,
    pub role: String,
}

pub async fn list_user_teams(pool: &DbPool, user_id: &Uuid) -> Result<Vec<UserTeamRow>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        select tm.team_id as team_id,
               t.name as team_name,
               tm.role as role
        from public.team_members tm
        join public.teams t on t.id = tm.team_id
        where tm.user_id = $1
        order by t.created_at asc
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| UserTeamRow {
            team_id: r.get::<Uuid, _>("team_id"),
            team_name: r.get::<String, _>("team_name"),
            role: r.get::<String, _>("role"),
        })
        .collect())
}

pub async fn is_team_member(pool: &DbPool, team_id: Uuid, user_id: Uuid) -> Result<bool, sqlx::Error> {
    let row = sqlx::query(
        r#"
        select 1
        from public.team_members
        where team_id = $1 and user_id = $2
        limit 1
        "#,
    )
    .bind(team_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.is_some())
}

pub async fn get_default_team_for_user(pool: &DbPool, user_id: Uuid) -> Result<Option<Uuid>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        select team_id
        from public.team_members
        where user_id = $1
        order by created_at asc
        limit 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| r.get::<Uuid, _>("team_id")))
}

pub async fn bootstrap_team_for_user(pool: &DbPool, user_id: Uuid) -> Result<Uuid, sqlx::Error> {
    let team_id = Uuid::new_v4();
    let name = "Default team".to_string();

    let mut tx = pool.begin().await?;

    sqlx::query(
        r#"
        insert into public.teams (id, name)
        values ($1, $2)
        "#,
    )
    .bind(team_id)
    .bind(name)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        insert into public.team_members (team_id, user_id, role)
        values ($1, $2, 'owner')
        "#,
    )
    .bind(team_id)
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(team_id)
}

pub struct AssessmentRow {
    pub id: Uuid,
    pub team_id: Uuid,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub status: String,
    pub system_name: Option<String>,
    pub intended_purpose: Option<String>,
    pub risk_class: Option<String>,
}

pub async fn insert_assessment(
    pool: &DbPool,
    team_id: Uuid,
    created_by: Uuid,
    system_name: String,
    intended_purpose: String,
    risk_class: String,
) -> Result<AssessmentRow, sqlx::Error> {
    let id = Uuid::new_v4();

    let row = sqlx::query(
        r#"
        insert into public.assessments (
            id,
            team_id,
            created_by,
            status,
            system_name,
            intended_purpose,
            risk_class
        )
        values ($1, $2, $3, 'draft', $4, $5, $6)
        returning
            id,
            team_id,
            created_by,
            created_at,
            status,
            system_name,
            intended_purpose,
            risk_class
        "#,
    )
    .bind(id)
    .bind(team_id)
    .bind(created_by)
    .bind(system_name)
    .bind(intended_purpose)
    .bind(risk_class)
    .fetch_one(pool)
    .await?;

    Ok(AssessmentRow {
        id: row.get::<Uuid, _>("id"),
        team_id: row.get::<Uuid, _>("team_id"),
        created_by: row.get::<Uuid, _>("created_by"),
        created_at: row.get::<DateTime<Utc>, _>("created_at"),
        status: row.get::<String, _>("status"),
        system_name: row.get::<Option<String>, _>("system_name"),
        intended_purpose: row.get::<Option<String>, _>("intended_purpose"),
        risk_class: row.get::<Option<String>, _>("risk_class"),
    })
}
