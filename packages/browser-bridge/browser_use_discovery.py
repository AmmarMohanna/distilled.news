"""Bounded Browser Use Path 3 discovery worker. Stdin/stdout carry only public URLs.

This process is not an authority boundary: its output must be checked against
Distilled's trusted Chromium observations before a workflow can be promoted.
"""

import asyncio
import contextlib
import json
import os
import sys
import traceback
import urllib.request
import uuid
from urllib.parse import urlparse


class DiscoveryFailure(Exception):
    def __init__(self, category: str):
        self.category = category
        super().__init__(category)


def safe_exception_type(error: BaseException | None) -> str | None:
    if error is None:
        return None
    value = f"{type(error).__module__}.{type(error).__name__}"
    return value if len(value) <= 120 and all(character.isalnum() or character in "._" for character in value) else None


def safe_trace(error: BaseException | None) -> list[str]:
    if error is None:
        return []
    frames = traceback.extract_tb(error.__traceback__)[-4:]
    values = [f"{os.path.basename(frame.filename)}.{frame.name}" for frame in frames]
    return [value for value in values if len(value) <= 100 and all(character.isalnum() or character in "._" for character in value)]


def runtime_hint(error: BaseException | None) -> str | None:
    if not isinstance(error, RuntimeError):
        return None
    message = str(error).lower()
    cases = (
        ("failed to launch browser", "BROWSER_LAUNCH"),
        ("no local chrome", "BROWSER_EXECUTABLE"),
        ("no local browser path", "BROWSER_EXECUTABLE"),
        ("chrome profile directory", "BROWSER_PROFILE"),
        ("cdp client not initialized", "CDP_INITIALIZATION"),
        ("failed to establish cdp", "CDP_INITIALIZATION"),
        ("failed to get session for initial target", "CDP_INITIALIZATION"),
        ("no active page", "PAGE_TARGET"),
        ("no page targets", "PAGE_TARGET"),
        ("sessionmanager not initialized", "SESSION_MANAGER"),
        ("failed to load system prompt", "PROMPT_TEMPLATE"),
        ("cannot be called from a running event loop", "EVENT_LOOP"),
        ("connection error", "MODEL_CONNECTION"),
        ("browser not connected", "BROWSER_DISCONNECTED"),
    )
    return next((category for phrase, category in cases if phrase in message), "OTHER_RUNTIME")


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
    try:
        from browser_use import Agent, Browser, ChatOpenAI, Tools, ActionResult
        from browser_use.browser.profile import BrowserProfile
        from pydantic import BaseModel, Field
    except Exception as error:
        raise DiscoveryFailure("BROWSER_USE_IMPORT_FAILED") from error

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
        raise DiscoveryFailure("MODEL_CONFIGURATION_FAILED")
    # All site traffic goes through the existing fenced Distilled bridge. The
    # Browser Use native browser has no navigation actions or source authority.
    browser = Browser(browser_profile=BrowserProfile(
        allowed_domains=["invalid.invalid"], block_ip_addresses=True,
        executable_path=os.environ.get("DISTILLED_BROWSER_USE_CHROMIUM"),
        headless=True, chromium_sandbox=True, enable_default_extensions=False))
    tools = Tools(exclude_actions=["search", "navigate", "go_back", "wait", "click", "input",
                                   "upload_file", "scroll", "find_text", "send_keys", "evaluate",
                                   "switch", "close", "extract", "screenshot", "dropdown_options",
                                   "select_dropdown", "write_file", "read_file", "replace_file"])
    visited: list[str] = []
    observed_links: set[str] = set()
    model_calls = 0
    browser_actions = 0
    agent_actions = 0

    class CountedChatOpenAI(ChatOpenAI):
        async def ainvoke(self, *args, **kwargs):
            nonlocal model_calls
            result = await super().ainvoke(*args, **kwargs)
            model_calls += 1
            return result

    def bridge(operation: str, **arguments: object) -> dict:
        nonlocal browser_actions
        body = json.dumps({"protocol": "v1", "operationId": str(uuid.uuid4()),
                           "capability": capability, "operation": operation, **arguments}).encode()
        request = urllib.request.Request(bridge_url, data=body, headers={"content-type": "application/json"}, method="POST")
        with urllib.request.urlopen(request, timeout=25) as response:
            envelope = json.load(response)
        if envelope.get("ok") is not True:
            raise DiscoveryFailure("ACTION_BRIDGE_FAILED")
        result = envelope["result"]
        if not isinstance(result, dict) or not admitted(result.get("url", ""), origin):
            raise DiscoveryFailure("ACTION_BRIDGE_FAILED")
        if result["url"] not in visited:
            visited.append(result["url"])
        for value in result.get("listingLinks", []):
            if isinstance(value, str) and admitted(value, origin):
                observed_links.add(value)
        for control in result.get("controls", []):
            if isinstance(control, dict) and isinstance(control.get("destinationUrl"), str) and admitted(control["destinationUrl"], origin):
                observed_links.add(control["destinationUrl"])
        browser_actions += 1
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
        nonlocal agent_actions
        if not admitted(url, origin):
            return ActionResult(extracted_content="Navigation denied by Distilled origin policy")
        result = await asyncio.to_thread(bridge, "NAVIGATE_PUBLIC_PAGE", url=url)
        agent_actions += 1
        return ActionResult(extracted_content=summary(result))

    @tools.action("Scroll the current Distilled public page by up to 1200 pixels and inspect it")
    async def scroll_source() -> ActionResult:
        nonlocal agent_actions
        result = await asyncio.to_thread(bridge, "SCROLL_PUBLIC_PAGE", deltaY=1200)
        agent_actions += 1
        return ActionResult(extracted_content=summary(result))

    @tools.action("Observe the current Distilled public page")
    async def observe_source() -> ActionResult:
        nonlocal agent_actions
        result = await asyncio.to_thread(bridge, "OBSERVE_PUBLIC_PAGE")
        agent_actions += 1
        return ActionResult(extracted_content=summary(result))
    # A bounded, fenced listing probe gives the agent real links on sites that
    # render items only after scrolling. These are hints, never trusted evidence.
    initial = await asyncio.to_thread(bridge, "NAVIGATE_PUBLIC_PAGE", url=source_url)
    initial_observations = [summary(initial)]
    if not initial.get("challengeState") or initial.get("challengeState") == "NO_CHALLENGE":
        for _ in range(2):
            initial = await asyncio.to_thread(bridge, "SCROLL_PUBLIC_PAGE", deltaY=1200)
            initial_observations.append(summary(initial))
            if initial.get("challengeState") and initial.get("challengeState") != "NO_CHALLENGE":
                break
    try:
        agent = Agent(
            task=(f"Explore the public news listing {source_url} using navigate_source, scroll_source and observe_source. "
                  f"Distilled already observed these bounded listing states: {initial_observations}. "
                  "Select article_urls from the observed listing links; propose at least two when two are visible. "
                  "You may use navigate_source, scroll_source and observe_source to investigate further. "
                  "Distilled will visit your proposed article URLs through its fenced browser and verify them independently. "
                  "Identify listing and article URLs, continuation, timestamp hints, and visible challenges. "
                  "Do not submit forms, authenticate, or claim a challenge was solved."),
            llm=CountedChatOpenAI(model=model, api_key=os.environ["OPENAI_API_KEY"],
                           base_url=os.environ["OPENAI_BASE_URL"], reasoning_effort=None),
            browser=browser, tools=tools,
            output_model_schema=Discovery, use_vision=False, directly_open_url=False,
        )
    except Exception as error:
        raise DiscoveryFailure("AGENT_INITIALIZATION_FAILED") from error
    try:
        history = await agent.run(max_steps=max_steps)
    except DiscoveryFailure:
        raise
    except Exception as error:
        category = "MODEL_REQUEST_FAILED" if type(error).__name__ in {"APIStatusError", "AuthenticationError", "APIConnectionError", "RateLimitError"} else "AGENT_RUN_FAILED"
        raise DiscoveryFailure(category) from error
    result = history.structured_output
    if result is None:
        raise DiscoveryFailure("STRUCTURED_OUTPUT_INVALID")
    visited = visited[:32]
    structured = result.model_dump()
    listings = [url for url in structured["listing_urls"] if url in visited]
    # The model selects hypotheses only from links actually seen by the fenced
    # browser. Execute selected visits here; the Worker later re-observes them
    # in a fresh session before compiling any workflow.
    articles = []
    for url in structured["article_urls"][:8]:
        if url not in observed_links:
            continue
        if url not in visited:
            await asyncio.to_thread(bridge, "NAVIGATE_PUBLIC_PAGE", url=url)
        if url in visited:
            articles.append(url)
    continuation = structured["continuation"]
    if continuation not in {"none", "pagination", "load_more", "scroll"}:
        continuation = "none"
    return {
        "protocol": "distilled.browser-use.discovery.v1", "runId": run_id,
        "visitedUrls": visited, "listingUrls": listings, "articleUrls": articles,
        "continuation": continuation,
        "timestampHints": structured["timestamp_hints"][:16],
        "steps": min(32, history.number_of_steps()),
        "modelCalls": min(32, model_calls),
        "browserActions": min(64, browser_actions),
        "agentBrowserActions": min(32, agent_actions),
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
        category = error.category if isinstance(error, DiscoveryFailure) else "AGENT_RUN_FAILED"
        origin = error.__cause__ if isinstance(error, DiscoveryFailure) else error
        print(json.dumps({"error": "browser_use_discovery_failed", "category": category,
                          "failureType": safe_exception_type(origin),
                          "causeType": safe_exception_type(origin.__cause__ if origin else None),
                          "failureTrace": safe_trace(origin),
                          "runtimeHint": runtime_hint(origin)}))
        sys.exit(1)
