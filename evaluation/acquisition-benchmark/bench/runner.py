"""Common durable execution engine. Provider work is explicit; replay is offline."""
from __future__ import annotations

import asyncio
from contextlib import AsyncExitStack
from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
from importlib import metadata
import json
from pathlib import Path
import random
import shutil
import time
import platform
from urllib.parse import urlsplit

from bench import adapters, processing
from bench.config import PAID, canonical, credentials, digest, identifier
from bench.network import Http
from bench.state import State


def versions():
    result = {"python": platform.python_version(), "platform": platform.platform()}
    for name in ("httpx", "httpcore", "zstandard", "PyYAML", "trafilatura", "feedparser", "Telethon", "playwright"):
        try: result[name] = metadata.version(name)
        except metadata.PackageNotFoundError: result[name] = None
    root = Path(__file__).resolve().parents[1]
    files = list((root / "bench").rglob("*.py")) + [root / "node/transform.mjs", root / "node/package-lock.json"]
    files += list((root.parents[1] / "packages/connectors/src").glob("*.ts"))
    result["code_sha256"] = hashlib.sha256(b"".join(str(path.relative_to(root.parents[1])).encode() + path.read_bytes() for path in sorted(files) if path.exists())).hexdigest()
    return result


def plan(config, selection="all", chains=False):
    routes = {route["id"]: route for route in config["routes"]}
    jobs = []
    for target in config["targets"]:
        if selection == "web" and target["kind"] != "article": continue
        if selection == "sources" and target["kind"] == "article": continue
        reference = json.loads(Path(target["reference"]).read_text(encoding="utf-8")) if target.get("reference") else None
        candidates = config.get("chains", []) if chains and target["kind"] == "article" else []
        if chains and target["kind"] != "article": continue
        if not chains: candidates = [{"id": route_id, "routes": [route_id]} for route_id in target["routes"]]
        for candidate in candidates:
            if not set(candidate["routes"]) <= set(target["routes"]): continue
            for repetition in range(config["repetitions"]):
                ordered = [routes[key] for key in candidate["routes"]]
                fixture_hashes = {}
                if config["mode"] == "offline":
                    for route in ordered:
                        fixture = target.get("fixtures", {}).get(route["id"], target.get("fixture"))
                        if fixture: fixture_hashes[route["id"]] = hashlib.sha256(Path(fixture).read_bytes()).hexdigest()
                jobs.append({"target": target, "routes": ordered, "candidate": candidate["id"], "reference": reference, "reference_sha256": digest(reference) if reference else None,
                             "repetition": repetition, "chain": chains, "deadline_seconds": candidate.get("deadline_seconds", config["limits"]["job_seconds"]),
                             "fixture_hashes": fixture_hashes})
    random.Random(config["seed"]).shuffle(jobs)
    ceiling = sum(route.get("cost_ceiling_usd", 0) for job in jobs for route in job["routes"] if route["enabled"] and config["mode"] == "live")
    return {"config": config, "config_sha256": digest(config), "versions": versions(),
            "planned_jobs": len(jobs), "planned_maximum_usd": ceiling, "jobs": jobs}


@dataclass
class Context:
    config: dict
    state: State
    http: Http
    run: str
    job: str
    target: dict
    route: dict
    credentials: dict
    remote: dict | None = None
    evidence: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    secrets: set = field(default_factory=set)
    reported_cost: float | None = None
    total_bytes: int = 0
    accounted_payloads: set = field(default_factory=set, repr=False)

    @property
    def limits(self): return self.config["limits"]

    def stopped(self):
        return self.state.stopped(self.run) or bool(self.config.get("parent_run") and self.state.stopped(self.config["parent_run"]))

    def set_remote(self, remote):
        self.remote = remote | {"route_id": self.route["id"]}
        self.state.remote(self.job, self.remote)

    def save(self, payload, info):
        # Request evidence and canonical payload can describe the same bytes.
        checksum = hashlib.sha256(payload).hexdigest()
        if checksum not in self.accounted_payloads:
            if self.total_bytes + len(payload) > self.limits["max_job_bytes"]: raise ValueError("job_byte_limit")
            self.total_bytes += len(payload)
            self.accounted_payloads.add(checksum)
        redacted = False
        for value in self.secrets:
            if value and value.encode() in payload:
                payload = payload.replace(value.encode(), b"[REDACTED]")
                redacted = True
        if redacted: info = info | {"credential_redaction": True}
        artifact = self.state.artifact(payload)
        self.evidence.append({"artifact": artifact, "metadata": info})
        self.state.event(self.run, self.job, "capture", self.evidence[-1])
        return artifact

    @property
    def dispatched(self): return bool(self.state.checkpoint("dispatched:" + self.job + ":" + self.route["id"]))


