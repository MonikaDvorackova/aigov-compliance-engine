#!/usr/bin/env python3
"""
Backfill Supabase ``public.runs`` (or equivalent exposed table) into GovAI ``console.runs``.

Idempotent: uses ``INSERT ... ON CONFLICT (id) DO UPDATE`` (same as ``aigov_py.govai_postgres_runs``).

Required environment
---------------------
**Source (Supabase PostgREST)**
  ``SUPABASE_URL`` — project URL (same as other tooling).
  ``SUPABASE_SERVICE_ROLE_KEY`` — **service role** so all rows are visible regardless of RLS.
    Do not use anon keys for production backfill.

**Target (GovAI Postgres)**
  ``GOVAI_DATABASE_URL`` — preferred; else ``DATABASE_URL`` must point at the database where
  migration ``0004_console_runs.sql`` has been applied (schema ``console``, table ``console.runs``).
  Use the same URI as Node; ``aigov_py.psycopg_database_url`` strips query keys that ``psycopg``/libpq
  reject (e.g. ``statement_cache_capacity``) while keeping ``sslmode`` and other standard options.

Optional
--------
  ``BACKFILL_PAGE_SIZE`` — default ``500`` (rows per Supabase page).
  ``BACKFILL_DRY_RUN`` — if ``1``/``true``/``yes``, only print pages and counts; no writes.

Assumptions
-----------
  * Supabase exposes a table named ``runs`` with at least the columns listed in ``RUN_COLUMNS``.
  * Column names and types are compatible with ``console.runs`` (timestamps ISO strings from API are fine).
  * Network can reach both Supabase HTTPS and Postgres.

Dependencies
------------
  ``pip install supabase 'psycopg[binary]'`` (or install package ``aigov-py[runs-postgres]`` and ``supabase``).

Usage (repo root)
-----------------
  python3 scripts/console_runs_backfill.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT / "python"))

RUN_COLUMNS = (
    "id,created_at,mode,status,policy_version,"
    "bundle_sha256,evidence_sha256,report_sha256,evidence_source,closed_at"
)


def _truthy(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "y", "on")


def _normalize_row(row: dict) -> dict:
    """Ensure keys match ``upsert_run_row_postgres`` expectations; drop extras."""
    out = {}
    for k in (
        "id",
        "created_at",
        "mode",
        "status",
        "policy_version",
        "bundle_sha256",
        "evidence_sha256",
        "report_sha256",
        "evidence_source",
        "closed_at",
    ):
        v = row.get(k)
        out[k] = v if v is not None else None
    return out


def main() -> int:
    dry = _truthy("BACKFILL_DRY_RUN")
    page_size = int(os.environ.get("BACKFILL_PAGE_SIZE", "500") or "500")
    page_size = max(1, min(page_size, 2000))

    supabase_url = (os.environ.get("SUPABASE_URL") or "").strip()
    supabase_key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.", file=sys.stderr)
        return 2

    try:
        from supabase import create_client
    except ImportError:
        print("ERROR: Install supabase: pip install supabase", file=sys.stderr)
        return 2

    try:
        from aigov_py.govai_postgres_runs import upsert_run_row_postgres
    except ImportError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    client = create_client(supabase_url, supabase_key)

    offset = 0
    total = 0
    while True:
        q = (
            client.table("runs")
            .select(RUN_COLUMNS)
            .order("created_at", desc=False)
            .order("id", desc=False)
            .range(offset, offset + page_size - 1)
        )
        resp = q.execute()
        rows = getattr(resp, "data", None) or []
        if not rows:
            break
        for raw in rows:
            row = _normalize_row(raw if isinstance(raw, dict) else dict(raw))
            if dry:
                pass
            else:
                upsert_run_row_postgres(row)
            total += 1
        print(f"backfill: processed offset={offset} batch={len(rows)} cumulative_rows={total} dry_run={dry}")
        if len(rows) < page_size:
            break
        offset += page_size

    print(f"OK: backfill finished; rows_touched={total} dry_run={dry}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
