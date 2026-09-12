from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Literal


RunKind = Literal["gold", "live", "fault", "provider_failure"]


class ErrorType(str, Enum):
    TIMEOUT = "timeout"
    DNS = "dns"
    CONNECT = "connect"
    TLS = "tls"
    TOO_MANY_REDIRECTS = "too_many_redirects"
    TOO_LARGE = "too_large"
    RATE_LIMITED = "rate_limited"
    BLOCKED = "blocked"
    SERVER_ERROR = "server_error"
    CLIENT_ERROR = "client_error"
    UNSAFE_TARGET = "unsafe_target"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    PROVIDER_AUTH = "provider_auth"
    PROVIDER_QUOTA = "provider_quota"
    OTHER = "other"


@dataclass(frozen=True, slots=True)
class TransportRecord:
    ok: bool
    http_status: int | None = None
    resolved_url: str | None = None
    redirects: int = 0
    bytes_received: int = 0
    content_type: str | None = None
    error_type: ErrorType | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "httpStatus": self.http_status,
            "resolvedUrl": self.resolved_url,
            "redirects": self.redirects,
            "bytes": self.bytes_received,
            "contentType": self.content_type,
            "errorType": self.error_type.value if self.error_type else None,
        }


@dataclass(frozen=True, slots=True)
class CostRecord:
    estimated_usd: float
    billed_units: float
    cpu_seconds: float

    def to_dict(self) -> dict[str, float]:
        return {
            "estimatedUsd": self.estimated_usd,
            "billedUnits": self.billed_units,
            "cpuSeconds": self.cpu_seconds,
        }


@dataclass(frozen=True, slots=True)
class VersionRecord:
    harness: str
    route: str
    benchmark_config: str

    def to_dict(self) -> dict[str, str]:
        return {
            "harness": self.harness,
            "route": self.route,
            "benchmarkConfig": self.benchmark_config,
        }


@dataclass(frozen=True, slots=True)
class FetchAttempt:
    fetch_id: str
    run_id: str
    run_kind: RunKind
    route: str
    acquisition_method: str
    acquisition_provider: str
    input_url: str
    domain: str
    started_at: str
    finished_at: str
    latency_ms: int
    transport: TransportRecord
    cost: CostRecord
    versions: VersionRecord
    gold_id: str | None = None
    live_oracle: dict[str, str] | None = None
    raw_payload_ref: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "fetchId": self.fetch_id,
            "runId": self.run_id,
            "runKind": self.run_kind,
            "route": self.route,
            "acquisitionMethod": self.acquisition_method,
            "acquisitionProvider": self.acquisition_provider,
            "inputUrl": self.input_url,
            "domain": self.domain,
            "goldId": self.gold_id,
            "liveOracle": self.live_oracle,
            "startedAt": self.started_at,
            "finishedAt": self.finished_at,
            "latencyMs": self.latency_ms,
            "transport": self.transport.to_dict(),
            "cost": self.cost.to_dict(),
            "rawPayloadRef": self.raw_payload_ref,
            "versions": self.versions.to_dict(),
        }
