"""Reports distinguish evidence quality, acquisition availability, actual cost and reserved bounds."""
from collections import Counter
import csv
import io
import json
import math
import shutil
import time
from itertools import combinations
from urllib.parse import urlsplit

from bench.config import HOURS_PER_MONTH
from bench.metrics import summarize
from bench.processing import wilson

UNATTEMPTED = {"not_tested", "skipped_budget"}


def percentile95(values):
    return sorted(values)[max(0, math.ceil(.95 * len(values))-1)] if values else None


def reported_score(step, score, reference):
    # Older saved steps may contain both a processing error and a stale score.
    if step.get("processing_error"):
        return {"label": "FAIL" if reference else "AUTO_FAIL", "verified": bool(reference)}
    return score


def cost_model(config):
    monthly = config.get("costs", {}).get("server_monthly_usd")
    concurrency = config["limits"]["concurrency"]
    per_ms = None if monthly is None else monthly / HOURS_PER_MONTH / 3_600_000 / concurrency
    return {"server_monthly_usd": monthly, "concurrency": concurrency, "allocation": "slot_time",
            "server_usd_per_slot_hour": None if per_ms is None else per_ms * 3_600_000,
            "method": "Active acquisition and processing milliseconds x server hourly rate / configured concurrency. "
                      "Idle time between runs is not allocated to candidates; report it in the campaign total.",
            "per_ms": per_ms}


def costs(rows, per_ms):
    """Provider charges count once per attempt; acquisition server time once per attempt, processing per row."""
    attempted = [row for row in rows if row["status"] not in UNATTEMPTED]
    attempts = {row["spend_id"] or (row["job"], row["route"]): row for row in attempted}
    actual = sum(row["provider_actual_usd"] for row in attempts.values() if row["provider_actual_usd"] is not None)
    unreconciled = sum(row["provider_reserved_usd"] or 0 for row in attempts.values() if not row["cost_reconciled"])
    server = None
    if per_ms is not None:
        server = (sum(row["acquisition_ms"] for row in attempts.values()) + sum(row["processing_ms"] or 0 for row in attempted)) * per_ms
    return {"provider_actual_usd": actual, "provider_unreconciled_reserved_usd": unreconciled, "server_allocated_usd": server,
            "all_provider_charges_reconciled": all(row["cost_reconciled"] for row in attempts.values())}


def cost_per_usable(block, usable):
    if block["server_allocated_usd"] is None: status = "SERVER_COST_NOT_CONFIGURED"
    elif not block["all_provider_charges_reconciled"]: status = "UNRECONCILED_PROVIDER_CHARGES"
    elif not usable: status = "NO_USABLE_RESULTS"
    else: status = "RECONCILED"
    known = block["provider_actual_usd"] + (block["server_allocated_usd"] or 0)
    return {"cost_status": status, "usable_results": usable,
            "cost_per_usable_result_usd": known / usable if status == "RECONCILED" else None,
            "cost_per_usable_result_upper_bound_usd": (known + block["provider_unreconciled_reserved_usd"]) / usable
                if usable and block["server_allocated_usd"] is not None else None}


