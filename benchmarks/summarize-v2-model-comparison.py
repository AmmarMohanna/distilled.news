"""Offline, sanitized summary of the operator's retained real comparison.

Run from the repository root. No credentials, network requests or inference.
Private source text, prompts, reader text and ledger tokens stay local.
"""
import argparse
import collections
import hashlib
import json
import math
from pathlib import Path


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def summarize(root):
    receipts = [(p, read(p)) for p in sorted(root.glob("*-settled.json"))]
    intents = list(root.glob("*-intent.json"))
    pending = [p.name for p in intents if not p.with_name(p.name.replace("-intent", "-settled")).exists()]
    audit = read(root / "remote-ledger-audit.json")
    assert not pending and audit["unsettled"] == 0
    assert len(receipts) == audit["calls"]
    local = {r["id"]: r for _, r in receipts}
    remote_ids = [r["id"] for r in audit["rows"]]
    assert len(local) == len(receipts) == len(remote_ids) == len(set(remote_ids))
    assert set(local) == set(remote_ids)
    assert math.isclose(sum(r["cost_usd"] for r in audit["rows"]), audit["actualUsd"], abs_tol=1e-12)
    for row in audit["rows"]:
        receipt = local[row["id"]]
        assert receipt["token"] == row["token"] == row["settled_token"]
        assert receipt["usage"]["cost"] == row["cost_usd"]
    groups = collections.defaultdict(lambda: {"calls": 0, "actualUsd": 0, "providerAndSettlementMs": 0})
    for _, r in receipts:
        group = groups[r["profile"]]
        group["calls"] += 1
        group["actualUsd"] += r["usage"]["cost"]
        group["providerAndSettlementMs"] += r["wallMs"]
    runs = []
    for name in ["C", "A-medium", "A-medium-recovered", "A-low", "B-medium", "B-low", "B-thinking-disabled"]:
        path = root / (name + "-report.json")
        report = read(path)
        validation = []
        for doc in read(root / (name + "-state.json")):
            if doc["kind"] == "publication_validation_results":
                value = json.loads(doc["json"])
                validation.append({k: value[k] for k in ["status", "reasons"]})
        runs.append({
            "arm": name, "status": report["status"], "error": report.get("error"),
            "wallMs": report["wallMs"], "persistedUsefulBriefing": False,
            "performanceQualification": report.get("performanceQualification", "PILOT_SINGLE_RUN"),
            "initial": report["initial"], "database": report["database"],
            "stages": report["stages"], "validation": validation,
            "artifactSha256": digest(path),
        })
    stages = []
    for row in read(root / "matched-stage-results.json"):
        value = row.get("value", {})
        novelty = collections.Counter(c.get("readerNovelty", {}).get("status", "ABSENT") for c in value.get("semanticChecks", []))
        stages.append({"name": row["name"], "status": row["status"], "error": row.get("error"),
                       "wallMs": row["wallMs"], "noveltyCounts": dict(novelty),
                       "wholeClaimRejections": sum(not c["fullyEntailed"] for c in value.get("claimEntailment", []))})
    drafts = []
    for row in read(root / "draft-verification-recovered.json"):
        drafts.append({"writer": row["writerModel"], "verifier": row["verifier"],
                       "applicationDecision": {k: row["decision"][k] for k in ["status", "reasons"]},
                       "wholeClaimRejections": len(row["wholeClaimFailures"]),
                       "requiredFactFailures": len(row["requiredFactFailures"]),
                       "recoveredWithoutNewCalls": row["providerPayloadUnchanged"] and row["providerSchemaUnchanged"]})
    approval = read(root / "approval.json")
    models = [{k: m[k] for k in ["id", "canonical_slug", "context_length", "top_provider", "pricing", "supported_parameters"]}
              for m in read(root / "catalog.json")["models"] if m["id"] in approval["modelIds"]]
    calls = [{k: r.get(k) for k in ["profile", "model", "phase", "effort", "operationHash", "servedModels", "error", "usage", "wallMs", "reservedUsd", "accountingRecovery"]}
             | {"receiptSha256": digest(p)} for p, r in receipts]
    return {
        "date": "2026-10-21", "qualification": "NO_CONFIGURATION_QUALIFIED_FOR_PROMOTION",
        "scope": "SAVED_REAL_EVIDENCE_LOCAL_END_TO_END_AND_MATCHED_STAGE_PILOT",
        "sourceManifestHash": runs[0]["initial"]["evidenceHash"],
        "financial": {k: audit[k] for k in ["at", "calls", "actualUsd", "reservedUsd", "unsettled"]},
        "groups": dict(groups), "models": models, "runs": runs, "matchedStages": stages,
        "matchedDraftDecisions": drafts, "calls": calls,
        "limits": [
            "One sample per main arm, not statistical reliability or P95.",
            "Initial main-run graph and publication history were identical and empty; actual nonempty history tested separately on matched verification inputs.",
            "Acquisition imports saved immutable articles, not live network acquisition or unattended delivery timing.",
            "Review is AI-assisted source review, not independently certified human gold.",
            "No candidate edition persisted, no public publication, deployment or routing change.",
            "Full GPT-4.1 historical runs are not the current GPT-4.1-mini baseline.",
            "No real multilingual corpus, separate later-update sequence, JEV or exhaustive packet-boundary qualification.",
            "Reasoning comparisons include routing/cache/load variability; requests disable fallback but do not pin serving endpoints.",
            "A-medium recovery reused the original settled result; its interrupted wall time is not directly comparable.",
            "Timed-out canceled operations have stable provider-reported billing but no reusable completed semantic result.",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(".local-reports/v2-model-comparison"))
    parser.add_argument("--output", type=Path, default=Path("benchmarks/results/v2-model-comparison-2026-10-21.json"))
    args = parser.parse_args()
    result = summarize(args.root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(json.dumps(result["financial"]))
