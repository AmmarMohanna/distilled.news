"""Feed-parser parity and conditional snapshots across frozen benchmark runs."""
import asyncio
from pathlib import Path

import httpx
import pytest

from bench import adapters
from bench.config import DEFAULT_LIMITS
from bench.network import Http
from bench.processing import normalize
from bench.runner import Context
from bench.state import State

ROOT = Path(__file__).resolve().parents[1]
PARSERS = [(adapter, parser) for adapter in ("rss", "google_news_rss") for parser in ("baseline", "feedparser")]
STAMP = "2026-09-01T12:00:00Z"


def normalize_feed(payload, adapter, parser):
    return normalize(payload, {"id": "feed", "kind": "rss" if adapter == "rss" else "google_news", "input": "https://example.com/feed"},
        {"adapter": adapter, "settings": {"parser": parser}}, STAMP)


@pytest.mark.parametrize("adapter,parser", PARSERS)
@pytest.mark.parametrize("declaration", [
    b'<!DOCTYPE rss PUBLIC "-//Netscape//DTD RSS 0.91//EN" "https://example.invalid/rss.dtd">',
    b'<!DOCTYPE rss [<!ELEMENT rss ANY>]>'
])
def test_doctype_feed_reaches_each_actual_parser(adapter, parser, declaration):
    async def scenario():
        payload = (ROOT / "fixtures/rss.xml").read_bytes()
        # Put the DTD after the XML declaration if this fixture has one.
        text = payload.decode().removeprefix('\ufeff')
        if text.startswith("<?xml"): text = text.split("?>", 1)[1]
        plain = await normalize_feed(text.encode(), adapter, parser)
        declared = await normalize_feed(declaration + b"\n" + text.encode(), adapter, parser)
        assert len(declared["items"]) == len(plain["items"]) == 2
        assert declared["items"] == plain["items"]
    asyncio.run(scenario())


@pytest.mark.parametrize("adapter,parser", PARSERS)
@pytest.mark.parametrize("payload", [
    b"<html><body><rss><channel/></rss></body></html>",
    b"<html><!-- <rss></rss> -->Access denied</html>",
    b'<?notice fake="<rss>"?><html>Consent required</html>'
])
def test_nonfeed_root_is_rejected_identically_before_either_parser(adapter, parser, payload, monkeypatch):
    async def forbidden(*args, **kwargs): pytest.fail("Non-feed reached the TypeScript parser")
    monkeypatch.setattr("bench.processing.isolated", forbidden)
    import feedparser
    monkeypatch.setattr(feedparser, "parse", lambda *_: pytest.fail("Non-feed reached feedparser"))
    async def scenario():
        with pytest.raises(ValueError, match="not_a_feed"):
            await normalize_feed(payload, adapter, parser)
    asyncio.run(scenario())


@pytest.mark.parametrize("adapter,parser", PARSERS)
def test_entity_declarations_still_rejected_before_parsing(adapter, parser, monkeypatch):
    async def forbidden(*args, **kwargs): pytest.fail("Entity declaration reached the TypeScript parser")
    monkeypatch.setattr("bench.processing.isolated", forbidden)
    import feedparser
    monkeypatch.setattr(feedparser, "parse", lambda *_: pytest.fail("Entity declaration reached feedparser"))
    payload = b'<!DOCTYPE rss [<!ENTITY injected SYSTEM "file:///never-read">]><rss><channel/></rss>'
    async def scenario():
        with pytest.raises(ValueError, match="feed_entities_refused"):
            await normalize_feed(payload, adapter, parser)
    asyncio.run(scenario())


@pytest.mark.parametrize("adapter,parser", PARSERS)
def test_bom_and_prolog_do_not_reject_a_valid_empty_feed(adapter, parser):
    async def scenario():
        result = await normalize_feed('\ufeff<?xml version="1.0"?>\n<!-- generated -->\n<rss><channel><title>Quiet</title></channel></rss>'.encode(), adapter, parser)
        assert result["items"] == []
    asyncio.run(scenario())


@pytest.mark.parametrize("adapter", ["rss", "direct_http"])
def test_conditional_cache_survives_reopen_within_run_but_never_crosses_runs(tmp_path, adapter):
    async def scenario():
        config = {"mode": "live", "limits": DEFAULT_LIMITS}
        bodies = {"pilot": b"pilot snapshot", "controlled": b"controlled snapshot"}
        calls = []
        active_run = "pilot"
        def handler(request):
            calls.append((active_run, dict(request.headers)))
            if "if-none-match" in request.headers:
                return httpx.Response(304)
            return httpx.Response(200, content=bodies[active_run], headers={"etag": active_run, "last-modified": "Tue, 01 Sep 2026 09:00:00 GMT"})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            for run in ("pilot", "controlled"):
                active_run = run
                for attempt in range(2):
                    state = State(tmp_path)
                    try:
                        if attempt == 0: state.create_run(run, {"config": config}, [{}])
                        ctx = Context(config, state, Http(config["limits"], client), run, run + "-000000",
                            {"id": "feed", "kind": "rss", "input": "https://example.com/feed"},
                            {"id": "candidate", "adapter": adapter, "settings": {"conditional": True}}, {})
                        capture = await adapters.acquire(ctx)
                        assert capture["payload"] == bodies[run]
                        assert capture["coverage"]["http_status"] == (200 if attempt == 0 else 304)
                    finally: state.close()
        assert len(calls) == 4
        for index in (0, 2):
            assert "if-none-match" not in calls[index][1] and "if-modified-since" not in calls[index][1]
        assert calls[1][1]["if-none-match"] == "pilot"
        assert calls[3][1]["if-none-match"] == "controlled"
    asyncio.run(scenario())
