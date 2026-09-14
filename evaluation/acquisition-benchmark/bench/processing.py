"""Source normalization and backwards-compatible processing entry points."""
import html
import json
import re

from bench.extractors import extract, isolated
from bench.validator import article_validation
from bench.score import (canonical_url, date_matches, normalize_text, parsed_date, score_article,
                         score_source, similarity, source_reference_gaps, wilson)


def lookup(value, paths, default=None):
    for path in paths:
        current = value
        for key in path.split("."):
            if not isinstance(current, dict): current = None; break
            current = current.get(key)
        if current is not None: return current
    return default


def feed_gate(raw):
    """Match the production root gate for both parsers, including legacy DTD feeds."""
    if "<!ENTITY" in raw.upper(): raise ValueError("feed_entities_refused")
    document = re.sub(r"""<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE\b(?:[^>"'\[]|"[^"]*"|'[^']*'|\[(?:[^\]"']|"[^"]*"|'[^']*')*\])*>""", "", raw, flags=re.I)
    document = re.sub(r"^[\s\ufeff]+", "", document)
    if not re.match(r"<(?:rss|feed|rdf:RDF)(?:\s|/?>)", document, re.I): raise ValueError("not_a_feed")


def x_fields(row, expansions):
    """Preserve link entities and join media expansions from every captured page."""
    entities = lookup(row, ["note_tweet.entities", "entities"], {})
    links = []
    for entity in entities.get("urls", []) or []:
        url = lookup(entity, ["unwound_url", "expanded_url", "url"])
        if isinstance(url, str) and url not in links: links.append(url)
    media = []
    for key in lookup(row, ["attachments.media_keys"], []) or []:
        # Preserve the reference when the API omitted an expansion; never fabricate a URL.
        media.append(expansions.get(key, {"media_key": key, "unresolved": True}))
    return links, media


async def normalize(payload, target, route, fetched_at, *, offline=False):
    adapter, settings = route["adapter"], route["settings"]
    raw = payload.decode("utf-8", errors="replace")
    if offline and target.get("format") == "normalized": return {"items": json.loads(payload), "issues": []}
    if adapter in {"rss", "google_news_rss"}:
        feed_gate(raw)
        if settings.get("parser") == "feedparser":
            import feedparser
            feed = feedparser.parse(payload)
            items = []
            for entry in feed.entries:
                dates = entry.get("published_parsed")
                stamp = __import__('calendar').timegm(dates) if dates else None
                items.append({"id": str(entry.get("id", entry.get("link", ""))), "text": entry.get("title", "") + " " + (entry.get("content", [{}])[0].get("value", entry.get("summary", ""))),
                    "published_at": parsed_date(stamp), "url": entry.get("link"), "media": entry.get("enclosures", []), "source_id": target["id"]})
            return {"items": items, "issues": ["malformed_feed"] if feed.bozo else []}
        return await isolated("google_news" if adapter == "google_news_rss" else "rss", raw, target, fetched_at)
    if adapter == "telegram_public": return await isolated("telegram", raw, target, fetched_at)
    data = json.loads(payload)
    if adapter == "apify":
        result = await isolated("apify", raw, target, fetched_at)
        result["raw_item_count"] = len(data)
        result["normalization_dropped"] = len(data) - len(result["items"])
        if target["kind"] == "google_news" and any(not any(item.get(key) for key in ("publishedAt", "published_at", "publishedTimestamp", "timestamp", "date")) for item in data):
            result.setdefault("issues", []).append("raw_publication_date_missing")
        return result
    rows = data.get("data", []) if isinstance(data, dict) else data
    if not isinstance(rows, list): raise ValueError("source_dataset_not_a_list")
    items, rejected = [], 0
    expansions = {}
    if adapter == "x_api" and isinstance(data, dict):
        pages = data.get("includes", [])
        if isinstance(pages, dict): pages = [pages]
        for page in pages:
            for medium in page.get("media", []) or []:
                if medium.get("media_key"): expansions[medium["media_key"]] = medium
    fields = settings.get("field_map", {})
    for row in rows:
        if not isinstance(row, dict): rejected += 1; continue
        defaults = {
            "id": ["id", "post_id", "url"], "text": ["note_tweet.text", "text", "message", "description", "commentary"],
            "date": ["created_at", "date", "date_posted", "posted_at.date", "publishedAt", "postedAt"],
            "url": ["url", "post_url"], "author": ["author_id", "user_posted", "author", "authorName"],
            "media": ["photos", "media", "attachments", "content"]
        }
        values = {key: lookup(row, [fields[key]] if key in fields else paths) for key, paths in defaults.items()}
        if values["id"] is None: rejected += 1; continue
        original_id = str(values["id"])
        url = values["url"]
        if adapter == "telethon": url = f"https://t.me/{target['input'].lstrip('@')}/{original_id}"
        extra = {}
        if adapter == "x_api":
            url = f"https://x.com/i/web/status/{original_id}"
            links, values["media"] = x_fields(row, expansions)
            extra = {"links": links, "unresolved_media_keys": [item["media_key"] for item in values["media"] if item.get("unresolved")]}
        if adapter == "linkedin_api": values["date"] = lookup(row, ["publishedAt", "createdAt"])
        items.append({"id": original_id, "text": str(values["text"] or ""), "published_at": parsed_date(values["date"]),
            "url": url, "author": values["author"], "media": values["media"], "source_id": target["id"], **extra})
    return {"items": items, "normalization_dropped": rejected, "raw_item_count": len(rows), "issues": []}
