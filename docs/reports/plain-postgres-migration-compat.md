## Plain Postgres migration compatibility (Railway, etc.)

Problem: migration `0009_password_reset_tokens.sql` referenced `auth.users`, which exists on Supabase but not on plain Postgres providers (for example Railway). This caused fresh migrations to fail with:

- `schema "auth" does not exist`
- `relation "auth.users" does not exist`

Fix: keep `password_reset_tokens.user_id` as a required UUID column, and attach the foreign key to `auth.users(id)` **only if** that table exists. On Supabase, the FK (with `ON DELETE CASCADE`) is applied; on plain Postgres, the migration succeeds without creating any fake `auth.users` objects.

### Evaluation gate

Compliance evaluation semantics are unchanged. The evaluation gate is enforced by the audit ledger + projection endpoints (for example `POST /evidence` and `GET /compliance-summary`) and does not depend on Supabase Auth tables.

### Human approval gate

Human approval semantics are unchanged. Approval evidence is represented as ledger events (for example `human_approved`) and projected into the authoritative compliance decision; it does not require `auth.users`.

