"""Re-extract and score saved CNN captures without changing the original report."""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bench.processing import extract
from bench.score import score_article


async def replay(args):
    report_bytes = args.report.read_bytes()
    report = json.loads(report_bytes)
    results = []
    for job in report["jobs"]:
        spec = job["spec"]
        if spec["target"]["id"] != "article-001": continue
        for step in job["result"]["steps"]:
            if step.get("status") != "captured": continue
            artifact = step["payload"]
            raw = (args.data_dir / artifact["path"]).read_bytes()
            if hashlib.sha256(raw).hexdigest() != artifact["sha256"]:
                raise ValueError("Captured payload hash mismatch")
            for name in ("trafilatura", "readability"):
                article = await extract(raw, spec["target"], name, step["started_at"])
                article["url"] = step.get("resolved_url", spec["target"]["input"])
                score = score_article(article, spec.get("reference"))
                results.append({"target": spec["target"]["id"], "repetition": spec["repetition"],
                                "extractor": name, "payload_sha256": artifact["sha256"],
                                "article": article, "score": score})
    if not results: raise ValueError("No captured article-001 pages")
    root = Path(__file__).resolve().parents[1]
    output = {"original_report_sha256": hashlib.sha256(report_bytes).hexdigest(), "network_calls": 0,
              "code_hashes": {name: hashlib.sha256((root / "bench" / name).read_bytes()).hexdigest()
                              for name in ("validator.py", "score.py")}, "results": results}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as handle:
        json.dump(output, handle, ensure_ascii=False, indent=2)
    print(json.dumps({"scored_results": len(results), "labels": [r["score"]["label"] for r in results],
                      "validation_reasons": [r["score"]["validation"]["reasons"] for r in results],
                      "output": str(args.output)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("report", "data-dir", "output"):
        parser.add_argument("--" + name, type=Path, required=True)
    asyncio.run(replay(parser.parse_args()))
