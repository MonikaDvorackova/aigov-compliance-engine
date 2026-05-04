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

pub mod api_error;
pub mod api_usage;
pub mod audit_api_key;
pub mod billing_trace;
pub mod stripe_webhook;
pub mod stripe_billing;
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

use crate::govai_environment::GovaiEnvironment;

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

pub(crate) fn staging_prod_bind_must_be_reachable(
    deployment_env: GovaiEnvironment,
    addr: SocketAddr,
) -> Result<(), String> {
    match deployment_env {
        GovaiEnvironment::Staging | GovaiEnvironment::Prod if addr.ip().is_loopback() => Err(format!(
            "Refusing to start {deployment_env} on loopback {addr}: use a reachable bind address such as \"0.0.0.0:${{PORT}}\" (Railway provides PORT)."
        )),
        _ => Ok(()),
    }
}

async fn assert_staging_prod_operational_constraints(
    deployment_env: GovaiEnvironment,
    addr: SocketAddr,
    auto_migrate: bool,
    pool: &db::DbPool,
) -> Result<(), String> {
    match deployment_env {
        GovaiEnvironment::Dev => Ok(()),
        GovaiEnvironment::Staging | GovaiEnvironment::Prod => {
            staging_prod_bind_must_be_reachable(deployment_env, addr)?;
            if !auto_migrate {
                db::verify_sqlx_migrations_complete(pool).await?;
            }
            Ok(())
        }
    }
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

    let ledger_dir_result = crate::ledger_storage::validate_startup(deployment_env)?;
    let ledger_display = ledger_dir_result
        .as_ref()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| {
            "(unset — evidence files use process working directory; not for staging/prod)"
                .to_string()
        });

    let policy_version = govai_environment::policy_version_for(deployment_env);
    let resolved_policy = policy_config::load_with_env(deployment_env.as_str());

    if let Err(e) = db::postgres_url_configured_nonempty() {
        eprintln!("{e}");
        return Err(e);
    }

    let pool = match db::init_pool_from_env().await {
        Ok(p) => p,
        Err(e) => {
            eprintln!("database connection failed: {}", e);
            eprintln!("Configure GOVAI_DATABASE_URL or DATABASE_URL to a reachable Postgres URL.");
            return Err(e);
        }
    };

    let auto_migrate = std::env::var("GOVAI_AUTO_MIGRATE")
        .ok()
        .map(|s| {
            matches!(
                s.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "on" | "yes"
            )
        })
        .unwrap_or(false);
    if auto_migrate {
        println!("startup: migrations=applying (GOVAI_AUTO_MIGRATE=true)");
        if let Err(e) = sqlx::migrate!("./migrations").run(&pool).await {
            eprintln!("DB migration failed: {}", e);
            return Err(format!("DB migration failed: {e}"));
        }
    } else if matches!(
        deployment_env,
        GovaiEnvironment::Staging | GovaiEnvironment::Prod
    ) {
        println!("startup: migrations=not auto-applied; verifying schema...");
    } else {
        println!("startup: migrations=not auto-applied (dev); GOVAI_AUTO_MIGRATE not enabled");
    }

    if let Err(e) =
        assert_staging_prod_operational_constraints(deployment_env, addr, auto_migrate, &pool).await
    {
        eprintln!("staging/prod startup validation failed: {e}");
        return Err(e);
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
        "startup: bind=http://{} environment={} policy_version={}",
        addr, deployment_env, policy_version
    );
    println!("startup: ledger_dir={ledger_display}");
    println!("startup: database=verified (pool connected)");
    if auto_migrate {
        println!("startup: migrations=complete (applied this boot)");
    } else if matches!(
        deployment_env,
        GovaiEnvironment::Staging | GovaiEnvironment::Prod
    ) {
        println!("startup: migrations=verified against _sqlx_migrations");
    }
    println!("startup: liveness=GET /health  readiness=GET /ready");

    println!("govai listening on http://{}", addr);

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

    #[test]
    fn staging_rejects_loopback_bind() {
        let addr = SocketAddr::from(([127, 0, 0, 1], 8088));
        let err = staging_prod_bind_must_be_reachable(GovaiEnvironment::Staging, addr).unwrap_err();
        assert!(err.contains("loopback"), "{err}");

        let ok = staging_prod_bind_must_be_reachable(
            GovaiEnvironment::Staging,
            SocketAddr::from(([0, 0, 0, 0], 8088)),
        );
        assert!(ok.is_ok());
    }

    #[test]
    fn dev_allows_loopback_bind() {
        let addr = SocketAddr::from(([127, 0, 0, 1], 8088));
        assert!(staging_prod_bind_must_be_reachable(GovaiEnvironment::Dev, addr).is_ok());
    }
}
