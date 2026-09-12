# Distilled agent runtime

The canonical model-routing configuration is structured data. Distilled resolves a logical `ModelRole`; the gateway does not choose the role.

```json
{
  "mode": "hybrid",
  "apiGateway": "openrouter",
  "selfHostedGateway": "openai_compatible",
  "roles": {
    "NAVIGATION_FAST": {
      "primary": { "deployment": "self_hosted", "model": "local/navigation" },
      "fallbacks": [
        { "deployment": "self_hosted", "model": "local/navigation-fallback" },
        { "deployment": "api", "model": "provider/hosted-fallback" }
      ]
    },
    "VISION_FAST": {
      "primary": { "deployment": "api", "model": "provider/vision-a" },
      "fallbacks": [{ "deployment": "api", "model": "provider/vision-b" }]
    }
  }
}
```

Every configured role uses exactly one non-empty `primary` target and an ordered `fallbacks` array. A target contains `deployment: "api" | "self_hosted"` and `model`. `api` mode accepts only API targets, `self_hosted` accepts only self-hosted targets, and `hybrid` permits both in the configured order. Model and provider names are deployment data, not runtime constants. The hosted API gateway defaults to `openrouter`; the self-hosted gateway depends only on an OpenAI-compatible `/chat/completions` contract.

The runtime dependency chain remains `AgentRuntime -> ModelRouter -> ModelGateway`. `DeploymentModelGateway` selects an API or self-hosted `ModelGateway` from the durable route; no deployment conditional exists in the agent loop. Credentials and endpoint URLs are not part of the durable model-role mapping.

Environment overrides are unambiguous and per role:

```text
DISTILLED_LLM_MODE=api|self_hosted|hybrid
DISTILLED_LLM_API_GATEWAY=openrouter
OPENROUTER_API_KEY=...
DISTILLED_SELF_HOSTED_BASE_URL=http://inference.internal/v1
DISTILLED_SELF_HOSTED_API_KEY=...
DISTILLED_MODEL_ROLE_<MODEL_ROLE>_PRIMARY=provider/model-a
DISTILLED_MODEL_ROLE_<MODEL_ROLE>_PRIMARY_DEPLOYMENT=api|self_hosted
DISTILLED_MODEL_ROLE_<MODEL_ROLE>_FALLBACKS_JSON=[{"deployment":"api","model":"provider/model-b"},{"deployment":"self_hosted","model":"local/model-c"}]
```

`<MODEL_ROLE>` is one of `NAVIGATION_FAST`, `EXTRACTION_FAST`, `VISION_FAST`, `REASONING_STANDARD`, `REASONING_STRONG`, `VISION_STRONG`, `ADAPTER_REPAIR`, or `SEMANTIC_VERIFIER`. In non-hybrid modes a fallback JSON string may use the mode's implicit deployment for backwards-compatible environment input; the canonical format is the explicit object array above, and hybrid requires it. Empty entries, duplicate deployment/model targets, malformed arrays, and targets inconsistent with the selected mode are rejected.

The runtime keeps stable instructions separate from dynamic `AgentPageState`, observation-delta, budget, challenge, progress, completion-deficit, and capability data. A model response is a schema-validated plan of one to five actions. The deterministic controller decides whether each next action can continue without another model call. Exact response reuse is deliberately disabled; the immutable context-manifest hash and `allowExactReuse` seam remain available only for requests that can prove identical immutable context and safe reuse.

## Read-navigation security contract

`follow_read_link` and `visual_read_link` capabilities authorize navigation only to the exact runtime-resolved destination stored in the capability. Anchor elements and screenshot-grounded anchor coordinates are evidence for resolving that destination; they are never authority to execute a DOM event. Trusted observation, semantic control discovery, link-destination resolution, article extraction, and visual grounding use Chromium DevTools Protocol DOM snapshots, accessibility snapshots, or hit testing rather than page-owned JavaScript. URL resolution is performed in runtime code, and the observation-bound grounding record is durably persisted before policy evaluation. The executor performs direct navigation and does not call element, locator, or pointer click APIs for read-navigation capabilities.

Every persisted `ObservationEnvelope` remains `UNTRUSTED_EXTERNAL`, but it now records machine-readable provenance for the trusted transport: `observationSource`, `protocolSnapshotVersion`, `browserGeneration`, `pageId`, `pageRevision`, raw artifact hash, bounded projection hash, and timestamp. Safe observation transport does not make webpage content trusted instructions.

HTTP requests are independently checked for HTTP(S), exact allowed origin including port, DNS pinning, public-address eligibility, a `GET`/`HEAD` method, and a bounded per-session request ceiling. That method restriction does not prove that an origin implements side-effect-free GET handlers. The production invariant is narrower: Distilled never authorizes explicit user/account/business-state mutations and untrusted page code cannot open ungoverned active communication channels. Browser contexts deny WebSocket and EventSource routing, WebTransport, WebRTC data channels, Service Workers, dedicated/shared workers, downloads, and popups/new page network activity. Browser hardening and routing enforcement are both applied before untrusted documents load.

A denial before browser dispatch is `known_not_applied`. Once direct navigation or another browser effect has begun, a blocked request, download, popup, redirect, cancellation, or uncertain response remains `effect_unknown` unless deterministic reconciliation proves otherwise. Direct `page.goto()` remains subject to origin, DNS/SSRF, redirect, lease cancellation, browser-generation, capability-expiry, and ObservationEnvelope checks.

Challenge state is runtime-owned. A deterministic classifier uses main-document status, URL/login patterns, authentication controls, challenge markup, browser/network signals, and persisted fingerprint occurrence to produce every typed challenge state; a model may assist only when deterministic evidence is genuinely ambiguous. Retry scheduling and `CHALLENGE_LOOP` remain bounded controller transitions.

Canonical acquired content stores only stable content identity and article fields. Each run has a separate acquisition-provenance link containing its own generation, turn/model/tool call, observation, artifact, final URL, acquisition attempt, and acceptance timestamp. Recovery therefore never inherits the first accepting run's provenance. Each physical model attempt likewise records requested and actual model, provider, deployment, gateway, fallback reason, usage, cost, and latency; returned identities outside the resolved route are rejected. Exhausted Web Operator queue delivery durably fails and fences a nonterminal run, marks its outbox failed with an operator-visible reason, and invalidates its lease.

The Cloudflare queue consumer keeps `web_operator` externally routed by posting a bounded `{ "type": "web_operator_run", "runId": "..." }` message to `/v1/agent-runs/process`. The external host must mount `createConfiguredWebOperatorHttpHandler` with its durable store, artifact store, isolated Playwright adapter, gateway environment, and `WEB_OPERATOR_RUNTIME_TOKEN`. The handler authenticates the request, constructs `createModelGatewayFromEnv`, returns `409` for a busy lease so Queue delivery retries, and returns success only after the coordinator reaches a durable terminal or suspended disposition.
