//! Stripe webhook receiver: signature verification + idempotent event log + tenant billing side effects.

use crate::db::DbPool;
use crate::stripe_billing;
use axum::http::StatusCode;
use base64::Engine;
use chrono::Utc;
use hmac::{Hmac, Mac};
use serde_json::Value;
use sha2::Sha256;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

const SUPPORTED_TYPES: &[&str] = &[
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
];

fn webhook_signing_key_bytes(secret: &str) -> Result<Vec<u8>, String> {
    let s = secret.trim();
    if s.is_empty() {
        return Err("empty webhook secret".into());
    }
    if let Some(b64) = s.strip_prefix("whsec_") {
        base64::engine::general_purpose::STANDARD
            .decode(b64.trim())
            .map_err(|e| format!("invalid whsec_ base64: {e}"))
    } else {
        Ok(s.as_bytes().to_vec())
    }
}

/// Stripe `Stripe-Signature` header: `t=...,v1=...` (possibly multiple v1).
pub fn verify_stripe_signature(payload: &[u8], stripe_signature: &str, secret: &str) -> Result<(), String> {
    let key = webhook_signing_key_bytes(secret)?;
    let mut ts: Option<i64> = None;
    let mut v1_sigs: Vec<&str> = Vec::new();
    for part in stripe_signature.split(',') {
        let part = part.trim();
        if let Some(rest) = part.strip_prefix("t=") {
            if let Ok(v) = rest.parse::<i64>() {
                ts = Some(v);
            }
        } else if let Some(rest) = part.strip_prefix("v1=") {
            v1_sigs.push(rest);
        }
    }
    let t = ts.ok_or_else(|| "missing t=".to_string())?;
    let now = Utc::now().timestamp();
    if (now - t).abs() > 300 {
        return Err("timestamp outside tolerance".to_string());
    }
    if v1_sigs.is_empty() {
        return Err("missing v1 signature".to_string());
    }
    let signed_payload = format!("{}.{t}", String::from_utf8_lossy(payload));
    let mut mac = HmacSha256::new_from_slice(&key).map_err(|e| e.to_string())?;
    mac.update(signed_payload.as_bytes());
    let expected: [u8; 32] = mac.finalize().into_bytes().into();
    let mut ok = false;
    for sig in v1_sigs {
        if let Ok(sig_bytes) = hex::decode(sig.trim()) {
            if sig_bytes.len() == expected.len()
                && sig_bytes.as_slice().ct_eq(expected.as_slice()).into()
            {
                ok = true;
                break;
            }
        }
    }
    if ok {
        Ok(())
    } else {
        Err("signature mismatch".to_string())
    }
}

fn event_id_and_type(body: &[u8]) -> Result<(String, String), String> {
    let v: Value = serde_json::from_slice(body).map_err(|e| e.to_string())?;
    let id = v
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing event id".to_string())?
        .to_string();
    let typ = v
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing event type".to_string())?
        .to_string();
    Ok((id, typ))
}

/// Insert webhook event; returns `true` if newly inserted, `false` if duplicate (idempotent).
pub async fn persist_webhook_event(
    pool: &DbPool,
    stripe_event_id: &str,
    event_type: &str,
) -> Result<bool, sqlx::Error> {
    let res = sqlx::query(
        r#"
        insert into public.stripe_webhook_events (stripe_event_id, type, received_at, processed_at)
        values ($1, $2, now(), null)
        on conflict (stripe_event_id) do nothing
        "#,
    )
    .bind(stripe_event_id)
    .bind(event_type)
    .execute(pool)
    .await?;
    Ok(res.rows_affected() > 0)
}

async fn webhook_pending_processing(pool: &DbPool, stripe_event_id: &str) -> Result<bool, sqlx::Error> {
    let pending: Option<bool> = sqlx::query_scalar(
        r#"
        select processed_at is null
        from public.stripe_webhook_events
        where stripe_event_id = $1
        "#,
    )
    .bind(stripe_event_id)
    .fetch_optional(pool)
    .await?;
    Ok(pending.unwrap_or(false))
}

pub async fn mark_webhook_succeeded(pool: &DbPool, stripe_event_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        update public.stripe_webhook_events
        set processed_at = now(),
            last_error = null
        where stripe_event_id = $1
        "#,
    )
    .bind(stripe_event_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_webhook_failed(pool: &DbPool, stripe_event_id: &str, err: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        update public.stripe_webhook_events
        set last_error = $2
        where stripe_event_id = $1
          and processed_at is null
        "#,
    )
    .bind(stripe_event_id)
    .bind(err)
    .execute(pool)
    .await?;
    Ok(())
}

