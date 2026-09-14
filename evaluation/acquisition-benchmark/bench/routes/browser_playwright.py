"""Chromium acquisition in two separately scored variants.

isolated: Chromium has no network; the pinned HTTP client fulfills GET requests without cookies.
standard: ordinary Chromium networking with cookies and all methods. Its per-request address
check does not cover redirects or DNS changes, so config requires a confirmed host egress firewall.
"""
import asyncio
from contextlib import AsyncExitStack
import os
import shutil
import sys
from urllib.parse import urlsplit

from bench.network import NetworkError
from bench.routes.common import Unavailable
from bench.safety import UnsafeTargetError, validate_public_http_url

BLOCKED_RESOURCES = ["font", "image", "media"]
VIEWPORT = {"width": 1280, "height": 720}
LOCALE = "en-US"
VARIANTS = {
    "isolated": "isolated_network_pinned_interception_no_cookies_get_only",
    "standard": "standard_network_cookies_all_methods_address_guard_host_firewall",
}


def isolation_available():
    return sys.platform == "linux" and bool(shutil.which("unshare"))


async def launch(playwright, root, network):
    if network == "standard":
        return await playwright.chromium.launch()
    wrapper = root / "runtime" / "chromium-isolated"
    wrapper.parent.mkdir(parents=True, exist_ok=True)
    wrapper.write_text('#!/bin/sh\nexec unshare --user --map-root-user --net "$BENCH_CHROMIUM" "$@"\n', encoding="utf-8")
    wrapper.chmod(0o700)
    return await playwright.chromium.launch(executable_path=str(wrapper),
        env=dict(os.environ) | {"BENCH_CHROMIUM": playwright.chromium.executable_path})


async def acquire(ctx):
    network = ctx.route["settings"].get("network", "isolated")
    if network == "isolated" and not isolation_available():
        raise Unavailable("Isolated browser collection requires Linux unshare network isolation")
    from playwright.async_api import async_playwright
    await asyncio.to_thread(validate_public_http_url, ctx.target["input"])
    total = 0
    limit_error = None
    counting = []
    checked_hosts = {}

    def over_budget(size):
        nonlocal total, limit_error
        total += size
        if total > ctx.limits["max_job_bytes"] and not limit_error: limit_error = NetworkError("too_large")

    async def isolated_route(route):
        req = route.request
        if limit_error or req.resource_type in BLOCKED_RESOURCES or req.method != "GET":
            await route.abort(); return
        try:
            response = await ctx.http.request("GET", req.url, follow_redirects=False)
            over_budget(len(response.body))
            if limit_error: raise limit_error
            headers = {key: value for key, value in response.headers.items() if key not in {"content-encoding", "content-length", "transfer-encoding", "set-cookie"}}
            await route.fulfill(status=response.status, headers=headers, body=response.body)
        except Exception:
            ctx.warnings.append("browser_subrequest_rejected")
            await route.abort()

    async def public_host(url):
        parsed = urlsplit(url)
        key = (parsed.scheme, parsed.hostname, parsed.port)
        if key not in checked_hosts:
            try:
                await asyncio.to_thread(validate_public_http_url, url)
                checked_hosts[key] = True
            except (UnsafeTargetError, ValueError):
                checked_hosts[key] = False
        return checked_hosts[key]

    async def standard_route(route):
        req = route.request
        if limit_error or req.resource_type in BLOCKED_RESOURCES:
            await route.abort(); return
        if urlsplit(req.url).scheme in {"data", "blob"}:
            await route.continue_(); return
        if not await public_host(req.url):
            ctx.warnings.append("browser_subrequest_rejected")
            await route.abort(); return
        await route.continue_()

    async def count_finished(request):
        try:
            sizes = await request.sizes()
            over_budget(sizes.get("responseBodySize", 0) + sizes.get("responseHeadersSize", 0))
        except Exception:
            ctx.warnings.append("browser_size_unavailable")

    async with async_playwright() as playwright:
        browser = await launch(playwright, ctx.state.root, network)
        async with AsyncExitStack() as cleanup:
            cleanup.push_async_callback(browser.close)
            context = await browser.new_context(service_workers="block", accept_downloads=False, viewport=VIEWPORT, locale=LOCALE)
            cleanup.push_async_callback(context.close)
            await context.route("**/*", isolated_route if network == "isolated" else standard_route)
            if network == "standard":
                # Response sizes arrive after completion, so one response can exceed the budget before it is detected.
                context.on("requestfinished", lambda request: counting.append(asyncio.ensure_future(count_finished(request))))
            if hasattr(context, "route_web_socket"):
                await context.route_web_socket("**/*", lambda socket: socket.close())
            page = await context.new_page()
            response = await page.goto(ctx.target["input"], wait_until="domcontentloaded", timeout=ctx.limits["attempt_seconds"] * 1000)
            await page.wait_for_timeout(1000)
            if counting: await asyncio.gather(*counting)
            if limit_error: raise limit_error
            if response is None: raise NetworkError("browser_no_response")
            if network == "standard" and not await public_host(page.url):
                raise UnsafeTargetError("Browser final URL is not a public address")
            payload = (await page.content()).encode()
            if len(payload) > ctx.limits["max_bytes"]: raise NetworkError("too_large")
            if response.status >= 400: raise NetworkError("target_http_error", response.status)
            return {"format": "html", "payload": payload, "resolved_url": page.url,
                    "coverage": {"browser_version": browser.version, "network": network, "variant": VARIANTS[network],
                        "blocked_resource_types": BLOCKED_RESOURCES, "network_bytes": total,
                        "network_bytes_method": "fulfilled_bodies" if network == "isolated" else "finished_request_sizes",
                        "target_http_status": response.status, "representation": "rendered_dom",
                        "viewport": VIEWPORT, "locale": LOCALE}}
