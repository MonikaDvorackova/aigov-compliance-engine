use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EvidenceEvent {
  pub event_id: String,
  pub event_type: String,
  pub ts_utc: String,
  pub actor: String,
  pub system: String,
  pub run_id: String,
  pub payload: serde_json::Value,
}
