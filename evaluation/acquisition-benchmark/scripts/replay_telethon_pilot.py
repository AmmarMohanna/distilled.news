"""Offline comparison of reprocessed API captures with verified public-page output."""
import argparse
import asyncio
from collections import Counter
from datetime import datetime
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bench.processing import normalize


async def replay(args):
    api_bytes, public_bytes = args.report.read_bytes(), args.public_report.read_bytes()
    api, public = json.loads(api_bytes), json.loads(public_bytes)
    public_items = {}
    for job in public["jobs"]:
        for step in job["result"]["steps"]:
            if step.get("status") == "captured":
                public_items[(job["spec"]["target"]["id"], job["spec"]["repetition"])] = step["normalized"]["items"]
    results = []
    for job in api["jobs"]:
        spec = job["spec"]
        for step in job["result"]["steps"]:
            if step.get("status") != "captured": continue
            route = next(r for r in spec["routes"] if r["id"] == step["route"])
            if route["adapter"] != "telethon": continue
            artifact = step["payload"]
            raw = (args.data_dir / artifact["path"]).read_bytes()
            if hashlib.sha256(raw).hexdigest() != artifact["sha256"]:
                raise ValueError("API payload hash mismatch")
            originals = {str(row["id"]): row for row in json.loads(raw)}
            expected = {i["id"]: i for i in public_items[(spec["target"]["id"], spec["repetition"]) ]}
            normalized = await normalize(raw, spec["target"], route, step["started_at"])
            items = normalized["items"]
            checks = {"ids_match": Counter(i["id"] for i in items) == Counter(expected.keys()), "post_errors": []}
            instant = lambda value: datetime.fromisoformat(value.replace("Z", "+00:00"))
            for item in items:
                row, web = originals[item["id"]], expected.get(item["id"])
                if web is None:
                    checks["post_errors"].append({"id": item["id"], "failed": ["not_in_public_sample"]})
                    continue
                fields = {
                    "raw_text": item["text"] == row.get("message", ""),
                    "public_text": " ".join(item["text"].split()) == " ".join(web["text"].split()),
                    "dates": instant(item["published_at"]) == instant(row["date"]) == instant(web["published_at"]),
                    "post_url": item["url"] == web["url"],
                    "links": set(item["links"]) == set(web["links"]),
                    "media_types": Counter(m["type"] for m in item["media"]) == Counter(m["type"] for m in web["media"]),
                    "raw_media": item["raw_media"] == row.get("media"),
                }
                # Independently check IDs against raw API objects, not CDN URLs.
                source_media = row.get("media") or {}
                obj = source_media.get("photo") or source_media.get("document")
                if obj and obj.get("id") is not None:
                    fields["media_id"] = len(item["media"]) == 1 and item["media"][0].get("telegram_id") == str(obj["id"])
                if source_media.get("_") == "MessageMediaWebPage":
                    fields["preview"] = len(item["link_previews"]) == 1 and item["link_previews"][0]["url"] == source_media["webpage"].get("url")
                failed = [name for name, passed in fields.items() if not passed]
                if failed: checks["post_errors"].append({"id": item["id"], "failed": failed})
            results.append({"target": spec["target"]["id"], "repetition": spec["repetition"],
                            "payload_sha256": artifact["sha256"], "checks": checks, "normalized": normalized})
    if not results: raise ValueError("No API captures found")
    failures = sum(not r["checks"]["ids_match"] or bool(r["checks"]["post_errors"]) for r in results)
    output = {"network_calls": 0, "original_report_sha256": hashlib.sha256(api_bytes).hexdigest(),
              "public_report_sha256": hashlib.sha256(public_bytes).hexdigest(),
              "processing_sha256": hashlib.sha256((Path(__file__).resolve().parents[1] / "bench/processing.py").read_bytes()).hexdigest(),
              "comparisons": len(results), "failed_comparisons": failures, "results": results}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as handle: json.dump(output, handle, ensure_ascii=False, indent=2)
    print(json.dumps({"comparisons": len(results), "failed_comparisons": failures, "output": str(args.output)}))
    return bool(failures)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("report", "public-report", "data-dir", "output"):
        parser.add_argument("--" + name, type=Path, required=True)
    raise SystemExit(asyncio.run(replay(parser.parse_args())))
