# Acquisition architecture and reproducible evaluation

## Runtime authority

`ProductionSourceAcquisitionService` composes `SourceAcquisitionOrchestrator` in this order: structured source, deterministic HTTP, durable ACTIVE browser workflow, then browser-agent discovery or repair. Successful cheaper stages bypass discovery.

Browser Use runs as a Python library inside the Cloudflare Container. It controls bounded Distilled browser actions; it does not obtain arbitrary shell or page JavaScript execution. Distilled enforces network and origin policy, observation freshness, capabilities, secrets, trusted extraction, temporal coverage, and cleanup.

Agent proposals remain untrusted. Distilled independently observes proposed pages and article evidence, compiles the existing workflow IR, validates through `WorkflowLifecycleCoordinator`, and persists ACTIVE workflows in D1. Subsequent requests construct fresh services and repositories and execute the stored workflow deterministically.

## Experimental bounded decisions

`GENERATIVE_ONLY` is the default. `JEV_HYBRID` is an opt-in discovery/repair experiment; deterministic replay does not invoke Jev.

The provider-neutral bounded decision interface uses `OpenRouterJevDecisionProvider` with `typesafe/jev-1.13` and the native `POST https://openrouter.ai/api/alpha/decisions` Choice API. See [OpenRouter's Decisions tutorial](https://openrouter.ai/blog/tutorials/how-to-use-jev/). It uses the existing `OPENROUTER_API_KEY` Worker secret, without a Workers AI or Cloudflare AI Gateway Jev binding.

The runtime enumerates legal `SCROLL`, `OPEN_OBSERVED_ITEM`, `RETURN_TO_LISTING`, `REOBSERVE`, and `STOP` choices. Provider state contains compact counters, page role, objective, and opaque legal choice IDs. Equivalent item-opening alternatives are reduced to the first runtime-ranked item. No URLs, selectors, HTML, transcripts, credentials, cookies, or session values are supplied to Jev.

The runtime validates membership, target identity, generation, observation revision, origin, expiry, and the configured confidence threshold before executing. Malformed output, low confidence, timeout, cancellation, and provider failure safely fall back to the existing generative path. Redirects are rejected; response size, duration, and retries are bounded.

## Product acquisition and durable observation

Authenticated accounts submit through `POST /api/me/acquisitions` and poll `GET /api/me/acquisitions/:requestId`. The account identity comes from the session; status reads are owner-scoped. These routes use the production acquisition service and durable queue, independently of smoke enablement.

Authorized operators use `POST /v1/sources/acquisition/submit` and `GET /v1/sources/acquisition/requests/:requestId`. Long discovery returns a durable request ID instead of relying on one client connection. Browser Use telemetry is available through the protected `/v1/browser-use-runs/:runId` route.

D1 retains bounded run counters, stage durations, typed outcomes, and decision metadata. Decision records include provider, model, kind, choice count, selected choice/probability, execution outcome, latency, input tokens, and reported cost. Prompts, provider response bodies, credentials, and browser session material are not telemetry.

## Reproduction

1. Apply the complete D1 migration chain, including decision metadata migration `0032`. `migrations-clean.test.ts` verifies the chain on an empty local D1 database.
2. Deploy compatible Worker and Container versions. Keep `GENERATIVE_ONLY` and smoke disabled for ordinary operation.
3. Set `DISTILLED_RUNTIME_TOKEN_FILE` to the authorized local runtime token file. Never place the token in a command argument or report.
4. Run `node scripts/evaluate-public-discovery.mjs --base <worker-origin> --owner <account-id> --source <source-url> --start <ISO-start> --end <ISO-end> --key <unique-idempotency-key>`.
5. For isolated discovery comparisons, temporarily enable the protected smoke fixture and use `--evaluation <unique-evaluation-id>`. Use distinct fresh evaluation identities for each mode, identical fixture behavior, windows, model, and limits. Preserve existing production ACTIVE workflows.
6. Poll the durable request and retrieve its authoritative run telemetry. The harness writes sanitized artifacts under ignored `.local-reports/`.
7. Redeploy/reconstruct the service context, then submit the same resource/window with a new idempotency key and the same evaluation identity. Require `BROWSER_WORKFLOW`, the same persisted workflow/version and items, and zero Browser Use, full-model, and Jev calls.
8. Restore smoke disabled and `GENERATIVE_ONLY`; verify protected fixtures and diagnostic smoke routes are unavailable, and no run or browser execution remains active.

Compare selected stage, success, item count, requested/effective window, coverage, truncation, stopping reason, discovery/model/Jev calls, successful and executed Jev choices, fallback count, browser operations, latency, workflow promotion/reuse, and high-water behavior. Agent browser operations and total discovery operations (including verification) are different counters. Report both explicitly. Provider-reported Jev cost alone does not establish total acquisition cost.

## Evidence labels and limitations

- **Live production proof:** real Worker, queue, Container, Python Agent/model, fenced actions, independent verification, and durable D1 workflow replay. Public Al Jazeera acceptance uses `https://www.aljazeera.net/`, separately from `.com`.
- **Synthetic proof:** controlled listings and authenticated timeline fixtures demonstrate contracts, lifecycle, security, and replay. They do not prove live authenticated X access.
- **Experimental measurement:** compare fresh generative and hybrid discovery runs. A successful Jev choice is necessary but insufficient evidence of lower latency or cost. Keep the baseline default until repeated measurements justify a change.
- **External limitation:** live X login has returned HTTP 403 before timeline discovery. Do not describe synthetic authenticated replay as live X success or provider changes as an authentication fix.

Partial acquisition remains partial: `MAX_ITEMS_REACHED`, truncation, or incomplete range coverage must retain unresolved work and must not advance high-water. Session-specific run IDs, benchmark outputs, deployment transcripts, and dated engineering reports belong in ignored local artifacts, not project documentation.
