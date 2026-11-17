import json
from pathlib import Path

import zstandard

from bench.records import CostRecord, FetchAttempt, TransportRecord, VersionRecord
from bench.storage import ArtifactStore


def test_saves_compressed_payload_and_append_only_fetch_record(tmp_path: Path) -> None:
    attempt = FetchAttempt(
        fetch_id="f_storage",
        run_id="gold-001",
        run_kind="gold",
        route="direct_http",
        acquisition_method="direct_http",
        acquisition_provider="self",
        input_url="https://example.com/article",
        domain="example.com",
        started_at="2026-09-11T10:00:00.000Z",
        finished_at="2026-09-11T10:00:00.250Z",
        latency_ms=250,
        transport=TransportRecord(
            ok=True,
            http_status=200,
            resolved_url="https://example.com/article",
            bytes_received=20,
            content_type="text/html; charset=utf-8",
        ),
        cost=CostRecord(estimated_usd=0.0, billed_units=0.0, cpu_seconds=0.01),
        versions=VersionRecord(
            harness="git:test",
            route="direct_http@1",
            benchmark_config="bench-v1",
        ),
    )
    payload = b"<html>hello</html>"

    stored = ArtifactStore(tmp_path).save(attempt, payload)

    assert stored.raw_payload_ref == "raw/2026-09-11/f_storage.html.zst"
    compressed_path = tmp_path / Path(stored.raw_payload_ref)
    assert zstandard.ZstdDecompressor().decompress(compressed_path.read_bytes()) == payload

    records = (tmp_path / "fetches" / "2026-09-11.jsonl").read_text(
        encoding="utf-8"
    ).splitlines()
    assert len(records) == 1
    assert json.loads(records[0])["rawPayloadRef"] == stored.raw_payload_ref