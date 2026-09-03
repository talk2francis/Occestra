"""Direct-mode tests for OccestraQualityAdjudicator.

These run entirely offline: every web fetch, page render and LLM call is mocked, and
`strict_mocks` makes an unmocked external call a test failure rather than a silent network
hit. `check_pickling` is on for the consensus paths because the leader/validator closures are
cloudpickled in production. Note its limits: direct-mode storage slots define `__reduce__`, so
a closure that captured `self` still pickles here. Keeping `self` out of those closures is a
discipline the contract holds itself to, not something these tests can enforce.

    cd genlayer && .venv/bin/gltest tests/direct/ -q
"""

import json
import pytest

CONTRACT = "contracts/OccestraQualityAdjudicator.py"

EVIDENCE_BASE = "https://api.occestra.xyz/genlayer/evidence/"
ARTIFACT_BASE = "https://api.occestra.xyz/genlayer/artifacts/"
ARTIFACT_HASH = "0x" + "11" * 32
OQS_VERSION = "1.2.0"

WRITTEN_TRIBUNAL = {
    "verdict": "PASS",
    "axes": {
        "voice": 82,
        "specificity": 80,
        "factual_support": 86,
        "structure": 78,
        "platform_fit": 84,
    },
    "hardFailures": [],
}

PLAN_TRIBUNAL = {
    "verdict": "PASS",
    "axes": {
        "groundedness": 84,
        "feasibility": 80,
        "completeness": 79,
        "contingency": 75,
        "honesty": 88,
    },
    "hardFailures": [],
}

VISUAL_TRIBUNAL = {
    "verdict": "PASS",
    "axes": {
        "composition": 85,
        "legibility": 74,
        "style_fidelity": 82,
        "subject_fidelity": 88,
    },
    "hardFailures": [],
}


def _evidence(review_id="oce_gl_written_pass", profile="written", **overrides):
    tribunal = {
        "written": WRITTEN_TRIBUNAL,
        "plan": PLAN_TRIBUNAL,
        "visual": VISUAL_TRIBUNAL,
        "pack": WRITTEN_TRIBUNAL,
    }[profile]
    body = {
        "schemaVersion": "1",
        "reviewId": review_id,
        "createdAt": "2026-09-03T00:00:00.000Z",
        "artifactId": "art_" + review_id,
        "artifactHash": ARTIFACT_HASH,
        "artifactKind": "launch_thread" if profile == "written" else profile,
        "profile": profile,
        "oqsVersion": OQS_VERSION,
        "localVerdict": "PASS",
        "publicForConsensus": True,
        "brief": {"objective": "Announce a real product launch without unsupported claims."},
        "rubric": {"axisPassThreshold": 70},
        "artifact": {
            "text": "Occestra turns real moments into finished packs and publishes the quality report with every pack."
        },
        "localTribunal": tribunal,
    }
    body.update(overrides)
    return body


def _mock_evidence(vm, payload, *, status=200, raw=None):
    body = raw if raw is not None else json.dumps(payload)
    vm.mock_web(r"https://api\.occestra\.xyz/genlayer/evidence/.*", {"status": status, "body": body})


def _mock_artifact(vm):
    vm.mock_web(r"https://api\.occestra\.xyz/genlayer/artifacts/.*", {"status": 200, "body": ""})


def _mock_llm(vm, decision="UPHELD", score_band="70-84", failure_codes=None, critical=""):
    vm.mock_llm(
        r".*independent quality adjudicator.*",
        json.dumps(
            {
                "decision": decision,
                "score_band": score_band,
                "failure_codes": failure_codes or [],
                "critical_failure": critical,
                "summary": "Independent review of the supplied frozen evidence.",
            }
        ),
    )


def _deploy(direct_vm, direct_deploy, direct_alice, *, pickling=True):
    direct_vm.strict_mocks = True
    direct_vm.check_pickling = pickling
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    return contract


def _request(
    contract,
    review_id="oce_gl_written_pass",
    *,
    evidence_url=None,
    artifact_hash=ARTIFACT_HASH,
    profile="written",
    oqs_version=OQS_VERSION,
    local_verdict="PASS",
):
    contract.request_review(
        review_id,
        evidence_url if evidence_url is not None else EVIDENCE_BASE + review_id,
        artifact_hash,
        profile,
        oqs_version,
        local_verdict,
        1788422400,
    )


