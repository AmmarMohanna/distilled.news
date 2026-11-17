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

## Scheduling and downstream handoff

Configured `web` and ordinary RSS sources use the existing cron and public acquisition queue. The scheduler selects the unresolved window first, otherwise the last successful boundary, with retention-based initial history. It uses a durable request admission check and a tenant/source lease to prevent concurrent execution. Queue delivery is idempotent. Partial acquisition retains unresolved work; only complete coverage advances high-water. Google News, Telegram and Apify keep their existing connector paths.

Successful source items persist in `acquired_source_items` with tenant/resource-scoped canonical identity, publication time, body, source reference, bounded trusted provenance and workflow version. Configured subscriptions atomically create the existing `raw_messages` and deterministic `processing_jobs` records. The existing processing queue handles event clustering, ranking and synthesis. Repeated acquisition does not create duplicate processing jobs. A crash after persistence but before sending is recovered by the existing stale-job relay. Item expiry follows configured retention; no model/browser transcript or session material is part of the handoff.

The API reports high-water read back from durable storage, including conservatively merged unresolved windows. It must not report a proposed smaller retry window as the complete stored state.

Worker deployments must enable `global_fetch_strictly_public`. Without it, same-zone URLs may fetch an origin instead of their public Worker document. This follows [Cloudflare's public fetch routing documentation](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public); it does not remove HTTPS/origin admission, redirect rejection, byte limits or browser network authority.

## Reproduction

1. Apply the complete D1 migration chain, including decision metadata migration `0032` and item-handoff/lease migration `0033`. `migrations-clean.test.ts` verifies the chain on an empty local D1 database.
2. Deploy compatible Worker and Container versions. Keep `GENERATIVE_ONLY` and smoke disabled for ordinary operation.
3. Set `DISTILLED_RUNTIME_TOKEN_FILE` to the authorized local runtime token file. Never place the token in a command argument or report.
4. Run `node scripts/evaluate-public-discovery.mjs --base <worker-origin> --owner <account-id> --source <source-url> --start <ISO-start> --end <ISO-end> --key <unique-idempotency-key>`.
5. Use `node scripts/evaluate-acquisition-suite.mjs --base <worker-origin> --owner <account-id> --prefix <unique-prefix> --phase cheap` for structured boundary, finite HTTP, access-denied, real RSS and Al Jazeera replay cases. Phase `synthetic` executes the authenticated and production-composition integration fixtures and labels fixture-reported model counts separately from real external calls. Phases `baseline`, `hybrid`, and `replay` use comparable fresh SPA discovery identities. Deploy the corresponding decision mode before each discovery phase; never infer hybrid execution from its label. Optional `--fixtureBase <fixture-origin>` supports reuse of these read-only documents on a separate evaluation host. All artifacts remain ignored. Browser phases explicitly request 110 seconds; the existing independent capability ceiling remains 120 seconds and ordinary defaults are unchanged.
6. For isolated discovery comparisons, temporarily enable the protected smoke fixture and use `--evaluation <unique-evaluation-id>`. Use distinct fresh evaluation identities for each mode, identical fixture behavior, windows, model, and limits. Preserve existing production ACTIVE workflows.
7. Poll the durable request and retrieve its authoritative run telemetry. The harness writes sanitized artifacts under ignored `.local-reports/`.
8. Redeploy/reconstruct the service context, then submit the same resource/window with a new idempotency key and the same evaluation identity. Require `BROWSER_WORKFLOW`, the same persisted workflow/version and items, and zero Browser Use, full-model, and Jev calls.
9. Restore smoke disabled and `GENERATIVE_ONLY`; verify protected fixtures and diagnostic smoke routes are unavailable, and no run or browser execution remains active.

Compare selected stage, success, item count, requested/effective window, coverage, truncation, stopping reason, discovery/model/Jev calls, successful and executed Jev choices, fallback count, browser operations, latency, workflow promotion/reuse, and high-water behavior. Agent browser operations and total discovery operations (including verification) are different counters. Report both explicitly. Provider-reported Jev cost alone does not establish total acquisition cost.

## Evidence labels and limitations

- **Live production proof:** real Worker, queue, Container, Python Agent/model, fenced actions, independent verification and durable D1 workflow replay. Public Al Jazeera acceptance uses `https://www.aljazeera.net/`, separately from `.com`. Complete temporal RSS coverage, exact boundary filtering, finite HTTP acquisition, scheduled queue execution and persisted item handoff are evaluated separately from full publisher article content. RSS descriptions remain native feed content; do not describe them as independently fetched full articles.
- **Synthetic proof:** the clean-D1 production-composition integration test verifies boundary inclusion/exclusion, canonical deduplication, source fencing, merged high-water, duplicate-job prevention, unresolved retries and next scheduled windows. Controlled listings and authenticated timeline fixtures demonstrate contracts, lifecycle, security, and replay. They do not prove live authenticated X access.
- **Experimental measurement:** compare fresh generative and hybrid discovery runs. A successful Jev choice is necessary but insufficient evidence of lower latency or cost. Keep the baseline default until repeated measurements justify a change.
- **External limitation:** live X login has returned HTTP 403 before timeline discovery. Do not describe synthetic authenticated replay as live X success or provider changes as an authentication fix.

Partial acquisition remains partial: `MAX_ITEMS_REACHED`, truncation, or incomplete range coverage must retain unresolved work and must not advance high-water. Session-specific run IDs, benchmark outputs, deployment transcripts, and dated engineering reports belong in ignored local artifacts, not project documentation.
