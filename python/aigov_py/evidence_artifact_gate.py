from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, Mapping

from govai import GovAIAPIError, GovAIClient, GovAIHTTPError, submit_event


def canonicalize_evidence_event_dicts(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Mirrors Rust `canonicalize_evidence_events` for dict payloads (ordering + duplicate event_id)."""

    sorted_e = sorted(events, key=lambda e: str(e.get("ts_utc") or ""))
    seen: set[str] = set()
    out_rev: list[dict[str, Any]] = []
    for e in reversed(sorted_e):
        eid = str(e.get("event_id") or "")
        if eid and eid not in seen:
            seen.add(eid)
            out_rev.append(e)
    out_rev.reverse()
    out_rev.sort(
        key=lambda e: (
            str(e.get("ts_utc") or ""),
            str(e.get("event_type") or ""),
            str(e.get("event_id") or ""),
        ),
    )
    return out_rev


def event_for_submit(ev: Mapping[str, Any]) -> dict[str, Any]:
    """POST body matches CI-generated evidence; omit server-stamped `environment`."""

    body = dict(ev)
    body.pop("environment", None)
    return body



def _duplicate_ids_from_error_payload(payload: Mapping[str, Any]) -> tuple[str | None, str | None]:
    import re

    candidates: list[str] = []

    details = payload.get("details")
    if isinstance(details, dict):
        raw = details.get("raw")
        if isinstance(raw, str):
            candidates.append(raw)
        event_id = details.get("event_id")
        run_id = details.get("run_id")
        if isinstance(event_id, str) and isinstance(run_id, str):
            return event_id, run_id

    message = payload.get("message")
    if isinstance(message, str):
        candidates.append(message)

    for value in candidates:
        match = re.search(r"event_id=([^\s]+)\s+run_id=([^\s]+)", value)
        if match:
            return match.group(1), match.group(2)

    return None, None


def _is_idempotent_duplicate_409_for_body(error: GovAIHTTPError, body: Mapping[str, Any]) -> bool:
    if getattr(error, "status_code", None) != 409:
        return False

    payload = getattr(error, "payload", None)
    if not isinstance(payload, dict):
        return False

    code = payload.get("code")
    err = payload.get("error")
    if isinstance(err, dict):
        code = err.get("code") or code
        payload = err | {k: v for k, v in payload.items() if k != "error"}

    if code != "DUPLICATE_EVENT_ID":
        return False

    duplicate_event_id, duplicate_run_id = _duplicate_ids_from_error_payload(payload)
    return (
        duplicate_event_id == str(body.get("event_id") or "")
        and duplicate_run_id == str(body.get("run_id") or "")
    )


def submit_event_or_idempotent_duplicate(client: GovAIClient, body: dict[str, Any]) -> None:
    """
    POST /evidence for one event; treat DUPLICATE_EVENT_ID as success only when
    the conflict names the same event_id and run_id as this request body.
    """

    try:
        submit_event_or_idempotent_duplicate(client, body)
    except GovAIHTTPError as e:
        if _is_idempotent_duplicate_409_for_body(e, body):
            print(f"already submitted: {str(body.get('event_id') or '')}")
            return
        raise

def load_bundle(run_id: str, artifact_dir: Path) -> tuple[dict[str, Any], Path]:
    p = artifact_dir / f"{run_id}.json"
    if not p.is_file():
        raise FileNotFoundError(f"missing evidence bundle JSON: {p}")
    data = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise TypeError(f"expected object in {p}, got {type(data).__name__}")
    return data, p


def load_manifest(artifact_dir: Path) -> dict[str, Any]:
    p = artifact_dir / "evidence_digest_manifest.json"
    if not p.is_file():
        raise FileNotFoundError(f"missing digest manifest {p}")
    ob = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(ob, dict):
        raise TypeError("manifest must be a JSON object")
    return ob


def submit_evidence_bundle_events(
    client: GovAIClient,
    *,
    bundle: Mapping[str, Any],
    progress: Callable[[int, int, str], None] | None = None,
) -> None:
    evs = bundle.get("events")
    if not isinstance(evs, list):
        raise ValueError("bundle.events must be an array")

    decoded: list[dict[str, Any]] = []
    for i, e in enumerate(evs):
        if not isinstance(e, dict):
            raise TypeError(f"bundle.events[{i}] must be an object")
        decoded.append(dict(e))

    ordered = canonicalize_evidence_event_dicts(decoded)
    n = len(ordered)

    required = frozenset({"event_id", "event_type", "ts_utc", "actor", "system", "run_id", "payload"})
    for idx, raw in enumerate(ordered, start=1):
        missing = sorted(required.difference(raw.keys()))
        if missing:
            raise ValueError(f"event[{idx}] missing keys: {', '.join(missing)}")
        if not isinstance(raw.get("payload"), dict):
            raise TypeError(f"event[{idx}].payload must be an object")
        body = event_for_submit(raw)
        et = str(body.get("event_type") or "")
        if progress is not None:
            progress(idx, n, et)
        submit_event_or_idempotent_duplicate(client, body)


def bundle_hash_digest(client: GovAIClient, run_id: str) -> dict[str, Any]:
    raw = client.request_json(
        "GET",
        "/bundle-hash",
        params={"run_id": run_id},
        raise_on_body_ok_false=True,
    )
    if not isinstance(raw, dict):
        raise TypeError(f"/bundle-hash: expected dict, got {type(raw).__name__}")
    digest = raw.get("events_content_sha256")
    if not isinstance(digest, str) or len(digest.strip()) != 64:
        raise GovAIAPIError(
            "/bundle-hash missing events_content_sha256 (artifact-bound gate requires GovAI audit >= "
            + "this revision; refusal is intentional).",
            raw,
        )
    return raw


def fetch_export_evidence_hashes(client: GovAIClient, run_id: str) -> tuple[dict[str, Any] | None, str | None]:
    """GET /api/export/:run_id → evidence_hashes. Returns (dict, None) or (None, skip_reason)."""

    try:
        raw = client.request_json(
            "GET",
            f"/api/export/{run_id}",
            raise_on_body_ok_false=True,
        )
    except Exception:
        return None, "export not available"
    if not isinstance(raw, dict):
        return None, "export response was not a JSON object"
    eh = raw.get("evidence_hashes")
    if not isinstance(eh, dict):
        return None, "export response missing evidence_hashes"
    return eh, None