class Runner:
    def __init__(self, state: State, config: dict, creds=None, http=None):
        self.state, self.config = state, config
        self.credentials = creds if creds is not None else credentials(config.get("credentials_file"))
        self.http = http or Http(config["limits"])
        self.semaphore = asyncio.Semaphore(config["limits"]["concurrency"])
        self.browser_lock = asyncio.Lock()
        self.domain_locks = {}
        self.next_start = {}
        self.provider_locks = {}

    def domain_key(self, target, route):
        return urlsplit(target["input"]).hostname or {"telethon": "telegram-api", "telegram_public": "t.me"}.get(route["adapter"], route["provider"])

    async def paced(self, target, route):
        host = self.domain_key(target, route)
        lock = self.domain_locks.setdefault(host, asyncio.Lock())
        await lock.acquire()
        try:
            delay = self.next_start.get(host, 0) - time.monotonic()
            if delay > 0 and self.config["mode"] == "live": await asyncio.sleep(delay)
            return lock
        except BaseException:
            lock.release(); raise

    async def attempt(self, run, job, route, remote, remaining):
        spec, job_id = job["spec"], job["id"]
        spend_id = job_id + "__" + route["id"]
        base = {"route": route["id"], "adapter": route["adapter"], "provider": route["provider"],
                "spend_id": spend_id, "started_at": datetime.now(timezone.utc).isoformat(), "status": "failed", "evidence": []}
        if not route["enabled"]: return base | {"status": "not_tested", "reason": "disabled", "duration_ms": 0}
        maximum = route.get("cost_ceiling_usd", 0) if self.config["mode"] == "live" else 0
        if not self.state.reserve(spend_id, route["provider"], maximum, self.config["budget"]):
            return base | {"status": "skipped_budget", "duration_ms": 0}
        ctx = Context(self.config, self.state, self.http, run, job_id, spec["target"], route, self.credentials, remote)
        queued_at, started = time.monotonic(), None
        try:
            if self.config["mode"] == "offline":
                fixture = spec["target"].get("fixtures", {}).get(route["id"], spec["target"].get("fixture"))
                if fixture and hashlib.sha256(Path(fixture).read_bytes()).hexdigest() != spec["fixture_hashes"][route["id"]]:
                    raise ValueError("fixture_changed_after_planning")
            async with AsyncExitStack() as slots:
                # Ordinary attempt clocks start after all local capacity waits.
                # Chains retain their end-to-end deadline, including those waits.
                async with asyncio.timeout(remaining if spec["chain"] else None):
                    lock = await self.paced(spec["target"], route)
                    slots.callback(lock.release)
                    if route["adapter"] == "browser_playwright":
                        await slots.enter_async_context(self.browser_lock)
                    elif route["adapter"] in PAID:
                        await slots.enter_async_context(self.provider_locks.setdefault(route["provider"], asyncio.Lock()))
                started = time.monotonic()
                self.next_start[self.domain_key(spec["target"], route)] = started + self.config["limits"]["domain_interval_seconds"]
                base["started_at"] = datetime.now(timezone.utc).isoformat()
                if spec["chain"]: remaining = max(0, remaining-(started-queued_at))
                deadline = self.config["limits"]["attempt_seconds"] if spec["target"]["kind"] == "article" else self.config["limits"]["job_seconds"]
                async with asyncio.timeout(min(remaining, deadline)):
                    if ctx.stopped(): raise adapters.RemotePending("stop_requested")
                    cache_key = "capture:" + digest([run, spec["target"], spec["repetition"], route["adapter"],
                        {key: value for key, value in route["settings"].items() if key != "parser"}])
                    cacheable = self.config["mode"] == "live" and route["adapter"] in {"rss", "google_news_rss"}
                    cached = self.state.checkpoint(cache_key) if cacheable else None
                    if cached:
                        capture = cached | {"payload": self.state.read_artifact(cached["artifact"])}
                        ctx.save(capture["payload"], {"shared_capture": True})
                    else: capture = await adapters.acquire(ctx)
                    artifact = ctx.save(capture["payload"], {"format": capture["format"], "canonical_payload": True,
                        "representation": capture.get("coverage", {}).get("representation", "acquisition_payload")})
                    if cacheable: self.state.checkpoint(cache_key, {key: value for key, value in capture.items() if key != "payload"} | {"artifact": artifact})
                    base |= {"status": "captured", "payload": artifact, "format": capture["format"], "coverage": capture.get("coverage", {}), "resolved_url": capture.get("resolved_url", spec["target"]["input"])}
                    if spec["chain"]:
                        extractor = self.config["extractors"][0]
                        article = await processing.extract(capture["payload"], spec["target"], extractor, base["started_at"], offline=self.config["mode"] == "offline")
                        base["chain_article"] = article
                        base["validation"] = processing.article_validation(article)
        except adapters.Unavailable as error:
            if ctx.remote and ctx.remote.get("id"):
                base |= {"status": "pending", "reason": "remote_poll_unavailable: " + str(error)}
            else:
                base |= {"status": "not_tested", "reason": str(error)}
        except adapters.UncertainSubmission:
            base |= {"status": "uncertain", "reason": "reconcile_remote_submission"}
        except adapters.RemotePending:
            base |= {"status": "pending", "reason": "stop_requested"}
        except TimeoutError:
            status = "pending" if ctx.remote and ctx.remote.get("id") else "uncertain" if ctx.remote else "failed" if started is not None else "not_tested"
            base |= {"status": status, "reason": "deadline" if started is not None else "chain_deadline_waiting_for_slot"}
        except Exception as error:
            code = getattr(error, "code", type(error).__name__)
            status = "failed"
            if ctx.remote and not ctx.remote.get("id"): status = "uncertain"
            elif ctx.remote and not str(code).startswith("remote_"): status = "pending"
            base |= {"status": status, "reason": code, "http_status": getattr(error, "status", None), "retry_after": getattr(error, "retry_after", None)}
        finished = time.monotonic()
        base |= {"duration_ms": round((finished - started) * 1000) if started is not None else 0,
                 "queue_ms": round(((started if started is not None else finished) - queued_at) * 1000), "evidence": ctx.evidence,
                 "warnings": ctx.warnings, "remote": ctx.remote, "provider_reported_usd": ctx.reported_cost}
        # Never infer $0 for a timed-out/failed paid request. Reservations persist until reconciliation.
        if maximum == 0 or (not ctx.dispatched and not ctx.remote and base["status"] not in {"pending", "uncertain"}):
            self.state.reconcile(spend_id, 0, "No paid provider request dispatched; local resource cost reported separately")
        return base

    async def execute_job(self, run, job):
        async with self.semaphore:
            if self.stopped(run): return
            if self.config["mode"] == "live" and shutil.disk_usage(self.state.root).free < self.config["limits"]["min_free_disk_bytes"]:
                self.state.stop(run); self.state.event(run, job["id"], "disk_stop", {}); return
            spec = job["spec"]
            steps = (job.get("result") or {}).get("steps", [])
            next_route = spec["routes"][len(steps)] if len(steps) < len(spec["routes"]) else None
            if job["status"] == "running" and not job["remote"] and self.config["mode"] == "live" and next_route and self.state.checkpoint("dispatched:" + job["id"] + ":" + next_route["id"]):
                self.state.set_job(job["id"], "uncertain", {"steps": steps, "reason": "interrupted_inflight_attempt"}); return
            self.state.set_job(job["id"], "running", {"steps": steps})
            started = time.monotonic()
            for route in spec["routes"][len(steps):]:
                if self.stopped(run):
                    self.state.set_job(job["id"], "pending", {"steps": steps}); return
                previous_ms = sum(step["duration_ms"] + step.get("queue_ms", 0) for step in steps) if spec["chain"] else 0
                remaining = spec["deadline_seconds"] - previous_ms / 1000
                if remaining <= 0: break
                remote = job["remote"] if job["remote"] and job["remote"].get("route_id") == route["id"] else None
                step = await self.attempt(run, job, route, remote, remaining)
                if step["status"] in {"pending", "uncertain"}:
                    self.state.set_job(job["id"], step["status"], {"steps": steps, "inflight": step}); return
                steps.append(step)
                self.state.set_job(job["id"], "running", {"steps": steps})
                self.state.remote(job["id"], None)
                if spec["chain"] and step.get("validation", {}).get("accepted"): break
            result = {"steps": steps, "duration_ms": sum(step["duration_ms"] + (step.get("queue_ms", 0) if spec["chain"] else 0) for step in steps),
                      "fallbacks_not_attempted": len(spec["routes"]) - len(steps)}
            self.state.set_job(job["id"], "complete" if len(steps) or not spec["routes"] else "skipped", result)
            self.state.beat(run)

    def stopped(self, run):
        return self.state.stopped(run) or bool(self.config.get("parent_run") and self.state.stopped(self.config["parent_run"]))

    async def heartbeat(self, run):
        while True:
            from bench.metrics import snapshot
            self.state.beat(run)
            self.state.event(run, None, "resource_sample", snapshot(self.state.root))
            if self.config.get("parent_run"): self.state.beat(self.config["parent_run"])
            await asyncio.sleep(5)

    async def run(self, run, *, resume=False):
        # OS lock spans all source/provider work and auto-releases if this process exits.
        with self.state.dispatch_lock():
            jobs = self.state.jobs(run)
            eligible = {"planned"} | ({"running", "pending"} if resume else set())
            self.state.beat(run)
            heartbeat = asyncio.create_task(self.heartbeat(run))
            try: await asyncio.gather(*(self.execute_job(run, job) for job in jobs if job["status"] in eligible))
            finally:
                heartbeat.cancel()
                await asyncio.gather(heartbeat, return_exceptions=True)
                from bench.metrics import snapshot
                self.state.event(run, None, "resource_final", snapshot(self.state.root))
                await self.http.close()


