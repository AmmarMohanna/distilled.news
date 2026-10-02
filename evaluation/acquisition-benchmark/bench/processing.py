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


def limit_feed(result, max_items):
    """Cap normalized entries in feed order, without hiding intentional omissions."""
    if max_items is None: return result
    if type(max_items) is not int or max_items < 1:
        raise ValueError("max_items must be a positive integer")
    available = len(result["items"])
    result["items"] = result["items"][:max_items]
    result["item_limit"] = {"maximum": max_items, "available": available,
                            "returned": len(result["items"]), "omitted": max(0, available-max_items)}
    return result


def feed_media(entry):
    """Map Media RSS as well as enclosures; feedparser keeps them separately."""
    media, seen = [], set()
    for field in ("media_content", "media_thumbnail", "enclosures"):
        for value in entry.get(field, []):
            url = value.get("url") or value.get("href")
            if not url or url in seen: continue
            seen.add(url)
            kind = value.get("medium") or value.get("type", "")
            kind = "photo" if field == "media_thumbnail" or kind == "image" or kind.startswith("image/") else "video" if kind == "video" or kind.startswith("video/") else "audio" if kind == "audio" or kind.startswith("audio/") else "unknown"
            media.append({"url": url, "type": kind})
    return media


def telethon_fields(row):
    """Map MTProto entities and media without inventing public download URLs."""
    text = row.get("message") or ""
    encoded = text.encode("utf-16-le")
    links = []
    for entity in row.get("entities") or []:
        url = None
        if entity.get("_") == "MessageEntityTextUrl":
            url = entity.get("url")
        elif entity.get("_") == "MessageEntityUrl":
            offset, length = entity.get("offset"), entity.get("length")
            if type(offset) is int and type(length) is int and offset >= 0 and length > 0 and (offset + length) * 2 <= len(encoded):
                try: url = encoded[offset * 2:(offset + length) * 2].decode("utf-16-le")
                except UnicodeDecodeError: pass
        if isinstance(url, str) and re.match(r"^https?://", url, re.I) and url not in links:
            links.append(url)
    for url in re.findall(r"https?://[^\s)]+", text):
        if url not in links: links.append(url)

    raw = row.get("media")
    media, previews = [], []
    if isinstance(raw, dict):
        kind = raw.get("_")
        value = raw.get("photo") if kind == "MessageMediaPhoto" else raw.get("document") if kind == "MessageMediaDocument" else None
        if isinstance(value, dict) and value.get("id") is not None:
            media_type = "photo" if kind == "MessageMediaPhoto" else "document"
            attributes = value.get("attributes") or []
            names = {a.get("_") for a in attributes}
            if "DocumentAttributeAnimated" in names: media_type = "animation"
            elif "DocumentAttributeVideo" in names: media_type = "video"
            elif "DocumentAttributeAudio" in names:
                media_type = "voice" if any(a.get("voice") for a in attributes if a.get("_") == "DocumentAttributeAudio") else "audio"
            media.append({"type": media_type, "telegram_id": str(value["id"]),
                          "requires_api_download": True})
        elif kind == "MessageMediaWebPage":
            page = raw.get("webpage") or {}
            previews.append({"url": page.get("url"), "title": page.get("title")})
        elif kind != "MessageMediaEmpty":
            media.append({"type": "unknown", "telegram_type": kind, "unresolved": True})
    return {"links": links, "media": media, "link_previews": previews, "raw_media": raw}


async def normalize(payload, target, route, fetched_at, *, offline=False, max_items=None):
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
                dates = entry.get("published_parsed") or entry.get("updated_parsed")
                date_source = "published" if entry.get("published_parsed") else "updated" if dates else None
                stamp = __import__('calendar').timegm(dates) if dates else None
                # Prefer the publisher summary. Media RSS descriptions can appear in
                # feedparser's content list and must not replace the article summary.
                description = entry.get("summary", "")
                if not description:
                    description = next((value.get("value", "") for value in entry.get("content", []) if value.get("value")), "")
                items.append({"id": str(entry.get("id", entry.get("link", ""))), "text": entry.get("title", "") + " " + description,
                    "published_at": parsed_date(stamp), "date_source": date_source, "url": entry.get("link"), "media": feed_media(entry), "source_id": target["id"]})
            return limit_feed({"items": items, "issues": ["malformed_feed"] if feed.bozo else []}, max_items)
        return limit_feed(await isolated("google_news" if adapter == "google_news_rss" else "rss", raw, target, fetched_at), max_items)
    if adapter == "telegram_public":
        result = await isolated("telegram", raw, target, fetched_at)
        # A channel landing page supplies no message inventory. It is not evidence
        # that the requested channel/window contains zero posts.
        if not result["items"] and not re.search(r"\bdata-post\s*=", raw, re.I):
            result.setdefault("issues", []).append("public_preview_has_no_message_inventory")
        return result
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
        if adapter == "telethon":
            extra = telethon_fields(row)
            values["media"] = extra.pop("media")
        if adapter == "x_api":
            url = f"https://x.com/i/web/status/{original_id}"
            links, values["media"] = x_fields(row, expansions)
            extra = {"links": links, "unresolved_media_keys": [item["media_key"] for item in values["media"] if item.get("unresolved")]}
        if adapter == "linkedin_api": values["date"] = lookup(row, ["publishedAt", "createdAt"])
        items.append({"id": original_id, "text": str(values["text"] or ""), "published_at": parsed_date(values["date"]),
            "url": url, "author": values["author"], "media": values["media"], "source_id": target["id"], **extra})
    return {"items": items, "normalization_dropped": rejected, "raw_item_count": len(rows), "issues": []}
