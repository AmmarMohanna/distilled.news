"""Bright Data Web Unlocker raw-response acquisition."""
import asyncio

from bench.network import require_ok
from bench.routes.common import Unavailable, request, secret
from bench.safety import validate_public_http_url


async def acquire(ctx):
    await asyncio.to_thread(validate_public_http_url, ctx.target["input"])
    token = secret(ctx, "BRIGHTDATA_API_TOKEN")
    zone = ctx.route["settings"].get("zone") or ctx.credentials.get("BRIGHTDATA_UNLOCKER_ZONE")
    if not zone:
        raise Unavailable("Bright Data Unlocker zone required")
    response = require_ok(await request(
        ctx, "POST", "https://api.brightdata.com/request", api_host="api.brightdata.com",
        headers={"Authorization": f"Bearer {token}"},
        data={"zone": zone, "url": ctx.target["input"], "format": "raw"}
    ))
    return {"format": "html", "payload": response.body,
            "coverage": {"outer_http_status": response.status, "target_http_status": None,
                         "provider_internals": "unknown", "representation": "provider_returned_target_body"}}
