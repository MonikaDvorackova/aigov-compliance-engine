#!/usr/bin/env python3
"""
Compare Supabase ``runs`` vs GovAI ``console.runs`` for migration / canary validation.

Exits 0 only if all checks **PASS**; otherwise exits 1.

Required environment
---------------------
  ``SUPABASE_URL``, ``SUPABASE_SERVICE_ROLE_KEY`` — read source ``runs`` (service role avoids RLS gaps).
  ``GOVAI_DATABASE_URL`` or ``DATABASE_URL`` — target Postgres with ``console.runs`` (same URI as Node;
  query params unsupported by libpq/psycopg, e.g. ``statement_cache_capacity``, are stripped automatically).

Optional
--------
  ``PARITY_LAST_N`` — default ``50``; number of newest rows to compare (by ``created_at`` desc, ``id`` asc).

Assumptions
-----------
  * Supabase table ``runs`` with columns matching ``console.runs`` (see migration ``0004``).
  * Staging / canary sized datasets: this script loads **all** rows from both sides into memory.
    For very large tables, run against a snapshot or extend with sampling (not implemented here).

Dependencies
------------
  ``pip install supabase 'psycopg[binary]'``

Usage (repo root)
-----------------
  python3 scripts/console_runs_parity_check.py
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT / "python"))

from aigov_py.psycopg_database_url import resolve_psycopg_database_url

RUN_COLUMNS = (
    "id,created_at,mode,status,policy_version,"
    "bundle_sha256,evidence_sha256,report_sha256,evidence_source,closed_at"
)


def _parse_ts(v: Any) -> datetime | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.astimezone(timezone.utc) if v.tzinfo else v.replace(tzinfo=timezone.utc)
    s = str(v).strip()
    if not s:
        return None
    try:
        x = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if x.tzinfo is None:
            x = x.replace(tzinfo=timezone.utc)
        return x.astimezone(timezone.utc)
    except ValueError:
        return None


def _norm_hash(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def _fetch_supabase_runs(client: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    page = 500
    offset = 0
    while True:
        resp = (
            client.table("runs")
            .select(RUN_COLUMNS)
            .order("created_at", desc=False)
            .order("id", desc=False)
            .range(offset, offset + page - 1)
            .execute()
        )
        chunk = getattr(resp, "data", None) or []
        if not chunk:
            break
        for r in chunk:
            out.append(dict(r))
        if len(chunk) < page:
            break
        offset += page
    return out


def _fetch_console_runs(conn: Any) -> list[dict[str, Any]]:
    cols = RUN_COLUMNS
    with conn.cursor() as cur:
        cur.execute(f"select {cols} from console.runs")
        names = [d[0] for d in cur.description]
        return [dict(zip(names, row, strict=False)) for row in cur.fetchall()]


def _sort_key(r: dict[str, Any]) -> tuple:
    ts = _parse_ts(r.get("created_at"))
    ts_key = ts.timestamp() if ts else 0.0
    return (-ts_key, str(r.get("id") or ""))


def _row_sig(r: dict[str, Any]) -> tuple:
    return (
        str(r.get("id") or ""),
        _norm_hash(r.get("bundle_sha256")),
        _norm_hash(r.get("evidence_sha256")),
        _norm_hash(r.get("report_sha256")),
        _norm_hash(r.get("policy_version")),
        _norm_hash(r.get("status")),
        _norm_hash(r.get("mode")),
        _norm_hash(r.get("evidence_source")),
    )


def main() -> int:
    supabase_url = (os.environ.get("SUPABASE_URL") or "").strip()
    supabase_key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not supabase_url or not supabase_key:
        print("FAIL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.")
        return 1

    try:
        db_url = resolve_psycopg_database_url()
    except RuntimeError as e:
        print(f"FAIL: {e}")
        return 1

    try:
        import psycopg
        from supabase import create_client
    except ImportError as e:
        print(f"FAIL: missing dependency ({e}). pip install supabase 'psycopg[binary]'")
        return 1

    last_n = int(os.environ.get("PARITY_LAST_N", "50") or "50")
    last_n = max(1, min(last_n, 500))

    sb = create_client(supabase_url, supabase_key)
    src_rows = _fetch_supabase_runs(sb)
    src_by_id = {str(r["id"]): r for r in src_rows if r.get("id") is not None}

    with psycopg.connect(db_url) as conn:
        tgt_rows = _fetch_console_runs(conn)
    tgt_by_id = {str(r["id"]): r for r in tgt_rows if r.get("id") is not None}

    checks: list[tuple[str, bool, str]] = []

    src_count = len(src_by_id)
    tgt_count = len(tgt_by_id)
    count_ok = src_count == tgt_count
    checks.append(("row_count", count_ok, f"source={src_count} target={tgt_count}"))

    missing = sorted(set(src_by_id) - set(tgt_by_id))
    miss_ok = len(missing) == 0
    checks.append(
        ("missing_ids_in_target", miss_ok, f"missing={len(missing)} sample={missing[:5]}"),
    )

    hash_mismatch: list[str] = []
    for sid in sorted(set(src_by_id) & set(tgt_by_id)):
        srow, trow = src_by_id[sid], tgt_by_id[sid]
        if (
            _norm_hash(srow.get("bundle_sha256")) != _norm_hash(trow.get("bundle_sha256"))
            or _norm_hash(srow.get("evidence_sha256")) != _norm_hash(trow.get("evidence_sha256"))
            or _norm_hash(srow.get("report_sha256")) != _norm_hash(trow.get("report_sha256"))
        ):
            hash_mismatch.append(sid)
    hash_ok = len(hash_mismatch) == 0
    checks.append(
        ("hash_triplet_mismatch", hash_ok, f"mismatch={len(hash_mismatch)} sample={hash_mismatch[:5]}"),
    )

    src_max = max((_parse_ts(r.get("created_at")) for r in src_by_id.values()), default=None)
    tgt_max = max((_parse_ts(r.get("created_at")) for r in tgt_by_id.values()), default=None)
    max_ok = src_max == tgt_max or (
        src_max is not None
        and tgt_max is not None
        and abs((src_max - tgt_max).total_seconds()) <= 1
    )
    checks.append(
        ("latest_created_at", max_ok, f"source_max={src_max} target_max={tgt_max}"),
    )

    src_sorted = sorted(src_by_id.values(), key=_sort_key)
    tgt_sorted = sorted(tgt_by_id.values(), key=_sort_key)
    src_last_sigs = [_row_sig(r) for r in src_sorted[:last_n]]
    tgt_last_sigs = [_row_sig(r) for r in tgt_sorted[:last_n]]
    last_ok = src_last_sigs == tgt_last_sigs
    checks.append(
        (
            f"last_{last_n}_runs_order_and_core_fields",
            last_ok,
            "tuple (id,bundle,evidence,report,policy,status,mode,evidence_source) after sort -created_at, id",
        ),
    )

    print("=== console.runs parity check ===\n")
    all_pass = True
    for name, ok, detail in checks:
        status = "PASS" if ok else "FAIL"
        if not ok:
            all_pass = False
        print(f"[{status}] {name}: {detail}")

    print()
    if all_pass:
        print("SUMMARY: PASS (all checks green)")
        return 0
    print("SUMMARY: FAIL (see FAIL lines above)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
