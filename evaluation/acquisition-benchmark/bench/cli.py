from __future__ import annotations

import argparse
import asyncio
import copy
from datetime import datetime, timedelta, timezone
from importlib import util
import json
import os
from pathlib import Path
import shutil
import sys
import time

from bench import adapters
from bench.config import credentials, identifier, load, digest
from bench.routes import browser_playwright
from bench.runner import Runner, plan, process_run, report, versions
from bench.state import State


def preflight(config):
    creds = credentials(config.get("credentials_file"))
    checks = []
    needed = {"telethon": ("telethon", "TELEGRAM_API_HASH"), "zyte_http": (None, "ZYTE_API_KEY"),
              "brightdata_unlocker": (None, "BRIGHTDATA_API_TOKEN"), "brightdata_social": (None, "BRIGHTDATA_API_TOKEN"),
              "apify": (None, "APIFY_TOKEN"), "x_api": (None, "X_BEARER_TOKEN"), "linkedin_api": (None, "LINKEDIN_ACCESS_TOKEN"),
              "browser_playwright": ("playwright", None)}
    for route in config["routes"]:
        issues = []
        if not route["enabled"]:
            checks.append({"route": route["id"], "status": "DISABLED"}); continue
        if config["mode"] == "live":
            module, env = needed.get(route["adapter"], (None, None))
            env = route["settings"].get("credential_env", env)
            if module and util.find_spec(module) is None: issues.append("missing package " + module)
            if env and not creds.get(env): issues.append("missing environment variable " + env)
            settings = route["settings"]
            if route["adapter"] == "brightdata_unlocker" and not (settings.get("zone") or creds.get("BRIGHTDATA_UNLOCKER_ZONE")):
                issues.append("Bright Data Unlocker zone required")
            if route["adapter"] == "apify" and not (settings.get("actor_id") or settings.get("task_id")): issues.append("actor_id or task_id required")
            if route["adapter"] == "brightdata_social" and not settings.get("dataset_id"): issues.append("dataset_id required")
            if route["adapter"] == "linkedin_api" and not settings.get("linkedin_version"): issues.append("linkedin_version required")
            if route["adapter"] == "linkedin_api" and not settings.get("authorized_read_confirmed"): issues.append("authorized read access must be confirmed")
            for target in config["targets"]:
                if route["id"] not in target["routes"]: continue
                if "REPLACE" in json.dumps(target): issues.append("replace example inputs for " + target["id"])
                if route["adapter"] == "telethon" and not all(target.get("options", {}).get(key) for key in ("start_time", "end_time")): issues.append("Telegram time window required")
                try:
                    from bench.config import template
                    template(settings.get("input", {}), target)
                except ValueError as error: issues.append(str(error))
            if route["adapter"] == "telethon":
                if not creds.get("TELEGRAM_API_ID") or not creds.get("TELEGRAM_SESSION_PATH"): issues.append("Telegram ID/session path required")
                elif not Path(creds["TELEGRAM_SESSION_PATH"]).expanduser().exists(): issues.append("Telegram login session absent")
            if route["adapter"] == "browser_playwright" and settings.get("network", "isolated") == "isolated" and not browser_playwright.isolation_available():
                issues.append("Linux unshare required for the isolated browser; run server-check")
        checks.append({"route": route["id"], "status": "NOT_READY" if issues else "READY", "issues": issues})
    if config["mode"] == "live" and config.get("costs", {}).get("server_monthly_usd") is None:
        checks.append({"check": "server_cost", "status": "NOT_READY",
                       "issues": ["Set costs.server_monthly_usd so cost per usable result includes the server; unpaid routes are not free"]})
    if config.get("schedule", {}).get("rolling_window_hours"):
        for target in config["targets"]:
            if target["kind"] == "article" or not target.get("reference"): continue
            try: complete = json.loads(Path(target["reference"]).read_text(encoding="utf-8")).get("complete_window")
            except (OSError, ValueError): continue
            if complete:
                checks.append({"check": "reference_window", "target": target["id"], "status": "NOT_READY",
                               "issues": ["A fixed complete reference cannot match rolling round windows; use schedule.references_dir or attach-reference per round"]})
    for extractor in config["extractors"]:
        if extractor == "trafilatura" and util.find_spec("trafilatura") is None: checks.append({"extractor": extractor, "status": "NOT_READY", "issues": ["Install .[extract]"]})
        if extractor == "readability" and (not shutil.which("node") or not (Path(__file__).resolve().parent.parent / "node/node_modules/@mozilla/readability").exists()):
            checks.append({"extractor": extractor, "status": "NOT_READY", "issues": ["Node 24+ and npm ci --prefix node required"]})
    if any(route["enabled"] and route["adapter"] in {"rss", "google_news_rss", "telegram_public", "apify"} and route["settings"].get("parser") != "feedparser" for route in config["routes"]):
        import subprocess
        try:
            version = subprocess.run(["node", "--version"], capture_output=True, text=True, timeout=5, check=True).stdout.strip()
            if int(version.lstrip("v").split(".")[0]) < 24: raise ValueError("old_node")
        except (OSError, ValueError, subprocess.SubprocessError): checks.append({"status": "NOT_READY", "issues": ["Baseline parser bridge requires Node 24+"]})
    if any(route["enabled"] and route["settings"].get("parser") == "feedparser" for route in config["routes"]) and util.find_spec("feedparser") is None:
        checks.append({"status": "NOT_READY", "issues": ["Install .[sources]"]})
    return {"checks": checks, "ready": not any(row["status"] == "NOT_READY" for row in checks), "mode": config["mode"],
            "enabled_routes": sum(route["enabled"] for route in config["routes"]), "versions": versions(), "network_calls": 0}


