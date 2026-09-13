import asyncio
import json
from pathlib import Path

import httpx
import pytest

from bench import adapters
from bench.cli import main, scheduled_rounds
from bench.config import DEFAULT_LIMITS, load
from bench.network import Http, NetworkError
from bench.runner import Runner, plan, process_run
from bench.state import State

ROOT = Path(__file__).resolve().parents[1]


def experiment(tmp_path, live=False):
    config = load(ROOT / "configs/offline-demo.json")
    config.update(mode="live" if live else "offline", data_dir=str(tmp_path / "data"), extractors=["fixture"])
    config["limits"] |= {"min_free_disk_bytes": 0, "domain_interval_seconds": 0}
    config["targets"] = [{"id": "article", "kind": "article", "input": "https://example.com/article", "routes": ["direct", "zyte"],
                          "fixture": str(ROOT / "fixtures/article.json"), "reference": str(ROOT / "fixtures/article.gold.json")}]
    config["routes"] = [route for route in config["routes"] if route["id"] in {"direct", "zyte"}]
    return config


def start(config, run="test", chains=False):
    state = State(Path(config["data_dir"]))
    manifest = plan(config, chains=chains)
    state.create_run(run, {key: value for key, value in manifest.items() if key != "jobs"}, manifest["jobs"])
    return state


def test_chain_uses_response_validation_and_includes_failed_primary(tmp_path, monkeypatch):
    async def scenario():
        config = experiment(tmp_path)
        config["chains"] = [{"id": "fallback", "routes": ["direct", "zyte"], "deadline_seconds": 90}]
        state = start(config, chains=True)
        actual = adapters.acquire
        async def acquire(ctx):
            if ctx.route["id"] == "direct": return {"format": "json", "payload": json.dumps({"title": "Access denied", "body": "verify you are human"}).encode()}
            return await actual(ctx)
        monkeypatch.setattr(adapters, "acquire", acquire)
        await Runner(state, config).run("test")
        report = await process_run(state, "test")
        chain = report["chains"][0]
        assert chain["selected_route"] == "zyte"
        assert chain["attempted_routes"] == ["direct", "zyte"]
        assert chain["final_scores"]["fixture"]["label"] == "PASS"
        assert report["groups"]["direct / article / fixture"]["labels"] == {"FAIL": 1}
        state.close()
    asyncio.run(scenario())


def test_chain_does_not_use_gold_to_decide_fallback(tmp_path, monkeypatch):
    async def scenario():
        config = experiment(tmp_path)
        config["chains"] = [{"id": "fallback", "routes": ["direct", "zyte"], "deadline_seconds": 90}]
        state = start(config, chains=True)
        calls = []
        async def acquire(ctx):
            calls.append(ctx.route["id"])
            return {"format": "json", "payload": json.dumps({"title": "Another news article", "body": "A plausible but unrelated article. " * 30}).encode()}
        monkeypatch.setattr(adapters, "acquire", acquire)
        await Runner(state, config).run("test")
        result = await process_run(state, "test")
        assert calls == ["direct"]
        assert result["chains"][0]["final_scores"]["fixture"]["label"] == "FALSE_SUCCESS"
        state.close()
    asyncio.run(scenario())


def test_stopped_jobs_resume_without_recollecting_completed_jobs(tmp_path, monkeypatch):
    async def scenario():
        config = experiment(tmp_path)
        state = start(config)
        state.stop("test")
        await Runner(state, config).run("test")
        assert all(job["status"] == "planned" for job in state.jobs("test"))
        state.stop("test", False)
        await Runner(state, config).run("test", resume=True)
        assert all(job["status"] == "complete" for job in state.jobs("test"))
        async def forbidden(ctx): pytest.fail("recollected completed job")
        monkeypatch.setattr(adapters, "acquire", forbidden)
        await Runner(state, config).run("test", resume=True)
        state.close()
    asyncio.run(scenario())


def test_changed_fixture_after_plan_is_rejected(tmp_path):
    async def scenario():
        config = experiment(tmp_path)
        fixture = tmp_path / "fixture.json"
        fixture.write_bytes((ROOT / "fixtures/article.json").read_bytes())
        config["targets"][0]["fixture"] = str(fixture)
        state = start(config)
        fixture.write_bytes(b"{}")
        await Runner(state, config).run("test")
        assert all(job["result"]["steps"][0]["status"] == "failed" for job in state.jobs("test"))
        assert state.db.execute("SELECT count(*) FROM events WHERE kind='capture'").fetchone()[0] == 0
        state.close()
    asyncio.run(scenario())


