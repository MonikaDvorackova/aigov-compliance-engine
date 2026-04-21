mod audit_store;
mod bundle;
mod policy;
mod schema;
mod verify_chain;

mod projection;

mod audit_api_key;
mod auth;
mod db;
mod govai_api;
mod rbac;

use axum::Router;
use std::net::SocketAddr;

const LOG_PATH: &str = "audit_log.jsonl";
const POLICY_VERSION: &str = "v0.4_human_approval";

fn bind_addr_from_env() -> SocketAddr {
    let s = std::env::var("AIGOV_BIND").unwrap_or_else(|_| "127.0.0.1:8088".to_string());
    s.parse().unwrap_or_else(|_| SocketAddr::from(([127, 0, 0, 1], 8088)))
}

#[tokio::main]
async fn main() {
    let addr = bind_addr_from_env();

    let pool = match db::init_pool_from_env().await {
        Ok(p) => p,
        Err(e) => {
            eprintln!("DB init failed: {}", e);
            eprintln!("Set DATABASE_URL env var to a Postgres connection string");
            std::process::exit(1);
        }
    };

    let app: Router = Router::new()
        .merge(govai_api::core_router(POLICY_VERSION))
        .merge(govai_api::audit_router(LOG_PATH, POLICY_VERSION))
        .merge(govai_api::assessments_router(pool.clone()))
        .merge(govai_api::compliance_workflow_router(pool));

    println!("govai listening on http://{}", addr);

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Bind failed on {}: {}", addr, e);
            std::process::exit(1);
        }
    };

    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("Server error: {}", e);
        std::process::exit(1);
    }
}
