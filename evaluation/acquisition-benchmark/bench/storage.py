from __future__ import annotations

import json
import os
import threading
import uuid
from dataclasses import replace
from pathlib import Path, PurePosixPath

import zstandard

from bench.records import FetchAttempt


class ArtifactStore:
    def __init__(self, data_root: Path) -> None:
        self._data_root = data_root
        self._append_lock = threading.Lock()

    def save(self, attempt: FetchAttempt, payload: bytes | None) -> FetchAttempt:
        run_date = attempt.started_at[:10]
        stored_attempt = attempt

        if payload is not None:
            extension = _payload_extension(attempt.transport.content_type)
            relative_path = PurePosixPath(
                "raw",
                run_date,
                f"{attempt.fetch_id}.{extension}.zst",
            )
            destination = self._data_root.joinpath(*relative_path.parts)
            _write_compressed_atomic(destination, payload)
            stored_attempt = replace(attempt, raw_payload_ref=str(relative_path))

        fetch_log = self._data_root / "fetches" / f"{run_date}.jsonl"
        fetch_log.parent.mkdir(parents=True, exist_ok=True)
        serialized = json.dumps(
            stored_attempt.to_dict(),
            ensure_ascii=False,
            separators=(",", ":"),
        )
        with self._append_lock, fetch_log.open("a", encoding="utf-8", newline="\n") as stream:
            stream.write(serialized)
            stream.write("\n")

        return stored_attempt


def _write_compressed_atomic(destination: Path, payload: bytes) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
    compressed = zstandard.ZstdCompressor(level=3).compress(payload)
    try:
        temporary.write_bytes(compressed)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def _payload_extension(content_type: str | None) -> str:
    normalized = (content_type or "").lower()
    if "html" in normalized:
        return "html"
    if "json" in normalized:
        return "json"
    if "xml" in normalized:
        return "xml"
    return "bin"