def test_rss_alternatives_reuse_durable_capture_across_resume(tmp_path):
    async def scenario():
        config = experiment(tmp_path, live=True)
        config["routes"] = [{"id": name, "adapter": "rss", "provider": "self", "enabled": True, "settings": {"parser": parser}} for name, parser in [("baseline", "baseline"), ("feedparser", "feedparser")]]
        config["targets"] = [{"id": "rss", "kind": "rss", "input": "https://example.com/rss", "routes": ["baseline", "feedparser"]}]
        state = start(config)
        calls = []
        def handler(request): calls.append(str(request.url)); return httpx.Response(200, content=(ROOT / "fixtures/rss.xml").read_bytes())
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            runner = Runner(state, config, http=Http(config["limits"], client))
            first, second = state.jobs("test")
            await runner.execute_job("test", first)
            await Runner(state, config, http=Http(config["limits"], client)).execute_job("test", second)
        assert len(calls) == 1
        hashes = {job["result"]["steps"][0]["payload"]["sha256"] for job in state.jobs("test")}
        assert len(hashes) == 1
        state.close()
    asyncio.run(scenario())


def test_known_remote_timeout_resumes_polling_and_keeps_reservation(tmp_path, monkeypatch):
    async def scenario():
        config = experiment(tmp_path, live=True)
        config["budget"] = {"total_usd": .5, "providers": {"apify": .5}}
        config["routes"] = [{"id": "actor", "adapter": "apify", "provider": "apify", "enabled": True, "cost_ceiling_usd": .5, "settings": {"actor_id": "a/b"}}]
        config["targets"] = [{"id": "s", "kind": "apify", "input": "test", "routes": ["actor"]}]
        state = start(config)
        async def pending(ctx):
            ctx.set_remote({"id": "known", "provider": "apify"})
            raise NetworkError("http_error", 503)
        monkeypatch.setattr(adapters, "acquire", pending)
        await Runner(state, config).run("test")
        assert state.jobs("test")[0]["status"] == "pending"
        async def resume(ctx):
            assert ctx.remote["id"] == "known"
            return {"format": "json", "payload": b"[]"}
        monkeypatch.setattr(adapters, "acquire", resume)
        await Runner(state, config).run("test", resume=True)
        assert state.jobs("test")[0]["status"] == "complete"
        assert state.db.execute("SELECT count(*), sum(reserved) FROM spend").fetchone()[0] == 1
        state.close()
    asyncio.run(scenario())


def test_schedule_restart_uses_frozen_manifest_and_adds_daily_targets(tmp_path):
    async def scenario():
        config = experiment(tmp_path)
        config["schedule"] = {"rounds": 2, "interval_seconds": 1}
        extra = config["targets"][0] | {"id": "daily"}
        config["targets_by_round"] = {"1": [extra]}
        state = State(Path(config["data_dir"]))
        await scheduled_rounds(config, "week", state)
        assert len(state.jobs("week-r000")) == 2
        assert len(state.jobs("week-r001")) == 4
        before = state.db.execute("SELECT count(*) FROM spend").fetchone()[0]
        await scheduled_rounds(config, "week", state)
        assert state.db.execute("SELECT count(*) FROM spend").fetchone()[0] == before
        changed = config | {"seed": 123}
        with pytest.raises(ValueError, match="configuration changed"): await scheduled_rounds(changed, "week", state)
        state.close()
    asyncio.run(scenario())


def test_schedule_rejects_duplicate_routes_in_daily_targets(tmp_path):
    async def scenario():
        config = experiment(tmp_path)
        daily = tmp_path / "daily"
        daily.mkdir()
        (daily / "round-000.json").write_text(json.dumps([{
            "id": "daily", "kind": "article", "input": "https://example.com/daily",
            "routes": ["direct", "direct"],
        }]), encoding="utf-8")
        config["schedule"] = {"rounds": 1, "interval_seconds": 1, "daily_targets_dir": str(daily)}
        state = State(Path(config["data_dir"]))
        with pytest.raises(ValueError, match="Invalid/duplicate daily article target"):
            await scheduled_rounds(config, "week", state)
        assert state.db.execute("SELECT 1 FROM runs WHERE id='week-r000'").fetchone() is None
        state.close()
    asyncio.run(scenario())


