"""Shared acquisition errors, credentials, and durable request evidence."""
from datetime import datetime, timezone


class Unavailable(Exception): pass


class RemotePending(Exception): pass


class UncertainSubmission(Exception): pass


def secret(ctx, default):
    name = ctx.route["settings"].get("credential_env", default)
    value = ctx.credentials.get(name)
    if not value: raise Unavailable(f"Missing credential environment variable {name}")
    ctx.secrets.add(value)
    return value


async def request(ctx, method, url, **kwargs):
    ctx.state.checkpoint("dispatched:" + ctx.job + ":" + ctx.route["id"], {"at": datetime.now(timezone.utc).isoformat()})
    response = await ctx.http.request(method, url, **kwargs)
    ctx.save(response.body, {"url": response.url, "status": response.status,
                            "content_type": response.headers.get("content-type"),
                            "retry_after": response.headers.get("retry-after")})
    return response
