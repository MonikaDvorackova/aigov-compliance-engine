# Enterprise layer (optional product)

This document describes **what is implemented today** for Postgres-backed identity, team scope, product RBAC, and compliance workflow. It is **not** part of the frozen core ledger contract ([OPEN_SOURCE_SCOPE.md](OPEN_SOURCE_SCOPE.md), [docs/strong-core-contract-note.md](docs/strong-core-contract-note.md)).

**Scope:** “Optional” means **not guaranteed as OSS core** and **orthogonal to ledger semantics**—not that the running server can omit Postgres in v0.1 (see [Boundaries vs frozen core](#boundaries-vs-frozen-core)).

Contents: [Tenant model](#tenant-model-teams) · [RBAC](#rbac-model) · [Workflow](#workflow-model) · [Boundaries](#boundaries-vs-frozen-core)

## Tenant model (teams)

- **Isolation unit** is a **`teams`** row (`public.teams`: `id`, `name`). The codebase uses “team” naming; there is no separate `tenant` table.
- **Membership** is **`team_members`**: `(team_id, user_id)` with a **`role`** string (`rust/migrations/0001_govai_core.sql`). Users are identified from the **Supabase JWT** (`rust/src/auth.rs`); team data lives in Postgres.
- **Active team** for API calls: optional header **`x-govai-team-id`**. If present, it must be a UUID and the user must be a member; otherwise **403** (`NOT_TEAM_MEMBER`). If absent, the server uses **`get_default_team_for_user`**, or **`bootstrap_team_for_user`** when the user has no team (`rust/src/govai_api.rs`).
- **Assessments** and **compliance workflow** rows are keyed by **`team_id`** (FK to `teams`).

## RBAC model

- **Source of truth** for product permissions is **`team_members.role`** in the database. **`rust/src/rbac.rs`** maps string roles to **`ProductRole`** and derives **`ProductPermissions`** (`review_queue_view`, `artifact_view`, `decision_submit`, `promotion_action`, `admin_override`). Unknown roles resolve to the most restrictive mapping (**Viewer**).
- **`GET /api/me`** returns the authenticated user plus each team with **`effective_role`**, raw **`role`**, and computed **`permissions`** (same module).
- **Route checks** (e.g. assessments, compliance workflow) use those permission flags—e.g. **`decision_submit`** for registering/reviewing workflow, **`promotion_action`** for promotion transitions, **`review_queue_view`** for listing/reading workflow. **`Viewer`** (and unknown DB roles mapped to Viewer) can list/read the queue where allowed but **cannot** submit decisions or promotions (`rust/src/rbac.rs`). This layer does **not** implement evidence **`policy.rs`** rules; it only gates product APIs.

## Workflow model

- **Table** `public.compliance_workflow` (`rust/migrations/0003_compliance_workflow.sql`): one row per **`(team_id, run_id)`**, with **`state`**, audit columns (`created_by`, `updated_by`, timestamps).
- **States**: `pending_review`, `approved`, `rejected`, `promotion_allowed`, `promotion_blocked`.
- **Transitions** (enforced in SQL `WHERE` clauses in `rust/src/db.rs`): `pending_review` → `approved` | `rejected` (review); `approved` → `promotion_allowed` | `promotion_blocked` (promotion). If the row is missing or not in the expected state, the update matches nothing; HTTP handlers respond with **409** `INVALID_STATE` (see `post_review_decision` / `post_promotion_decision` in `rust/src/govai_api.rs`).
- **Purpose:** app-layer queue and human decision tracking **only**. It does **not** append to **`audit_log.jsonl`**, change **`policy.rs`**, or substitute for **`POST /evidence`**. Emitting evidence events remains a **separate** step (e.g. Python/Makefile or any client).

## Boundaries vs frozen core

| Frozen core | Enterprise layer |
|-------------|------------------|
| Hash-chained **`audit_log.jsonl`**, **`POST /evidence`**, **`policy.rs`** | JWT-gated **`/api/*`** (team scope + RBAC checks) |
| Bundle / verify / **`/compliance-summary`** from ledger | **`teams`**, **`team_members`**, **`assessments`**, **`compliance_workflow`** rows |
| Canonical schemas in contract note | Product permissions derived from **`team_members.role`** (`rust/src/rbac.rs`) |

**v0.1 binary:** `main.rs` always opens a Postgres pool (**`DATABASE_URL`** required to start). Core HTTP routes do not use JWT or team/workflow logic; **`/api/*`** does. Schema for teams/assessments/workflow is in migrations **`0001_*`**–**`0003_*`**.

Reusing **contract-level** core only: integrate with ledger routes only; do not rely on **`/api/*`** semantics. Reusing **enterprise** features: set **`DATABASE_URL`** and Supabase env for JWT; team/RBAC/workflow behavior may drift from core policy versioning without a coordinated release story—that is by design for this layer.
