## Summary
This change set implements **minimal P0 tenant/team access control** required for external pilot users.
The dashboard previously authenticated users but did not prove **team ownership** before listing runs,
fetching run detail, downloading artifacts, or minting signed URLs.

## Access model
- **Canonical ownership mapping**: `public.govai_run_meters(run_id → team_id)` is treated as the source of truth for which team owns a run.
- **Membership check**: a user is authorized if they have a row in `public.team_members` for the owning `team_id`.
- **Runs data source**: dashboard reads from `public.runs` (a view over `console.runs` joined to `govai_run_meters` to expose `team_id`).

## RLS coverage
RLS is enabled and policies are added for:
- `public.team_members` (select own memberships)
- `public.govai_run_meters` (select mappings for teams the caller belongs to)
- `console.runs` (select runs only if mapped to a team the caller belongs to)
- `storage.objects` (select objects in buckets `packs`, `audit`, `evidence` only if object name run id belongs to caller’s team)

Migration: `rust/migrations/0011_supabase_tenant_access_control.sql`.

## API authorization
All artifact and run routes perform server-side authorization **before** returning data:
- `/api/runs` filters to the caller’s `team_id`s
- `/api/runs/[id]` verifies membership and returns:
  - 404 if run has no mapping
  - 403 if run exists but caller is not a team member
- `/api/storage/signed-urls` authorizes before minting signed URLs
- `/api/bundle/[id]`, `/api/raw/evidence/[id]`, `/api/raw/audit/[id]` authorize before reading local files or Storage

Shared helper: `dashboard/lib/console/runAccess.server.ts`.

## Storage authorization
Buckets used by the dashboard:
- `packs` (zip bundles)
- `audit` (audit JSON)
- `evidence` (evidence JSON)

RLS policy on `storage.objects` restricts reads to objects whose `{run_id}` prefix maps (via `govai_run_meters`) to a team the user belongs to.

## Evaluation gate
No changes to evaluation logic; only access control changes.

## Human approval gate
No changes to approval logic; only access control changes.

## Tests
Vitest tests prove cross-tenant denial for the affected routes by asserting 403 and ensuring Storage calls are not reached:
- `dashboard/lib/console/tenantAccessRoutes.test.ts`

## Remaining risks
- This repo does not include run ingest/backfill logic for `govai_run_meters`. If a run is missing a mapping row, it becomes **inaccessible** (404) to all dashboard users.
- Write policies are intentionally not expanded in this minimal change set; server-side writers should continue using privileged credentials where needed.

