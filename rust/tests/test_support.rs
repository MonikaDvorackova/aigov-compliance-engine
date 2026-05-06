use std::sync::OnceLock;

/// Integration tests run concurrently, but env vars + current dir are process-global.
/// Use one global async lock for any test that mutates env/CWD.
pub async fn env_lock() -> tokio::sync::MutexGuard<'static, ()> {
    static LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| tokio::sync::Mutex::new(())).lock().await
}

