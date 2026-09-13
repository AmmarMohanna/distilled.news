"""Prevent misleading quality scores and timeouts in acquisition comparisons."""
import asyncio
import csv
from pathlib import Path

import pytest

from bench import adapters
from bench.config import load
from bench.runner import Runner, plan, process_run, report
from bench.state import State

ROOT = Path(__file__).resolve().parents[1]


def single_job(tmp_path, kind="rss"):
    config = load(ROOT / "configs/offline-demo.json")
    config["data_dir"] = str(tmp_path)
    config["limits"] |= {"domain_interval_seconds": 0, "min_free_disk_bytes": 0}
    target = next(target for target in config["targets"] if target["kind"] == kind)
    target["routes"] = target["routes"][:1]
    if kind == "article":
        config["extractors"] = ["fixture"]
        target["fixture"] = str(ROOT / "fixtures/article.json")
    config["targets"] = [target]
    config["routes"] = [route for route in config["routes"] if route["id"] in target["routes"]]
    manifest = plan(config)
    state = State(tmp_path)
    state.create_run("review", {key: value for key, value in manifest.items() if key != "jobs"}, manifest["jobs"])
    return config, state


@pytest.mark.parametrize("kind", ["article", "rss"])
@pytest.mark.parametrize("damage", ["corrupt", "missing"])
@pytest.mark.parametrize("operation", ["all", "score"])
def test_invalid_evidence_clears_pass_and_recovers_only_after_reprocessing(tmp_path, kind, damage, operation):
    async def scenario():
        config, state = single_job(tmp_path, kind)
        try:
            await Runner(state, config).run("review")
            first = await process_run(state, "review")
            assert first["rows"][0]["label"] == "PASS"
            artifact = first["jobs"][0]["result"]["steps"][0]["payload"]
            path = state.root / artifact["path"]
            original = path.read_bytes()
            if damage == "missing": path.unlink()
            else: path.write_bytes(b"corrupted evidence")

            failed = await process_run(state, "review", operation)
            step = failed["jobs"][0]["result"]["steps"][0]
            assert all(key not in step for key in ("extractions", "normalized", "source_score", "normalization_ms"))
            assert step["processing_error"] == ("FileNotFoundError" if damage == "missing" else "ValueError")
            assert failed["rows"][0]["label"] == "FAIL"
            persisted = report(state, "review")
            assert persisted["rows"][0]["label"] == "FAIL"
            with (state.root / "reports/review/attempts.csv").open(newline="", encoding="utf-8") as stream:
                assert next(csv.DictReader(stream))["label"] == "FAIL"

            path.write_bytes(original)
            recovered = await process_run(state, "review")
            assert recovered["rows"][0]["label"] == "PASS"
            assert "processing_error" not in recovered["jobs"][0]["result"]["steps"][0]
        finally: state.close()
    asyncio.run(scenario())


@pytest.mark.parametrize("kind", ["article", "rss"])
def test_report_overrides_legacy_stale_pass_without_replaying(tmp_path, kind):
    config, state = single_job(tmp_path, kind)
    try:
        job = state.jobs("review")[0]
        step = {"route": config["routes"][0]["id"], "status": "captured", "duration_ms": 10,
                "processing_error": "ValueError", "validation": {"accepted": True}}
        stale = {"label": "PASS", "verified": True}
        if kind == "article":
            step["extractions"] = {"fixture": {"score": stale}}
            spec = job["spec"] | {"chain": True}
            from bench.config import canonical
            state.db.execute("UPDATE jobs SET spec=? WHERE id=?", (canonical(spec), job["id"]))
        else: step["source_score"] = stale
        state.set_job(job["id"], "complete", {"steps": [step]})
        result = report(state, "review")
        assert result["rows"][0]["label"] == "FAIL"
        if kind == "article": assert result["chains"][0]["final_scores"]["fixture"]["label"] == "FAIL"
    finally: state.close()


