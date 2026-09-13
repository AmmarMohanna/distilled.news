"""Exercise the actual website dispatch paths with nonbillable provider responses."""
import asyncio
import base64
from contextlib import asynccontextmanager
import json
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from bench import adapters
from bench.config import DEFAULT_LIMITS, load
from bench.network import Http, NetworkError
from bench.routes import brightdata_unlocker, browser_playwright, zyte_http
from bench.runner import Context, Runner, plan, process_run
from bench.safety import validate_public_http_url
from bench.state import State

ROOT = Path(__file__).resolve().parents[1]
HTML = b"<html><article>Provider response</article></html>"


@pytest.fixture(autouse=True)
def fixed_public_dns(monkeypatch):
    # Keep real URL/literal checks; substitute only DNS resolution in these offline tests.
    def validate(url): return validate_public_http_url(url, resolver=lambda *_: ("93.184.216.34",))
    for module in (zyte_http, brightdata_unlocker, browser_playwright):
        monkeypatch.setattr(module, "validate_public_http_url", validate)


@asynccontextmanager
async def capture_context(tmp_path, adapter, handler, *, limits=None, settings=None, creds=None):
    config = {"mode": "live", "limits": DEFAULT_LIMITS | (limits or {})}
    state = State(tmp_path)
    state.create_run("web", {"config": config}, [{}])
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        ctx = Context(config, state, Http(config["limits"], client), "web", "web-000000",
            {"id": "article", "kind": "article", "input": "https://example.com/article"},
            {"id": "candidate", "adapter": adapter, "settings": {"zone": "test-zone"} | (settings or {})},
            {"ZYTE_API_KEY": "fixture-key", "BRIGHTDATA_API_TOKEN": "fixture-key"} if creds is None else creds)
        try: yield ctx
        finally: state.close()


def test_zyte_keeps_envelope_target_body_and_statuses_separate(tmp_path):
    async def scenario():
        calls = []
        def handler(request):
            calls.append(request)
            assert request.url == "https://api.zyte.com/v1/extract"
            assert request.headers["authorization"].startswith("Basic ")
            assert json.loads(request.content) == {"url": "https://example.com/article", "httpResponseBody": True, "httpResponseHeaders": True}
            return httpx.Response(200, json={"statusCode": 200, "httpResponseBody": base64.b64encode(HTML).decode()})
        async with capture_context(tmp_path, "zyte_http", handler) as ctx:
            result = await adapters.acquire(ctx)
            assert len(calls) == 1 and ctx.dispatched
            assert result["payload"] == HTML
            assert result["coverage"] == {"outer_http_status": 200, "target_http_status": 200,
                "provider_internals": "unknown", "representation": "provider_returned_target_body"}
            assert json.loads(ctx.state.read_artifact(ctx.evidence[0]["artifact"]))["statusCode"] == 200
            assert len(ctx.evidence) == 1  # Runner owns the canonical target-body write.
    asyncio.run(scenario())


@pytest.mark.parametrize("envelope", [[], {}, {"statusCode": "200"}, {"statusCode": 200},
    {"statusCode": 200, "httpResponseBody": "not base64"}, {"statusCode": 200, "httpResponseBody": 42}])
def test_zyte_rejects_invalid_schema_without_losing_provider_evidence(tmp_path, envelope):
    async def scenario():
        async with capture_context(tmp_path, "zyte_http", lambda request: httpx.Response(200, json=envelope)) as ctx:
            with pytest.raises(NetworkError, match="provider_schema"): await adapters.acquire(ctx)
            assert len(ctx.evidence) == 1 and ctx.dispatched
    asyncio.run(scenario())


def test_zyte_distinguishes_target_error_from_successful_provider_request(tmp_path):
    async def scenario():
        async with capture_context(tmp_path, "zyte_http", lambda request: httpx.Response(200, json={"statusCode": 403})) as ctx:
            with pytest.raises(NetworkError) as caught: await adapters.acquire(ctx)
            assert caught.value.code == "target_http_error" and caught.value.status == 403
            assert ctx.evidence[0]["metadata"]["status"] == 200
    asyncio.run(scenario())


