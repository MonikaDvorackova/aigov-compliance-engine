use crate::audit_api_key;
use crate::govai_environment::GovaiEnvironment;
use governor::clock::Clock;
use governor::clock::DefaultClock;
use governor::state::keyed::DefaultKeyedStateStore;
use governor::{Quota, RateLimiter};
use once_cell::sync::Lazy;
use std::num::NonZeroU32;

static LIMITER: Lazy<RateLimiter<String, DefaultKeyedStateStore<String>, DefaultClock>> =
    Lazy::new(|| {
        // Defaults: modest but non-trivial. Operators can set explicit values.
        let rps = std::env::var("GOVAI_RATE_LIMIT_RPS")
            .ok()
            .and_then(|s| s.trim().parse::<u32>().ok())
            .unwrap_or(20);
        let burst = std::env::var("GOVAI_RATE_LIMIT_BURST")
            .ok()
            .and_then(|s| s.trim().parse::<u32>().ok())
            .unwrap_or(40);

        let rps = NonZeroU32::new(rps.max(1)).unwrap();
        let burst = NonZeroU32::new(burst.max(1)).unwrap();

        let quota = Quota::per_second(rps).allow_burst(burst);
        RateLimiter::keyed(quota)
    });

pub fn rate_limiting_enabled(env: GovaiEnvironment) -> bool {
    // Enable by default in staging/prod; optional in dev.
    match env {
        GovaiEnvironment::Dev => std::env::var("GOVAI_RATE_LIMIT").ok().is_some_and(|v| {
            matches!(v.trim().to_ascii_lowercase().as_str(), "1" | "true" | "on" | "yes")
        }),
        GovaiEnvironment::Staging | GovaiEnvironment::Prod => true,
    }
}

/// Returns Ok(()) when request is allowed; Err(reason) when rejected.
///
/// Fail-closed semantics:
/// - if the request cannot be associated to a stable key in staging/prod, it is rejected.
pub fn check_request_allowed(
    headers: &axum::http::HeaderMap,
    env: GovaiEnvironment,
) -> Result<(), String> {
    if !rate_limiting_enabled(env) {
        return Ok(());
    }

    // Use API-key-derived tenant id when possible (stable, prevents bypass).
    let key = match audit_api_key::require_tenant_id_from_api_key_for_ledger(headers, env) {
        Ok(tid) => tid,
        Err(e) => {
            return Err(format!(
                "rate_limit: missing tenant context for rate limiting: {e}"
            ));
        }
    };

    match LIMITER.check_key(&key) {
        Ok(_) => Ok(()),
        Err(n) => {
            let wait = n
                .wait_time_from(DefaultClock::default().now());
            Err(format!(
                "rate_limited: key={} retry_after_ms={}",
                key,
                wait.as_millis()
            ))
        }
    }
}

