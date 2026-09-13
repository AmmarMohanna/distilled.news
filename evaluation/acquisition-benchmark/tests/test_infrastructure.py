import asyncio
import copy
import gzip
import hashlib
import json
from pathlib import Path
import socket

import httpx
import pytest

from bench import adapters, processing
from bench.config import DEFAULT_LIMITS, load, template
from bench.network import Http, NetworkError, PublicBackend
from bench.runner import Context, Runner, plan, process_run, report
from bench.safety import UnsafeTargetError
from bench.state import State

ROOT = Path(__file__).resolve().parents[1]


def config(tmp_path):
    value = load(ROOT / "configs/offline-demo.json")
    value["data_dir"] = str(tmp_path / "data")
    value["limits"] |= {"min_free_disk_bytes": 0, "domain_interval_seconds": 0}
    return value


def context(tmp_path, handler, adapter="apify", settings=None, target=None, remote=None):
    conf = config(tmp_path)
    conf["mode"] = "live"
    state = State(Path(conf["data_dir"]))
    state.create_run("test", {"config": conf}, [{}])
    route = {"id": "candidate", "adapter": adapter, "settings": settings or {"actor_id": "author/actor", "input": {"url": "{input}"}}}
    ctx = Context(conf, state, Http(conf["limits"], httpx.AsyncClient(transport=httpx.MockTransport(handler))), "test", "test-000000",
                  target or {"id": "target", "kind": "x_profile", "input": "account"}, route,
                  {"APIFY_TOKEN": "fake-secret", "BRIGHTDATA_API_TOKEN": "fake-secret", "X_BEARER_TOKEN": "fake-secret"}, remote)
    return ctx


@pytest.mark.parametrize("name", ["stage1-pilot", "stage2-controlled", "stage3-soak", "offline-demo"])
def test_templates_load_and_plan_without_network(name, monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: pytest.fail("planning used DNS"))
    value = load(ROOT / "configs" / (name + ".json"))
    manifest = plan(value)
    assert manifest["planned_jobs"] > 0
    assert manifest["planned_maximum_usd"] == 0
    assert len({route["id"] for route in value["routes"]}) == 21
    if name != "offline-demo": assert not any(route["enabled"] for route in value["routes"])


@pytest.mark.parametrize("mutation", [
    lambda c: c.update(password="secret"),
    lambda c: c["limits"].update(concurrency=3),
    lambda c: c["budget"].update(total_usd=float("nan")),
    lambda c: c["routes"][0].update(enabled="false"),
    lambda c: c["targets"][0].update(routes=["unknown"]),
    lambda c: c["targets"][0].update(options={"start_time": "2026-09-02T00:00:00Z", "end_time": "2026-09-01T00:00:00Z"}),
])
def test_configuration_rejects_invalid_or_secret_values(tmp_path, mutation):
    value = config(tmp_path)
    mutation(value)
    path = tmp_path / "invalid.json"
    path.write_text(json.dumps(value), encoding="utf-8")
    with pytest.raises(ValueError): load(path)


def test_paid_routes_require_both_budget_and_provider_schema(tmp_path):
    value = config(tmp_path)
    value["mode"] = "live"
    value["routes"] = [{"id": "actor", "adapter": "apify", "provider": "apify", "enabled": True, "cost_ceiling_usd": .2, "cost_bound_confirmed": True, "settings": {"actor_id": "a/b"}}]
    value["targets"] = [{"id": "source", "kind": "apify", "input": "test", "routes": ["actor"]}]
    value["chains"] = []
    path = tmp_path / "paid.json"
    path.write_text(json.dumps(value), encoding="utf-8")
    with pytest.raises(ValueError): load(path)
    value["budget"] = {"total_usd": 1, "providers": {"apify": 1}}
    path.write_text(json.dumps(value), encoding="utf-8")
    with pytest.raises(ValueError, match="schema"): load(path)
    value["routes"][0]["settings"]["schema_confirmed"] = True
    path.write_text(json.dumps(value), encoding="utf-8")
    assert load(path)["routes"][0]["enabled"]


def test_template_is_explicit_not_code():
    assert template({"q": "{input}"}, {"input": "$(whoami)"}) == {"q": "$(whoami)"}
    with pytest.raises(ValueError): template("{missing}", {})


def test_durable_budget_reservations_and_reconciliation(tmp_path):
    first, second = State(tmp_path), State(tmp_path)
    cap = {"total_usd": 1, "providers": {"provider": .8}}
    assert first.reserve("attempt1", "provider", .6, cap)
    assert second.reserve("attempt1", "provider", .6, cap)
    assert not second.reserve("attempt2", "provider", .3, cap)
    assert not first.reconcile("attempt1", .1, "invoice line 1")
    assert second.reserve("attempt2", "provider", .3, cap)
    assert first.reconcile("attempt1", 2, "invoice correction")
    assert not second.reserve("attempt3", "provider", .01, cap)
    with pytest.raises(ValueError): first.reconcile("attempt1", float("nan"), "x")
    first.close(); second.close()