@pytest.mark.parametrize("adapter", ["zyte_http", "brightdata_unlocker"])
def test_managed_routes_retain_rate_limits_without_retrying(tmp_path, adapter):
    async def scenario():
        calls = []
        def handler(request):
            calls.append(request)
            return httpx.Response(429, headers={"retry-after": "60"}, content=b"quota exceeded")
        async with capture_context(tmp_path, adapter, handler) as ctx:
            with pytest.raises(NetworkError) as caught: await adapters.acquire(ctx)
            assert caught.value.code == "rate_limited" and caught.value.retry_after == "60"
            assert len(calls) == 1 and ctx.state.read_artifact(ctx.evidence[0]["artifact"]) == b"quota exceeded"
    asyncio.run(scenario())


@pytest.mark.parametrize("adapter", ["zyte_http", "brightdata_unlocker"])
def test_managed_routes_require_credentials_before_dispatch(tmp_path, adapter):
    async def scenario():
        def forbidden(request): pytest.fail("Dispatched without credentials")
        async with capture_context(tmp_path, adapter, forbidden, creds={}) as ctx:
            with pytest.raises(adapters.Unavailable): await adapters.acquire(ctx)
            assert not ctx.dispatched and not ctx.evidence
    asyncio.run(scenario())


def test_unlocker_requires_zone_before_dispatch(tmp_path):
    async def scenario():
        async with capture_context(tmp_path, "brightdata_unlocker", lambda _: pytest.fail("Missing zone"), settings={"zone": ""}) as ctx:
            with pytest.raises(adapters.Unavailable, match="zone required"): await adapters.acquire(ctx)
            assert not ctx.dispatched
    asyncio.run(scenario())


def test_preflight_reports_missing_unlocker_zone(tmp_path, monkeypatch):
    from bench.cli import preflight
    config = load(ROOT / "configs/offline-demo.json")
    config["mode"] = "live"
    config["routes"] = [route for route in config["routes"] if route["adapter"] == "brightdata_unlocker"]
    config["routes"][0]["settings"]["zone"] = ""
    monkeypatch.setattr("bench.cli.credentials", lambda _: {"BRIGHTDATA_API_TOKEN": "fixture-key"})
    check = next(check for check in preflight(config)["checks"] if check.get("route") == "unlocker")
    assert check["status"] == "NOT_READY" and "Bright Data Unlocker zone required" in check["issues"]


def test_configuration_rejects_nonobject_zyte_request(tmp_path):
    config = json.loads((ROOT / "configs/offline-demo.json").read_text())
    next(route for route in config["routes"] if route["adapter"] == "zyte_http")["settings"]["request"] = []
    path = tmp_path / "invalid.json"
    path.write_text(json.dumps(config))
    with pytest.raises(ValueError, match="Zyte request settings must be a mapping"): load(path)


def test_unlocker_preserves_bytes_without_inventing_target_status(tmp_path):
    async def scenario():
        def handler(request):
            assert request.url == "https://api.brightdata.com/request"
            assert request.headers["authorization"] == "Bearer fixture-key"
            assert json.loads(request.content) == {"zone": "test-zone", "url": "https://example.com/article", "format": "raw"}
            return httpx.Response(200, content=HTML)
        async with capture_context(tmp_path, "brightdata_unlocker", handler) as ctx:
            result = await adapters.acquire(ctx)
            assert result["payload"] == HTML
            assert result["coverage"]["outer_http_status"] == 200
            assert result["coverage"]["target_http_status"] is None
            assert ctx.state.read_artifact(ctx.evidence[0]["artifact"]) == HTML
    asyncio.run(scenario())


def test_zyte_bounds_decoded_body_separately_from_envelope(tmp_path):
    async def scenario():
        body = b"x" * 1001
        envelope = {"statusCode": 200, "httpResponseBody": base64.b64encode(body).decode()}
        async with capture_context(tmp_path, "zyte_http", lambda _: httpx.Response(200, json=envelope), limits={"max_bytes": 1000}) as ctx:
            with pytest.raises(NetworkError, match="too_large"): await adapters.acquire(ctx)
            assert len(ctx.evidence) == 1  # Envelope fits; decoded target exceeds its separate limit.
    asyncio.run(scenario())


