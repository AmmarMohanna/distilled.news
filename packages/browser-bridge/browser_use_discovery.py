"""Bounded Browser Use Path 3 discovery worker. Stdin/stdout carry only public URLs.

This process is not an authority boundary: its output must be checked against
Distilled's trusted Chromium observations before a workflow can be promoted.
"""

import asyncio
import json
import os
import sys
from urllib.parse import urlparse


def admitted(value: str, origin: str) -> bool:
    parsed = urlparse(value)
    source = urlparse(origin)
    return (
        parsed.scheme == source.scheme == "https"
        and parsed.hostname == source.hostname
        and parsed.port == source.port
        and not parsed.username
        and not parsed.password
        and len(value) <= 2048
    )


async def discover(payload: dict) -> dict:
    from browser_use import Agent, Browser, ChatOpenAI, Tools
    from pydantic import BaseModel, Field

    class Discovery(BaseModel):
        listing_urls: list[str] = Field(max_length=16)
        article_urls: list[str] = Field(max_length=32)
        continuation: str
        timestamp_hints: list[str] = Field(max_length=16)
        challenge_observed: bool

    source_url = payload["sourceUrl"]
    origin = payload["allowedOrigin"]
    run_id = payload["runId"]
    if not isinstance(run_id, str) or len(run_id) > 128 or not admitted(source_url, origin):
        raise ValueError("invalid_discovery_input")
    model = os.environ.get("DISTILLED_BROWSER_USE_MODEL", "").strip()
    if not model or not os.environ.get("OPENAI_API_KEY"):
        raise ValueError("discovery_model_unconfigured")
    # Browser Use's domain check is defense in depth. Distilled still requires
    # its independent Container network fence before enabling this in production.
    browser = Browser(allowed_domains=[origin], block_ip_addresses=True, headless=True,
                      enable_default_extensions=False)
    tools = Tools(exclude_actions=["search", "click", "input", "upload_file", "send_keys",
                                   "evaluate", "select_dropdown", "write_file", "read_file", "replace_file"])
    agent = Agent(
        task=(f"Explore the public news listing {source_url}. Use read-only navigation and scrolling. "
              "Identify listing and article URLs, continuation, timestamp hints, and visible challenges. "
              "Do not submit forms, authenticate, or claim a challenge was solved."),
        llm=ChatOpenAI(model=model), browser=browser, tools=tools,
        output_model_schema=Discovery, use_vision=False,
    )
    history = await agent.run(max_steps=12)
    result = history.structured_output
    if result is None:
        raise ValueError("discovery_output_missing")
    visited = list(dict.fromkeys(url for url in history.urls() if admitted(url, origin)))[:32]
    structured = result.model_dump()
    listings = [url for url in structured["listing_urls"] if url in visited]
    articles = [url for url in structured["article_urls"] if url in visited]
    continuation = structured["continuation"]
    if continuation not in {"none", "pagination", "load_more", "scroll"}:
        continuation = "none"
    return {
        "protocol": "distilled.browser-use.discovery.v1", "runId": run_id,
        "visitedUrls": visited, "listingUrls": listings, "articleUrls": articles,
        "continuation": continuation,
        "timestampHints": structured["timestamp_hints"][:16],
        "steps": min(32, history.number_of_steps()),
        "challengeObserved": structured["challenge_observed"],
    }


if __name__ == "__main__":
    try:
        request = json.loads(sys.stdin.read(8192))
        print(json.dumps(asyncio.run(discover(request)), separators=(",", ":")))
    except Exception:
        # No exception detail or page content may cross this process boundary.
        print('{"error":"browser_use_discovery_failed"}')
        sys.exit(1)