def test_os_lock_and_artifact_integrity(tmp_path):
    one, two = State(tmp_path), State(tmp_path)
    with one.dispatch_lock():
        with pytest.raises(RuntimeError):
            with two.dispatch_lock(): pass
    with two.dispatch_lock(): pass
    artifact = one.artifact(b"original")
    assert one.read_artifact(artifact) == b"original"
    (tmp_path / artifact["path"]).write_bytes(b"tampered")
    with pytest.raises(ValueError, match="checksum"): one.read_artifact(artifact)
    with pytest.raises(ValueError, match="escaped"): one.read_artifact({"path": "../outside", "sha256": "x"})
    one.close(); two.close()


def test_http_redirect_cannot_reach_private_ip():
    async def scenario():
        requests = []
        def handler(request):
            requests.append(str(request.url))
            return httpx.Response(302, headers={"location": "http://127.0.0.1/admin"})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(UnsafeTargetError): await Http(DEFAULT_LIMITS, client).request("GET", "https://example.com")
        assert len(requests) == 1
    asyncio.run(scenario())


def test_provider_redirect_does_not_forward_credentials():
    async def scenario():
        calls = []
        def handler(request):
            calls.append(request)
            return httpx.Response(302, headers={"location": "https://example.com"})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(NetworkError, match="provider_redirect"):
                await Http(DEFAULT_LIMITS, client).request("POST", "https://api.apify.com/test", api_host="api.apify.com", headers={"Authorization": "Bearer fake"})
        assert len(calls) == 1
    asyncio.run(scenario())


def test_dns_validated_at_connection_and_pinned(monkeypatch):
    async def scenario():
        loop = asyncio.get_running_loop()
        async def lookup(*a, **k): return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]
        called = []
        async def connect(self, host, *a, **k): called.append(host); return "stream"
        monkeypatch.setattr(loop, "getaddrinfo", lookup)
        monkeypatch.setattr("bench.network.AutoBackend.connect_tcp", connect)
        assert await PublicBackend().connect_tcp("example.com", 443) == "stream"
        assert called == ["93.184.216.34"]
        async def mixed(*a, **k): return await lookup() + [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))]
        monkeypatch.setattr(loop, "getaddrinfo", mixed)
        with pytest.raises(UnsafeTargetError): await PublicBackend().connect_tcp("example.com", 443)
        assert len(called) == 1
    asyncio.run(scenario())


class Stream(httpx.AsyncByteStream):
    def __init__(self, content, delay=0): self.content, self.delay = content, delay
    async def __aiter__(self):
        await asyncio.sleep(self.delay)
        yield self.content


@pytest.mark.parametrize("variant", ["compressed", "stalled", "truncated", "concatenated"])
def test_http_body_limits_and_deadlines(variant):
    async def scenario():
        compressed = gzip.compress(b"a" * 10000)
        body = compressed if variant == "compressed" else compressed[:-3] if variant == "truncated" else gzip.compress(b"a") + gzip.compress(b"b")
        response = httpx.Response(200, headers={"content-encoding": "gzip"}, stream=Stream(body, .2 if variant == "stalled" else 0))
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: response)) as client:
            limits = DEFAULT_LIMITS | {"max_bytes": 20 if variant == "compressed" else 20000, "attempt_seconds": .01 if variant == "stalled" else 10}
            with pytest.raises(TimeoutError if variant == "stalled" else NetworkError): await Http(limits, client).request("GET", "https://example.com")
    asyncio.run(scenario())


def test_apify_submit_poll_download_and_resume_without_resubmission(tmp_path):
    async def scenario():
        calls = []
        def handler(request):
            calls.append((request.method, request.url.path))
            assert request.headers["authorization"] == "Bearer fake-secret"
            if request.method == "POST": return httpx.Response(201, json={"data": {"id": "remote1"}})
            if "/actor-runs/" in request.url.path: return httpx.Response(200, json={"data": {"status": "SUCCEEDED", "defaultDatasetId": "dataset1", "usageTotalUsd": .03}})
            assert request.url.params["offset"] == "0"
            return httpx.Response(200, headers={"x-apify-pagination-total": "1"}, json=[{"id": "one", "text": "fake-secret"}])
        ctx = context(tmp_path, handler)
        capture = await adapters.acquire(ctx)
        assert json.loads(capture["payload"])[0]["id"] == "one"
        assert ctx.state.jobs("test")[0]["remote"]["id"] == "remote1"
        assert ctx.reported_cost == .03
        assert len(ctx.evidence) == 3
        assert b"fake-secret" not in ctx.state.read_artifact(ctx.evidence[-1]["artifact"])
        await adapters.acquire(ctx)
        assert sum(method == "POST" for method, _ in calls) == 1
        await ctx.http.client.aclose(); ctx.state.close()
    asyncio.run(scenario())


