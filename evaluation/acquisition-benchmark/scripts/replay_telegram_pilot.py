"""Compare saved Telegram pages with original outputs or current parser, offline."""
import argparse
import asyncio
from datetime import datetime
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bench.processing import normalize


class Page(HTMLParser):
    """Independent DOM-like reference reader; no production parser regexes."""
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = {"tag": "root", "attrs": {}, "children": []}
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = {"tag": tag, "attrs": dict(attrs), "children": []}
        self.stack[-1]["children"].append(node)
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for n in range(len(self.stack) - 1, 0, -1):
            if self.stack[n]["tag"] == tag:
                del self.stack[n:]
                break

    def handle_data(self, text):
        self.stack[-1]["children"].append(text)


def nodes(node):
    yield node
    for child in node["children"]:
        if isinstance(child, dict):
            yield from nodes(child)


def text(node):
    if isinstance(node, str):
        return node
    if node["tag"] == "br":
        return "\n"
    return "".join(text(child) for child in node["children"])


def clean(value):
    return " ".join(value.split())


def reference(raw):
    result = []
    for post in nodes(Page(raw.decode("utf-8")).root):
        post_id = post["attrs"].get("data-post")
        if not post_id:
            continue
        descendants = list(nodes(post))
        body = next((n for n in descendants if "js-message_text" in n["attrs"].get("class", "").split()), None)
        stamp = next(n["attrs"]["datetime"] for n in descendants if n["tag"] == "time" and n["attrs"].get("datetime"))
        media = set()
        for n in descendants:
            if n["tag"] in {"video", "source"} and n["attrs"].get("src"):
                media.add(("video", n["attrs"]["src"]))
            if "tgme_widget_message_photo_wrap" in n["attrs"].get("class", "").split():
                match = re.search(r"url\(['\"]?(.*?)['\"]?\)", n["attrs"].get("style", ""))
                if match:
                    media.add(("photo", match[1]))
        content = text(body) if body else ""
        links = {n["attrs"]["href"] for n in nodes(body) if n["tag"] == "a" and n["attrs"].get("href", "").startswith(("http://", "https://"))} if body else set()
        links.update(re.findall(r"https?://[^\s)]+", content))
        result.append({"id": post_id.split("/")[-1], "url": "https://t.me/" + post_id,
                       "text": content, "date": stamp, "media": media, "links": links})
    return result


async def replay(args):
    report_bytes = args.report.read_bytes()
    report = json.loads(report_bytes)
    results, failures = [], 0
    for job in report["jobs"]:
        spec = job["spec"]
        if spec["target"]["kind"] != "telegram":
            continue
        for step in job["result"]["steps"]:
            if step.get("status") != "captured":
                continue
            artifact = step["payload"]
            raw = (args.data_dir / artifact["path"]).read_bytes()
            if hashlib.sha256(raw).hexdigest() != artifact["sha256"]:
                raise ValueError("Captured payload hash mismatch")
            expected = reference(raw)
            route = next(r for r in spec["routes"] if r["id"] == step["route"])
            normalized = step["normalized"] if args.original else await normalize(raw, spec["target"], route, step["started_at"])
            items = normalized["items"]
            checks = {"ids_and_order_match": [i["id"] for i in items] == [e["id"] for e in expected], "post_errors": []}
            by_id = {i["id"]: i for i in items}
            instant = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00"))
            for e in expected:
                i = by_id.get(e["id"])
                if i is None:
                    checks["post_errors"].append({"id": e["id"], "failed": ["missing_post"]})
                    continue
                fields = {"text": clean(i["text"]) == clean(e["text"]),
                          "date": instant(i["published_at"]) == instant(e["date"]),
                          "url": i["url"] == e["url"],
                          "links": set(i["links"]) == e["links"],
                          "media": {(m["type"], m.get("url")) for m in i["media"]} == e["media"]}
                failed = [name for name, passed in fields.items() if not passed]
                if failed:
                    checks["post_errors"].append({"id": e["id"], "failed": failed})
            failures += int(not checks["ids_and_order_match"] or bool(checks["post_errors"]))
            results.append({"target": spec["target"]["id"], "payload_sha256": artifact["sha256"],
                            "returned": len(items), "checks": checks, "normalized": normalized})
    if not results:
        raise ValueError("No captured Telegram steps to verify")
    output = {"original_report_sha256": hashlib.sha256(report_bytes).hexdigest(),
              "mode": "original" if args.original else "replay", "network_calls": 0,
              "parser_sha256": hashlib.sha256((Path(__file__).resolve().parents[3] / "packages/connectors/src/telegram.ts").read_bytes()).hexdigest() if not args.original else None,
              "comparisons": len(results), "failed_comparisons": failures, "results": results}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as handle:
        json.dump(output, handle, ensure_ascii=False, indent=2)
    print(json.dumps({"comparisons": len(results), "failed_comparisons": failures, "output": str(args.output)}))
    return bool(failures)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--original", action="store_true", help="Check original saved output instead of rerunning the parser")
    raise SystemExit(asyncio.run(replay(parser.parse_args())))
