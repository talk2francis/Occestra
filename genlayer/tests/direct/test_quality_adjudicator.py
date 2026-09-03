"""Direct-mode tests for OccestraQualityAdjudicator.

Run from the genlayer directory after installing requirements with the current GenLayer testing
suite. These tests deliberately use written artifacts first; the visual screenshot path is a
separate ticket because it needs image/web mocks supported by the installed suite version.
"""

import json
import pytest


EVIDENCE_URL = "https://api.occestra.xyz/genlayer/evidence/oce_gl_written_pass"
ARTIFACT_HASH = "0x" + "11" * 32


def _evidence(**overrides):
    body = {
        "reviewId": "oce_gl_written_pass",
        "artifactHash": ARTIFACT_HASH,
        "artifactKind": "launch_thread",
        "profile": "written",
        "oqsVersion": "1.2.0",
        "localVerdict": "PASS",
        "publicForConsensus": True,
        "brief": {"objective": "Announce a real product launch without unsupported claims."},
        "artifact": {
            "text": "Occestra turns real moments into finished packs and publishes the quality report with every pack."
        },
        "localTribunal": {
            "verdict": "PASS",
            "axes": {
                "voice": 82,
                "specificity": 80,
                "factual_support": 86,
                "structure": 78,
                "platform_fit": 84,
            },
            "hardFailures": [],
        },
    }
    body.update(overrides)
    return body


def _mock_evidence(vm, payload):
    vm.mock_web(
        r"https://api\.occestra\.xyz/genlayer/evidence/.*",
        {"status": 200, "body": json.dumps(payload)},
    )


def _mock_llm(vm, decision="UPHELD", score_band="70-84", failure_codes=None):
    vm.mock_llm(
        r".*independent quality adjudicator.*",
        json.dumps(
            {
                "decision": decision,
                "score_band": score_band,
                "failure_codes": failure_codes or [],
                "critical_failure": "",
                "summary": "Independent review of the supplied frozen evidence.",
            }
        ),
    )


def _request(contract, review_id="oce_gl_written_pass"):
    contract.request_review(
        review_id,
        EVIDENCE_URL.replace("oce_gl_written_pass", review_id),
        ARTIFACT_HASH,
        "written",
        "1.2.0",
        "PASS",
        1788422400,
    )


def test_local_pass_can_be_upheld(direct_vm, direct_deploy, direct_alice):
    direct_vm.strict_mocks = True
    direct_vm.check_pickling = True
    contract = direct_deploy("contracts/OccestraQualityAdjudicator.py")
    direct_vm.sender = direct_alice
    _mock_evidence(direct_vm, _evidence())
    _mock_llm(direct_vm, "UPHELD", "70-84")

    _request(contract)

    review = contract.get_review("oce_gl_written_pass")
    assert review["artifactHash"] == ARTIFACT_HASH
    assert review["localVerdict"] == "PASS"
    assert review["consensusDecision"] == "UPHELD"
    assert review["scoreBand"] == "70-84"
    assert contract.review_count() == 1


def test_local_pass_can_be_overturned(direct_vm, direct_deploy, direct_alice):
    direct_vm.strict_mocks = True
    contract = direct_deploy("contracts/OccestraQualityAdjudicator.py")
    direct_vm.sender = direct_alice
    _mock_evidence(direct_vm, _evidence())
    _mock_llm(direct_vm, "OVERTURNED", "50-69", ["FACTUAL_SUPPORT"])

    _request(contract)

    review = contract.get_review("oce_gl_written_pass")
    assert review["consensusDecision"] == "OVERTURNED"
    assert "FACTUAL_SUPPORT" in review["failureCodes"]


def test_rejects_evidence_identity_mismatch(direct_vm, direct_deploy, direct_alice):
    direct_vm.strict_mocks = True
    contract = direct_deploy("contracts/OccestraQualityAdjudicator.py")
    direct_vm.sender = direct_alice
    _mock_evidence(direct_vm, _evidence(artifactHash="0x" + "22" * 32))

    with direct_vm.expect_revert("Evidence artifact hash mismatch"):
        _request(contract)


def test_rejects_nonpublic_consensus_evidence(direct_vm, direct_deploy, direct_alice):
    direct_vm.strict_mocks = True
    contract = direct_deploy("contracts/OccestraQualityAdjudicator.py")
    direct_vm.sender = direct_alice
    _mock_evidence(direct_vm, _evidence(publicForConsensus=False))

    with direct_vm.expect_revert("Evidence is not approved for public consensus"):
        _request(contract)


def test_duplicate_review_id_is_rejected(direct_vm, direct_deploy, direct_alice):
    direct_vm.strict_mocks = True
    contract = direct_deploy("contracts/OccestraQualityAdjudicator.py")
    direct_vm.sender = direct_alice
    _mock_evidence(direct_vm, _evidence())
    _mock_llm(direct_vm)
    _request(contract)

    with direct_vm.expect_revert("Review already exists"):
        _request(contract)
