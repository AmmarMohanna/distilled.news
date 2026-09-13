"""Provider acquisition only. Normalization/scoring operate on the saved evidence."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import re
from urllib.parse import quote, urlencode

from bench.config import template
from bench.network import NetworkError, require_ok
from bench.routes import zyte_http, brightdata_unlocker, browser_playwright
from bench.routes.common import Unavailable, RemotePending, UncertainSubmission, request, secret



def utc(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None: raise ValueError("Timezone required")
    return parsed.astimezone(timezone.utc)


def username(value):
    name = value.removeprefix("@")
    if not re.fullmatch(r"[A-Za-z0-9_]{5,32}", name): raise ValueError("Invalid Telegram channel")
    return name





async def acquire(ctx):
    adapter, target, settings = ctx.route["adapter"], ctx.target, ctx.route["settings"]
    if ctx.config["mode"] == "offline":
        fixture = target.get("fixtures", {}).get(ctx.route["id"], target.get("fixture"))
        if not fixture: raise Unavailable("No offline fixture for this route/target")
        payload = Path(fixture).read_bytes()
        if len(payload) > ctx.limits["max_bytes"]: raise NetworkError("too_large")
        ctx.save(payload, {"fixture": True, "content_type": target.get("content_type", "text/html"), "status": 200})
        return {"format": target.get("format", "html" if target["kind"] == "article" else "json"), "payload": payload, "coverage": {"fixture": True}}
    if adapter == "fixture": raise Unavailable("Fixture adapter is offline-only")
    if adapter in {"direct_http", "rss", "google_news_rss", "telegram_public"}:
        url = target["input"]
        if adapter == "telegram_public": url = f"https://t.me/s/{username(url)}"
        if adapter == "google_news_rss":
            language, region = target.get("options", {}).get("language", "en"), target.get("options", {}).get("region", "US")
            url = "https://news.google.com/rss/search?" + urlencode({"q": url, "hl": f"{language}-{region}", "gl": region, "ceid": f"{region}:{language}"})
        cache_key = "http:" + ctx.run + ":" + url
        cached = ctx.state.checkpoint(cache_key) or {}
        headers = {"Accept-Language": settings.get("accept_language", "ar,en;q=0.9,fr;q=0.8")}
        if settings.get("conditional", False):
            if cached.get("etag"): headers["If-None-Match"] = cached["etag"]
            if cached.get("modified"): headers["If-Modified-Since"] = cached["modified"]
        response = await request(ctx, "GET", url, headers=headers)
        if response.status == 304:
            if not cached.get("artifact"): raise NetworkError("304_without_cached_body")
            payload = ctx.state.read_artifact(cached["artifact"])
        else:
            require_ok(response)
            payload = response.body
            ctx.state.checkpoint(cache_key, {"etag": response.headers.get("etag"), "modified": response.headers.get("last-modified"), "artifact": ctx.evidence[-1]["artifact"]})
        return {"format": "html" if adapter in {"direct_http", "telegram_public"} else "xml", "payload": payload,
                "resolved_url": response.url, "coverage": {"http_status": response.status, "scope": "latest_public_page" if adapter == "telegram_public" else "response"}}
    if adapter == "zyte_http": return await zyte_http.acquire(ctx)
    if adapter == "brightdata_unlocker": return await brightdata_unlocker.acquire(ctx)
    if adapter in {"apify", "brightdata_social"}: return await remote_collection(ctx)
    if adapter == "x_api": return await x_api(ctx)
    if adapter == "linkedin_api": return await linkedin_api(ctx)
    if adapter == "telethon": return await telegram(ctx)
    if adapter == "browser_playwright": return await browser_playwright.acquire(ctx)
    raise Unavailable("Unsupported adapter")


async def remote_collection(ctx):
    settings, adapter = ctx.route["settings"], ctx.route["adapter"]
    is_apify = adapter == "apify"
    host = "api.apify.com" if is_apify else "api.brightdata.com"
    token = secret(ctx, "APIFY_TOKEN" if is_apify else "BRIGHTDATA_API_TOKEN")
    headers = {"Authorization": f"Bearer {token}"}
    remote = ctx.remote or {}
    if remote and not remote.get("id"): raise UncertainSubmission("Remote submission requires manual reconciliation")
    if not remote:
        payload = template(settings.get("input", {"url": "{input}"}), ctx.target)
        if is_apify:
            actor = settings.get("task_id") or settings.get("actor_id")
            if not actor: raise Unavailable("actor_id or task_id required")
            params = {"timeout": int(ctx.limits["job_seconds"]), "maxItems": ctx.limits["max_items"]}
            if settings.get("build"): params["build"] = settings["build"]
            collection = "actor-tasks" if settings.get("task_id") else "acts"
            url = f"https://{host}/v2/{collection}/{quote(actor.replace('/', '~'), safe='~')}/runs?{urlencode(params)}"
        else:
            dataset = settings.get("dataset_id")
            if not dataset: raise Unavailable("Bright Data dataset_id required")
            query = {"dataset_id": dataset, "include_errors": "true"} | settings.get("query", {})
            url = f"https://{host}/datasets/v3/trigger?{urlencode(query)}"
        ctx.set_remote({"provider": adapter, "submission_started": True})
        response = require_ok(await request(ctx, "POST", url, api_host=host, headers=headers, data=payload))
        body = response.json()
        remote_id = body["data"]["id"] if is_apify else body["snapshot_id"]
        ctx.set_remote({"provider": adapter, "id": remote_id})
        remote = ctx.remote
    remote_id = quote(remote["id"], safe="")
    while True:
        if ctx.stopped(): raise RemotePending("Stopped with remote job retained")
        url = f"https://{host}/v2/actor-runs/{remote_id}" if is_apify else f"https://{host}/datasets/v3/progress/{remote_id}"
        body = require_ok(await request(ctx, "GET", url, api_host=host, headers=headers)).json()
        info = body["data"] if is_apify else body
        status = str(info.get("status", "")).upper()
        if status in {"SUCCEEDED", "READY"}: break
        if status in {"FAILED", "ABORTED", "TIMED-OUT", "TIMED_OUT", "ERROR"}: raise NetworkError("remote_" + status.lower())
        await asyncio.sleep(ctx.limits["poll_seconds"])
    items, cap = [], False
    if is_apify:
        dataset = info["defaultDatasetId"]
        for page in range(ctx.limits["max_pages"]):
            size = min(100, ctx.limits["max_items"] - len(items))
            if size <= 0: cap = True; break
            url = f"https://{host}/v2/datasets/{quote(dataset, safe='')}/items?" + urlencode({"format": "json", "clean": "true", "offset": len(items), "limit": size})
            response = require_ok(await request(ctx, "GET", url, api_host=host, headers=headers))
            batch = response.json()
            if not isinstance(batch, list): raise NetworkError("dataset_schema")
            if len(batch) > size: cap = True
            items.extend(batch[:size])
            total = response.headers.get("x-apify-pagination-total")
            if (total and len(items) >= int(total)) or len(batch) < size: break
        else: cap = True
        if len(items) >= ctx.limits["max_items"] and (not total or len(items) < int(total)): cap = True
        if isinstance(info.get("usageTotalUsd"), (int, float)):
            ctx.reported_cost = info["usageTotalUsd"]  # Evidence, not silently final invoice reconciliation.
    else:
        url = f"https://{host}/datasets/v3/snapshot/{remote_id}?format=json"
        response = require_ok(await request(ctx, "GET", url, api_host=host, headers=headers, maximum=ctx.limits["max_job_bytes"]))
        items = response.json()
        if not isinstance(items, list): raise NetworkError("dataset_schema")
        cap = len(items) > ctx.limits["max_items"]
        items = items[:ctx.limits["max_items"]]
    return {"format": "json", "payload": json.dumps(items).encode(), "coverage": {"capped": cap, "remote_id": remote["id"], "remote_status": status}}


async def x_api(ctx):
    token, options = secret(ctx, "X_BEARER_TOKEN"), ctx.target.get("options", {})
    headers = {"Authorization": f"Bearer {token}"}
    if ctx.target["kind"] == "x_profile":
        user_id = options.get("user_id")
        if not user_id:
            data = require_ok(await request(ctx, "GET", f"https://api.x.com/2/users/by/username/{quote(ctx.target['input'].lstrip('@'), safe='')}", headers=headers, api_host="api.x.com")).json()
            user_id = data["data"]["id"]
        endpoint = f"https://api.x.com/2/users/{quote(str(user_id), safe='')}/tweets"
        query = {"exclude": options["exclude"]} if options.get("exclude") else {}
        cursor_name = "pagination_token"
    else:
        variant = ctx.route["settings"].get("search", "recent")
        if variant not in {"recent", "all"}: raise ValueError("search must be recent or all")
        endpoint = f"https://api.x.com/2/tweets/search/{variant}"
        query, cursor_name = {"query": ctx.target["input"]}, "next_token"
    query |= {"tweet.fields": "created_at,author_id,attachments,referenced_tweets,entities,note_tweet", "expansions": "attachments.media_keys", "media.fields": "type,url,preview_image_url"}
    query |= {key: options[key] for key in ("start_time", "end_time", "since_id", "until_id") if options.get(key)}
    rows, seen, cursor, includes = [], set(), None, []
    for _ in range(ctx.limits["max_pages"]):
        query["max_results"] = max(10 if ctx.target["kind"] == "x_search" else 5, min(100, ctx.limits["max_items"] - len(rows)))
        if cursor: query[cursor_name] = cursor
        body = require_ok(await request(ctx, "GET", endpoint + "?" + urlencode(query), headers=headers, api_host="api.x.com")).json()
        if body.get("errors"): ctx.warnings.append("provider_partial_errors")
        rows.extend(body.get("data", [])); includes.append(body.get("includes", {}))
        cursor = body.get("meta", {}).get("next_token")
        if not cursor or len(rows) >= ctx.limits["max_items"]: break
        if cursor in seen: raise NetworkError("cursor_loop")
        seen.add(cursor)
    return {"format": "json", "payload": json.dumps({"data": rows[:ctx.limits['max_items']], "includes": includes}).encode(),
            "coverage": {"capped": bool(cursor) or len(rows) > ctx.limits["max_items"], "next_cursor": cursor}}


async def linkedin_api(ctx):
    token, settings = secret(ctx, "LINKEDIN_ACCESS_TOKEN"), ctx.route["settings"]
    version = settings.get("linkedin_version")
    if not version: raise Unavailable("Pin linkedin_version and confirm authorized read access")
    author = ctx.target.get("options", {}).get("author_urn")
    if not author: raise Unavailable("Authorized author_urn required")
    headers = {"Authorization": f"Bearer {token}", "LinkedIn-Version": str(version), "X-Restli-Protocol-Version": "2.0.0"}
    rows, more = [], False
    for _ in range(ctx.limits["max_pages"]):
        size = min(100, ctx.limits["max_items"] - len(rows))
        body = require_ok(await request(ctx, "GET", "https://api.linkedin.com/rest/posts?" + urlencode({"q": "author", "author": author, "start": len(rows), "count": size}), headers=headers, api_host="api.linkedin.com")).json()
        batch = body.get("elements", [])
        rows.extend(batch)
        more = any(link.get("rel") == "next" for link in body.get("paging", {}).get("links", [])) or len(batch) == size
        if not more or len(rows) >= ctx.limits["max_items"]: break
    return {"format": "json", "payload": json.dumps(rows).encode(), "coverage": {"capped": more, "authorized_cohort": True}}


async def telegram(ctx):
    from telethon import TelegramClient
    from telethon.tl.types import Channel
    api_hash = ctx.credentials.get("TELEGRAM_API_HASH")
    api_id = ctx.credentials.get("TELEGRAM_API_ID")
    session = ctx.credentials.get("TELEGRAM_SESSION_PATH")
    if not all((api_hash, api_id, session)): raise Unavailable("Telegram API ID/hash and external session path required")
    ctx.secrets.add(api_hash)
    client = TelegramClient(str(Path(session).expanduser()), int(api_id), api_hash,
        request_retries=0, connection_retries=0, auto_reconnect=False, flood_sleep_threshold=0, receive_updates=False)
    rows, cap = [], False
    options = ctx.target.get("options", {})
    end = utc(options["end_time"])
    start = utc(options["start_time"])
    try:
        await client.connect()
        if not await client.is_user_authorized(): raise Unavailable("Run telegram-login interactively before collection")
        entity = await client.get_entity(username(ctx.target["input"]))
        if not isinstance(entity, Channel) or not entity.broadcast or not entity.username: raise Unavailable("Public broadcast channel required")
        async for message in client.iter_messages(entity, offset_date=end, limit=ctx.limits["max_items"] + 1):
            if message.date < start: break
            if len(rows) >= ctx.limits["max_items"]: cap = True; break
            rows.append(json.loads(message.to_json()))
        payload = json.dumps(rows).encode()
        if len(payload) > ctx.limits["max_bytes"]: raise NetworkError("too_large")
        ctx.save(payload, {"channel_id": entity.id, "username": entity.username})
        return {"format": "json", "payload": payload, "coverage": {"capped": cap, "channel_id": entity.id}}
    finally:
        await asyncio.wait_for(client.disconnect(), timeout=5)