/// Documented minimal product surface; all verified Stripe events are still persisted.
pub fn type_is_recognized(typ: &str) -> bool {
    SUPPORTED_TYPES.contains(&typ)
}

/// Full handler: verify, parse, store, process (idempotent + safe retry when `processed_at` still null).
pub async fn handle_stripe_webhook(
    pool: &DbPool,
    body: &[u8],
    stripe_signature: Option<&str>,
) -> (StatusCode, serde_json::Value) {
    let secret = match std::env::var("GOVAI_STRIPE_WEBHOOK_SECRET") {
        Ok(s) => s,
        Err(_) => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                serde_json::json!({
                    "ok": false,
                    "error": "GOVAI_STRIPE_WEBHOOK_SECRET not configured"
                }),
            );
        }
    };
    if secret.trim().is_empty() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            serde_json::json!({
                "ok": false,
                "error": "GOVAI_STRIPE_WEBHOOK_SECRET is empty"
            }),
        );
    }
    let sig_header = match stripe_signature {
        Some(s) if !s.trim().is_empty() => s.trim(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                serde_json::json!({ "ok": false, "error": "missing Stripe-Signature header" }),
            );
        }
    };
    if let Err(e) = verify_stripe_signature(body, sig_header, &secret) {
        return (
            StatusCode::UNAUTHORIZED,
            serde_json::json!({ "ok": false, "error": "invalid_signature", "detail": e }),
        );
    }
    let v: Value = match serde_json::from_slice(body) {
        Ok(x) => x,
        Err(e) => {
            return (
                StatusCode::OK,
                serde_json::json!({ "ok": false, "ignored": "malformed", "detail": e.to_string() }),
            );
        }
    };
    let (event_id, typ) = match event_id_and_type(body) {
        Ok(x) => x,
        Err(e) => {
            return (
                StatusCode::OK,
                serde_json::json!({ "ok": false, "ignored": "malformed", "detail": e }),
            );
        }
    };
    let recognized = type_is_recognized(&typ);

    let inserted = match persist_webhook_event(pool, &event_id, &typ).await {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                serde_json::json!({ "ok": false, "error": "database", "detail": e.to_string() }),
            );
        }
    };

    let should_process = if inserted {
        true
    } else {
        match webhook_pending_processing(pool, &event_id).await {
            Ok(p) => p,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    serde_json::json!({ "ok": false, "error": "database", "detail": e.to_string() }),
                );
            }
        }
    };

    if !should_process {
        return (
            StatusCode::OK,
            serde_json::json!({
                "ok": true,
                "duplicate": true,
                "event_id": event_id,
                "type": typ,
                "minimal_surface": recognized
            }),
        );
    }

    match stripe_billing::process_stripe_webhook(pool, &v).await {
        Ok(()) => {
            if let Err(e) = mark_webhook_succeeded(pool, &event_id).await {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    serde_json::json!({ "ok": false, "error": "database", "detail": e.to_string() }),
                );
            }
            (
                StatusCode::OK,
                serde_json::json!({
                    "ok": true,
                    "received": true,
                    "event_id": event_id,
                    "type": typ,
                    "minimal_surface": recognized
                }),
            )
        }
        Err(e) => {
            let _ = mark_webhook_failed(pool, &event_id, &e).await;
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                serde_json::json!({
                    "ok": false,
                    "error": "processing_failed",
                    "detail": e,
                    "event_id": event_id,
                    "type": typ
                }),
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn stripe_signature_round_trip() {
        let secret = "plain_test_secret";
        let body = br#"{"id":"evt_test_1","type":"invoice.paid"}"#;
        let t = Utc::now().timestamp();
        let signed_payload = format!("{}.{t}", String::from_utf8_lossy(body));
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("hmac key");
        mac.update(signed_payload.as_bytes());
        let sig = hex::encode(mac.finalize().into_bytes());
        let header = format!("t={t},v1={sig}");
        verify_stripe_signature(body, &header, secret).expect("signature verifies");
    }

    #[test]
    fn stripe_signature_rejects_tamper() {
        let secret = "plain_test_secret";
        let body = br#"{"id":"evt_test_1","type":"invoice.paid"}"#;
        let t = Utc::now().timestamp();
        let signed_payload = format!("{}.{t}", String::from_utf8_lossy(body));
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("hmac key");
        mac.update(signed_payload.as_bytes());
        let sig = hex::encode(mac.finalize().into_bytes());
        let header = format!("t={t},v1={sig}");
        let bad_body = br#"{"id":"evt_other","type":"invoice.paid"}"#;
        assert!(verify_stripe_signature(bad_body, &header, secret).is_err());
    }
}
