from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
import requests

from govai import (
    GovAIAPIError,
    GovAIClient,
    GovAIHTTPError,
    compliance_decision_inputs_from_api,
    compliance_decision_label,
    current_state_from_summary,
    decision_signals_from_summary,
    get_bundle,
    get_bundle_hash,
    get_compliance_summary,
    submit_event,
    verify_chain,
)


def test_submit_event_success() -> None:
    client = GovAIClient("http://example.test")
    with patch.object(
        client,
        "request_json",
        return_value={"ok": True, "record_hash": "ab12", "policy_version": "v0.4_human_approval"},
    ) as req:
        out = submit_event(client, {"event_type": "model_trained", "event_id": "e1"})
    req.assert_called_once_with(
        "POST",
        "/evidence",
        json_body={"event_type": "model_trained", "event_id": "e1"},
        raise_on_body_ok_false=True,
    )
    assert out["ok"] is True
    assert out["record_hash"] == "ab12"


def test_submit_event_body_ok_false_raises() -> None:
    client = GovAIClient("http://example.test")
    with patch.object(
        client,
        "request_json",
        side_effect=GovAIAPIError("policy_violation", {"ok": False, "error": "policy_violation"}),
    ):
        with pytest.raises(GovAIAPIError, match="policy_violation"):
            submit_event(client, {})


def test_get_bundle_success() -> None:
    client = GovAIClient("http://example.test")
    doc = {"ok": True, "run_id": "r1", "events": []}
    with patch.object(client, "request_json", return_value=doc) as req:
        out = get_bundle(client, "r1")
    req.assert_called_once_with(
        "GET",
        "/bundle",
        params={"run_id": "r1"},
        raise_on_body_ok_false=True,
    )
    assert out == doc


def test_get_bundle_hash_success() -> None:
    client = GovAIClient("http://example.test")
    with patch.object(
        client,
        "request_json",
        return_value={"ok": True, "bundle_sha256": "deadbeef"},
    ) as req:
        h = get_bundle_hash(client, "r1")
    req.assert_called_once_with(
        "GET",
        "/bundle-hash",
        params={"run_id": "r1"},
        raise_on_body_ok_false=True,
    )
    assert h == "deadbeef"


def test_get_bundle_hash_missing_digest_raises() -> None:
    client = GovAIClient("http://example.test")
    with patch.object(client, "request_json", return_value={"ok": True}):
        with pytest.raises(GovAIAPIError, match="bundle_sha256"):
            get_bundle_hash(client, "r1")


def test_get_compliance_summary_returns_ok_false_without_raise() -> None:
    client = GovAIClient("http://example.test")
    body = {
        "ok": False,
        "schema_version": "aigov.compliance_summary.v2",
        "error": "run_not_found",
        "policy_version": "v0.4_human_approval",
        "run_id": "missing",
    }
    with patch.object(client, "request_json", return_value=body) as req:
        out = get_compliance_summary(client, "missing")
    req.assert_called_once_with(
        "GET",
        "/compliance-summary",
        params={"run_id": "missing"},
        raise_on_body_ok_false=False,
        timeout=30.0,
    )
    assert out["ok"] is False
    assert out["error"] == "run_not_found"


def test_verify_chain_ok() -> None:
    client = GovAIClient("http://example.test")
    with patch.object(
        client,
        "request_json",
        return_value={"ok": True, "policy_version": "v0.4_human_approval"},
    ) as req:
        out = verify_chain(client)
    req.assert_called_once_with("GET", "/verify", raise_on_body_ok_false=False)
    assert out["ok"] is True


def test_verify_chain_broken_returns_body() -> None:
    client = GovAIClient("http://example.test")
    with patch.object(
        client,
        "request_json",
        return_value={"ok": False, "error": "hash_chain_broken at line 2", "policy_version": "v0.4_human_approval"},
    ):
        out = verify_chain(client)
    assert out["ok"] is False
    assert "hash_chain" in out["error"]


