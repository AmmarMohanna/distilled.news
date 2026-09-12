from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit

import httpx

from bench.records import (
    CostRecord,
    ErrorType,
    FetchAttempt,
    RunKind,
    TransportRecord,
    VersionRecord,
)
from bench.safety import (
    AddressResolver,
    DnsResolutionError,
    UnsafeTargetError,
    resolve_addresses,
    validate_public_http_url,
)


_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})


@dataclass(frozen=True, slots=True)
class DirectHttpConfig:
    deadline_seconds: float = 45.0
    max_redirects: int = 5
    max_bytes_decompressed: int = 10 * 1024 * 1024
    user_agent: str = "DistilledBenchmark/0.1 (+https://distilled.news/bot)"
    accept_language: str = "ar,en;q=0.9,fr;q=0.8"
    harness_version: str = "dev"
    benchmark_config_version: str = "bench-v1"


@dataclass(frozen=True, slots=True)
class FetchResult:
    attempt: FetchAttempt
    payload: bytes | None


@dataclass(frozen=True, slots=True)
class _Outcome:
    transport: TransportRecord
    payload: bytes | None


class _RouteFailure(Exception):
    def __init__(
        self,
        error_type: ErrorType,
        resolved_url: str,
        redirects: int,
        *,
        http_status: int | None = None,
        content_type: str | None = None,
    ) -> None:
        super().__init__(error_type.value)
        self.error_type = error_type
        self.resolved_url = resolved_url
        self.redirects = redirects
        self.http_status = http_status
        self.content_type = content_type


