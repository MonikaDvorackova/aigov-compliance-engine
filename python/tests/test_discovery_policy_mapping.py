from aigov_py.discovery_policy_mapping import (
    DiscoverySignals,
    discovery_required_evidence_additions,
)


def test_llm_used_requires_evaluation_and_usage_policy() -> None:
    req = discovery_required_evidence_additions(DiscoverySignals(llm_used=True))
    assert "evaluation_reported" in req
    assert "usage_policy_defined" in req


def test_user_facing_requires_human_approval() -> None:
    req = discovery_required_evidence_additions(DiscoverySignals(user_facing=True))
    assert req == {"human_approved"}


def test_pii_possible_requires_privacy_review() -> None:
    req = discovery_required_evidence_additions(DiscoverySignals(pii_possible=True))
    assert req == {"privacy_review_completed"}


def test_model_trained_requires_registration_and_evaluation() -> None:
    req = discovery_required_evidence_additions(DiscoverySignals(model_trained=True))
    assert req == {"model_registered", "evaluation_reported"}


def test_combined_signals_are_deduplicated() -> None:
    req = discovery_required_evidence_additions(
        DiscoverySignals(llm_used=True, model_trained=True, user_facing=True)
    )
    assert req == {
        "evaluation_reported",
        "usage_policy_defined",
        "model_registered",
        "human_approved",
    }
