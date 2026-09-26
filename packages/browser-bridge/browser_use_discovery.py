"""Bounded Browser Use Path 3 discovery worker. Stdin/stdout carry only public URLs.

This process is not an authority boundary: its output must be checked against
Distilled's trusted Chromium observations before a workflow can be promoted.
"""

import asyncio
import contextlib
import json
import os
import sys
import urllib.request
import uuid
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
    from browser_use import Agent, Browser, ChatOpenAI, Tools, ActionResult
    from browser_use.browser.profile import BrowserProfile
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
    model = payload.get("modelRef", "")
    max_steps = payload.get("maxSteps", 0)
    capability = payload.get("capability")
    bridge_url = os.environ.get("DISTILLED_BRIDGE_URL", "")
    if not isinstance(model, str) or not 1 <= len(model) <= 128 or not isinstance(max_steps, int) or not 1 <= max_steps <= 16 or not isinstance(capability, dict) or capability.get("runId") != run_id or bridge_url != "http://127.0.0.1:8080/v1/internal-authenticated-browser":
        raise ValueError("invalid_discovery_input")
    if not model or not os.environ.get("OPENAI_API_KEY"):
        raise ValueError("discovery_model_unconfigured")
    # All site traffic goes through the existing fenced Distilled bridge. The
    # Browser Use native browser has no navigation actions or source authority.
    browser = Browser(browser_profile=BrowserProfile(
        allowed_domains=["invalid.invalid"], block_ip_addresses=True,
        executable_path=os.environ.get("DISTILLED_BROWSER_USE_CHROMIUM"),
        headless=True, enable_default_extensions=False))
    tools = Tools(exclude_actions=["search", "navigate", "go_back", "wait", "click", "input",
                                   "upload_file", "scroll", "find_text", "send_keys", "evaluate",
                                   "switch", "close", "extract", "screenshot", "dropdown_options",
                                   "select_dropdown", "write_file", "read_file", "replace_file"])
    visited: list[str] = []

    def bridge(operation: str, **arguments: object) -> dict:
        body = json.dumps({"protocol": "v1", "operationId": str(uuid.uuid4()),
                           "capability": capability, "operation": operation, **arguments}).encode()
        request = urllib.request.Request(bridge_url, data=body, headers={"content-type": "application/json"}, method="POST")
        with urllib.request.urlopen(request, timeout=25) as response:
            envelope = json.load(response)
        if envelope.get("ok") is not True:
            raise ValueError("distilled_bridge_rejected")
        result = envelope["result"]
        if not isinstance(result, dict) or not admitted(result.get("url", ""), origin):
            raise ValueError("distilled_observation_rejected")
        if result["url"] not in visited:
            visited.append(result["url"])
        return result

    def summary(result: dict) -> str:
        controls = result.get("controls", [])
        links = [value for value in result.get("listingLinks", []) if isinstance(value, str) and admitted(value, origin)]
        links += [control.get("destinationUrl") for control in controls if isinstance(control, dict) and isinstance(control.get("destinationUrl"), str) and admitted(control["destinationUrl"], origin)]
        article = result.get("article") or {}
        return json.dumps({"url": result["url"], "title": result.get("title", "")[:200],
                           "links": list(dict.fromkeys(links))[:40],
                           "articleCanonical": article.get("canonicalUrl"),
                           "articlePublished": article.get("publisherTimestamp"),
                           "challengeState": result.get("challengeState")}, separators=(",", ":"))[:12000]

    @tools.action("Navigate to a public same-origin page through Distilled's fenced Chromium browser")
    async def navigate_source(url: str) -> ActionResult:
        if not admitted(url, origin):
            return ActionResult(extracted_content="Navigation denied by Distilled origin policy")
        return ActionResult(extracted_content=summary(await asyncio.to_thread(bridge, "NAVIGATE_PUBLIC_PAGE", url=url)))

    @tools.action("Scroll the current Distilled public page by up to 1200 pixels and inspect it")
    async def scroll_source() -> ActionResult:
        return ActionResult(extracted_content=summary(await asyncio.to_thread(bridge, "SCROLL_PUBLIC_PAGE", deltaY=1200)))

    @tools.action("Observe the current Distilled public page")
    async def observe_source() -> ActionResult:
        return ActionResult(extracted_content=summary(await asyncio.to_thread(bridge, "OBSERVE_PUBLIC_PAGE")))
    agent = Agent(
        task=(f"Explore the public news listing {source_url} using navigate_source, scroll_source and observe_source. "
              "Navigate at least two article pages. Return only URLs you visited. "
              "Identify listing and article URLs, continuation, timestamp hints, and visible challenges. "
              "Do not submit forms, authenticate, or claim a challenge was solved."),
        llm=ChatOpenAI(model=model, api_key=os.environ["OPENAI_API_KEY"],
                       base_url=os.environ["OPENAI_BASE_URL"], reasoning_effort=None),
        browser=browser, tools=tools,
        output_model_schema=Discovery, use_vision=False, directly_open_url=False,
    )
    history = await agent.run(max_steps=max_steps)
    result = history.structured_output
    if result is None:
        raise ValueError("discovery_output_missing")
    visited = visited[:32]
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
        with open(os.devnull, "w") as sink, contextlib.redirect_stdout(sink):
            result = asyncio.run(discover(request))
        print(json.dumps(result, separators=(",", ":")))
    except Exception as error:
        # Only a fixed exception category crosses this boundary. Exception text
        # can contain model responses, URLs, or provider credentials.
        category = type(error).__name__
        if category not in {"ValueError", "RuntimeError", "TimeoutError", "HTTPError", "ValidationError", "APIStatusError", "AuthenticationError", "ConnectionError"}:
            category = "OtherError"
        print(json.dumps({"error": "browser_use_discovery_failed", "category": category}))
        sys.exit(1)
