"""Zyte HTTP response acquisition using the common runner and evidence store."""
import asyncio
import base64
import binascii

from bench.network import NetworkError, require_ok
from bench.routes.common import request, secret
from bench.safety import validate_public_http_url


async def acquire(ctx):
    await asyncio.to_thread(validate_public_http_url, ctx.target["input"])
    key = secret(ctx, "ZYTE_API_KEY")
    response = require_ok(await request(
        ctx, "POST", "https://api.zyte.com/v1/extract", api_host="api.zyte.com", auth=(key, ""),
        data=ctx.route["settings"].get("request", {}) | {
            "url": ctx.target["input"], "httpResponseBody": True, "httpResponseHeaders": True
        }, maximum=ctx.limits["max_bytes"] * 2
    ))
    try:
        envelope = response.json()
    except ValueError as error:
        raise NetworkError("provider_schema") from error
    if not isinstance(envelope, dict) or type(envelope.get("statusCode")) is not int:
        raise NetworkError("provider_schema")
    status = envelope["statusCode"]
    if not 200 <= status < 300:
        raise NetworkError("target_http_error", status)
    if not isinstance(envelope.get("httpResponseBody"), str):
        raise NetworkError("provider_schema")
    try:
        payload = base64.b64decode(envelope["httpResponseBody"], validate=True)
    except (ValueError, binascii.Error) as error:
        raise NetworkError("provider_schema") from error
    if len(payload) > ctx.limits["max_bytes"]:
        raise NetworkError("too_large")
    coverage = {"outer_http_status": response.status, "target_http_status": status,
                "provider_internals": "unknown", "representation": "provider_returned_target_body"}
    # request() has saved the envelope; Runner saves this decoded body once.
    # Saving it here too would count the same payload twice against max_job_bytes.
    return {"format": "html", "payload": payload, "coverage": coverage}
