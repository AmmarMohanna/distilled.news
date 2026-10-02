import asyncio
import gzip

import httpx

from bench.records import ErrorType
from bench.routes.direct_http import DirectHttpConfig, DirectHttpRoute
from bench.safety import DnsResolutionError


def public_resolver(_hostname: str, _port: int) -> tuple[str, ...]:
    return ("93.184.216.34",)


def test_fetches_successful_html_with_fixed_headers() -> None:
    async def scenario() -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.headers["user-agent"].startswith("DistilledBenchmark/")
            assert request.headers["accept-language"] == "ar,en;q=0.9,fr;q=0.8"
            return httpx.Response(
                200,
                headers={"content-type": "text/html; charset=utf-8"},
                content=b"<html><article>hello</article></html>",
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await DirectHttpRoute(
                resolver=public_resolver,
                client=client,
            ).fetch(
                "https://example.com/article",
                run_id="gold-001",
                run_kind="gold",
                fetch_id="f_success",
            )

        assert result.payload == b"<html><article>hello</article></html>"
        assert result.attempt.transport.ok is True
        assert result.attempt.transport.http_status == 200
        assert result.attempt.transport.bytes_received == len(result.payload)

    asyncio.run(scenario())


def test_validates_every_redirect_before_requesting_it() -> None:
    async def scenario() -> None:
        requested_hosts: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requested_hosts.append(request.url.host)
            return httpx.Response(302, headers={"location": "http://127.0.0.1/admin"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await DirectHttpRoute(
                resolver=public_resolver,
                client=client,
            ).fetch(
                "https://example.com/article",
                run_id="fault-001",
                run_kind="fault",
            )

        assert requested_hosts == ["example.com"]
        assert result.payload is None
        assert result.attempt.transport.error_type is ErrorType.UNSAFE_TARGET
        assert result.attempt.transport.redirects == 1

    asyncio.run(scenario())


def test_enforces_decompressed_body_limit() -> None:
    async def scenario() -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                headers={"content-type": "text/html", "content-encoding": "gzip"},
                content=gzip.compress(b"decompressed body"),
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await DirectHttpRoute(
                DirectHttpConfig(max_bytes_decompressed=4),
                resolver=public_resolver,
                client=client,
            ).fetch(
                "https://example.com/large",
                run_id="fault-002",
                run_kind="fault",
            )

        assert result.payload is None
        assert result.attempt.transport.error_type is ErrorType.TOO_LARGE

    asyncio.run(scenario())


def test_classifies_rate_limiting() -> None:
    async def scenario() -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(429, content=b"retry later")

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await DirectHttpRoute(
                resolver=public_resolver,
                client=client,
            ).fetch(
                "https://example.com/article",
                run_id="gold-002",
                run_kind="gold",
            )

        assert result.payload == b"retry later"
        assert result.attempt.transport.ok is False
        assert result.attempt.transport.error_type is ErrorType.RATE_LIMITED

    asyncio.run(scenario())


def test_applies_one_total_deadline() -> None:
    async def scenario() -> None:
        async def handler(_request: httpx.Request) -> httpx.Response:
            await asyncio.sleep(0.05)
            return httpx.Response(200, content=b"too late")

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await DirectHttpRoute(
                DirectHttpConfig(deadline_seconds=0.001),
                resolver=public_resolver,
                client=client,
            ).fetch(
                "https://example.com/slow",
                run_id="fault-003",
                run_kind="fault",
            )

        assert result.payload is None
        assert result.attempt.transport.error_type is ErrorType.TIMEOUT

    asyncio.run(scenario())


def test_classifies_dns_resolution_failure() -> None:
    async def scenario() -> None:
        def failing_resolver(_hostname: str, _port: int) -> tuple[str, ...]:
            raise DnsResolutionError("DNS resolution failed")

        result = await DirectHttpRoute(resolver=failing_resolver).fetch(
            "https://missing.example/article",
            run_id="fault-004",
            run_kind="fault",
        )

        assert result.payload is None
        assert result.attempt.transport.error_type is ErrorType.DNS

    asyncio.run(scenario())


def test_malformed_url_still_produces_a_fetch_attempt() -> None:
    async def scenario() -> None:
        result = await DirectHttpRoute(resolver=public_resolver).fetch(
            "http://[::1",
            run_id="fault-005",
            run_kind="fault",
        )

        assert result.attempt.domain == ""
        assert result.attempt.transport.error_type is ErrorType.UNSAFE_TARGET

    asyncio.run(scenario())