class DirectHttpRoute:
    route_name = "direct_http"
    acquisition_method = "direct_http"
    acquisition_provider = "self"
    route_version = "direct_http@1"

    def __init__(
        self,
        config: DirectHttpConfig | None = None,
        *,
        resolver: AddressResolver = resolve_addresses,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._config = config or DirectHttpConfig()
        self._resolver = resolver
        self._client = client

    async def fetch(
        self,
        input_url: str,
        *,
        run_id: str,
        run_kind: RunKind,
        fetch_id: str | None = None,
        gold_id: str | None = None,
        live_oracle: dict[str, str] | None = None,
    ) -> FetchResult:
        started_at = _utc_now()
        started_clock = time.perf_counter()
        started_cpu = time.process_time()

        try:
            outcome = await asyncio.wait_for(
                self._fetch_with_client(input_url),
                timeout=self._config.deadline_seconds,
            )
        except asyncio.TimeoutError:
            outcome = _Outcome(
                transport=TransportRecord(
                    ok=False,
                    resolved_url=input_url,
                    error_type=ErrorType.TIMEOUT,
                ),
                payload=None,
            )
        except _RouteFailure as error:
            outcome = _Outcome(
                transport=TransportRecord(
                    ok=False,
                    http_status=error.http_status,
                    resolved_url=error.resolved_url,
                    redirects=error.redirects,
                    content_type=error.content_type,
                    error_type=error.error_type,
                ),
                payload=None,
            )
        except httpx.TimeoutException:
            outcome = _Outcome(
                transport=TransportRecord(
                    ok=False,
                    resolved_url=input_url,
                    error_type=ErrorType.TIMEOUT,
                ),
                payload=None,
            )
        except httpx.ConnectError:
            outcome = _Outcome(
                transport=TransportRecord(
                    ok=False,
                    resolved_url=input_url,
                    error_type=ErrorType.CONNECT,
                ),
                payload=None,
            )
        except httpx.HTTPError:
            outcome = _Outcome(
                transport=TransportRecord(
                    ok=False,
                    resolved_url=input_url,
                    error_type=ErrorType.OTHER,
                ),
                payload=None,
            )

        finished_at = _utc_now()
        elapsed_ms = round((time.perf_counter() - started_clock) * 1000)
        cpu_seconds = max(0.0, time.process_time() - started_cpu)
        domain = _domain_from_url(input_url)

        attempt = FetchAttempt(
            fetch_id=fetch_id or _new_fetch_id(),
            run_id=run_id,
            run_kind=run_kind,
            route=self.route_name,
            acquisition_method=self.acquisition_method,
            acquisition_provider=self.acquisition_provider,
            input_url=input_url,
            domain=domain,
            gold_id=gold_id,
            live_oracle=live_oracle,
            started_at=started_at,
            finished_at=finished_at,
            latency_ms=elapsed_ms,
            transport=outcome.transport,
            cost=CostRecord(
                estimated_usd=0.0,
                billed_units=0.0,
                cpu_seconds=cpu_seconds,
            ),
            versions=VersionRecord(
                harness=self._config.harness_version,
                route=self.route_version,
                benchmark_config=self._config.benchmark_config_version,
            ),
        )
        return FetchResult(attempt=attempt, payload=outcome.payload)

    async def _fetch_with_client(self, input_url: str) -> _Outcome:
        if self._client is not None:
            return await self._perform(self._client, input_url)

        async with httpx.AsyncClient(
            follow_redirects=False,
            timeout=None,
            trust_env=False,
        ) as client:
            return await self._perform(client, input_url)

    async def _perform(self, client: httpx.AsyncClient, input_url: str) -> _Outcome:
        current_url = input_url
        redirects = 0
        headers = {
            "User-Agent": self._config.user_agent,
            "Accept-Language": self._config.accept_language,
        }

        while True:
            try:
                await asyncio.to_thread(
                    validate_public_http_url,
                    current_url,
                    resolver=self._resolver,
                )
            except DnsResolutionError as error:
                raise _RouteFailure(
                    ErrorType.DNS,
                    current_url,
                    redirects,
                ) from error
            except UnsafeTargetError as error:
                raise _RouteFailure(
                    ErrorType.UNSAFE_TARGET,
                    current_url,
                    redirects,
                ) from error

            async with client.stream("GET", current_url, headers=headers) as response:
                if response.status_code in _REDIRECT_STATUSES:
                    location = response.headers.get("location")
                    if not location:
                        return _Outcome(
                            transport=TransportRecord(
                                ok=False,
                                http_status=response.status_code,
                                resolved_url=current_url,
                                redirects=redirects,
                                content_type=response.headers.get("content-type"),
                                error_type=ErrorType.CLIENT_ERROR,
                            ),
                            payload=None,
                        )
                    if redirects >= self._config.max_redirects:
                        raise _RouteFailure(
                            ErrorType.TOO_MANY_REDIRECTS,
                            current_url,
                            redirects,
                            http_status=response.status_code,
                            content_type=response.headers.get("content-type"),
                        )
                    current_url = urljoin(current_url, location)
                    redirects += 1
                    continue

                payload = await self._read_bounded_body(response, current_url, redirects)
                error_type = _classify_status(response.status_code)
                return _Outcome(
                    transport=TransportRecord(
                        ok=error_type is None,
                        http_status=response.status_code,
                        resolved_url=str(response.url),
                        redirects=redirects,
                        bytes_received=len(payload),
                        content_type=response.headers.get("content-type"),
                        error_type=error_type,
                    ),
                    payload=payload,
                )

    async def _read_bounded_body(
        self,
        response: httpx.Response,
        current_url: str,
        redirects: int,
    ) -> bytes:
        chunks: list[bytes] = []
        bytes_received = 0
        async for chunk in response.aiter_bytes():
            bytes_received += len(chunk)
            if bytes_received > self._config.max_bytes_decompressed:
                raise _RouteFailure(
                    ErrorType.TOO_LARGE,
                    current_url,
                    redirects,
                    http_status=response.status_code,
                    content_type=response.headers.get("content-type"),
                )
            chunks.append(chunk)
        return b"".join(chunks)


def _classify_status(status_code: int) -> ErrorType | None:
    if 200 <= status_code < 300:
        return None
    if status_code == 429:
        return ErrorType.RATE_LIMITED
    if status_code in {401, 403}:
        return ErrorType.BLOCKED
    if 400 <= status_code < 500:
        return ErrorType.CLIENT_ERROR
    if 500 <= status_code < 600:
        return ErrorType.SERVER_ERROR
    return ErrorType.OTHER


def _utc_now() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def _new_fetch_id() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return f"f_{timestamp}_{uuid.uuid4().hex[:8]}"


def _domain_from_url(url: str) -> str:
    try:
        return (urlsplit(url).hostname or "").rstrip(".").lower()
    except ValueError:
        return ""
