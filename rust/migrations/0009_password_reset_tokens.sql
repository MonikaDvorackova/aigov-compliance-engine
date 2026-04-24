-- One-time password reset tokens for email/password accounts (Supabase Auth).
-- Raw tokens are never stored; only SHA-256 hex hashes.

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists password_reset_tokens_token_hash_uq
  on public.password_reset_tokens (token_hash);

create index if not exists password_reset_tokens_user_id_idx
  on public.password_reset_tokens (user_id);

create index if not exists password_reset_tokens_expires_at_idx
  on public.password_reset_tokens (expires_at);

comment on table public.password_reset_tokens is 'Hashed one-time tokens for custom password reset flow; do not store plaintext tokens.';
