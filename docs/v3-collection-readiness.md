# V3 closed-window collection readiness

## Demonstrated problem

The clean Lebanon feed's 2026-10-28 22:02:09.437–22:32:09.437Z window still waited at 22:58Z for an unbounded Telegram poll scheduled at 22:32:02.550Z. That same poll continued draining pages collected after the cutoff. Intake had no pending pre-cutoff work, but collection readiness kept the window open. See `benchmarks/results/v3-selective-database-reads/collection-window-followup.json` for the retained observation.

## Local correction

Reuse the shared collection gate. For V3 only, an unbounded Telegram poll stops holding a closed window when its saved later page was durably handed off at or after the cutoff, every observation was observed at or after that cutoff and has a matching resolved receipt, and no receipt is unresolved. Missing timestamps, missing receipts, blocked checkpoints and incomplete handoffs remain blocking. Bounded requests and other providers do not gain this exception. Existing X/RSS behavior is retained.

The original poll remains pending and continues normally. No cursor, source evidence, job identity, ordering pointer, financial operation or reporting boundary is modified. Late discoveries retain existing freshness handling. Pre-cutoff acquisition/reassessment still blocks publication.

Before final V3 persistence, recheck collection readiness. Continuing collection is recorded in the request's coverage as `INCOMPLETE`, with `COLLECTION_CONTINUING_AFTER_CUTOFF` and a count. Verified nonempty output can publish; empty output finishes as deferred rather than falsely declaring a quiet window. This uses existing completion and coverage structures, with no new queues, migrations or inference stages.

## Validation and limits

Focused local SQL/integration regressions cover the positive release, V2 retaining its gate, negative handoff cases, exact cutoff, bounded requests, pending intake, deferred empty completion, verified edition persistence, source references and duplicate-delivery replay without additional model calls. Transport responses in publication tests are mocked; they establish integration behavior, not model quality or live latency.

The initial integration fixture inserted a source after enrollment, correctly firing a production lifecycle trigger and disabling its scope. The fixture now inserts the source before enrollment; runtime safety checks were not changed.

Local-phase run logs and exit codes are in `.local-reports/v3-window-readiness/`. That phase made no paid calls or remote mutations and did not deploy. This is a bounded continuation fix, not a guarantee that every incomplete acquisition can publish on time. The subsequently authorized staging observations follow below.

Final validation: 60 tests passed across six files (`connector-publication-coverage`, `v3-source-integration`, `connector-briefing-priority`, `connector-work-admission`, `publication-progress`, `v3-window`); Worker `tsc --noEmit` passed; `git diff --check` passed. The six-file run took 177.76 seconds locally. This test duration is not a live publication-latency measurement.

## Authorized staging follow-up

After the user authorized deployment and autonomous validation, runtime commit `8aa4e5f` was deployed only to `distilled-news-staging`, version `47c25424-1b71-4ae0-86b2-4f25ec684591`, with 100% traffic. The deployment dry run passed. Remote before/after checks found identical bindings, compatibility settings and queue consumers. The HTML, JavaScript, CSS, service worker and logo matched the previous deployed frontend exactly. The unrelated local favicon edit was excluded.

The two public Lebanon feed APIs returned 200. The clean test feed is private (`public_feed_enabled=0`), so its anonymous public API correctly returned 404; its execution was inspected through authorized read-only D1 queries. Existing visibility was not changed. The exact readiness SELECT ran against staging and read 4–8 rows in the initial samples.

Before deployment, the previously stuck 22:32:09.437Z window had independently finished quiet at 23:04:15.875Z (32m 6.438s late); the following 23:02:09.437Z window had published at 23:04:54.061Z (2m 44.624s late), using two model calls and $0.0284608. These are pre-deployment observations, not performance evidence for this patch.

The retained 22:43:16.403Z Telegram batch was exported read-only and projected into `benchmarks/results/v3-selective-database-reads/collection-readiness-retained-page.json`. It preserves the real cutoff, poll schedule, observation times and receipt-resolution relationships while anonymizing identifiers and excluding article text. Its handoff state is reconstructed from the durable batch response and saved poll checkpoint; it is not presented as a complete historical poll snapshot. A new regression confirms the projection releases V3 while preserving the old V2 gate. All 12 gate tests passed; the Worker typecheck passed again. No further runtime change was necessary.

Detailed deployment, read-back and window-observation artifacts are saved locally in `.local-reports/v3-window-readiness-live/`. The observer's OAuth credential expired during monitoring and was refreshed through Wrangler with a read-only `SELECT 1`; this was an observer access issue, not a Worker failure. No manual paid inference, queue sends, financial mutations or notification sends were performed.

### Fresh automatic publication

The clean feed's next consecutive window, **23:02:09.437–23:32:09.437Z on October 28** (01:02–01:32 Beirut on October 29), completed without operator intervention. Request `fa57f4a5fb23e1847e79421e9fc41c6ebad3577b22e90f95c6c402f4f423bb8a` was created at 23:33:55.525Z and persisted a two-item edition at **23:34:25.599Z**. Coverage was COMPLETE, with zero pending/failed intake jobs and zero request retries.

| Measurement | Actual observation |
|---|---|
| Cutoff to persisted publication | 136.162 seconds |
| Request creation to persisted publication | 30.074 seconds |
| Articles offered / items published | 4 / 2 |
| Model calls | 2; no repair |
| Editor/verifier stage time | 8.412s / 6.199s; 14.611s total |
| Input/output tokens | 4,657 / 275 |
| Reported, settled inference cost | $0.0082084 |
| Editor reservation / settlement | $0.05648 / $0.007382 |
| Verifier reservation / settlement | $0.0083336 / $0.0008264 |

Both existing operations had exactly one reported accounting settlement. Separate read-backs at 23:35 and 23:36 confirmed identical edition, request and V3 result content, with the same two distinct operation IDs. Persisted reader text matches the verified result, and every support quote matches its original input article with source identifier and URL intact. The two items concern an attributed Israeli interceptor launch and Lebanon's forecast weather front. The off-topic Kyiv report and routine aerial activity were omitted. Exact text and full evidence remain local in `fresh-briefing.md`, `fresh-window-complete.json` and the timestamped observations. Sanitized measurements and executable assertions are reflected in `benchmarks/results/v3-selective-database-reads/collection-readiness-live.json`.

This is real automatic publication from a fresh, nonempty window, not a forced replay or a manual inference test. The $0.0082084 is ordinary staging automation's actual cost, not additional experiment spending. The timing is deadline-to-persistence; it is not measured acquisition-to-delivery latency or notification delivery. The existing delivery job remained pending in the retained read-back, and no notification was manually sent or claimed delivered.

No continuing poll was present at final commit in this fresh window. Therefore this observation does **not** establish that the new exception caused a latency improvement, nor establish a latency percentile or capacity guarantee. The exceptional path is covered by the retained-page local replay and negative/integration regressions; its next natural live occurrence remains worth monitoring. Transient source BACKPRESSURE was observed on the two other public Lebanon feeds, without changing their configuration or claiming it was fixed here. No runtime regression requiring another deployment was found.