async def collect(config, run_id, selection="all", chains=False):
    if not preflight(config)["ready"]: raise ValueError("Preflight failed; run preflight for missing configuration/dependencies")
    manifest = plan(config, selection, chains)
    state = State(Path(config["data_dir"]))
    try:
        state.create_run(run_id, {key: value for key, value in manifest.items() if key != "jobs"}, manifest["jobs"])
        await Runner(state, config).run(run_id)
        return report(state, run_id)
    finally: state.close()


async def schedule(config, run_id):
    state = State(Path(config["data_dir"]))
    try:
        with state.dispatch_lock("schedule"):
            return await scheduled_rounds(config, run_id, state)
    finally: state.close()


async def scheduled_rounds(config, run_id, state):
    if not preflight(config)["ready"]: raise ValueError("Preflight failed")
    schedule_config = config.get("schedule", {})
    interval = schedule_config.get("interval_seconds", 86400)
    rounds = schedule_config.get("rounds", 7)
    if not isinstance(interval, (int, float)) or interval < 1 or not isinstance(rounds, int) or not 1 <= rounds <= 1000:
        raise ValueError("Bound schedule interval >= 1 second and rounds 1..1000")
    schedule_id = run_id + "-schedule"
    try:
        try: state.create_run(schedule_id, {"config": config, "schedule": True}, [])
        except __import__('sqlite3').IntegrityError:
            if digest(state.manifest(schedule_id)["config"]) != digest(config): raise ValueError("Existing schedule configuration changed; use its original configuration or a new run ID")
        anchor = state.db.execute("SELECT created FROM runs WHERE id=?", (schedule_id,)).fetchone()[0]
        for index in range(rounds):
            child = f"{run_id}-r{index:03}"
            due = anchor + index * interval
            while time.time() < due:
                if state.stopped(schedule_id): return {"schedule": schedule_id, "stopped": True}
                state.beat(schedule_id)
                await asyncio.sleep(min(5, due-time.time()))
            if state.stopped(schedule_id): break
            if state.db.execute("SELECT 1 FROM runs WHERE id=?", (child,)).fetchone():
                child_config = state.manifest(child)["config"]
                await Runner(state, child_config).run(child, resume=True)
            else:
                round_config = copy.deepcopy(config)
                round_config["parent_run"] = schedule_id
                round_config["targets"] += round_config.get("targets_by_round", {}).get(str(index), [])
                if schedule_config.get("daily_targets_dir"):
                    daily = Path(schedule_config["daily_targets_dir"]) / f"round-{index:03}.json"
                    if daily.exists():
                        additions = json.loads(daily.read_text(encoding="utf-8"))
                        web_routes = {route["id"] for route in config["routes"] if route["adapter"] in {"direct_http", "zyte_http", "brightdata_unlocker", "browser_playwright"}}
                        ids = {target["id"] for target in round_config["targets"]}
                        if not isinstance(additions, list) or len(additions) > 100: raise ValueError("Daily targets must be a list of at most 100 article inputs")
                        for target in additions:
                            from bench.config import reject_secrets
                            reject_secrets(target)
                            target_routes = target.get("routes", [])
                            if (identifier(target["id"]) in ids or target.get("kind") != "article" or not target.get("input")
                                    or not target_routes or len(set(target_routes)) != len(target_routes) or not set(target_routes) <= web_routes):
                                raise ValueError("Invalid/duplicate daily article target")
                            ids.add(target["id"])
                            for field in ("reference", "fixture"):
                                if target.get(field): target[field] = str((daily.parent / target[field]).resolve())
                        round_config["targets"] += additions
                        state.event(schedule_id, None, "daily_targets_loaded", {"round": index, "sha256": digest(additions), "count": len(additions)})
                    else: state.event(schedule_id, None, "daily_targets_missing", {"round": index})
                if schedule_config.get("rolling_window_hours"):
                    end = datetime.fromtimestamp(due, timezone.utc)
                    start = end - timedelta(hours=float(schedule_config["rolling_window_hours"]))
                    for target in round_config["targets"]:
                        target.setdefault("options", {}).update(start_time=start.isoformat(), end_time=end.isoformat())
                if schedule_config.get("references_dir"):
                    # Round-specific references replace fixed ones; scoring still checks each declared window.
                    folder = Path(schedule_config["references_dir"]) / f"round-{index:03}"
                    loaded = {}
                    for target in round_config["targets"]:
                        path = folder / f"{identifier(target['id'])}.json"
                        if path.is_file():
                            target["reference"] = str(path.resolve())
                            loaded[target["id"]] = __import__("hashlib").sha256(path.read_bytes()).hexdigest()
                    state.event(schedule_id, None, "round_references_loaded", {"round": index, "references": loaded})
                manifest = plan(round_config)
                state.create_run(child, {key: value for key, value in manifest.items() if key != "jobs"}, manifest["jobs"])
                await Runner(state, round_config).run(child)
            await process_run(state, child)
            state.event(schedule_id, None, "round_finished", {"run": child, "scheduled_at": due})
        return {"schedule": schedule_id, "rounds": rounds}
    finally: state.beat(schedule_id)