def test_http_error_on_evidence() -> None:
    client = GovAIClient("http://example.test")
    resp = MagicMock(spec=requests.Response)
    resp.ok = False
    resp.status_code = 400
    resp.text = '{"error":"bad request"}'
    resp.json.return_value = {"error": "bad request"}

    with patch.object(client._session, "request", return_value=resp):
        with pytest.raises(GovAIHTTPError) as ei:
            submit_event(client, {})
    assert ei.value.status_code == 400


def test_client_instance_methods_delegate() -> None:
    client = GovAIClient("http://example.test")
    with patch.object(client, "request_json", return_value={"ok": True, "record_hash": "x"}):
        assert client.submit_event({"event_id": "1"})["record_hash"] == "x"
    with patch.object(client, "request_json", return_value={"ok": True, "run_id": "r"}):
        assert client.get_bundle("r")["run_id"] == "r"
    with patch.object(client, "request_json", return_value={"ok": True, "bundle_sha256": "abc"}):
        assert client.get_bundle_hash("r") == "abc"
    with patch.object(client, "request_json", return_value={"ok": True, "current_state": {}}):
        assert client.get_compliance_summary("r")["ok"] is True
    with patch.object(client, "request_json", return_value={"ok": True}):
        assert client.verify_chain()["ok"] is True


def test_current_state_and_decision_helpers() -> None:
    summary = {
        "ok": True,
        "current_state": {
            "model": {
                "evaluation_passed": True,
                "promotion": {"state": "awaiting_promotion_execution", "model_promoted_present": False},
            },
            "approval": {"human_approval_decision": "approve", "risk_review_decision": "approve"},
        },
    }
    cs = current_state_from_summary(summary)
    assert cs is not None
    sig = decision_signals_from_summary(summary)
    assert sig is not None
    assert sig["evaluation_passed"] is True
    assert sig["promotion_state"] == "awaiting_promotion_execution"
    assert sig["human_approval_decision"] == "approve"

    bad = {"ok": False, "error": "x"}
    assert current_state_from_summary(bad) is None
    assert decision_signals_from_summary(bad) is None

    assert compliance_decision_label(compliance_decision_inputs_from_api(bad)) == "BLOCKED"
    assert (
        compliance_decision_label(compliance_decision_inputs_from_api({"ok": True, "current_state": {}}))
        == "BLOCKED"
    )


def _valid_api_summary() -> dict:
    return {
        "ok": True,
        "current_state": {
            "model": {"evaluation_passed": True},
            "approval": {"approved": True},
            "promotion": {"promoted": True},
        },
    }


def test_compliance_decision_label_tristate() -> None:
    assert (
        compliance_decision_label(
            {
                "evaluation_passed": True,
                "human_approval_present": True,
                "model_promoted_present": True,
            }
        )
        == "VALID"
    )
    assert (
        compliance_decision_label(
            {
                "evaluation_passed": False,
                "human_approval_present": True,
                "model_promoted_present": True,
            }
        )
        == "INVALID"
    )
    assert (
        compliance_decision_label(
            {
                "evaluation_passed": True,
                "human_approval_present": False,
                "model_promoted_present": True,
            }
        )
        == "BLOCKED"
    )


def test_compliance_decision_inputs_from_api_nested() -> None:
    assert compliance_decision_label(compliance_decision_inputs_from_api(_valid_api_summary())) == "VALID"

    inv = json.loads(json.dumps(_valid_api_summary()))
    inv["current_state"]["model"]["evaluation_passed"] = False
    assert compliance_decision_label(compliance_decision_inputs_from_api(inv)) == "INVALID"

    blocked = json.loads(json.dumps(_valid_api_summary()))
    blocked["ok"] = False
    assert compliance_decision_label(compliance_decision_inputs_from_api(blocked)) == "BLOCKED"
