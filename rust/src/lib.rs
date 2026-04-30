//! GovAI audit service library. Binary entrypoint: [`run`].

pub mod audit_store;
pub mod bundle;
pub mod govai_environment;
pub mod ledger_storage;
pub mod policy;
pub mod policy_config;
pub mod schema;
pub mod verify_chain;

pub mod projection;

pub mod api_usage;
pub mod api_error;
pub mod audit_api_key;
pub mod auth;
pub mod db;
pub mod evidence_usage;
pub mod govai_api;
pub mod metering;
pub mod pricing;
pub mod project;
pub mod rbac;

use axum::Router;
use std::net::SocketAddr;

const LOG_PATH: &str = "audit_log.jsonl";

fn default_bind() -> SocketAddr {
    SocketAddr::from(([127, 0, 0, 1], 8088))
}

fn bind_addr_from_env() -> SocketAddr {
    if let Ok(s) = std::env::var("AIGOV_BIND") {
        if let Ok(addr) = s.parse::<SocketAddr>() {
            return addr;
        }
    }

    if let Ok(port_s) = std::env::var("PORT") {
        if let Ok(port) = port_s.parse::<u16>() {
            return SocketAddr::from(([0, 0, 0, 0], port));
        }
    }

    default_bind()
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

    if let Err(e) = crate::audit_api_key::init_api_key_tenant_map(deployment_env) {
        eprintln!("{e}");
        return Err(e);
    }

    if let Err(e) = crate::ledger_storage::validate_startup(deployment_env) {
        eprintln!("{e}");
        return Err(e);
    }

    let policy_version = govai_environment::policy_version_for(deployment_env);
    let resolved_policy = policy_config::load_with_env(deployment_env.as_str());

    let pool = match db::init_pool_from_env().await {
        Ok(p) => p,
        Err(e) => {
            eprintln!("DB init failed: {}", e);
            eprintln!("Set GOVAI_DATABASE_URL (preferred) or DATABASE_URL to a Postgres connection string");
            return Err(e);
        }
    };

    let auto_migrate = std::env::var("GOVAI_AUTO_MIGRATE")
        .ok()
        .map(|s| matches!(s.trim().to_ascii_lowercase().as_str(), "1" | "true" | "on" | "yes"))
        .unwrap_or(false);
    if auto_migrate {
        if let Err(e) = sqlx::migrate!("./migrations").run(&pool).await {
            eprintln!("DB migration failed: {}", e);
            return Err(format!("DB migration failed: {e}"));
        }
    }

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
        .merge(govai_api::core_router(policy_version, deployment_env))
        .merge(govai_api::audit_router(
            LOG_PATH,
            policy_version,
            deployment_env,
            resolved_policy.config,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn clear_env_keys() {
        std::env::remove_var("AIGOV_BIND");
        std::env::remove_var("PORT");
    }

    #[test]
    fn bind_addr_uses_aigov_bind_when_valid() {
        let _g = env_lock().lock().unwrap();
        clear_env_keys();

        std::env::set_var("AIGOV_BIND", "127.0.0.1:5555");
        std::env::set_var("PORT", "9999");

        assert_eq!(
            bind_addr_from_env(),
            SocketAddr::from(([127, 0, 0, 1], 5555))
        );
        clear_env_keys();
    }

    #[test]
    fn bind_addr_falls_back_to_port_when_aigov_bind_missing() {
        let _g = env_lock().lock().unwrap();
        clear_env_keys();

        std::env::set_var("PORT", "3000");
        assert_eq!(bind_addr_from_env(), SocketAddr::from(([0, 0, 0, 0], 3000)));

        clear_env_keys();
    }

    #[test]
    fn bind_addr_falls_back_to_port_when_aigov_bind_invalid() {
        let _g = env_lock().lock().unwrap();
        clear_env_keys();

        std::env::set_var("AIGOV_BIND", "not-a-socket-addr");
        std::env::set_var("PORT", "3001");

        assert_eq!(bind_addr_from_env(), SocketAddr::from(([0, 0, 0, 0], 3001)));
        clear_env_keys();
    }

    #[test]
    fn bind_addr_defaults_when_no_env_or_invalid_port() {
        let _g = env_lock().lock().unwrap();
        clear_env_keys();

        assert_eq!(bind_addr_from_env(), default_bind());

        std::env::set_var("PORT", "not-a-number");
        assert_eq!(bind_addr_from_env(), default_bind());

        clear_env_keys();
    }
}