class FakePlaywright:
    def __init__(self):
        self.page = SimpleNamespace(goto=AsyncMock(return_value=SimpleNamespace(status=200)),
            wait_for_timeout=AsyncMock(), content=AsyncMock(return_value=HTML.decode()), url="https://example.com/final")
        self.context = SimpleNamespace(route=AsyncMock(), route_web_socket=AsyncMock(),
            new_page=AsyncMock(return_value=self.page), close=AsyncMock())
        self.browser = SimpleNamespace(new_context=AsyncMock(return_value=self.context), close=AsyncMock(), version="mock-chromium")
        self.chromium = SimpleNamespace(launch=AsyncMock(return_value=self.browser), executable_path="/mock/chromium")
    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass


def mock_browser(monkeypatch):
    fake = FakePlaywright()
    package, api = ModuleType("playwright"), ModuleType("playwright.async_api")
    api.async_playwright = lambda: fake
    monkeypatch.setitem(sys.modules, "playwright", package)
    monkeypatch.setitem(sys.modules, "playwright.async_api", api)
    monkeypatch.setattr(browser_playwright, "sys", SimpleNamespace(platform="linux"))
    monkeypatch.setattr(browser_playwright, "shutil", SimpleNamespace(which=lambda _: "/usr/bin/unshare"))
    return fake


def test_browser_records_rendered_dom_and_final_url_and_closes_resources(tmp_path, monkeypatch):
    fake = mock_browser(monkeypatch)
    async def scenario():
        async with capture_context(tmp_path, "browser_playwright", lambda _: httpx.Response(200)) as ctx:
            result = await adapters.acquire(ctx)
            assert result["payload"] == HTML and result["resolved_url"] == "https://example.com/final"
            assert result["coverage"]["representation"] == "rendered_dom"
            fake.browser.new_context.assert_awaited_once_with(service_workers="block", accept_downloads=False,
                viewport={"width": 1280, "height": 720}, locale="en-US")
            fake.context.close.assert_awaited_once()
            fake.browser.close.assert_awaited_once()
            wrapper = Path(fake.chromium.launch.call_args.kwargs["executable_path"])
            assert 'unshare --user --map-root-user --net' in wrapper.read_text()
    asyncio.run(scenario())


@pytest.mark.parametrize("failure", ["context", "interception", "navigation", "target_status", "missing_response", "dom_limit"])
def test_browser_cleans_up_on_setup_and_capture_failures(tmp_path, monkeypatch, failure):
    fake = mock_browser(monkeypatch)
    if failure == "context": fake.browser.new_context.side_effect = RuntimeError("setup failed")
    if failure == "interception": fake.context.route.side_effect = RuntimeError("setup failed")
    if failure == "navigation": fake.page.goto.side_effect = RuntimeError("navigation failed")
    if failure == "target_status": fake.page.goto.return_value = SimpleNamespace(status=403)
    if failure == "missing_response": fake.page.goto.return_value = None
    if failure == "dom_limit": fake.page.content.return_value = "x" * 101
    async def scenario():
        async with capture_context(tmp_path, "browser_playwright", lambda _: httpx.Response(200), limits={"max_bytes": 100}) as ctx:
            with pytest.raises((RuntimeError, NetworkError)): await adapters.acquire(ctx)
            fake.browser.close.assert_awaited_once()
            assert fake.context.close.await_count == (0 if failure == "context" else 1)
    asyncio.run(scenario())


