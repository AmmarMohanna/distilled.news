# QA source pipeline reliability and latency fixes — October 21

Branch: `codex/twenty-feed-dataset`, based on `ac6299f`.
Target: `distilled-news-sources-qa.distillednews-platform.workers.dev`.

## Changes to preserve when merging

1. `connector-intelligence-turn.ts`, `v1-intelligence/store.ts`, `runtime.ts`:
   publication preparation can run outside the Feed write turn. Each canonical
   store transaction reacquires admission and retains the original Feed/source
   epochs, semantic lease, model reservation and atomic CAS checks. Busy admission
   is transport waiting, not a failed draft attempt. Opt in with
   `V1_PUBLICATION_PREPARATION_ISOLATED=true`; the legacy default is preserved.
2. `review-prefetch.ts`, `store.ts`: batch independent Feed-owned graph roots and
   immutable lookups, and overlap independent reads. Keep staged writes, cached
   misses, foreign-ID rejection, complete support and stale-snapshot fencing.
   No relevance, grouping or editorial policy changes.
3. `connector-scheduling.ts`: dispatch one job per scheduler family per Feed per
   visit, yielding to other Feeds. Optional `SOURCE_SCHEDULING_QUEUE` separates
   enrollment/wakeup messages from long collection calls. Existing deployments
   without that binding retain the previous collection lane. QA binds the control
   lane to its existing processing queue; no new paid provider authority is added.
4. `source-execution-admission.ts` and migration
   `0068_source_execution_admission.sql`: two deployment-local helper transport
   slots with 90-second expiry and token-fenced release. Hold admission through
   response consumption/cancellation. The HTTP adapter's deadline is shorter than
   the lease. This grants neither source nor financial authorization.
5. Acquisition: helper capacity waits retain retry allowance and fetched-result
   recovery. Rate limits preserve `Retry-After`; bounded retries have jitter.
   Persist diagnostic detail and HTTP status for missing articles, server failures,
   listings, canonical mismatches and invalid acquired content. No schema or
   canonical-identity validation is relaxed.
6. Provider diagnostics: distinguish an unavailable browser executor from an access
   challenge and distinguish missing extractable text from successful retrieval.
   Do not invoke alternate transports around a publisher's explicit cooldown,
   login requirement or missing URL. X/LinkedIn provider fallback policy remains
   independently authorized. Provider attempts, source health and article traces
   expose typed diagnostic metadata, without credentials/raw provider responses.
7. `source-execution-server.mjs`: bounded helper wait queue, one Telegram session
   at a time, non-Telegram use of the spare slot, queue expiry and a bound on
   concurrently buffered incoming requests. **This separate VPS patch is not
   deployed:** SSH authentication was rejected. Worker-side admission is deployed
   independently. Do not describe the VPS rollout as completed.

## Rollout

Use `apps/worker/wrangler.dataset-qa.jsonc` for this specific QA deployment. It
preserves the fresh QA database `f34f4399-1e3b-4d4f-ba17-564e54e9f941`, archive
`distilled-news-qa-v3-raw`, secrets, spending limits and queue resources. It also
enables the existing isolated review preparation flag. Apply migration 0068 before
deploying code that uses helper admission. Production/staging were not deployed.

To roll back the admission/isolation behavior, deploy the prior Worker version and
its prior queue bindings. The additive helper slot table can remain. Never reset
paid operations, unknown holds or canonical evidence as a rollback shortcut.

## Validation and limitations

Focused regression coverage includes acquisition leases/replay, helper admission,
late-response fencing, publication recovery without another paid call, graph
scope and CAS checks, provider fallback, and indexed dispatch/shared public-fetch
reuse across 1,000 synthetic consumers. This is not a full-suite or 1,000-feed live
capacity claim. Exact final test counts and deployed measurements follow below.

Regression results: **292 focused tests passed** across the final relevant test
files (172 Worker, 114 connector, 6 helper-server tests). Worker and connector
typechecks passed. The new fixture/instrumentation failures encountered while
developing tests were corrected and rerun; the complete 24-test scheduling file
also passed on its final run. The full Worker suite was not run.

The first live retest was interrupted by an expired Cloudflare OAuth token;
cleanup verified all 40 test feeds paused. During its measured interval,
accepted observations increased 858 → 941, acquisitions completed 233 → 274 and
reviews completed 173 → 182. Retained source coverage stayed 115/200; backlog grew.
The 145-event bounded trace had no uncaught exceptions, but review samples still
took median 13.117 seconds and p95 20.004 seconds, with p95 Feed-turn hold 16.145
seconds. These observations motivated the subsequent graph batching and isolated
control lane. They are **not** performance results for those later changes.

All dataset schedules were kept as authored. Their first full daily reporting
windows are due October 23 (Beirut), and this fresh QA database has no active model
spending grants. Zero published editions during this collection test therefore
does not prove a publication regression or prove end-to-end publication success.
No new grants, tracking-only exceptions or fabricated source evidence were added.

Upstream access challenges, unavailable credentials, missing article URLs and
uncertain paid submissions remain real operational conditions. Retry/diagnostic
fixes do not make those upstream conditions disappear. Historical failures remain
retained; judge recovery from new jobs and accepted evidence, not erased counters.
