"""Bounded HTTP with address validation at connect time and hostname-preserving TLS."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
import ipaddress
import json
import ssl
from urllib.parse import urljoin, urlsplit
import zlib

import httpcore
from httpcore._backends.auto import AutoBackend
import httpx

from bench.safety import UnsafeTargetError, is_public_address, validate_public_http_url


class NetworkError(Exception):
    def __init__(self, code: str, status: int | None = None, retry_after: str | None = None):
        self.code, self.status, self.retry_after = code, status, retry_after
        super().__init__(code)


class PublicBackend(AutoBackend):
    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        # Resolve once, reject mixed unsafe answers, then connect to a literal IP.
        # HTTPCore still performs TLS using the original request hostname.
        answers = await asyncio.get_running_loop().getaddrinfo(host, port, type=__import__('socket').SOCK_STREAM)
        addresses = list(dict.fromkeys(answer[4][0] for answer in answers))
        if not addresses or any(not is_public_address(address) for address in addresses):
            raise UnsafeTargetError("Non-public connection address")
        return await super().connect_tcp(addresses[0], port, timeout, local_address, socket_options)

    async def connect_unix_socket(self, *args, **kwargs):
        raise UnsafeTargetError("Unix sockets are not acquisition targets")


class CoreStream(httpx.AsyncByteStream):
    def __init__(self, stream): self.stream = stream
    async def __aiter__(self):
        async for part in self.stream: yield part
    async def aclose(self): await self.stream.aclose()


class PublicTransport(httpx.AsyncBaseTransport):
    def __init__(self, backend=None):
        self.pool = httpcore.AsyncConnectionPool(
            ssl_context=ssl.create_default_context(), network_backend=backend or PublicBackend(),
            max_connections=2, retries=0
        )

    async def handle_async_request(self, request):
        response = await self.pool.handle_async_request(httpcore.Request(
            method=request.method, url=str(request.url), headers=request.headers.raw,
            content=request.stream, extensions=request.extensions
        ))
        return httpx.Response(response.status, headers=response.headers,
                              stream=CoreStream(response.stream), extensions=response.extensions)

    async def aclose(self): await self.pool.aclose()


@dataclass
class Response:
    status: int
    headers: dict
    body: bytes
    url: str

    def json(self): return json.loads(self.body)


async def bounded_body(response: httpx.Response, maximum: int) -> bytes:
    encoding = response.headers.get("content-encoding", "identity").lower()
    decoder = None
    if encoding in {"gzip", "x-gzip"}: decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
    elif encoding == "deflate": decoder = zlib.decompressobj()
    elif encoding not in {"identity", ""}: raise NetworkError("unsupported_content_encoding")
    output = bytearray()
    # Pre-read mock responses have already passed through HTTPX decoding.
    if response.is_stream_consumed:
        if len(response.content) > maximum: raise NetworkError("too_large")
        return response.content
    async for chunk in response.aiter_raw(65536):
        block = decoder.decompress(chunk, maximum - len(output) + 1) if decoder else chunk
        output.extend(block)
        if len(output) > maximum or (decoder and decoder.unconsumed_tail): raise NetworkError("too_large")
        if decoder and decoder.unused_data: raise NetworkError("trailing_compressed_data")
    if decoder and not decoder.eof: raise NetworkError("incomplete_compressed_body")
    return bytes(output)


class Http:
    def __init__(self, limits: dict, client=None):
        self.limits = limits
        self.client = client or httpx.AsyncClient(transport=PublicTransport(), trust_env=False, timeout=None, follow_redirects=False)
        self.owns_client = client is None

    async def close(self):
        if self.owns_client: await self.client.aclose()

    async def request(self, method, url, *, headers=None, data=None, auth=None, api_host=None, maximum=None, follow_redirects=True):
        headers = {"User-Agent": "DistilledBenchmark/1.0", "Accept-Encoding": "identity"} | (headers or {})
        async with asyncio.timeout(self.limits["attempt_seconds"]):
            for redirect in range(self.limits["redirects"] + 1):
                parsed = urlsplit(url)
                if api_host and (parsed.scheme != "https" or parsed.hostname != api_host or parsed.port not in (None, 443)):
                    raise UnsafeTargetError("Provider credential host mismatch")
                # URL syntax/literal checks before dispatch; PublicBackend repeats address checks at connection time.
                validate_public_http_url(url, resolver=lambda _host, _port: ("93.184.216.34",))
                async with self.client.stream(method, url, headers=headers, json=data, auth=auth) as response:
                    if follow_redirects and response.status_code in {301, 302, 303, 307, 308}:
                        if api_host or method != "GET": raise NetworkError("provider_redirect", response.status_code)
                        location = response.headers.get("location")
                        if not location or redirect == self.limits["redirects"]: raise NetworkError("redirect_limit")
                        url = urljoin(url, location)
                        continue
                    body = await bounded_body(response, maximum or self.limits["max_bytes"])
                    return Response(response.status_code, dict(response.headers), body, str(response.url))
        raise NetworkError("redirect_limit")


def require_ok(response: Response):
    if not 200 <= response.status < 300:
        code = {401: "provider_auth", 403: "blocked", 429: "rate_limited"}.get(response.status, "http_error")
        raise NetworkError(code, response.status, response.headers.get("retry-after"))
    return response
