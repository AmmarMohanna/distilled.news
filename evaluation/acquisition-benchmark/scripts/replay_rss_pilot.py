"""Offline replay of captured RSS inputs without overwriting the original run."""
import argparse
import asyncio
from collections import Counter
from datetime import datetime
from email.utils import parsedate_to_datetime
import hashlib
import html
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bench.processing import normalize
from bench.runner import versions


async def replay(args):
    report_bytes = args.report.read_bytes()
    report = json.loads(report_bytes)
    results = []
    for job in report["jobs"]:
        spec = job["spec"]
        if spec["target"]["kind"] != "rss": continue
        for step in job["result"]["steps"]:
            artifact = next(e["artifact"] for e in step["evidence"]
                            if e.get("metadata", {}).get("canonical_payload"))
            raw = (args.data_dir / artifact["path"]).read_bytes()
            if hashlib.sha256(raw).hexdigest() != artifact["sha256"]:
                raise ValueError("Captured payload hash mismatch")
            # Read-only independent XML checks on the saved RSS snapshots.
            if b"<!ENTITY" in raw.upper(): raise ValueError("Entity declaration refused")
            entries = ET.fromstring(raw).findall("./channel/item")
            route = next(r for r in spec["routes"] if r["id"] == step["route"])
            for maximum in (None, 20):
                result = await normalize(raw, spec["target"], route, step["started_at"], max_items=maximum)
                items = result["items"]
                expected = entries if maximum is None else entries[:maximum]
                by_url = {}
                for entry in expected: by_url.setdefault(entry.findtext("link"), []).append(entry)
                date_errors, missing_media, summary_errors = 0, 0, 0
                for item in items:
                    originals = by_url.get(item["url"], [])
                    stamp = datetime.fromisoformat(item["published_at"].replace("Z", "+00:00")).timestamp()
                    if not any(parsedate_to_datetime(e.findtext("pubDate")).timestamp() == stamp for e in originals):
                        date_errors += 1
                    media_urls = {n.attrib["url"] for e in originals for n in e.iter()
                                  if n.tag.startswith("{http://search.yahoo.com/mrss/}") and n.attrib.get("url")}
                    if media_urls and not any(m.get("url") in media_urls for m in item["media"]):
                        missing_media += 1
                    clean = lambda text: " ".join(html.unescape(text or "").split())
                    if not any(clean(e.findtext("description")) in clean(item["text"]) for e in originals):
                        summary_errors += 1
                checks = {
                    "urls_match": Counter(i["url"] for i in items) == Counter(e.findtext("link") for e in expected),
                    "count_matches": len(items) == len(expected),
                    "date_errors": date_errors, "missing_media": missing_media,
                    "summary_errors": summary_errors,
                }
                results.append({"target": spec["target"]["id"], "parser": spec["candidate"],
                                "repetition": spec["repetition"], "maximum": maximum,
                                "payload_sha256": artifact["sha256"], "checks": checks, "normalized": result})
    output = {"original_run": report["run"], "original_report_sha256": hashlib.sha256(report_bytes).hexdigest(),
              "processing_versions": versions(), "network_calls": 0, "results": results}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as handle:
        json.dump(output, handle, ensure_ascii=False, indent=2)
    failures = [r for r in results if not r["checks"]["urls_match"] or not r["checks"]["count_matches"]
                or any(r["checks"][k] for k in ("date_errors", "missing_media", "summary_errors"))]
    print(json.dumps({"comparisons": len(results), "failed_checks": len(failures), "output": str(args.output)}))
    return bool(failures)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True, help="Directory containing blobs/")
    parser.add_argument("--output", type=Path, required=True, help="New output file; existing files are never overwritten")
    raise SystemExit(asyncio.run(replay(parser.parse_args())))
