"""Nonbillable deterministic fault checks, using mock responses only."""
import asyncio
import gzip
import httpx

from bench.config import DEFAULT_LIMITS
from bench.network import Http, NetworkError, bounded_body
from bench.safety import UnsafeTargetError, validate_public_http_url


async def run_faults():
    checks = []
    for url in ("http://127.0.0.1/", "http://169.254.169.254/", "http://224.0.0.1/", "http://[ff02::1]/", "file:///etc/passwd"):
        try:
            validate_public_http_url(url)
            checks.append({"case": url, "passed": False})
        except UnsafeTargetError: checks.append({"case": url, "passed": True})
    class Drip(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b"hello"
            await asyncio.sleep(.1)
            yield b"late"
    async def handler(request): return httpx.Response(200, stream=Drip())
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        http = Http(DEFAULT_LIMITS | {"attempt_seconds": .01}, client)
        try:
            await http.request("GET", "https://example.test/")
            checks.append({"case": "stalled_body", "passed": False})
        except TimeoutError: checks.append({"case": "stalled_body", "passed": True})
    compressed = gzip.compress(b"x" * (20 * 1024 * 1024))
    class Compressed(httpx.AsyncByteStream):
        async def __aiter__(self): yield compressed
    response = httpx.Response(200, headers={"content-encoding": "gzip"}, stream=Compressed())
    try:
        await bounded_body(response, 1024)
        checks.append({"case": "compressed_expansion", "passed": False})
    except NetworkError as error: checks.append({"case": "compressed_expansion", "passed": error.code == "too_large"})
    return {"passed": all(check["passed"] for check in checks), "checks": checks, "network_calls": 0}
