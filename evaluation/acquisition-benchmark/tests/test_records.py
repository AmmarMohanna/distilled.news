from bench.records import (
    CostRecord,
    ErrorType,
    FetchAttempt,
    TransportRecord,
    VersionRecord,
)


def test_fetch_attempt_serializes_to_runbook_shape() -> None:
    attempt = FetchAttempt(
        fetch_id="f_001",
        run_id="gold-001",
        run_kind="gold",
        route="direct_http",
        acquisition_method="direct_http",
        acquisition_provider="self",
        input_url="https://example.com/article",
        domain="example.com",
        gold_id="g_001",
        started_at="2026-09-11T10:00:00.000Z",
        finished_at="2026-09-11T10:00:00.250Z",
        latency_ms=250,
        transport=TransportRecord(
            ok=False,
            resolved_url="https://example.com/article",
            error_type=ErrorType.TIMEOUT,
        ),
        cost=CostRecord(estimated_usd=0.0, billed_units=0.0, cpu_seconds=0.01),
        versions=VersionRecord(
            harness="git:test",
            route="direct_http@1",
            benchmark_config="bench-v1",
        ),
    )

    value = attempt.to_dict()

    assert value["fetchId"] == "f_001"
    assert value["goldId"] == "g_001"
    assert value["transport"]["errorType"] == "timeout"
    assert value["cost"]["estimatedUsd"] == 0.0
    assert value["versions"]["benchmarkConfig"] == "bench-v1"