def test_browser_network_budget_failure_cannot_return_partial_success(tmp_path, monkeypatch):
    fake = mock_browser(monkeypatch)
    async def navigate(*args, **kwargs):
        intercept = fake.context.route.call_args.args[1]
        request = SimpleNamespace(resource_type="document", method="GET", url="https://example.com/article")
        route = SimpleNamespace(request=request, abort=AsyncMock(), fulfill=AsyncMock())
        await intercept(route)
        route.abort.assert_awaited_once()
        route.fulfill.assert_not_awaited()
        return SimpleNamespace(status=200)
    fake.page.goto.side_effect = navigate
    async def scenario():
        async with capture_context(tmp_path, "browser_playwright", lambda _: httpx.Response(200, content=b"x" * 101), limits={"max_job_bytes": 100}) as ctx:
            with pytest.raises(NetworkError, match="too_large"): await adapters.acquire(ctx)
            assert ctx.warnings == ["browser_subrequest_rejected"]
    asyncio.run(scenario())


@pytest.mark.parametrize("route_id", ["zyte", "unlocker"])
def test_managed_capture_flows_through_real_extractors_scoring_and_reports(tmp_path, route_id):
    async def scenario():
        config = load(ROOT / "configs/offline-demo.json")
        config["mode"] = "live"
        config["data_dir"] = str(tmp_path)
        config["limits"] |= {"min_free_disk_bytes": 0, "domain_interval_seconds": 0}
        route = next(route for route in config["routes"] if route["id"] == route_id)
        route["settings"]["zone"] = "test-zone"
        route["cost_ceiling_usd"] = .1
        config["budget"] = {"total_usd": 1, "providers": {route["provider"]: 1}}
        config["routes"] = [route]
        target = next(target for target in config["targets"] if target["kind"] == "article")
        target["routes"] = [route_id]
        config["targets"] = [target]
        html = (ROOT / "fixtures/article.html").read_bytes()
        provider_payload = json.dumps({"statusCode": 200, "httpResponseBody": base64.b64encode(html).decode()}).encode() if route_id == "zyte" else html
        # Equal evidence-byte rules: Unlocker's response IS its canonical body;
        # Zyte's envelope and decoded body are two distinct payloads.
        config["limits"]["max_job_bytes"] = len(provider_payload) + (len(html) if route_id == "zyte" else 0)
        calls = []
        def handler(request):
            calls.append(request)
            return httpx.Response(200, content=provider_payload)
        state = State(tmp_path)
        try:
            manifest = plan(config)
            state.create_run("managed", {key: value for key, value in manifest.items() if key != "jobs"}, manifest["jobs"])
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                await Runner(state, config, creds={"ZYTE_API_KEY": "fixture-key", "BRIGHTDATA_API_TOKEN": "fixture-key"}, http=Http(config["limits"], client)).run("managed")
            result = await process_run(state, "managed")
            assert len(calls) == 1
            assert {row["extractor"] for row in result["rows"]} == {"trafilatura", "readability"}
            assert all(row["label"] == "PASS" for row in result["rows"])
            assert all(row["cost_bound_or_actual_usd"] == .1 and not row["cost_reconciled"] for row in result["rows"])
            evidence = result["jobs"][0]["result"]["steps"][0]["evidence"]
            assert len(evidence) == 2  # Two observations; identical bytes count only once.
            assert len({entry["artifact"]["sha256"] for entry in evidence}) == (2 if route_id == "zyte" else 1)
            assert state.read_artifact(evidence[-1]["artifact"]) == html
            assert evidence[-1]["metadata"]["representation"] == "provider_returned_target_body"
            assert (tmp_path / "reports/managed/report.json").exists()
            assert (tmp_path / "reports/managed/attempts.csv").exists()
        finally: state.close()
    asyncio.run(scenario())


def test_repeated_evidence_counts_once_but_distinct_payloads_still_hit_the_limit(tmp_path):
    async def scenario():
        async with capture_context(tmp_path, "brightdata_unlocker", lambda _: pytest.fail("No requests expected"), limits={"max_job_bytes": 15}) as ctx:
            first = ctx.save(b"a" * 10, {"status": 200})
            repeated = ctx.save(b"a" * 10, {"canonical_payload": True})
            assert repeated == first and ctx.total_bytes == 10
            assert len(ctx.evidence) == 2
            with pytest.raises(ValueError, match="job_byte_limit"):
                ctx.save(b"b" * 10, {"status": 200})
    asyncio.run(scenario())
