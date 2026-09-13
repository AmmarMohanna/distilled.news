"""Reports distinguish evidence quality, acquisition availability and unreconciled cost."""
from collections import Counter
import csv
import io
import json
import math
import shutil
import time
from itertools import combinations
from urllib.parse import urlsplit

from bench.processing import wilson


def percentile95(values):
    return sorted(values)[max(0, math.ceil(.95 * len(values))-1)] if values else None


def reported_score(step, score, reference):
    # Older saved steps may contain both a processing error and a stale score.
    if step.get("processing_error"):
        return {"label": "FAIL" if reference else "AUTO_FAIL", "verified": bool(reference)}
    return score


def generate(state, run):
    manifest, jobs = state.manifest(run), state.jobs(run)
    config = manifest["config"]
    spend = [dict(row) for row in state.db.execute("SELECT spend.* FROM spend JOIN jobs ON substr(spend.job,1,length(jobs.id)+2)=jobs.id || '__' WHERE jobs.run=?", (run,))]
    charges = {row["job"]: row for row in spend}
    rows, groups, chains = [], {}, []
    for job in jobs:
        spec, result = job["spec"], job["result"] or {}
        steps = result.get("steps", []) + ([result["inflight"]] if result.get("inflight") else [])
        target = spec["target"]
        for step in steps:
            article = target["kind"] == "article"
            extractors = config["extractors"] if article else ["source"]
            for extractor in extractors:
                extraction = step.get("extractions", {}).get(extractor, {})
                score = reported_score(step, extraction.get("score", {}) if article else step.get("source_score", {}), spec["reference"])
                label = score.get("label", "FAIL" if (step["status"] == "failed" or step.get("processing_error")) and spec["reference"] else "UNSCORED")
                charge = charges.get(step.get("spend_id"), {})
                cost = charge.get("actual") if charge.get("actual") is not None else charge.get("reserved")
                processing_ms = extraction.get("duration_ms") if article else step.get("normalization_ms")
                combined_ms = step["duration_ms"] + (processing_ms or 0)
                row = {"job": job["id"], "candidate": spec["candidate"], "route": step["route"], "extractor": extractor,
                    "target": target["id"], "kind": target["kind"], "input": target["input"],
                    "domain": urlsplit(target["input"]).hostname or target["kind"], "language": target.get("language", target.get("options", {}).get("language", "unknown")),
                    "repetition": spec["repetition"], "calibration": bool(target.get("calibration")), "status": step["status"],
                    "label": label, "verified": score.get("verified", bool(spec["reference"]) and label == "FAIL"),
                    "quality_verified": score.get("quality_verified", score.get("verified", bool(spec["reference"]) and label == "FAIL")),
                    "acquisition_ms": step["duration_ms"], "processing_ms": processing_ms,
                    "queue_ms": step.get("queue_ms", 0),
                    "combined_ms": combined_ms,
                    "cost_bound_or_actual_usd": cost, "cost_reconciled": charge.get("actual") is not None,
                    "capped": step.get("coverage", {}).get("capped", False), "reason": step.get("reason", step.get("processing_error")),
                    "score": score, "spend_id": step.get("spend_id")}
                rows.append(row)
                groups.setdefault(f"{step['route']} / {target['kind']} / {extractor}", []).append(row)
        if spec.get("chain"):
            final = next((step for step in reversed(steps) if step.get("validation", {}).get("accepted")), None)
            chains.append({"target": target["id"], "candidate": spec["candidate"], "repetition": spec["repetition"],
                "accepted": bool(final), "selected_route": final["route"] if final else None,
                "duration_ms": result.get("duration_ms"), "attempted_routes": [step["route"] for step in steps],
                "final_scores": {name: reported_score(final, extraction.get("score", {}), spec["reference"]) for name, extraction in (final or {}).get("extractions", {}).items()},
                "processing_error": (final or {}).get("processing_error"),
                "cost_bound_or_actual_usd": sum((charges.get(step.get("spend_id"), {}).get("actual") if charges.get(step.get("spend_id"), {}).get("actual") is not None else charges.get(step.get("spend_id"), {}).get("reserved", 0)) for step in steps)})
    summaries = {}
    for key, members in groups.items():
        independent = {row["input"]: row for row in members if row["quality_verified"] and not row["calibration"] and row["repetition"] == 0 and row["label"] != "SOURCE_CHANGED"}
        labels = Counter(row["label"] for row in independent.values())
        n, usable = len(independent), labels["PASS"] + labels["PARTIAL"]
        bounds = wilson(usable, n)
        attempted = [row for row in members if row["status"] not in {"not_tested", "skipped_budget"}]
        p95 = percentile95([row["combined_ms"] for row in attempted])
        successful_p95 = percentile95([row["combined_ms"] for row in members if row["status"] == "captured"])
        article = members[0]["kind"] == "article"
        gate = "INSUFFICIENT_EVIDENCE"
        if article and n >= 30:
            gate = "MEETS_NUMERIC_GATES_REVIEW_SERVER_EVIDENCE" if labels["PASS"] / n >= .8 and bounds[0] >= .85 and labels["FALSE_SUCCESS"] == 0 and p95 is not None and p95 <= 30000 else "DOES_NOT_MEET_GATES"
        seen_charges = {row["spend_id"]: row["cost_bound_or_actual_usd"] for row in members if row["spend_id"]}
        cost = sum(value for value in seen_charges.values() if value is not None)
        verified_charges = {row["spend_id"]: row["cost_bound_or_actual_usd"] for row in independent.values() if row["spend_id"]}
        verified_cost = sum(value for value in verified_charges.values() if value is not None)
        summaries[key] = {"attempts": len(members), "states": dict(Counter(row["status"] for row in members)),
            "labels": dict(Counter(row["label"] for row in members)), "unique_unseen": n, "unique_labels": dict(labels),
            "usable_wilson95": bounds if article else None, "pass_rate": labels["PASS"] / n if n else None,
            "false_success": labels["FALSE_SUCCESS"], "quality_gate": gate,
            "p95_acquisition_ms": percentile95([row["acquisition_ms"] for row in members if row["status"] not in {"not_tested", "skipped_budget"}]),
            "p95_combined_ms": p95, "p95_successful_combined_ms": successful_p95,
            "p95_queue_ms": percentile95([row["queue_ms"] for row in members]),
            "cost_bound_or_actual_usd": cost, "verified_cohort_cost_bound_or_actual_usd": verified_cost,
            "cost_per_verified_usable_attempt_usd": verified_cost / usable if usable else None,
            "all_costs_reconciled": all(row["cost_reconciled"] for row in members if row["status"] not in {"not_tested", "skipped_budget"}),
            "capped_attempts": sum(row["capped"] for row in members),
            "by_domain_language": dict(Counter(f"{row['domain']} / {row['language']} / {row['label']}" for row in members)),
            "source_results": [{"target": row["target"], **row["score"]} for row in members if not article]}
    # A comparison cohort contains only task/repetition pairs actually attempted by every active candidate.
    matched = {}
    for kind in {row["kind"] for row in rows}:
        active = {}
        for row in rows:
            if row["kind"] == kind and row["status"] in {"captured", "failed"}:
                active.setdefault(row["route"], set()).add((row["target"], row["repetition"]))
        pairs = set.intersection(*active.values()) if len(active) >= 2 else set()
        matched[kind] = {"active_candidates": sorted(active), "matched_task_repetitions": sorted(pairs), "count": len(pairs)}
        comparisons = {}
        for left, right in combinations(sorted(active), 2):
            common = active[left] & active[right]
            costs = {}
            for candidate in (left, right):
                attempts = {row["spend_id"]: row for row in rows if row["kind"] == kind and row["route"] == candidate and (row["target"], row["repetition"]) in common}
                costs[candidate] = {"cost_bound_or_actual_usd": sum(row["cost_bound_or_actual_usd"] or 0 for row in attempts.values()),
                                    "all_reconciled": all(row["cost_reconciled"] for row in attempts.values())}
            comparisons[left + " / " + right] = {"matched_count": len(common), "tasks": sorted(common), "costs": costs}
        matched[kind]["pairwise"] = comparisons
    beat = state.db.execute("SELECT at FROM heartbeat WHERE run=?", (run,)).fetchone()
    processing_version_row = state.db.execute("SELECT detail FROM events WHERE run=? AND kind='processing_versions' ORDER BY id DESC LIMIT 1", (run,)).fetchone()
    processing_versions = json.loads(processing_version_row[0]) if processing_version_row else None
    output = {"run": run, "config_sha256": manifest.get("config_sha256"), "versions": manifest.get("versions"),
        "acquisition_versions": manifest.get("versions"), "processing_versions": processing_versions,
        "mode": config["mode"], "job_states": dict(Counter(job["status"] for job in jobs)), "stopped": state.stopped(run),
        "heartbeat_age_seconds": round(time.time()-beat[0], 1) if beat else None,
        "free_disk_bytes": shutil.disk_usage(state.root).free,
        "groups": summaries, "matched_cohorts": matched, "chains": chains, "spend": spend,
        "reserved_or_reconciled_usd": sum(row["actual"] if row["actual"] is not None else row["reserved"] for row in spend),
        "local_runtime_cost": "unallocated; provider charges alone are not total cost",
        "resource_samples": [json.loads(row[0]) for row in state.db.execute("SELECT detail FROM events WHERE run=? AND kind IN ('resource_sample','resource_final') ORDER BY id", (run,))],
        "notes": ["Synthetic offline results validate the harness, not provider performance.",
                  "Publication age measures returned posts, not discovery delay. Complete recall needs an independent complete window.",
                  "Numeric gates do not validate legal access, billing bounds, cross-region behavior or Cloudflare deployment."],
        "rows": rows, "jobs": jobs}
    state.write_report(run, "report.json", output)
    csv_output = io.StringIO(newline="")
    columns = ["job", "candidate", "route", "extractor", "target", "kind", "domain", "language", "repetition", "calibration", "status", "label", "queue_ms", "acquisition_ms", "processing_ms", "combined_ms", "cost_bound_or_actual_usd", "cost_reconciled", "capped", "reason"]
    writer = csv.DictWriter(csv_output, fieldnames=columns, extrasaction="ignore")
    writer.writeheader(); writer.writerows(rows)
    state.write_report(run, "attempts.csv", csv_output.getvalue())
    lines = [f"# Benchmark {run}", "", f"Mode: {config['mode']}. Jobs: {output['job_states']}.", "",
        "| Candidate / task / parser | Attempts | Labels | Unseen inputs | p95 combined ms | Evidence gate |", "|---|---:|---|---:|---:|---|"]
    for key, group in summaries.items():
        lines.append(f"| {key} | {group['attempts']} | {group['labels']} | {group['unique_unseen']} | {group['p95_combined_ms']} | {group['quality_gate']} |")
    lines += ["", "Use report.json for per-item checks, matched cohorts, failure reasons, recovery state, costs and artifacts. attempts.csv supports spreadsheet comparison.", "",
        "Unreconciled reservations are conservative bounds. Disabled, pending and unscored results are not successful tests. Local runtime cost remains separate."]
    state.write_report(run, "report.md", "\n".join(lines) + "\n")
    return output