async def telegram_login(creds):
    from telethon import TelegramClient
    api_id, api_hash, session = (creds.get(key) for key in ("TELEGRAM_API_ID", "TELEGRAM_API_HASH", "TELEGRAM_SESSION_PATH"))
    if not all((api_id, api_hash, session)): raise ValueError("Provide Telegram API ID/hash/session path in credential file")
    path = Path(session).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    client = TelegramClient(str(path), int(api_id), api_hash)
    try:
        await client.start()
        return {"session_ready": True, "posts_sent": 0}
    finally: await asyncio.wait_for(client.disconnect(), timeout=5)


async def server_check(config):
    """Local readiness of the real host. Launches Chromium on inline HTML only; sends no acquisition requests."""
    import platform
    import subprocess
    checks = []
    limits = config["limits"]
    def add(name, ok, detail=None, required=True):
        checks.append({"check": name, "status": "READY" if ok else "NOT_READY" if required else "WARNING", "detail": detail})
    def command(*argv, timeout=10):
        try:
            done = subprocess.run(list(argv), capture_output=True, text=True, timeout=timeout)
            return done.returncode, (done.stdout or done.stderr).strip()[:300]
        except (OSError, subprocess.SubprocessError) as error:
            return None, type(error).__name__
    add("linux", sys.platform == "linux", platform.platform())
    add("python_3_12_plus", sys.version_info >= (3, 12), platform.python_version())
    code, output = command("node", "--version")
    add("node_24_plus", code == 0 and output.lstrip("v").split(".")[0].isdigit() and int(output.lstrip("v").split(".")[0]) >= 24, output)
    add("readability_installed", (Path(__file__).resolve().parents[1] / "node/node_modules/@mozilla/readability").exists())
    data_dir = Path(config["data_dir"])
    try:
        data_dir.mkdir(parents=True, exist_ok=True)
        probe = data_dir / f".server-check-{os.getpid()}"
        probe.write_bytes(b"ok"); probe.unlink()
        add("data_dir_writable", True, str(data_dir))
        free = shutil.disk_usage(data_dir).free
        add("free_disk_above_reserve", free >= limits["min_free_disk_bytes"], {"free_bytes": free, "reserve_bytes": limits["min_free_disk_bytes"]})
    except OSError as error:
        add("data_dir_writable", False, type(error).__name__)
    from bench.metrics import process_tree, snapshot
    sample = snapshot(data_dir if data_dir.exists() else Path.cwd())
    memory = sample.get("host_memory_bytes", {})
    add("host_memory_readable", "MemAvailable" in memory, memory)
    if "MemAvailable" in memory:
        add("available_memory_above_limit", memory["MemAvailable"] >= limits["min_available_memory_bytes"],
            {"available_bytes": memory["MemAvailable"], "limit_bytes": limits["min_available_memory_bytes"]})
    try: add("process_tree_measurement", process_tree()["processes"] >= 1)
    except (OSError, ValueError, AttributeError) as error: add("process_tree_measurement", False, type(error).__name__)
    code, output = command("timedatectl", "show", "-p", "NTPSynchronized", "--value")
    add("clock_synchronized", code == 0 and output == "yes", output, required=False)
    if config.get("credentials_file"):
        path = Path(config["credentials_file"])
        add("credentials_file_private", path.is_file() and path.stat().st_mode & 0o077 == 0,
            oct(path.stat().st_mode & 0o777) if path.exists() else "missing")
    try: session = credentials(config.get("credentials_file")).get("TELEGRAM_SESSION_PATH")
    except (OSError, ValueError): session = None
    if session and Path(session).expanduser().exists():
        add("telegram_session_private", Path(session).expanduser().stat().st_mode & 0o077 == 0, required=False)
    if config["mode"] == "live":
        add("server_cost_configured", config.get("costs", {}).get("server_monthly_usd") is not None)
    networks = {route["settings"].get("network", "isolated") for route in config["routes"] if route["enabled"] and route["adapter"] == "browser_playwright"}
    namespace_ok = False
    if "isolated" in networks:
        code, output = command("unshare", "--user", "--map-root-user", "--net", "true")
        namespace_ok = code == 0
        add("user_network_namespace", namespace_ok, output or "ok")
    for network in sorted(networks):
        if network == "isolated" and not namespace_ok: continue
        try:
            from playwright.async_api import async_playwright
            async with asyncio.timeout(60):
                async with async_playwright() as playwright:
                    browser = await browser_playwright.launch(playwright, data_dir, network)
                    try:
                        page = await browser.new_page()
                        await page.set_content("<html><title>Benchmark ready</title><body>Local check</body></html>")
                        add(f"chromium_launch_{network}", await page.title() == "Benchmark ready", browser.version)
                    finally: await browser.close()
        except Exception as error:
            add(f"chromium_launch_{network}", False, f"{type(error).__name__}: {str(error)[:200]}")
    if "standard" in networks:
        confirmed = all(route["settings"].get("host_egress_firewall_confirmed") is True for route in config["routes"]
                        if route["enabled"] and route["settings"].get("network") == "standard")
        add("host_egress_firewall_confirmed", confirmed, "Verify with the administrator; this check does not probe private addresses",
            required=config["mode"] == "live")
    return {"checks": checks, "ready": not any(check["status"] == "NOT_READY" for check in checks), "acquisition_requests": 0}


