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

Lease ownership, physical model-operation deadlines, and the durable run wall-clock limit are independent bounds. `leaseTtlMs` is a renewable fencing interval and never determines a model timeout. `modelCallTimeoutMs` bounds one physical gateway attempt; the controller clamps it to the remaining durable run time minus `runSettlementReserveMs`, which preserves time for persistence, cancellation, settlement, and cleanup. A model attempt is not started when that reserve is exhausted. Worker deployment defaults are configured explicitly:

```text
DISTILLED_MODEL_CALL_TIMEOUT_MS=45000
DISTILLED_RUN_SETTLEMENT_RESERVE_MS=5000
```

A gateway deadline fails the active turn, durably records an unconfirmed physical attempt and typed failure, settles the worker attempt, and returns the run to `queued` for the existing at-least-once retry path while run budget remains. Reservations are retained conservatively when the provider did not confirm usage. Lease loss cancels the operation without permitting the stale generation to settle; absolute run-deadline exhaustion is a terminal wall-clock budget failure.

## Browser backend selection

Browser execution is selected at construction time through `DISTILLED_BROWSER_BACKEND=local|cloudflare`. `LocalPlaywrightBrowserExecutor` and `CloudflareBrowserExecutor` implement the same browser ports and share the same adapter semantics; production code outside backend construction depends only on `BrowserExecutorPort`, `StructuredBrowserUsePort`, and `VisualComputerUsePort`.

## Live model smoke tests

Normal CI and repository tests use deterministic scripted gateways. A paid OpenRouter smoke test is inert unless all of these are explicitly supplied:

```text
DISTILLED_LIVE_OPENROUTER_SMOKE=true
OPENROUTER_API_KEY=...
DISTILLED_LIVE_OPENROUTER_MODEL=...
DISTILLED_LIVE_OPENROUTER_PROVIDER=...
```

A live public acquisition smoke test is also inert unless explicitly enabled with:

```text
DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE=true
DISTILLED_LIVE_PUBLIC_CANDIDATE_URL=https://publisher.example/article
DISTILLED_LIVE_OPENROUTER_SMOKE=true
OPENROUTER_API_KEY=...
DISTILLED_LIVE_OPENROUTER_MODEL=...
DISTILLED_LIVE_OPENROUTER_PROVIDER=...
```

The deployed Worker accepts operator smoke admission through `web_operator_live_smoke_requests`. An operator creates a request with an explicit unique idempotency key through the authenticated Wrangler/D1 control plane:

```text
pnpm web-operator:live-smoke:trigger https://publisher.example/article <explicit-idempotency-key>
```

The scheduled Worker dispatches at most one pending request per tick to `WEB_OPERATOR_QUEUE`. The queue consumer claims it once and invokes the existing authenticated live-smoke handler internally with the Worker-held `WEB_OPERATOR_RUNTIME_TOKEN`; the secret never leaves the Worker environment. Repeated insertion of the same identity and duplicate queue delivery are idempotent. A completed or typed-failed request is not automatically retried.

This path uses the real closed-loop runtime coordinator, configured model gateway, browser backend selection, policy checks, durable intent/effect handling, verifier-owned completion, workflow finalization, and `AcquiredContent` acceptance. The HTTP route remains disabled by default and authenticated when enabled. It is never required for normal tests or CI.

## Workflow lifecycle

A successful run may produce a `WorkflowCaptureBundle` containing visible actions, observation references, effect certainty, browser generation, structured discovery evidence, extraction evidence, completion evidence, and runtime/tool/schema versions. Discovery evidence is machine-readable and includes observed page types, listing URL candidates, article URL pattern hints, publication-time evidence, locator/capability evidence, and watermark/exhaustion evidence when available. It does not capture hidden chain-of-thought.

`WorkflowCandidateCompiler` converts captures into typed deterministic operations such as `navigate`, `locate_semantic_target`, `follow_canonical_article`, `paginate`, `stop_at_watermark`, `extract_article`, and `verify_expected_condition`. Unsupported or ambiguous gaps remain explicit.

Workflow states are `CANDIDATE`, `VALIDATED`, `ACTIVE`, `SUPERSEDED`, `REJECTED`, `INVALID`, and `ROLLED_BACK`. The producing agent may create a candidate, but only validator/promotion authority can activate it. Repair is authorized only after bounded structural-failure evidence on an active workflow; challenge, policy, and transient failures do not directly trigger repair. Deterministic replay uses the same browser security contracts and requires zero model calls while the workflow remains valid.

`ClosedLoopWebOperatorLifecycle` integrates the existing pieces for public candidate acquisition: configured deterministic acquisition routes run before Web Operator escalation, unavailable deterministic routes persist typed acquisition-failure evidence, no configured active route falls back to a normal Web Operator run, successful runs are captured and compiled, validator authority marks candidates `VALIDATED`, promotion authority activates one workflow version, later refreshes replay the active workflow with zero model calls, and `AcquisitionRouter` uses typed structural replay evidence, policy, and budget to gate repair before a replacement workflow can supersede the old active version. Repeated capture/candidate finalization for the same completed run is idempotent and returns the first persisted candidate.

## Authorized browser profiles

`AuthProfile` stores encrypted browser state by reference with tenant, owner, allowed domains, allowed operation class, version, expiry, and revocation. The model-visible `AuthProfileCapability` excludes passwords, cookies, session tokens, MFA secrets, and API keys. CAPTCHA/MFA remains a typed challenge and human-resume boundary.

## Evaluation instrumentation

Evaluation metrics are machine-readable and cover acquisition success, correct-candidate rate, model calls, tokens, cost, latency, tool actions, replans, strong-model escalation, visual usage, workflow compilation, deterministic replay, repair success, verifier rejection, policy denial, `effect_unknown`, challenge rate, and software/config/tool/workflow versions. Metrics exclude secrets, private browser state, and hidden model reasoning.