def test_unknown_remote_submission_is_never_retried(tmp_path):
    async def scenario():
        ctx = context(tmp_path, lambda request: pytest.fail("must not submit"), remote={"submission_started": True})
        with pytest.raises(adapters.UncertainSubmission): await adapters.acquire(ctx)
        await ctx.http.client.aclose(); ctx.state.close()
    asyncio.run(scenario())


def test_brightdata_poll_and_cap(tmp_path):
    async def scenario():
        def handler(request):
            if request.method == "POST": return httpx.Response(200, json={"snapshot_id": "snap1"})
            if "/progress/" in request.url.path: return httpx.Response(200, json={"status": "ready"})
            return httpx.Response(200, json=[{"id": str(index)} for index in range(3)])
        ctx = context(tmp_path, handler, "brightdata_social", {"dataset_id": "dataset1", "input": [{"url": "{input}"}]})
        ctx.limits["max_items"] = 2
        capture = await adapters.acquire(ctx)
        assert len(json.loads(capture["payload"])) == 2
        assert capture["coverage"]["capped"]
        await ctx.http.client.aclose(); ctx.state.close()
    asyncio.run(scenario())


def test_x_pagination_uses_cursor_and_keeps_partial_errors(tmp_path):
    async def scenario():
        def handler(request):
            if request.url.params.get("pagination_token") == "next": return httpx.Response(200, json={"data": [{"id": "2"}], "errors": [{"detail": "partial"}]})
            return httpx.Response(200, json={"data": [{"id": "1"}], "meta": {"next_token": "next"}})
        ctx = context(tmp_path, handler, "x_api", {}, {"id": "x", "kind": "x_profile", "input": "test", "options": {"user_id": "12"}})
        capture = await adapters.acquire(ctx)
        assert [row["id"] for row in json.loads(capture["payload"])["data"]] == ["1", "2"]
        assert ctx.warnings == ["provider_partial_errors"]
        await ctx.http.client.aclose(); ctx.state.close()
    asyncio.run(scenario())


def test_article_scoring_detects_false_success_and_order():
    gold = json.loads((ROOT / "fixtures/article.gold.json").read_text())
    assert processing.score_article(gold, gold)["label"] == "PASS"
    assert processing.score_article(gold, None)["label"] == "AUTO_UNVERIFIED"
    assert processing.score_article(gold | {"body": "An unrelated text. " * 50}, gold)["label"] == "FALSE_SUCCESS"
    assert processing.score_article(gold, gold | {"anchors": list(reversed(gold["anchors"]))})["label"] == "PARTIAL"
    assert processing.score_article(gold, gold | {"source_changed": True})["label"] == "SOURCE_CHANGED"
    assert processing.similarity("إفتتاح الْمَكْتَبَة", "افتتاح المكتبة")["f1"] == 1


def test_source_scoring_does_not_call_a_sample_total_recall():
    items = [{"id": "1", "text": "correct text", "published_at": None},
             {"id": None, "text": "missing stable identity", "published_at": None}]
    reference = {"items": [{"id": "1", "text": "correct text", "published_at": "2026-09-01T00:00:00Z"}, {"id": "2"}]}
    result = processing.score_source({"items": items}, reference, {})
    assert result["sample_coverage"] == .5 and result["recall"] is None
    assert result["item_checks"][0]["date_correct"] is False
    assert result["missing_dates"] == 2
    assert result["missing_item_ids"] == 1
    assert result["missing_reference_ids"] == ["2"]
    assert processing.wilson(5, 5)[0] < .85


def test_full_offline_pipeline_all_source_kinds_and_actual_parsers(tmp_path, monkeypatch):
    async def scenario():
        conf = config(tmp_path)
        manifest = plan(conf)
        state = State(Path(conf["data_dir"]))
        state.create_run("offline", {key: value for key, value in manifest.items() if key != "jobs"}, manifest["jobs"])
        monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: pytest.fail("offline used DNS"))
        await Runner(state, conf).run("offline")
        result = await process_run(state, "offline")
        assert result["job_states"] == {"complete": 21}
        steps = [step for job in result["jobs"] for step in job["result"]["steps"]]
        assert all(step["status"] == "captured" and "processing_error" not in step for step in steps), steps
        assert all("error" not in extraction for step in steps for extraction in step.get("extractions", {}).values())
        assert result["reserved_or_reconciled_usd"] == 0
        assert result["processing_versions"]["code_sha256"] == result["acquisition_versions"]["code_sha256"]
        telegram = next(step for step in steps if step["route"] == "telegram_public")
        assert telegram["normalized"]["items"][0]["id"] == "101"
        assert telegram["source_score"]["label"] == "PASS"
        rss = [step for step in steps if step["route"] in {"rss_baseline", "rss_feedparser"}]
        assert len(rss) == 2 and all(step["source_score"]["label"] == "PASS" for step in rss)
        before = state.db.execute("SELECT count(*) FROM events WHERE kind='capture'").fetchone()[0]
        await Runner(state, conf).run("offline", resume=True)
        assert state.db.execute("SELECT count(*) FROM events WHERE kind='capture'").fetchone()[0] == before
        assert (state.root / "reports/offline/report.json").exists()
        state.close()
    asyncio.run(scenario())


