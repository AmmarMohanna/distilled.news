# V3 overnight implementation and evaluation

## 1. Executive summary

Local V3 runs end-to-end: real retained evidence passed through intake, the V3 editor/verifier, one repair/recheck, publication and separate persistent-D1 read-back. The successful run produced two supported stories from two in-window articles; the third imported article was correctly filtered outside that window. End-to-read-back time was 20.94 seconds, excluding historical acquisition. Successful-run inference cost was $0.0157672; an earlier integration failure cost $0.007858, for $0.0236252 so far. No task provider charges are unsettled.

Isolated staging is being prepared; deployment and remote briefing delivery are not yet claimed. Original source text and identities remain retained. Independent AI-assisted review found a source-relative ?today? error; a focused prompt correction is implemented but not yet qualified by another real run. The next step is dedicated staging deployment and all-three-article replay.

## 2. Starting repository state

Branch `feat/parallel-cloudflare-event-reconciliation`, starting commit `ec0ecce5d6e8ca0f62ced9c5cff4c72bb3122462`. The tree was clean. V3 already used the fixed-window product scheduler; production and existing staging configuration were left unchanged. New commits use Ghada Al Danab as sole author and committer.

## 3. Investigations and decisions

Read-only R2 sampling read 13 objects across seven source prefixes, after a 12-key initial inventory. Objects include collection snapshots, provider payloads, RSS/XML and normalized records; incomplete excerpts are not represented as full articles. No bucket-wide download or original mutation occurred. Retained QA D1 provided a bounded sample of 100 recent revisions and 40 longest revisions. One broad MCP metadata query timed out; the bounded direct query succeeded.

There are 130 unique bodies in that combined, deliberately biased sample; 40 exceed 6,000 characters. The longest is a 193,826-character ECB review. The old trim would remove 1,181,490 characters across the sample. This is not a bucket-wide prevalence estimate. The shared default becomes a finite 250,000 characters, preserving all observed bodies. Existing batching and product-provider context/cost admission remain in force; no preprocessing model was added. Product V3 already preserved full evidence.

Eighteen retained editions cover ten feeds, with 1?9 communicated items per feed. Exact published-text replay probes retain the relevant targets. Keep the 21-day/16-item/four-recent-plus-relevance method. These small histories do not qualify recall above the cap, and reminders of much older news are not automatically errors.

## 4. Code changes

A dedicated authenticated QA entry calls existing intake, reassessment, V3 publication and reader projection. It has no collectors, Cron, queues, public application or notification handlers. Content uses a new isolated D1 database; actual provider accounting uses the existing account ledger through its normal reservation/settlement functions plus the fresh task cap. This avoids pretending an isolated content database is a separate OpenRouter account.

The first real call exposed a foreign-key error when its response was saved in the accounting database, where the isolated feed does not exist. Responses now stay in isolated content storage; account reservations and settlements stay in account storage. A response can reconcile/replay without issuing a second paid request. Focused tests cover those boundaries, pre-send budget denial and uncertain outcomes. Relative-date instructions now explicitly forbid copying ?today?/?yesterday? from older sources.

## 5. Local end-to-end results

Edition `92db0acff55d7891aafbae12c59a276f225ba6fc1bd057eb835ccb0832df64f9` persisted and matched a separate database reopen/read. Two stories and two citations survived. Four successful-run model calls were used: editor, verifier, repair and recheck. The isolated reporting window was October 18?20. Replit?s October 17 publication correctly did not reach the editor. A subsequent staging input will include all three articles deliberately.

Exact reader text, input corpus, operation evidence and independent review are retained under `.local-reports/v3-overnight/`. The first failed output and charge remain recorded; no historical holds were reset.

## 6. Staging deployment and verification

Prepared Worker `distilled-news-v3-overnight-20261022`, dedicated content D1 `7cbf12c8-8dde-4b25-8f09-cdbba806e0ca`. No production routes, asset bucket, source queues or notification bindings. The separate `SPENDING_DB` binding is solely for append-only task account reservations/settlements. No original source or feed data is imported into that accounting database.

Deployment pending. All QA endpoints require a secret bearer token; credentials are local/server-side only.

## 7. Evaluation results

Initial independent AI-assisted source review finds Anthropic and Laplace supported without false merge or substantial repetition, with moderate confidence and the temporal caveat above. It is not human-reviewed gold. Important fact coverage is assessed for concise reporting, not exhaustive reproduction. Multi-source, sequential and larger-workload trials are pending.

## 8. Actual spending and latency

Hard task limit: $20 additional. Model exposure is capped at $19, with $1 conservatively reserved for incremental Cloudflare usage. Local phase cap is $3; staging smoke cumulative cap is $8. All unknown charges count at reservation value. Actual known inference so far is $0.0236252 across five paid calls, including the failed wrapper attempt. No task provider reservation is unsettled. Local content storage retains its first failed-operation recovery record; it is not a second provider charge.

A fresh, non-overlapping account authorization was appended for 22:28:36.805 UTC October 21 through 09:47:21.603 UTC October 22. Its $25.0268524893 exposure bound includes $6.0268524893 existing held liabilities plus this task?s maximum model exposure. Historical grants and all original holds remain unchanged. The task guard also counts earlier local task charges. No grant was renewed or overwritten.

Durable append-only operations are in `.local-reports/v3-overnight/progress.jsonl`; authoritative cumulative task accounting and conservative exposure are exported to `spending.json`. Model response time is not acquisition-to-delivery time; the corpus was replayed.

## 9. Problems discovered

- QA response storage originally targeted the financial database and failed its feed foreign key after a settled call; corrected and tested.
- An unnecessary one-slot local concurrency override caused a pre-send wait behind the failed local record; removed in favor of the existing default. No extra provider call occurred during that wait.
- Source-relative ?today? passed native verification in the initial local output; focused prompt correction requires real re-evaluation.
- The initial three-import article label overstated actual editor input: only two were in-window. This distinction is preserved in reporting.

## 10. Remaining work and recommended next step

Deploy only the dedicated authenticated QA Worker, confirm separate API read-back, then run ordinary, overlapping, chronological and larger saved-evidence trials within the same task cap. Preserve the simple V3 architecture and record quality defects without turning them into more mandatory stages.
