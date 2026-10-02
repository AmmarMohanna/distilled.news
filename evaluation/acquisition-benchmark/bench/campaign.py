"""Campaign accounting across the shared ledger, including repetitions and idle VPS cost."""
from collections import Counter
import math

from bench.reporting import generate


def report_campaign(state, server_total_usd, server_cost_evidence):
    if not math.isfinite(server_total_usd) or server_total_usd < 0:
        raise ValueError("Server total must be finite and nonnegative")
    if not server_cost_evidence.strip():
        raise ValueError("Describe the server billing period and allocation, including idle time")
    with state.dispatch_lock():
        runs = [row[0] for row in state.db.execute("SELECT id FROM runs ORDER BY created,id")]
        if not runs: raise ValueError("No runs in the campaign ledger")
        rows, jobs = [], []
        for run in runs:
            # Parent schedules contain no acquisition jobs, but their children are included.
            if not state.jobs(run): continue
            report = generate(state, run)
            rows.extend(report["rows"])
            jobs.extend(report["jobs"])
        spend = [dict(row) for row in state.db.execute("SELECT * FROM spend ORDER BY job")]
        actual = sum(row["actual"] for row in spend if row["actual"] is not None)
        unreconciled = [row for row in spend if row["actual"] is None]
        unresolved = [job["id"] for job in jobs if job["status"] not in {"complete", "skipped"}]
        # One usable acquisition per job: alternative extractors and fallback steps do not multiply outputs.
        usable = {row["job"] for row in rows if row["status"] == "captured" and row["quality_verified"]
                  and row["label"] in {"PASS", "PARTIAL"}}
        unverified = {row["job"] for row in rows if row["status"] == "captured" and not row["quality_verified"]} - usable
        status = ("UNRESOLVED_JOBS" if unresolved else "UNRECONCILED_PROVIDER_CHARGES" if unreconciled
                  else "INCOMPLETE_QUALITY_EVIDENCE" if unverified else "NO_USABLE_RESULTS" if not usable else "RECONCILED")
        output = {
            "scope": "Every run in this data directory; all repetitions and calibration jobs included",
            "runs": runs, "job_states": dict(Counter(job["status"] for job in jobs)),
            "provider_actual_usd": actual,
            "provider_unreconciled_reserved_usd": sum(row["reserved"] for row in unreconciled),
            "unreconciled_spend_ids": [row["job"] for row in unreconciled], "unresolved_job_ids": unresolved,
            "unverified_job_ids": sorted(unverified), "server_total_usd": server_total_usd,
            "server_cost_evidence": server_cost_evidence,
            "server_cost_basis": "Operator-supplied campaign allocation including idle time; replaces slot-time estimates",
            "known_total_usd": actual + server_total_usd, "usable_acquisitions": len(usable),
            "cost_status": status,
            "cost_per_usable_acquisition_usd": (actual + server_total_usd) / len(usable) if status == "RECONCILED" else None,
            "notes": ["Source acquisitions are collection jobs, not individual posts.",
                      "This is campaign expenditure, not a matched provider ranking. Use individual reports for matched comparisons.",
                      "Unresolved provider work may incur further charges; reservations are not final bills."],
        }
        state.write_report("campaign-costs", "report.json", output)
        state.write_report("campaign-costs", "report.md", "\n".join([
            "# Campaign costs", "", output["scope"], "",
            f"Status: {status}. Usable acquisitions: {len(usable)}.",
            f"Reconciled provider charges: ${actual:.4f}.",
            f"Unreconciled reservations: ${output['provider_unreconciled_reserved_usd']:.4f}.",
            f"Server allocation including idle time: ${server_total_usd:.4f}. Evidence: {server_cost_evidence}",
            f"Cost per usable acquisition: {output['cost_per_usable_acquisition_usd']}", "",
            "See report.json for unresolved jobs and unreconciled spending. This is not a provider ranking.", ""]))
        return output
