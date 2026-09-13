"""Chromium acquisition with isolated networking and bounded HTTP interception."""
import asyncio
from contextlib import AsyncExitStack
import os
import shutil
import sys

from bench.network import NetworkError
from bench.routes.common import Unavailable
from bench.safety import validate_public_http_url


async def acquire(ctx):
    if sys.platform != "linux" or not shutil.which("unshare"):
        raise Unavailable("Browser collection requires Linux unshare network isolation")
    from playwright.async_api import async_playwright
    await asyncio.to_thread(validate_public_http_url, ctx.target["input"])
    # All browser network traffic is fulfilled by the pinned, bounded HTTP client.
    # Chromium does not resolve/connect to arbitrary page subresource hosts itself.
    total = 0
    limit_error = None
    async with async_playwright() as playwright:
        wrapper = ctx.state.root / "runtime" / "chromium-isolated"
        wrapper.parent.mkdir(parents=True, exist_ok=True)
        wrapper.write_text('#!/bin/sh\nexec unshare --user --map-root-user --net "$BENCH_CHROMIUM" "$@"\n', encoding="utf-8")
        wrapper.chmod(0o700)
        browser = await playwright.chromium.launch(executable_path=str(wrapper),
            env=dict(os.environ) | {"BENCH_CHROMIUM": playwright.chromium.executable_path})
        async with AsyncExitStack() as cleanup:
            cleanup.push_async_callback(browser.close)
            context = await browser.new_context(service_workers="block", accept_downloads=False,
                viewport={"width": 1280, "height": 720}, locale="en-US")
            cleanup.push_async_callback(context.close)
            async def intercept(route):
                nonlocal total, limit_error
                req = route.request
                if limit_error or req.resource_type in {"image", "media", "font", "websocket"} or req.method != "GET":
                    await route.abort(); return
                try:
                    response = await ctx.http.request("GET", req.url, follow_redirects=False)
                    total += len(response.body)
                    if total > ctx.limits["max_job_bytes"]: raise NetworkError("too_large")
                    headers = {key: value for key, value in response.headers.items() if key not in {"content-encoding", "content-length", "transfer-encoding", "set-cookie"}}
                    await route.fulfill(status=response.status, headers=headers, body=response.body)
                except Exception as error:
                    if isinstance(error, NetworkError) and error.code == "too_large": limit_error = error
                    ctx.warnings.append("browser_subrequest_rejected")
                    await route.abort()
            await context.route("**/*", intercept)
            if hasattr(context, "route_web_socket"):
                await context.route_web_socket("**/*", lambda socket: socket.close())
            page = await context.new_page()
            response = await page.goto(ctx.target["input"], wait_until="domcontentloaded", timeout=ctx.limits["attempt_seconds"] * 1000)
            await page.wait_for_timeout(1000)
            if limit_error: raise limit_error
            if response is None: raise NetworkError("browser_no_response")
            payload = (await page.content()).encode()
            if len(payload) > ctx.limits["max_bytes"]: raise NetworkError("too_large")
            if response.status >= 400: raise NetworkError("target_http_error", response.status)
            return {"format": "html", "payload": payload, "resolved_url": page.url,
                    "coverage": {"browser_version": browser.version,
                        "variant": "isolated_network_pinned_interception_no_cookies_get_only",
                        "network_bytes": total, "target_http_status": response.status,
                        "representation": "rendered_dom", "viewport": {"width": 1280, "height": 720}, "locale": "en-US"}}