def generate(state, run):
    manifest, jobs = state.manifest(run), state.jobs(run)
    config = manifest["config"]
    model = cost_model(config)
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
            charge = charges.get(step.get("spend_id"), {})
            for extractor in extractors:
                extraction = step.get("extractions", {}).get(extractor, {})
                score = reported_score(step, extraction.get("score", {}) if article else step.get("source_score", {}), spec["reference"])
                label = score.get("label", "FAIL" if (step["status"] == "failed" or step.get("processing_error")) and spec["reference"] else "UNSCORED")
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
                    "cost_bound_or_actual_usd": cost, "cost_reconciled": charge.get("actual") is not None or not charge,
                    "provider_actual_usd": charge.get("actual"), "provider_reserved_usd": charge.get("reserved"),
                    "server_allocated_usd": None if model["per_ms"] is None else combined_ms * model["per_ms"],
                    "capped": step.get("coverage", {}).get("capped", False), "reason": step.get("reason", step.get("processing_error")),
                    "browser_network": step.get("coverage", {}).get("network"),
                    "score": score, "spend_id": step.get("spend_id")}
                rows.append(row)
                groups.setdefault(f"{step['route']} / {target['kind']} / {extractor}", []).append(row)
        if spec.get("chain"):
            final = next((step for step in reversed(steps) if step.get("validation", {}).get("accepted")), None)
            chain_charges = [charges.get(step.get("spend_id"), {}) for step in steps]
            chains.append({"target": target["id"], "candidate": spec["candidate"], "repetition": spec["repetition"],
                "accepted": bool(final), "selected_route": final["route"] if final else None,
                "duration_ms": result.get("duration_ms"), "attempted_routes": [step["route"] for step in steps],
                "final_scores": {name: reported_score(final, extraction.get("score", {}), spec["reference"]) for name, extraction in (final or {}).get("extractions", {}).items()},
                "processing_error": (final or {}).get("processing_error"),
                "cost_bound_or_actual_usd": sum((charge.get("actual") if charge.get("actual") is not None else charge.get("reserved", 0)) for charge in chain_charges),
                "provider_actual_usd": sum(charge["actual"] for charge in chain_charges if charge.get("actual") is not None),
                "provider_unreconciled_reserved_usd": sum(charge.get("reserved", 0) for charge in chain_charges if charge and charge.get("actual") is None),
                "server_allocated_usd": None if model["per_ms"] is None else sum(step["duration_ms"] for step in steps) * model["per_ms"]})
    summaries = {}
    for key, members in groups.items():
        independent = {row["input"]: row for row in members if row["quality_verified"] and not row["calibration"] and row["repetition"] == 0 and row["label"] != "SOURCE_CHANGED"}
        labels = Counter(row["label"] for row in independent.values())
        n, usable = len(independent), labels["PASS"] + labels["PARTIAL"]
        bounds = wilson(usable, n)
        attempted = [row for row in members if row["status"] not in UNATTEMPTED]
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
        verified_costs = costs(list(independent.values()), model["per_ms"])
        summaries[key] = {"attempts": len(members), "states": dict(Counter(row["status"] for row in members)),
            "labels": dict(Counter(row["label"] for row in members)), "unique_unseen": n, "unique_labels": dict(labels),
            "usable_wilson95": bounds if article else None, "pass_rate": labels["PASS"] / n if n else None,
            "false_success": labels["FALSE_SUCCESS"], "quality_gate": gate,
            "p95_acquisition_ms": percentile95([row["acquisition_ms"] for row in attempted]),
            "p95_combined_ms": p95, "p95_successful_combined_ms": successful_p95,
            "p95_queue_ms": percentile95([row["queue_ms"] for row in members]),
            "cost_bound_or_actual_usd": cost, "verified_cohort_cost_bound_or_actual_usd": verified_cost,
            "costs": costs(members, model["per_ms"]), "verified_cohort_costs": verified_costs,
            **cost_per_usable(verified_costs, usable),
            "all_costs_reconciled": all(row["cost_reconciled"] for row in attempted),
            "capped_attempts": sum(row["capped"] for row in members),
            "extractor_date_correct": dict(Counter(str(row["score"].get("extractor_date_correct")) for row in independent.values())) if article else None,
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
            pair_costs = {}
            for candidate in (left, right):
                members = [row for row in rows if row["kind"] == kind and row["route"] == candidate and (row["target"], row["repetition"]) in common]
                attempts = {row["spend_id"]: row for row in members}
                pair_costs[candidate] = {"cost_bound_or_actual_usd": sum(row["cost_bound_or_actual_usd"] or 0 for row in attempts.values()),
                                         "all_reconciled": all(row["cost_reconciled"] for row in attempts.values()), **costs(members, model["per_ms"])}
            comparisons[left + " / " + right] = {"matched_count": len(common), "tasks": sorted(common), "costs": pair_costs}
        matched[kind]["pairwise"] = comparisons
    beat = state.db.execute("SELECT at FROM heartbeat WHERE run=?", (run,)).fetchone()
    processing_version_row = state.db.execute("SELECT detail FROM events WHERE run=? AND kind='processing_versions' ORDER BY id DESC LIMIT 1", (run,)).fetchone()
    processing_versions = json.loads(processing_version_row[0]) if processing_version_row else None
    samples = [json.loads(row[0]) for row in state.db.execute("SELECT detail FROM events WHERE run=? AND kind IN ('resource_sample','resource_final') ORDER BY id", (run,))]
    output = {"run": run, "config_sha256": manifest.get("config_sha256"), "versions": manifest.get("versions"),
        "acquisition_versions": manifest.get("versions"), "processing_versions": processing_versions,
        "mode": config["mode"], "job_states": dict(Counter(job["status"] for job in jobs)), "stopped": state.stopped(run),
        "heartbeat_age_seconds": round(time.time()-beat[0], 1) if beat else None,
        "free_disk_bytes": shutil.disk_usage(state.root).free,
        "groups": summaries, "matched_cohorts": matched, "chains": chains, "spend": spend,
        "reserved_or_reconciled_usd": sum(row["actual"] if row["actual"] is not None else row["reserved"] for row in spend),
        "provider_actual_usd": sum(row["actual"] for row in spend if row["actual"] is not None),
        "provider_unreconciled_reserved_usd": sum(row["reserved"] for row in spend if row["actual"] is None),
        "cost_model": {key: value for key, value in model.items() if key != "per_ms"},
        "resource_summary": summarize(samples),
        "capacity_stops": [json.loads(row[0]) for row in state.db.execute("SELECT detail FROM events WHERE run=? AND kind='capacity_stop' ORDER BY id", (run,))],
        "resource_samples": samples,
        "notes": ["Synthetic offline results validate the harness, not provider performance.",
                  "Cost per usable result is reported only after provider charges are reconciled and a server cost is configured; reserved ceilings are bounds, not costs.",
                  "Publication age measures returned posts, not discovery delay. Complete recall needs an independent reference for the same collection window.",
                  "Numeric gates do not validate legal access, billing bounds, cross-region behavior or Cloudflare deployment."],
        "rows": rows, "jobs": jobs}
    state.write_report(run, "report.json", output)
    csv_output = io.StringIO(newline="")
    columns = ["job", "candidate", "route", "extractor", "target", "kind", "domain", "language", "repetition", "calibration", "status", "label",
               "queue_ms", "acquisition_ms", "processing_ms", "combined_ms", "provider_actual_usd", "provider_reserved_usd", "cost_reconciled",
               "server_allocated_usd", "cost_bound_or_actual_usd", "capped", "browser_network", "reason"]
    writer = csv.DictWriter(csv_output, fieldnames=columns, extrasaction="ignore")
    writer.writeheader(); writer.writerows(rows)
    state.write_report(run, "attempts.csv", csv_output.getvalue())
    resources = output["resource_summary"]
    lines = [f"# Benchmark {run}", "", f"Mode: {config['mode']}. Jobs: {output['job_states']}.", "",
        "| Candidate / task / parser | Attempts | Labels | Unseen inputs | p95 combined ms | Evidence gate | Cost per usable result | Cost status |",
        "|---|---:|---|---:|---:|---|---:|---|"]
    for key, group in summaries.items():
        lines.append(f"| {key} | {group['attempts']} | {group['labels']} | {group['unique_unseen']} | {group['p95_combined_ms']} | {group['quality_gate']} | {group['cost_per_usable_result_usd']} | {group['cost_status']} |")
    server_line = (f"Server cost: {model['server_monthly_usd']} USD/month, allocated by slot time." if model["server_monthly_usd"] is not None
                   else "Server cost: not configured, so no cost per usable result is reported.")
    lines += ["", f"Provider charges: actual ${output['provider_actual_usd']:.4f}; unreconciled reservations ${output['provider_unreconciled_reserved_usd']:.4f}. " + server_line,
        f"Resources: peak process-tree RSS {resources.get('peak_tree_rss_bytes', 'unavailable')} bytes (Chromium {resources.get('peak_chromium_rss_bytes', 'unavailable')}, "
        f"Node {resources.get('peak_node_rss_bytes', 'unavailable')}); minimum available memory {resources.get('min_available_memory_bytes', 'unavailable')} bytes; "
        f"maximum host CPU {resources.get('max_host_cpu_fraction', 'unavailable')}. Capacity stops: {len(output['capacity_stops'])}.", "",
        "Use report.json for per-item checks, matched cohorts, failure reasons, recovery state, costs and artifacts. attempts.csv supports spreadsheet comparison.", "",
        "Unreconciled reservations are conservative bounds, not costs. Disabled, pending and unscored results are not successful tests."]
    state.write_report(run, "report.md", "\n".join(lines) + "\n")
    return output