def main(argv=None):
    os.umask(0o077)
    parser = argparse.ArgumentParser(description="Distilled source acquisition benchmark")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("preflight", "server-check", "plan", "fetch", "collect", "run", "chains", "schedule", "validate-gold"):
        sub = commands.add_parser(name)
        sub.add_argument("--config", required=True, type=Path)
        if name in {"fetch", "collect", "run", "chains", "schedule"}: sub.add_argument("--run-id", required=True)
        if name == "plan": sub.add_argument("--output", type=Path)
    for name in ("extract", "normalize", "score", "process", "report", "status", "stop", "resume"):
        sub = commands.add_parser(name)
        sub.add_argument("--data-dir", type=Path, default=Path("data"))
        sub.add_argument("--run-id", required=True)
    reconcile = commands.add_parser("reconcile")
    reconcile.add_argument("--data-dir", type=Path, default=Path("data"))
    reconcile.add_argument("--spend-id", required=True)
    reconcile.add_argument("--actual-usd", required=True, type=float)
    reconcile.add_argument("--evidence", required=True)
    attach = commands.add_parser("attach-remote")
    attach.add_argument("--data-dir", type=Path, default=Path("data"))
    attach.add_argument("--job-id", required=True)
    attach.add_argument("--route-id", required=True)
    attach.add_argument("--remote-id", required=True)
    attach.add_argument("--evidence", required=True)
    resolve = commands.add_parser("resolve-job")
    resolve.add_argument("--data-dir", type=Path, default=Path("data"))
    resolve.add_argument("--job-id", required=True)
    resolve.add_argument("--evidence", required=True)
    reference = commands.add_parser("attach-reference")
    reference.add_argument("--data-dir", type=Path, default=Path("data"))
    reference.add_argument("--run-id", required=True)
    reference.add_argument("--target-id", required=True)
    reference.add_argument("--reference", type=Path, required=True)
    auth = commands.add_parser("telegram-login")
    auth.add_argument("--credentials-file", required=True)
    faults = commands.add_parser("faults")
    faults.add_argument("--output", type=Path)
    gold = commands.add_parser("compare-gold")
    gold.add_argument("--first", type=Path, required=True)
    gold.add_argument("--second", type=Path, required=True)
    discovery = commands.add_parser("discover")
    discovery.add_argument("--data-dir", type=Path, default=Path("data"))
    discovery.add_argument("--run-id", required=True)
    discovery.add_argument("--limit", type=int, default=20)
    discovery.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "compare-gold":
            from bench.gold import compare
            output = compare(args.first, args.second)
        elif args.command == "telegram-login": output = asyncio.run(telegram_login(credentials(args.credentials_file)))
        elif args.command == "faults":
            from bench.faults import run_faults
            output = asyncio.run(run_faults())
            if args.output:
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
        elif hasattr(args, "config"):
            config = load(args.config)
            if args.command == "preflight": output = preflight(config)
            elif args.command == "server-check": output = asyncio.run(server_check(config))
            elif args.command == "validate-gold":
                from bench.gold import validate
                output = validate(config)
            elif args.command == "plan":
                output = plan(config)
                if args.output:
                    args.output.parent.mkdir(parents=True, exist_ok=True)
                    args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
            elif args.command == "schedule": output = asyncio.run(schedule(config, identifier(args.run_id)))
            else:
                output = asyncio.run(collect(config, identifier(args.run_id), {"fetch": "web", "collect": "sources"}.get(args.command, "all"), args.command == "chains"))
        else:
            state = State(args.data_dir)
            try:
                if args.command == "attach-reference":
                    if args.reference.stat().st_size > 10 * 1024 * 1024: raise ValueError("Reference too large")
                    reference_data = json.loads(args.reference.read_text(encoding="utf-8"))
                    if not isinstance(reference_data, dict): raise ValueError("Reference must be an object")
                    updated = 0
                    with state.dispatch_lock():
                        for job in state.jobs(args.run_id):
                            if job["spec"]["target"]["id"] != args.target_id: continue
                            spec = job["spec"]
                            state.event(args.run_id, job["id"], "reference_updated", {"old": spec["reference"], "new_sha256": digest(reference_data)})
                            spec.update(reference=reference_data, reference_sha256=digest(reference_data))
                            state.db.execute("UPDATE jobs SET spec=? WHERE id=?", (json.dumps(spec), job["id"]))
                            updated += 1
                    if not updated: raise ValueError("Target not found in run")
                    from bench.score import collection_window, window_check
                    target = spec["target"]
                    output = {"updated_jobs": updated, "next": "Run score or process; acquisition is unchanged", "network_calls": 0,
                              "collection_window": collection_window(target),
                              "reference_window_error": None if target["kind"] == "article" else window_check(reference_data, target)}
                elif args.command == "discover":
                    from bench.gold import discover
                    if not 1 <= args.limit <= 100: raise ValueError("Discovery limit must be 1..100")
                    targets = discover(state, args.run_id, args.limit)
                    args.output.parent.mkdir(parents=True, exist_ok=True)
                    args.output.write_text(json.dumps(targets, ensure_ascii=False, indent=2), encoding="utf-8")
                    output = {"targets": len(targets), "output": str(args.output), "network_calls": 0}
                elif args.command == "reconcile":
                    with state.dispatch_lock():
                        active = state.db.execute("SELECT status FROM jobs WHERE substr(?,1,length(id)+2)=id || '__'", (args.spend_id,)).fetchone()
                        if active and active[0] not in {"complete", "skipped"}: raise ValueError("Finish or resolve the job before reconciling final billing")
                        output = {"exceeded_reservation": state.reconcile(args.spend_id, args.actual_usd, args.evidence)}
                elif args.command == "resolve-job":
                    with state.dispatch_lock():
                        row = state.db.execute("SELECT * FROM jobs WHERE id=?", (args.job_id,)).fetchone()
                        if row is None or row["status"] not in {"pending", "uncertain", "running"}: raise ValueError("Job is not unresolved")
                        if not args.evidence.strip(): raise ValueError("Provider status/billing evidence required")
                        result = json.loads(row["result"]) if row["result"] else {"steps": []}
                        inflight = result.pop("inflight", None)
                        if inflight:
                            inflight.update(status="failed", reason="manually_resolved")
                            result["steps"].append(inflight)
                        result["manual_resolution"] = args.evidence
                        state.set_job(args.job_id, "complete", result)
                        state.event(row["run"], args.job_id, "manual_resolution", {"evidence": args.evidence})
                        output = {"resolved": True, "provider_cancellation": "must already be confirmed externally; no cancellation request sent"}
                elif args.command == "attach-remote":
                    with state.dispatch_lock():
                        row = state.db.execute("SELECT spec,run,status,result,remote FROM jobs WHERE id=?", (args.job_id,)).fetchone()
                        if row is None: raise ValueError("Unknown job")
                        if row["status"] not in {"pending", "uncertain", "running"} or not args.evidence.strip(): raise ValueError("Attach only unresolved jobs, with provider evidence")
                        spec = json.loads(row["spec"])
                        result = json.loads(row["result"]) if row["result"] else {"steps": []}
                        remote = json.loads(row["remote"]) if row["remote"] else None
                        if remote and remote.get("id"): raise ValueError("Remote ID already recorded; refusing to overwrite recovery state")
                        expected_route = (result.get("inflight") or {}).get("route")
                        if expected_route is None and len(result.get("steps", [])) < len(spec["routes"]):
                            expected_route = spec["routes"][len(result.get("steps", []))]["id"]
                        if expected_route != args.route_id or (remote and remote.get("route_id") not in {None, args.route_id}):
                            raise ValueError("Remote ID route does not match the unresolved attempt")
                        route = next((route for route in spec["routes"] if route["id"] == args.route_id), None)
                        if route is None or route["adapter"] not in {"apify", "brightdata_social"}: raise ValueError("Only async provider jobs can be attached")
                        state.remote(args.job_id, {"id": args.remote_id, "route_id": args.route_id, "provider": route["adapter"]})
                        state.set_job(args.job_id, "pending")
                        state.event(row["run"], args.job_id, "remote_attached", {"remote_id": args.remote_id, "evidence": args.evidence})
                    output = {"attached": True, "job": args.job_id}
                elif args.command == "stop": state.stop(args.run_id); output = {"dispatch_stopped": True, "remote_jobs": "retained for reconciliation; local stop does not cancel provider billing"}
                elif args.command == "resume":
                    state.stop(args.run_id, False)
                    asyncio.run(Runner(state, state.manifest(args.run_id)["config"]).run(args.run_id, resume=True))
                    output = report(state, args.run_id)
                elif args.command in {"report", "status"}: output = report(state, args.run_id)
                else: output = asyncio.run(process_run(state, args.run_id, {"process": "all"}.get(args.command, args.command)))
            finally: state.close()
        # Keep terminal output short; complete results are saved under reports/.
        if "jobs" in output and args.command != "plan": output = {key: value for key, value in output.items() if key not in {"jobs", "groups", "spend", "rows", "chains", "matched_cohorts", "resource_samples"}}
        print(json.dumps(output, ensure_ascii=False, indent=2))
        if args.command in {"preflight", "server-check", "faults"} and not output.get("ready", output.get("passed", True)): return 1
        if args.command == "validate-gold" and not output["valid"]: return 1
        if args.command == "compare-gold" and not output["meets_body_agreement_threshold"]: return 1
        return 0
    except (ValueError, OSError, RuntimeError, KeyError) as error:
        print(json.dumps({"error": type(error).__name__, "detail": str(error)}), file=sys.stderr)
        return 1


if __name__ == "__main__": raise SystemExit(main())
