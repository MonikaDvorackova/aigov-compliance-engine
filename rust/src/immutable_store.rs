use serde::{Deserialize, Serialize};

use crate::govai_environment::GovaiEnvironment;

#[cfg(feature = "immutable-s3")]
use aws_sdk_s3::primitives::ByteStream;
#[cfg(feature = "immutable-s3")]
use aws_sdk_s3::types::{ObjectLockLegalHoldStatus, ObjectLockMode};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImmutableBackendKind {
    Disabled,
    AwsS3ObjectLock,
}

#[derive(Debug, Clone)]
pub struct ImmutableStoreConfig {
    pub kind: ImmutableBackendKind,
    pub s3_bucket: Option<String>,
    pub s3_prefix: String,
    pub s3_region: Option<String>,
    pub retention_days: u32,
    pub object_lock_mode: String,
    pub require_in_staging_prod: bool,
}

impl ImmutableStoreConfig {
    pub fn from_env() -> Result<Self, String> {
        let kind = std::env::var("GOVAI_IMMUTABLE_BACKEND")
            .ok()
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();

        let kind = match kind.as_str() {
            "" | "off" | "disabled" => ImmutableBackendKind::Disabled,
            "aws_s3_object_lock" | "s3_object_lock" | "aws_s3" => {
                ImmutableBackendKind::AwsS3ObjectLock
            }
            other => return Err(format!("invalid GOVAI_IMMUTABLE_BACKEND={other:?}")),
        };

        let s3_bucket = std::env::var("GOVAI_S3_OBJECT_LOCK_BUCKET")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let s3_prefix = std::env::var("GOVAI_S3_OBJECT_LOCK_PREFIX")
            .ok()
            .unwrap_or_else(|| "govai/anchors".to_string());
        let s3_prefix = s3_prefix.trim().trim_matches('/').to_string();

        let s3_region = std::env::var("AWS_REGION")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                std::env::var("GOVAI_S3_OBJECT_LOCK_REGION")
                    .ok()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
            });

        let retention_days = std::env::var("GOVAI_S3_OBJECT_LOCK_RETENTION_DAYS")
            .ok()
            .and_then(|s| s.trim().parse::<u32>().ok())
            .unwrap_or(365);

        let object_lock_mode = std::env::var("GOVAI_S3_OBJECT_LOCK_MODE")
            .ok()
            .unwrap_or_else(|| "COMPLIANCE".to_string())
            .trim()
            .to_string();

        let require_in_staging_prod = std::env::var("GOVAI_IMMUTABLE_REQUIRED")
            .ok()
            .map(|s| matches!(s.trim().to_ascii_lowercase().as_str(), "1" | "true" | "on" | "yes"))
            .unwrap_or(false);

        Ok(Self {
            kind,
            s3_bucket,
            s3_prefix,
            s3_region,
            retention_days,
            object_lock_mode,
            require_in_staging_prod,
        })
    }

    pub fn validate_startup(&self, env: GovaiEnvironment) -> Result<(), String> {
        let must = self.require_in_staging_prod
            && matches!(env, GovaiEnvironment::Staging | GovaiEnvironment::Prod);
        match self.kind {
            ImmutableBackendKind::Disabled => {
                if must {
                    return Err("Invalid immutable audit configuration: refusing to start — GOVAI_IMMUTABLE_BACKEND must be set in staging/prod when GOVAI_IMMUTABLE_REQUIRED=true".to_string());
                }
                Ok(())
            }
            ImmutableBackendKind::AwsS3ObjectLock => {
                #[cfg(not(feature = "immutable-s3"))]
                {
                    let _ = env;
                    Err(
                        "Invalid immutable audit configuration: refusing to start — immutable S3 backend requires the immutable-s3 feature"
                            .to_string(),
                    )
                }

                #[cfg(feature = "immutable-s3")]
                {
                    let bucket = self
                        .s3_bucket
                        .as_deref()
                        .unwrap_or("")
                        .trim();
                    if bucket.is_empty() {
                        return Err("Invalid immutable audit configuration: refusing to start — GOVAI_S3_OBJECT_LOCK_BUCKET required when GOVAI_IMMUTABLE_BACKEND=aws_s3_object_lock".to_string());
                    }
                    if self.retention_days == 0 {
                        return Err("Invalid immutable audit configuration: refusing to start — retention_days must be > 0".to_string());
                    }
                    let mode = self.object_lock_mode.trim().to_ascii_uppercase();
                    if mode != "COMPLIANCE" && mode != "GOVERNANCE" {
                        return Err("Invalid immutable audit configuration: refusing to start — GOVAI_S3_OBJECT_LOCK_MODE must be COMPLIANCE or GOVERNANCE".to_string());
                    }
                    Ok(())
                }
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct ImmutableStore {
    cfg: ImmutableStoreConfig,
    #[cfg(feature = "immutable-s3")]
    s3: Option<aws_sdk_s3::Client>,
}

impl ImmutableStore {
    pub async fn init(cfg: ImmutableStoreConfig) -> Result<Self, String> {
        match cfg.kind {
            ImmutableBackendKind::Disabled => Ok(Self {
                cfg,
                #[cfg(feature = "immutable-s3")]
                s3: None,
            }),
            ImmutableBackendKind::AwsS3ObjectLock => {
                #[cfg(not(feature = "immutable-s3"))]
                {
                    let _ = cfg;
                    return Err(
                        "immutable S3 backend requires the immutable-s3 feature".to_string(),
                    );
                }

                #[cfg(feature = "immutable-s3")]
                {
                    let shared =
                        aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
                    let s3 = aws_sdk_s3::Client::new(&shared);
                    Ok(Self { cfg, s3: Some(s3) })
                }
            }
        }
    }

    pub fn enabled(&self) -> bool {
        !matches!(self.cfg.kind, ImmutableBackendKind::Disabled)
    }

    pub fn cfg(&self) -> &ImmutableStoreConfig {
        &self.cfg
    }

    pub fn anchor_key(&self, tenant_id: &str, anchor_id: &str) -> String {
        let t = tenant_id.trim();
        let a = anchor_id.trim();
        format!("{}/{}/{}.json", self.cfg.s3_prefix, t, a)
    }

    pub async fn put_anchor_object_locked(
        &self,
        tenant_id: &str,
        anchor_id: &str,
        bytes: Vec<u8>,
    ) -> Result<(), String> {
        match self.cfg.kind {
            ImmutableBackendKind::Disabled => Ok(()),
            ImmutableBackendKind::AwsS3ObjectLock => {
                #[cfg(not(feature = "immutable-s3"))]
                {
                    let _ = (tenant_id, anchor_id, bytes);
                    return Err(
                        "immutable S3 backend requires the immutable-s3 feature".to_string(),
                    );
                }

                #[cfg(feature = "immutable-s3")]
                {
                let s3 = self.s3.as_ref().ok_or_else(|| "s3 client missing".to_string())?;
                let bucket = self.cfg.s3_bucket.as_ref().ok_or_else(|| "bucket missing".to_string())?;
                let key = self.anchor_key(tenant_id, anchor_id);

                let retain_until = chrono::Utc::now()
                    .checked_add_signed(chrono::Duration::days(self.cfg.retention_days as i64))
                    .ok_or_else(|| "retention overflow".to_string())?;
                let retain_until = aws_sdk_s3::primitives::DateTime::from_secs(
                    retain_until.timestamp(),
                );

                let mode = match self.cfg.object_lock_mode.trim().to_ascii_uppercase().as_str() {
                    "COMPLIANCE" => ObjectLockMode::Compliance,
                    "GOVERNANCE" => ObjectLockMode::Governance,
                    _ => return Err("invalid object lock mode".to_string()),
                };

                s3.put_object()
                    .bucket(bucket)
                    .key(key)
                    .body(ByteStream::from(bytes))
                    .object_lock_mode(mode)
                    .object_lock_retain_until_date(retain_until)
                    .object_lock_legal_hold_status(ObjectLockLegalHoldStatus::Off)
                    .content_type("application/json")
                    .send()
                    .await
                    .map_err(|e| format!("s3 put_object failed: {e}"))?;
                Ok(())
                }
            }
        }
    }

    pub async fn get_anchor_bytes(
        &self,
        tenant_id: &str,
        anchor_id: &str,
    ) -> Result<Option<Vec<u8>>, String> {
        match self.cfg.kind {
            ImmutableBackendKind::Disabled => Ok(None),
            ImmutableBackendKind::AwsS3ObjectLock => {
                #[cfg(not(feature = "immutable-s3"))]
                {
                    let _ = (tenant_id, anchor_id);
                    return Err(
                        "immutable S3 backend requires the immutable-s3 feature".to_string(),
                    );
                }

                #[cfg(feature = "immutable-s3")]
                {
                let s3 = self.s3.as_ref().ok_or_else(|| "s3 client missing".to_string())?;
                let bucket = self.cfg.s3_bucket.as_ref().ok_or_else(|| "bucket missing".to_string())?;
                let key = self.anchor_key(tenant_id, anchor_id);

                let res = s3.get_object().bucket(bucket).key(key).send().await;
                match res {
                    Ok(out) => {
                        let data = out
                            .body
                            .collect()
                            .await
                            .map_err(|e| format!("s3 body read failed: {e}"))?
                            .into_bytes()
                            .to_vec();
                        Ok(Some(data))
                    }
                    Err(err) => {
                        // Deterministic: treat not-found as None; others are hard errors.
                        let is_no_such_key = err.to_string().contains("NoSuchKey")
                            || err.to_string().contains("NotFound");
                        if is_no_such_key {
                            Ok(None)
                        } else {
                            Err(format!("s3 get_object failed: {err}"))
                        }
                    }
                }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn immutable_config_validation_rejects_missing_bucket_when_enabled() {
        let cfg = ImmutableStoreConfig {
            kind: ImmutableBackendKind::AwsS3ObjectLock,
            s3_bucket: None,
            s3_prefix: "p".to_string(),
            s3_region: None,
            retention_days: 365,
            object_lock_mode: "COMPLIANCE".to_string(),
            require_in_staging_prod: true,
        };
        let err = cfg
            .validate_startup(GovaiEnvironment::Prod)
            .expect_err("must error");
        // When the feature is disabled, we must fail-closed with a feature error
        // before we can validate AWS-specific bucket fields.
        #[cfg(not(feature = "immutable-s3"))]
        assert!(err.contains("immutable-s3"), "{err}");
        #[cfg(feature = "immutable-s3")]
        assert!(err.contains("GOVAI_S3_OBJECT_LOCK_BUCKET"), "{err}");
    }

    #[test]
    fn immutable_disabled_validates_without_aws() {
        let cfg = ImmutableStoreConfig {
            kind: ImmutableBackendKind::Disabled,
            s3_bucket: None,
            s3_prefix: "p".to_string(),
            s3_region: None,
            retention_days: 365,
            object_lock_mode: "COMPLIANCE".to_string(),
            require_in_staging_prod: false,
        };
        assert!(cfg.validate_startup(GovaiEnvironment::Dev).is_ok());
    }
}

