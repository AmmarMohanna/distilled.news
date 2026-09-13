"""Isolated offline extraction process. Never fetches a URL."""
import json
import sys


def main():
    request = json.loads(sys.stdin.buffer.read(110 * 1024 * 1024))
    if request["operation"] == "trafilatura":
        import trafilatura
        value = trafilatura.bare_extraction(request["payload"], url=request["target"]["input"],
            include_comments=False, include_tables=False, favor_precision=True, with_metadata=True)
        if value is not None and not isinstance(value, dict): value = value.as_dict()
        value = value or {}
        output = {"title": value.get("title", ""), "body": value.get("text", ""), "published_at": value.get("date")}
    else: raise ValueError("Unknown isolated operation")
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__": main()