def test_attach_remote_refuses_overwrite_and_wrong_route(tmp_path, capsys):
    config = experiment(tmp_path, live=True)
    config["routes"] = [
        {"id": route_id, "adapter": "apify", "provider": "apify", "enabled": True,
         "cost_ceiling_usd": .25, "settings": {"actor_id": "a/b"}}
        for route_id in ("actor1", "actor2")
    ]
    config["targets"] = [{"id": "source", "kind": "article", "input": "https://example.com/article", "routes": ["actor1", "actor2"]}]
    config["chains"] = [{"id": "fallback", "routes": ["actor1", "actor2"], "deadline_seconds": 90}]
    state = start(config, chains=True)
    job_id = state.jobs("test")[0]["id"]
    state.set_job(job_id, "uncertain", {"steps": [], "inflight": {"route": "actor1", "status": "uncertain"}})
    state.remote(job_id, {"id": "known", "route_id": "actor1", "provider": "apify"})
    state.close()

    command = ["attach-remote", "--data-dir", config["data_dir"], "--job-id", job_id,
               "--route-id", "actor1", "--remote-id", "replacement", "--evidence", "checked"]
    assert main(command) == 1
    state = State(Path(config["data_dir"]))
    assert state.jobs("test")[0]["remote"]["id"] == "known"
    state.remote(job_id, {"submission_started": True, "route_id": "actor1", "provider": "apify"})
    state.close()
    command[command.index("actor1")] = "actor2"
    assert main(command) == 1
    state = State(Path(config["data_dir"]))
    assert state.jobs("test")[0]["remote"].get("id") is None
    state.close()


def test_known_remote_stays_pending_when_poll_credentials_are_missing(tmp_path):
    async def scenario():
        config = experiment(tmp_path, live=True)
        config["budget"] = {"total_usd": .5, "providers": {"apify": .5}}
        config["routes"] = [{"id": "actor", "adapter": "apify", "provider": "apify", "enabled": True,
                             "cost_ceiling_usd": .5, "settings": {"actor_id": "a/b"}}]
        config["targets"] = [{"id": "source", "kind": "apify", "input": "test", "routes": ["actor"]}]
        state = start(config)
        job_id = state.jobs("test")[0]["id"]
        state.set_job(job_id, "pending", {"steps": [], "inflight": {"route": "actor", "status": "pending"}})
        state.remote(job_id, {"id": "known", "route_id": "actor", "provider": "apify"})
        await Runner(state, config, creds={}).run("test", resume=True)
        job = state.jobs("test")[0]
        assert job["status"] == "pending"
        assert job["remote"]["id"] == "known"
        assert job["result"]["inflight"]["reason"].startswith("remote_poll_unavailable")
        assert state.db.execute("SELECT actual FROM spend").fetchone()[0] is None
        state.close()
    asyncio.run(scenario())


def test_paid_failure_before_dispatch_releases_reservation(tmp_path, monkeypatch):
    async def scenario():
        config = experiment(tmp_path, live=True)
        config["budget"] = {"total_usd": .5, "providers": {"apify": .5}}
        config["routes"] = [{"id": "actor", "adapter": "apify", "provider": "apify", "enabled": True,
                             "cost_ceiling_usd": .5, "settings": {"actor_id": "a/b"}}]
        config["targets"] = [{"id": "source", "kind": "apify", "input": "test", "routes": ["actor"]}]
        state = start(config)

        async def fail_before_request(ctx):
            raise NetworkError("local_validation")

        monkeypatch.setattr(adapters, "acquire", fail_before_request)
        await Runner(state, config, creds={"APIFY_TOKEN": "unused"}).run("test")
        spend = state.db.execute("SELECT reserved,actual FROM spend").fetchone()
        assert spend["reserved"] == .5 and spend["actual"] == 0
        state.close()
    asyncio.run(scenario())


def test_cli_plan_and_faults(tmp_path, capsys):
    assert main(["plan", "--config", str(ROOT / "configs/stage1-pilot.json"), "--output", str(tmp_path / "plan.json")]) == 0
    assert json.loads((tmp_path / "plan.json").read_text())["planned_maximum_usd"] == 0
    assert main(["faults", "--output", str(tmp_path / "faults.json")]) == 0
    assert json.loads((tmp_path / "faults.json").read_text())["passed"]