@pytest.mark.parametrize("adapter", ["zyte_http", "browser_playwright"])
def test_capacity_wait_is_excluded_from_attempt_timeout_and_latency(tmp_path, monkeypatch, adapter):
    async def scenario():
        config, state = single_job(tmp_path, "article")
        config["mode"] = "live"
        config["limits"]["attempt_seconds"] = .1
        job = state.jobs("review")[0]
        route = config["routes"][0] | {"adapter": adapter, "provider": "tested_provider"}
        runner = Runner(state, config, creds={})
        lock = runner.browser_lock if adapter == "browser_playwright" else runner.provider_locks.setdefault("tested_provider", asyncio.Lock())
        calls = []
        async def acquire(ctx):
            calls.append(ctx.route["id"])
            return {"payload": b"<html>fixture</html>", "format": "html"}
        monkeypatch.setattr(adapters, "acquire", acquire)
        await lock.acquire()
        task = asyncio.create_task(runner.attempt("review", job, route, None, 1))
        try:
            await asyncio.sleep(.2)  # Longer than the request deadline, before any provider work.
            was_waiting = not task.done()
            assert not calls
        finally: lock.release()
        try:
            result = await task
            assert was_waiting and result["status"] == "captured"
            assert result["queue_ms"] >= 100
            assert result["duration_ms"] < result["queue_ms"]
            assert len(calls) == 1
            assert not lock.locked() and not any(item.locked() for item in runner.domain_locks.values())
            assert runner.next_start[runner.domain_key(job["spec"]["target"], route)] > 0
        finally:
            await runner.http.close()
            state.close()
    asyncio.run(scenario())


@pytest.mark.parametrize("adapter", ["zyte_http", "browser_playwright"])
def test_chain_deadline_still_bounds_capacity_wait_and_releases_domain(tmp_path, monkeypatch, adapter):
    async def scenario():
        config, state = single_job(tmp_path, "article")
        config["mode"] = "live"
        config["budget"] = {"total_usd": 1, "providers": {"tested_provider": 1}}
        job = state.jobs("review")[0]
        job["spec"]["chain"] = True
        route = config["routes"][0] | {"adapter": adapter, "provider": "tested_provider", "cost_ceiling_usd": .5}
        runner = Runner(state, config, creds={})
        lock = runner.browser_lock if adapter == "browser_playwright" else runner.provider_locks.setdefault("tested_provider", asyncio.Lock())
        async def forbidden(ctx): pytest.fail("Chain dispatched after its deadline")
        monkeypatch.setattr(adapters, "acquire", forbidden)
        await lock.acquire()
        try:
            result = await runner.attempt("review", job, route, None, .05)
            assert result["status"] == "not_tested" and result["reason"] == "chain_deadline_waiting_for_slot"
            assert result["duration_ms"] == 0 and result["queue_ms"] >= 40
            assert lock.locked()  # The caller's capacity reservation is still owned by the caller.
            assert not any(item.locked() for item in runner.domain_locks.values())
            assert state.db.execute("SELECT actual FROM spend").fetchone()[0] == 0
        finally:
            lock.release()
            await runner.http.close()
            state.close()
    asyncio.run(scenario())


def test_active_request_still_times_out(tmp_path, monkeypatch):
    async def scenario():
        config, state = single_job(tmp_path, "article")
        config["limits"]["attempt_seconds"] = .05
        runner = Runner(state, config)
        async def slow(ctx):
            await asyncio.sleep(1)
            pytest.fail("Active deadline was not enforced")
        monkeypatch.setattr(adapters, "acquire", slow)
        try:
            result = await runner.attempt("review", state.jobs("review")[0], config["routes"][0], None, 1)
            assert result["status"] == "failed" and result["reason"] == "deadline"
            assert not any(item.locked() for item in runner.domain_locks.values())
        finally:
            await runner.http.close()
            state.close()
    asyncio.run(scenario())
