"""Offline article extraction and isolated transforms over saved payloads."""
import asyncio
import json
from pathlib import Path
import sys

from bench.extractors.metadata import extract_metadata

NODE = Path(__file__).resolve().parents[2] / "node" / "transform.mjs"


async def isolated(operation, payload, target, fetched_at):
    command = [sys.executable, "-m", "bench.transform_worker"] if operation == "trafilatura" else ["node", str(NODE)]
    process = await asyncio.create_subprocess_exec(*command, stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    data = json.dumps({"operation": operation, "payload": payload, "target": target, "fetched_at": fetched_at}).encode()
    try:
        stdout, _stderr = await asyncio.wait_for(process.communicate(data), timeout=30)
        if process.returncode: raise ValueError(f"{operation}_transform_failed")
        if len(stdout) > 100 * 1024 * 1024: raise ValueError("transform_output_too_large")
        return json.loads(stdout)
    finally:
        if process.returncode is None:
            process.kill(); await process.wait()


async def extract(payload, target, extractor, fetched_at, *, offline=False):
    if extractor == "fixture":
        if not offline: raise ValueError("Fixture extraction is offline-only")
        return json.loads(payload)
    html = payload.decode("utf-8", errors="replace")
    result = await isolated(extractor, html, target, fetched_at)
    # Keep the extractor's original metadata visible when explicit HTML is more precise.
    result["extractor_metadata"] = {key: result.get(key) for key in ("title", "published_at")}
    metadata, provenance = extract_metadata(html, target["input"])
    result["metadata_provenance"] = {}
    for key in ("title", "published_at"):
        if result.get(key): result["metadata_provenance"][key] = {"source": extractor, "raw": result[key]}
    for key, value in metadata.items():
        if key == "title" and result.get("title"): continue
        result[key] = value
        result["metadata_provenance"][key] = provenance[key]
    result["url"] = target["input"]
    result["short_news"] = bool(target.get("options", {}).get("short_news"))
    return result
