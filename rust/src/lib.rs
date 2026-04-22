//! GovAI audit service library. Binary entrypoint: [`run`].

pub mod audit_store;
pub mod bundle;
pub mod govai_environment;
pub mod policy;
pub mod policy_config;
pub mod schema;
pub mod verify_chain;

pub mod projection;

pub mod api_usage;
pub mod audit_api_key;
pub mod auth;
pub mod db;
pub mod evidence_usage;
pub mod govai_api;
pub mod metering;
pub mod project;
pub mod rbac;

use axum::Router;
use std::net::SocketAddr;

const LOG_PATH: &str = "audit_log.jsonl";

fn bind_addr_from_env() -> SocketAddr {
    let s = std::env::var("AIGOV_BIND").unwrap_or_else(|_| "127.0.0.1:8088".to_string());
    s.parse().unwrap_or_else(|_| SocketAddr::from(([127, 0, 0, 1], 8088)))
}

/// Run the HTTP server (same as the `aigov_audit` binary).
pub async fn run() -> Result<(), String> {
    let addr = bind_addr_from_env();

    let deployment_env = match govai_environment::resolve_from_env() {
        Ok(e) => e,
        Err(e) => {
            eprintln!("{}", e);
            return Err(e);
        }
    };
    let policy_version = govai_environment::policy_version_for(deployment_env);
    let resolved_policy = policy_config::load_with_env(deployment_env.as_str());

    let pool = match db::init_pool_from_env().await {
        Ok(p) => p,
        Err(e) => {
            eprintln!("DB init failed: {}", e);
            eprintln!("Set DATABASE_URL env var to a Postgres connection string");
            return Err(e);
        }
    };

    let metering = crate::metering::MeteringConfig::from_env();
    if metering.enabled {
        let keys_ok = std::env::var("GOVAI_API_KEYS")
            .ok()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        if !keys_ok {
            eprintln!("GOVAI_METERING=on requires a non-empty GOVAI_API_KEYS");
            return Err("GOVAI_METERING=on requires GOVAI_API_KEYS".to_string());
        }
    }

    let api_usage = match api_usage::ApiUsageState::from_env(&pool) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("API usage init failed: {}", e);
            return Err(e);
        }
    };

    let app: Router = Router::new()
        .merge(govai_api::core_router(
            policy_version,
            deployment_env,
            resolved_policy.clone(),
        ))
        .merge(govai_api::audit_router(
            LOG_PATH,
            policy_version,
            deployment_env,
            resolved_policy,
            api_usage,
            pool.clone(),
            metering,
        ))
        .merge(govai_api::assessments_router(pool.clone()))
        .merge(govai_api::compliance_workflow_router(pool));

    println!(
        "govai listening on http://{} (environment={} policy_version={})",
        addr, deployment_env, policy_version
    );

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Bind failed on {}: {}", addr, e);
            return Err(e.to_string());
        }
    };

    axum::serve(listener, app).await.map_err(|e| e.to_string())
}