# --- the four rulings -------------------------------------------------------------------


def test_local_pass_upheld(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence())
    _mock_llm(direct_vm, "UPHELD", "70-84")

    _request(contract)

    review = contract.get_review("oce_gl_written_pass")
    assert review["artifactHash"] == ARTIFACT_HASH
    assert review["localVerdict"] == "PASS"
    assert review["consensusDecision"] == "UPHELD"
    assert review["scoreBand"] == "70-84"
    assert review["failureCodes"] == []
    assert contract.review_count() == 1


def test_local_pass_overturned(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence())
    _mock_llm(direct_vm, "OVERTURNED", "50-69", ["factual_support"], critical="FACTUAL_SUPPORT")

    _request(contract)

    review = contract.get_review("oce_gl_written_pass")
    assert review["consensusDecision"] == "OVERTURNED"
    # Codes are normalized to upper case so the repair loop can key off them reliably.
    assert review["failureCodes"] == ["FACTUAL_SUPPORT"]
    assert review["criticalFailure"] == "FACTUAL_SUPPORT"


def test_local_fail_upheld(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence(localVerdict="FAIL"))
    _mock_llm(direct_vm, "UPHELD", "0-49", ["LEGIBILITY"])

    _request(contract, local_verdict="FAIL")

    review = contract.get_review("oce_gl_written_pass")
    assert review["localVerdict"] == "FAIL"
    assert review["consensusDecision"] == "UPHELD"


def test_local_fail_overturned(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence(localVerdict="FAIL"))
    _mock_llm(direct_vm, "OVERTURNED", "85-100")

    _request(contract, local_verdict="FAIL")

    review = contract.get_review("oce_gl_written_pass")
    assert review["localVerdict"] == "FAIL"
    assert review["consensusDecision"] == "OVERTURNED"


def test_undetermined_is_recorded_as_undetermined(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence())
    _mock_llm(direct_vm, "UNDETERMINED", "UNKNOWN", ["EVIDENCE_INSUFFICIENT"])

    _request(contract)

    assert contract.get_review("oce_gl_written_pass")["consensusDecision"] == "UNDETERMINED"


def test_unparseable_validator_output_becomes_undetermined(direct_vm, direct_deploy, direct_alice):
    """A model that ignores the response contract must not be able to write a real verdict."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence())
    _mock_llm(direct_vm, decision="probably fine?", score_band="great", failure_codes=None)

    _request(contract)

    review = contract.get_review("oce_gl_written_pass")
    assert review["consensusDecision"] == "UNDETERMINED"
    assert review["scoreBand"] == "UNKNOWN"


# --- profiles ---------------------------------------------------------------------------


def test_written_profile_does_not_render_a_page(direct_vm, direct_deploy, direct_alice):
    """Only the visual profile may render. strict_mocks turns an unexpected render into a failure."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence())
    _mock_llm(direct_vm)

    _request(contract)

    assert contract.get_review("oce_gl_written_pass")["profile"] == "written"


def test_plan_profile_review(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence("oce_gl_plan_pass", profile="plan"))
    _mock_llm(direct_vm, "OVERTURNED", "50-69", ["SCHEDULE_CONFLICT"])

    _request(contract, "oce_gl_plan_pass", profile="plan")

    review = contract.get_review("oce_gl_plan_pass")
    assert review["profile"] == "plan"
    assert review["failureCodes"] == ["SCHEDULE_CONFLICT"]


