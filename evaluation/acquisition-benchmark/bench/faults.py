"""Nonbillable deterministic fault smoke checks using mock responses only.

This is a fast pre/post-run gate over the main fault classes. The full pytest suite remains the
complete gate: it also covers provider envelopes, pagination, recovery and the real parser bridge.
"""
import asyncio
import gzip

import httpx

from bench.config import DEFAULT_LIMITS
from bench.network import Http, NetworkError, bounded_body, require_ok
from bench.processing import feed_gate
from bench.safety import UnsafeTargetError, validate_public_http_url
from bench.validator import article_validation

PUBLIC = lambda *_: ("93.184.216.34",)


async def expect_error(checks, case, operation, errors, code=None):
    try:
        await operation()
    except errors as error:
        passed = code is None or getattr(error, "code", str(error)) == code
        checks.append({"case": case, "passed": passed, "observed": getattr(error, "code", type(error).__name__)})
        return error
    checks.append({"case": case, "passed": False, "observed": "no_error"})


async def mock_request(handler, url="https://example.test/", **limits):
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        return await Http(DEFAULT_LIMITS | limits, client).request("GET", url)


async def run_faults():
    checks = []
    for url in ("http://127.0.0.1/", "http://169.254.169.254/", "http://224.0.0.1/", "http://[ff02::1]/", "http://[::1]/", "file:///etc/passwd"):
        async def validate(url=url): validate_public_http_url(url, resolver=PUBLIC)
        await expect_error(checks, "unsafe_target " + url, validate, UnsafeTargetError)

    class Drip(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b"hello"
            await asyncio.sleep(.1)
            yield b"late"
    await expect_error(checks, "stalled_body", lambda: mock_request(lambda _: httpx.Response(200, stream=Drip()), attempt_seconds=.01), TimeoutError)

    loop = lambda request: httpx.Response(302, headers={"location": str(request.url)})
    await expect_error(checks, "redirect_loop", lambda: mock_request(loop), NetworkError, "redirect_limit")
    private = lambda _: httpx.Response(302, headers={"location": "http://169.254.169.254/latest/meta-data"})
    await expect_error(checks, "redirect_to_private_address", lambda: mock_request(private), UnsafeTargetError)
    await expect_error(checks, "oversized_body", lambda: mock_request(lambda _: httpx.Response(200, content=b"x" * 2048), max_bytes=1024), NetworkError, "too_large")

    compressed = gzip.compress(b"x" * (20 * 1024 * 1024))
    class Compressed(httpx.AsyncByteStream):
        async def __aiter__(self): yield compressed
    response = httpx.Response(200, headers={"content-encoding": "gzip"}, stream=Compressed())
    await expect_error(checks, "compressed_expansion", lambda: bounded_body(response, 1024), NetworkError, "too_large")

    for status, code in ((429, "rate_limited"), (403, "blocked"), (401, "provider_auth"), (404, "http_error"), (503, "http_error")):
        async def classify(status=status):
            require_ok(await mock_request(lambda _: httpx.Response(status, headers={"retry-after": "30"})))
        error = await expect_error(checks, f"http_{status}", classify, NetworkError, code)
        if error is not None and (error.status != status or (status == 429 and error.retry_after != "30")):
            checks[-1]["passed"] = False

    challenge = {"title": "Just a moment", "body": "Verify you are human " + "x" * 400}
    checks.append({"case": "http_200_challenge_page", "passed": not article_validation(challenge)["accepted"]})
    short = {"title": "Headline", "body": "x" * 120, "short_news": True}
    checks.append({"case": "short_news_needs_page_date", "passed": not article_validation(short)["accepted"]})

    for case, body, code in (("html_access_denied_is_not_a_feed", "<html>Access denied</html>", "not_a_feed"),
                             ("entity_declaration_refused", '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///x">]><rss/>', "feed_entities_refused")):
        async def gate(body=body): feed_gate(body)
        await expect_error(checks, case, gate, ValueError, code)
    try:
        feed_gate('<?xml version="1.0"?>\n<!DOCTYPE rss PUBLIC "-//N//DTD RSS 0.91//EN" "http://x/rss.dtd">\n<rss version="2.0"></rss>')
        checks.append({"case": "doctype_feed_accepted", "passed": True})
    except ValueError as error:
        checks.append({"case": "doctype_feed_accepted", "passed": False, "observed": str(error)})
    return {"passed": all(check["passed"] for check in checks), "checks": checks, "network_calls": 0,
            "scope": "smoke subset; run python -m pytest for the complete offline gate"}
