-- Counters for GOVAI API key usage (POST /evidence, GET /compliance-summary only).
-- Rows keyed by sha256 hex of the raw bearer token (not the secret itself).
create table if not exists public.govai_api_key_usage (
  key_hash text not null primary key,
  request_count bigint not null default 0
);