def test_renormalization_clears_stale_source_score(tmp_path, monkeypatch):
    async def scenario():
        conf = config(tmp_path)
        target = next(target for target in conf["targets"] if target["kind"] == "rss")
        route_id = target["routes"][0]
        conf["targets"] = [target | {"routes": [route_id]}]
        conf["routes"] = [route for route in conf["routes"] if route["id"] == route_id]
        manifest = plan(conf)
        state = State(Path(conf["data_dir"]))
        state.create_run("replay", {key: value for key, value in manifest.items() if key != "jobs"}, manifest["jobs"])
        await Runner(state, conf).run("replay")
        first = await process_run(state, "replay")
        assert "source_score" in first["jobs"][0]["result"]["steps"][0]

        async def fail_normalization(*args, **kwargs):
            raise ValueError("changed parser failure")

        monkeypatch.setattr(processing, "normalize", fail_normalization)
        replayed = await process_run(state, "replay", "normalize")
        step = replayed["jobs"][0]["result"]["steps"][0]
        assert "normalized" not in step and "source_score" not in step
        assert step["processing_error"] == "ValueError"
        assert replayed["rows"][0]["label"] == "FAIL"
        state.close()
    asyncio.run(scenario())


def test_report_gate_counts_failures_and_cost_uses_verified_cohort(tmp_path):
    conf = config(tmp_path)
    conf["extractors"] = ["fixture"]
    route = {"id": "candidate", "adapter": "fixture", "provider": "provider", "enabled": True, "settings": {}}
    conf["routes"] = [route]
    jobs = []
    for index in range(101):
        verified = index < 100
        target = {"id": f"article{index}", "kind": "article", "input": f"https://example.com/{index}", "routes": ["candidate"]}
        step = {"route": "candidate", "adapter": "fixture", "provider": "provider", "spend_id": f"metrics-{index:06}__candidate",
                "started_at": "2026-09-01T00:00:00Z", "status": "captured" if index < 94 or not verified else "failed",
                "duration_ms": 100 if index < 94 or not verified else 45000, "evidence": []}
        if index < 94 or not verified:
            step["extractions"] = {"fixture": {"article": {}, "duration_ms": 1,
                                                  "score": {"label": "PASS" if verified else "AUTO_UNVERIFIED", "verified": verified}}}
        jobs.append({"target": target, "routes": [route], "candidate": "candidate", "reference": {"labelled": True} if verified else None,
                     "reference_sha256": "reference" if verified else None, "repetition": 0, "chain": False,
                     "deadline_seconds": 60, "fixture_hashes": {}})
    state = State(tmp_path / "metrics")
    state.create_run("metrics", {"config": conf, "config_sha256": "config", "versions": {"code_sha256": "acquisition"}}, jobs)
    for index in range(101):
        job_id = f"metrics-{index:06}"
        state.reserve(job_id + "__candidate", "provider", .01, {"total_usd": 2, "providers": {"provider": 2}})
        state.set_job(job_id, "complete", {"steps": [({"route": "candidate", "adapter": "fixture", "provider": "provider",
            "spend_id": job_id + "__candidate", "started_at": "2026-09-01T00:00:00Z", "evidence": []} |
            ({"status": "captured", "duration_ms": 100, "extractions": {"fixture": {"article": {}, "duration_ms": 1,
              "score": {"label": "PASS" if index < 100 else "AUTO_UNVERIFIED", "verified": index < 100}}}} if index < 94 or index == 100 else
             {"status": "failed", "duration_ms": 45000, "reason": "timeout"}))]})
    result = report(state, "metrics")
    group = result["groups"]["candidate / article / fixture"]
    assert group["p95_combined_ms"] == 45000
    assert group["p95_successful_combined_ms"] == 101
    assert group["quality_gate"] == "DOES_NOT_MEET_GATES"
    assert group["cost_bound_or_actual_usd"] == pytest.approx(1.01)
    assert group["verified_cohort_cost_bound_or_actual_usd"] == pytest.approx(1.0)
    assert group["cost_per_verified_usable_attempt_usd"] == pytest.approx(1 / 94)
    state.close()