def test_visual_profile_renders_the_frozen_artifact(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(
        direct_vm,
        _evidence("oce_gl_visual_pass", profile="visual", artifactUrl=ARTIFACT_BASE + "oce_gl_visual_pass"),
    )
    _mock_artifact(direct_vm)
    _mock_llm(direct_vm, "OVERTURNED", "50-69", ["LEGIBILITY"], critical="LEGIBILITY")

    _request(contract, "oce_gl_visual_pass", profile="visual")

    review = contract.get_review("oce_gl_visual_pass")
    assert review["profile"] == "visual"
    assert review["consensusDecision"] == "OVERTURNED"
    assert review["criticalFailure"] == "LEGIBILITY"


def test_visual_without_a_frozen_artifact_is_undetermined(direct_vm, direct_deploy, direct_alice):
    """No image means nothing was actually looked at. That is UNDETERMINED, never UPHELD."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence("oce_gl_visual_bare", profile="visual"))

    _request(contract, "oce_gl_visual_bare", profile="visual")

    review = contract.get_review("oce_gl_visual_bare")
    assert review["consensusDecision"] == "UNDETERMINED"
    assert review["failureCodes"] == ["ARTIFACT_UNAVAILABLE"]


# --- rejections -------------------------------------------------------------------------


def test_rejects_artifact_hash_mismatch(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence(artifactHash="0x" + "22" * 32))

    with direct_vm.expect_revert("Evidence artifact hash mismatch"):
        _request(contract)


def test_rejects_profile_mismatch(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence(profile="plan"))

    with direct_vm.expect_revert("Evidence profile mismatch"):
        _request(contract)


def test_rejects_oqs_version_mismatch(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence(oqsVersion="1.1.0"))

    with direct_vm.expect_revert("Evidence OQS version mismatch"):
        _request(contract)


def test_rejects_local_verdict_mismatch(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence(localVerdict="FAIL"))

    with direct_vm.expect_revert("Evidence local verdict mismatch"):
        _request(contract)


def test_rejects_nonpublic_consensus_evidence(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence(publicForConsensus=False))

    with direct_vm.expect_revert("Evidence is not approved for public consensus"):
        _request(contract)


def test_rejects_foreign_evidence_origin(direct_vm, direct_deploy, direct_alice):
    """Arbitrary evidence URLs would make every validator a fetcher for an attacker's host."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)

    with direct_vm.expect_revert("Evidence URL must use the Occestra evidence origin"):
        _request(contract, evidence_url="https://evil.example.com/genlayer/evidence/x")


def test_rejects_foreign_artifact_origin(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(
        direct_vm,
        _evidence("oce_gl_visual_evil", profile="visual", artifactUrl="https://evil.example.com/a.png"),
    )

    with direct_vm.expect_revert("Artifact URL must use the Occestra consensus artifact origin"):
        _request(contract, "oce_gl_visual_evil", profile="visual")


def test_rejects_unsupported_profile(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)

    with direct_vm.expect_revert("Unsupported profile"):
        _request(contract, profile="interpretive_dance")


@pytest.mark.parametrize("version", ["", "1.2", "banana", "2.0.0", "1.2.0-rc1"])
def test_rejects_invalid_or_unsupported_oqs_version(direct_vm, direct_deploy, direct_alice, version):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)

    with direct_vm.expect_revert("Unsupported OQS version"):
        _request(contract, oqs_version=version)


def test_accepts_a_later_oqs_minor(direct_vm, direct_deploy, direct_alice):
    """The rubric travels inside the evidence, so a minor bump must not need a redeploy."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence(oqsVersion="1.3.0"))
    _mock_llm(direct_vm)

    _request(contract, oqs_version="1.3.0")

    assert contract.get_review("oce_gl_written_pass")["oqsVersion"] == "1.3.0"


def test_rejects_invalid_artifact_hash(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)

    with direct_vm.expect_revert("Invalid artifact hash"):
        _request(contract, artifact_hash="0xdeadbeef")


def test_rejects_invalid_local_verdict(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)

    with direct_vm.expect_revert("Invalid local verdict"):
        _request(contract, local_verdict="MAYBE")


def test_rejects_duplicate_review_id(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence())
    _mock_llm(direct_vm)
    _request(contract)

    with direct_vm.expect_revert("Review already exists"):
        _request(contract)


def test_rejects_unavailable_evidence(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, None, status=404, raw="not found")

    with direct_vm.expect_revert("Evidence unavailable"):
        _request(contract)


def test_rejects_malformed_evidence(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, None, raw="{not json at all")

    with direct_vm.expect_revert("Evidence is not valid JSON"):
        _request(contract)


def test_rejects_non_object_evidence(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, None, raw='["a list, not a snapshot"]')

    with direct_vm.expect_revert("Evidence is not a JSON object"):
        _request(contract)


# --- the equivalence rule ----------------------------------------------------------------
#
# These exercise validator_fn directly. They are the tests that prove the contract does not
# demand byte-identical LLM prose, while still refusing to rubber-stamp a different ruling.


def _capture_validator(direct_vm, direct_deploy, direct_alice, **llm):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence())
    _mock_llm(direct_vm, **llm)
    _request(contract)
    return contract


def test_validator_agrees_despite_different_prose(direct_vm, direct_deploy, direct_alice):
    _capture_validator(direct_vm, direct_deploy, direct_alice, decision="UPHELD", score_band="70-84")

    agreed = direct_vm.run_validator(
        leader_result={
            "decision": "UPHELD",
            "score_band": "70-84",
            "failure_codes": [],
            "critical_failure": "",
            "summary": "Completely different wording, same ruling.",
        }
    )

    assert agreed is True


def test_validator_agrees_on_an_adjacent_score_band(direct_vm, direct_deploy, direct_alice):
    _capture_validator(direct_vm, direct_deploy, direct_alice, decision="UPHELD", score_band="70-84")

    assert direct_vm.run_validator(
        leader_result={
            "decision": "UPHELD",
            "score_band": "85-100",
            "failure_codes": [],
            "critical_failure": "",
            "summary": "",
        }
    ) is True


def test_validator_rejects_a_distant_score_band(direct_vm, direct_deploy, direct_alice):
    _capture_validator(direct_vm, direct_deploy, direct_alice, decision="UPHELD", score_band="70-84")

    assert direct_vm.run_validator(
        leader_result={
            "decision": "UPHELD",
            "score_band": "0-49",
            "failure_codes": [],
            "critical_failure": "",
            "summary": "",
        }
    ) is False


def test_validator_rejects_a_different_decision(direct_vm, direct_deploy, direct_alice):
    _capture_validator(direct_vm, direct_deploy, direct_alice, decision="UPHELD", score_band="70-84")

    assert direct_vm.run_validator(
        leader_result={
            "decision": "OVERTURNED",
            "score_band": "70-84",
            "failure_codes": [],
            "critical_failure": "",
            "summary": "",
        }
    ) is False


def test_validator_rejects_a_contradicting_critical_failure(direct_vm, direct_deploy, direct_alice):
    _capture_validator(
        direct_vm,
        direct_deploy,
        direct_alice,
        decision="OVERTURNED",
        score_band="50-69",
        failure_codes=["LEGIBILITY"],
        critical="LEGIBILITY",
    )

    assert direct_vm.run_validator(
        leader_result={
            "decision": "OVERTURNED",
            "score_band": "50-69",
            "failure_codes": ["LEGIBILITY"],
            "critical_failure": "BUDGET_INCONSISTENCY",
            "summary": "",
        }
    ) is False


def test_validator_rejects_disjoint_failure_codes(direct_vm, direct_deploy, direct_alice):
    _capture_validator(
        direct_vm,
        direct_deploy,
        direct_alice,
        decision="OVERTURNED",
        score_band="50-69",
        failure_codes=["LEGIBILITY"],
    )

    assert direct_vm.run_validator(
        leader_result={
            "decision": "OVERTURNED",
            "score_band": "50-69",
            "failure_codes": ["SCHEDULE_CONFLICT"],
            "critical_failure": "",
            "summary": "",
        }
    ) is False


def test_validator_rejects_a_non_return_result(direct_vm, direct_deploy, direct_alice):
    _capture_validator(direct_vm, direct_deploy, direct_alice)

    assert direct_vm.run_validator(leader_error="something went wrong") is False


# --- lookups ------------------------------------------------------------------------------


def test_lookup_by_artifact_hash(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_evidence(direct_vm, _evidence())
    _mock_llm(direct_vm)
    _request(contract)

    assert contract.get_review_by_artifact(ARTIFACT_HASH)["reviewId"] == "oce_gl_written_pass"


def test_unknown_review_is_not_found(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy, direct_alice)

    with direct_vm.expect_revert("Review not found"):
        contract.get_review("oce_gl_nope_nope")
