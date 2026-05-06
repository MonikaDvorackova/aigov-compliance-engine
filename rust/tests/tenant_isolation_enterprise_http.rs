//! Tenant isolation tests for enterprise (Supabase-authenticated) routes.
//!
//! Confirms:
//! - Team A can create workflow items / assessments within its team scope
//! - Team B cannot read or mutate Team A workflow items
//! - Team B cannot create assessments in Team A by selecting Team A via header
//! - Cross-team responses do not include Team A identifiers or data

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use axum::routing::get;
use axum::{Json, Router};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use http_body_util::BodyExt;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use rand::rngs::OsRng;
use rsa::pkcs1::{EncodeRsaPrivateKey, LineEnding};
use rsa::{RsaPrivateKey, RsaPublicKey};
use rsa::traits::PublicKeyParts;
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
mod test_support;
use test_support::env_lock;
use tokio::task::JoinHandle;
use tower::ServiceExt;
use uuid::Uuid;

use aigov_audit::govai_api;

fn database_url() -> Option<String> {
    std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .ok()
}

struct TestJwksServer {
    base_url: String,
    _task: JoinHandle<()>,
}

fn b64url_uint(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

fn rsa_public_jwk(kid: &str, pubk: &RsaPublicKey) -> Value {
    // RFC7517: RSA JWK uses base64url-encoded big-endian bytes for n/e.
    let n = b64url_uint(&pubk.n().to_bytes_be());
    let e = b64url_uint(&pubk.e().to_bytes_be());
    json!({
        "kty": "RSA",
        "kid": kid,
        "use": "sig",
        "alg": "RS256",
        "n": n,
        "e": e
    })
}

async fn start_jwks_server(jwks: Value) -> TestJwksServer {
    let app = Router::new().route(
        "/auth/v1/.well-known/jwks.json",
        get({
            let jwks = jwks.clone();
            move || {
                let jwks = jwks.clone();
                async move { Json(jwks) }
            }
        }),
    );

    let listener = tokio::net::TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
        .await
        .unwrap();
    let addr = listener.local_addr().unwrap();
    let base_url = format!("http://{}", addr);

    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    TestJwksServer {
        base_url,
        _task: task,
    }
}

#[derive(Debug, Serialize)]
struct JwtClaims {
    sub: String,
    iss: String,
    aud: Option<serde_json::Value>,
    exp: usize,
}

fn make_jwt_rs256(kid: &str, issuer: &str, user_id: Uuid, key: &RsaPrivateKey) -> String {
    let mut header = Header::new(Algorithm::RS256);
    header.kid = Some(kid.to_string());

    let claims = JwtClaims {
        sub: user_id.to_string(),
        iss: issuer.to_string(),
        aud: None,
        // Far future (tests).
        exp: 2_000_000_000,
    };

    let pem = key.to_pkcs1_pem(LineEnding::LF).unwrap();
    encode(
        &header,
        &claims,
        &EncodingKey::from_rsa_pem(pem.as_bytes()).unwrap(),
    )
    .unwrap()
}

async fn seed_team(pool: &sqlx::PgPool, team_id: Uuid, name: &str) {
    sqlx::query("insert into public.teams (id, name) values ($1, $2)")
        .bind(team_id)
        .bind(name)
        .execute(pool)
        .await
        .unwrap();
}

async fn seed_team_member(pool: &sqlx::PgPool, team_id: Uuid, user_id: Uuid, role: &str) {
    sqlx::query("insert into public.team_members (team_id, user_id, role) values ($1, $2, $3)")
        .bind(team_id)
        .bind(user_id)
        .bind(role)
        .execute(pool)
        .await
        .unwrap();
}

async fn read_json(res: axum::response::Response) -> (StatusCode, Value) {
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let v: Value = serde_json::from_slice(&bytes).unwrap();
    (status, v)
}

#[tokio::test]
async fn enterprise_team_isolation_assessments_and_compliance_workflow() {
    let Some(url) = database_url() else {
        eprintln!("skip tenant_isolation_enterprise_http: set DATABASE_URL or TEST_DATABASE_URL");
        return;
    };

    let _g = env_lock().await;

    // Generate an RSA keypair and serve a JWKS locally.
    let mut rng = OsRng;
    let key = RsaPrivateKey::new(&mut rng, 2048).unwrap();
    let pubk = RsaPublicKey::from(&key);
    let kid = "test-kid";
    let jwks = json!({ "keys": [rsa_public_jwk(kid, &pubk)] });
    let jwks_server = start_jwks_server(jwks).await;

    // Configure auth to use the local JWKS server.
    std::env::set_var("SUPABASE_URL", &jwks_server.base_url);
    std::env::remove_var("SUPABASE_JWT_AUD");
    let issuer = format!("{}/auth/v1", jwks_server.base_url.trim_end_matches('/'));

    // DB setup.
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("connect db");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate");

    // Build only enterprise routers under test.
    let app = Router::new()
        .merge(govai_api::assessments_router(pool.clone()))
        .merge(govai_api::compliance_workflow_router(pool.clone()));

    // Seed two teams and two users (disjoint memberships).
    let team_a = Uuid::new_v4();
    let team_b = Uuid::new_v4();
    let user_a = Uuid::new_v4();
    let user_b = Uuid::new_v4();
    seed_team(&pool, team_a, "Team A").await;
    seed_team(&pool, team_b, "Team B").await;
    seed_team_member(&pool, team_a, user_a, "admin").await;
    seed_team_member(&pool, team_b, user_b, "admin").await;

    let token_a = make_jwt_rs256(kid, &issuer, user_a, &key);
    let token_b = make_jwt_rs256(kid, &issuer, user_b, &key);

    // --- Team A creates a compliance workflow item.
    let run_id = format!("run_{}", Uuid::new_v4());
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/compliance-workflow")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::AUTHORIZATION, format!("Bearer {token_a}"))
                .header("x-govai-team-id", team_a.to_string())
                .body(Body::from(
                    serde_json::to_string(&json!({ "run_id": run_id })).unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let (status, body) = read_json(res).await;
    assert_eq!(status, StatusCode::OK, "unexpected register response: {body}");
    assert_eq!(body.get("ok").and_then(|v| v.as_bool()), Some(true));
    let wf = body.get("workflow").cloned().unwrap_or(Value::Null);
    assert_eq!(
        wf.get("team_id").and_then(|v| v.as_str()),
        Some(team_a.to_string().as_str())
    );
    assert_eq!(wf.get("run_id").and_then(|v| v.as_str()), Some(run_id.as_str()));

    // --- Team B tries to read Team A workflow item using its own default team (Team B) => 404.
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/compliance-workflow/{run_id}"))
                .header(header::AUTHORIZATION, format!("Bearer {token_b}"))
                // no x-govai-team-id: resolves to Team B
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let (status, body) = read_json(res).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "unexpected get response: {body}");
    // Must not include Team A identifiers in response.
    let raw = body.to_string();
    assert!(!raw.contains(&team_a.to_string()), "leaked team A id: {raw}");
    assert!(!raw.contains("Team A"), "leaked team A name: {raw}");

    // --- Team B tries to mutate Team A workflow item via review endpoint (Team B scope) => 409 invalid_state.
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/compliance-workflow/{run_id}/review"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::AUTHORIZATION, format!("Bearer {token_b}"))
                .body(Body::from(
                    serde_json::to_string(&json!({ "decision": "approve" })).unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let (status, body) = read_json(res).await;
    assert_eq!(status, StatusCode::CONFLICT, "unexpected review response: {body}");
    let raw = body.to_string();
    assert!(!raw.contains(&team_a.to_string()), "leaked team A id: {raw}");
    assert!(!raw.contains("Team A"), "leaked team A name: {raw}");

    // --- Team B explicitly selects Team A via header => 403 not_team_member (no existence leak).
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/compliance-workflow/{run_id}"))
                .header(header::AUTHORIZATION, format!("Bearer {token_b}"))
                .header("x-govai-team-id", team_a.to_string())
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let (status, body) = read_json(res).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "unexpected cross-team select: {body}");
    // Response must not reveal Team A resource existence.
    let raw = body.to_string();
    assert!(!raw.contains(&run_id), "should not echo run_id: {raw}");

    // --- Team A can create an assessment for Team A.
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/assessments")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::AUTHORIZATION, format!("Bearer {token_a}"))
                .header("x-govai-team-id", team_a.to_string())
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "system_name": "sys-a",
                        "intended_purpose": "purpose-a",
                        "risk_class": "high"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let (status, body) = read_json(res).await;
    assert_eq!(status, StatusCode::OK, "unexpected assessment create: {body}");
    assert_eq!(
        body.get("team_id").and_then(|v| v.as_str()),
        Some(team_a.to_string().as_str())
    );

    // --- Team B cannot create an assessment in Team A (selecting Team A).
    let res = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/assessments")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::AUTHORIZATION, format!("Bearer {token_b}"))
                .header("x-govai-team-id", team_a.to_string())
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "system_name": "sys-b",
                        "intended_purpose": "purpose-b",
                        "risk_class": "low"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let (status, body) = read_json(res).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "unexpected assessment cross-team: {body}");
    let raw = body.to_string();
    assert!(!raw.contains(&team_a.to_string()), "leaked team A id: {raw}");

    // Cleanup env to reduce cross-test coupling.
    std::env::remove_var("SUPABASE_URL");
}

