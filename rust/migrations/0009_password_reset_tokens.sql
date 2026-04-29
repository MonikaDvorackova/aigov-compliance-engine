-- One-time password reset tokens for email/password accounts (Supabase Auth).
-- Raw tokens are never stored; only SHA-256 hex hashes.

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Supabase-only: attach FK to auth.users when it exists.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  ) then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'password_reset_tokens_user_id_fkey'
        and conrelid = 'public.password_reset_tokens'::regclass
    ) then
      execute 'alter table public.password_reset_tokens
        add constraint password_reset_tokens_user_id_fkey
        foreign key (user_id) references auth.users(id) on delete cascade';
    end if;
  end if;
end $$;

create unique index if not exists password_reset_tokens_token_hash_uq
  on public.password_reset_tokens (token_hash);

create index if not exists password_reset_tokens_user_id_idx
  on public.password_reset_tokens (user_id);

create index if not exists password_reset_tokens_expires_at_idx
  on public.password_reset_tokens (expires_at);

comment on table public.password_reset_tokens is 'Hashed one-time tokens for custom password reset flow; do not store plaintext tokens.';