async def process_run(state, run, operations="all"):
    with state.dispatch_lock():
        return await process_unlocked(state, run, operations)


async def process_unlocked(state, run, operations="all"):
    manifest = state.manifest(run)
    config = manifest["config"]
    state.event(run, None, "processing_versions", versions())
    for job in state.jobs(run):
        spec, result = job["spec"], job["result"]
        if not result: continue
        for step in result.get("steps", []):
            if step["status"] != "captured" or "payload" not in step: continue
            route = next(route for route in spec["routes"] if route["id"] == step["route"])
            try:
                payload = state.read_artifact(step["payload"])
            except Exception as error:
                # No derived output can be trusted when its saved input is unavailable.
                for key in ("extractions", "normalized", "normalization_ms", "source_score"):
                    step.pop(key, None)
                step["processing_error"] = type(error).__name__
                continue
            try:
                step.pop("processing_error", None)
                if spec["target"]["kind"] == "article":
                    if operations in {"all", "extract"}:
                        step["extractions"] = {}
                        for extractor in config["extractors"]:
                            processing_started = time.monotonic()
                            try:
                                article = await processing.extract(payload, spec["target"], extractor, step["started_at"], offline=config["mode"] == "offline")
                                article["url"] = step.get("resolved_url", spec["target"]["input"])
                                step["extractions"][extractor] = {"article": article}
                            except Exception as error: step["extractions"][extractor] = {"error": type(error).__name__}
                            step["extractions"][extractor]["duration_ms"] = round((time.monotonic() - processing_started) * 1000)
                    if operations in {"all", "score"}:
                        for extraction in step.get("extractions", {}).values():
                            extraction["score"] = processing.score_article(extraction["article"], spec["reference"]) if "article" in extraction else {"label": "FAIL", "verified": bool(spec["reference"])}
                else:
                    if operations in {"all", "normalize"}:
                        step.pop("normalized", None)
                        step.pop("normalization_ms", None)
                        step.pop("source_score", None)
                        processing_started = time.monotonic()
                        step["normalized"] = await processing.normalize(payload, spec["target"], route, step["started_at"], offline=config["mode"] == "offline")
                        step["normalization_ms"] = round((time.monotonic() - processing_started) * 1000)
                    if operations in {"all", "score"} and "normalized" in step:
                        step["source_score"] = processing.score_source(step["normalized"], spec["reference"], spec["target"], step["started_at"])
            except Exception as error:
                step["processing_error"] = type(error).__name__
                step.pop("source_score", None)
                for extraction in step.get("extractions", {}).values(): extraction.pop("score", None)
        state.set_job(job["id"], job["status"], result)
    return report(state, run)



def report(state, run):
    from bench.reporting import generate
    return generate(state, run)
