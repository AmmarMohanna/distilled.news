# V3 thousand-feed capacity evaluation

## Conclusion

The current deployment is not qualified for 1,000 continuously active half-hour feeds. This evaluation leaves live limits unchanged. It retains one demonstrated database correction; staging verification is recorded below. It measures current behavior locally with explicitly synthetic source evidence and controlled model responses.

## Firm configuration constraints

`configuredProviderLimits()` defaults to 20 requests/minute globally; staging overrides concurrency to six but does not override RPM. A nonempty successful V3 edition normally needs at least an editor and verifier call. Thus the rate ceiling is at most 300 nonempty editions per 30 minutes before repairs or competing tasks. An 80%-nonempty cohort of 1,000 feeds needs 1,600 calls/window (53.34 calls/minute), taking at least 80 minutes at the existing ceiling. All 1,000 nonempty need 2,000 calls and at least 100 minutes. These are necessary-capacity calculations, not latency forecasts or model-quality claims.

`dispatchConnectorFeeds()` enrolls at most 100 feeds per invocation. One wholly due cohort of 1,000 needs ten batches; on a once-per-minute dispatcher, the final batch can start nine minutes after the first. Normal consumer completion, other due feeds and arrival phases affect actual cadence. Increasing a batch size or model quota has not been tested and is not a retained fix.

## Reproduce

From the existing feature worktree, PowerShell:

```powershell
$env:RUN_V3_CAPACITY='1'
$env:V3_CAPACITY_FEEDS='1000'
corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/capacity.bench.test.ts
```

The test is skipped in ordinary CI. It creates and disposes its own ephemeral Miniflare D1 database. Set 12 for the smaller smoke trial. Exact reports are saved incrementally under `.local-reports/v3-capacity/`. It never uses Wrangler, production/staging resources, real API keys, external model inference or notification transport.

## Experimental boundaries

All feeds exercise actual preparation and the bounded database dispatcher with controlled queue sends. At most 24 exercise serial full publication, public edition read-back and duplicate replay under unchanged 20-RPM admission. This is NOT 1,000 concurrent end-to-end publications. Six is the configured provider ceiling, not a simulated six-worker cloud deployment. First-row instrumentation executes the same SQL through `all()` to retain D1 row metrics and returns its first row; batch metrics use returned statement metadata. Local Miniflare timings and rows do not establish Cloudflare saturation or HTTP-user p95.

Publication history uses 0, 96 or 480 expired editions per feed, including terminal requests and carry-result history. Old publication identities share one historical revision per feed. It underrepresents unique historical articles, active retained evidence, recent 16-item reader prose, V2 semantic-intent references, historical financial receipts and large carry payloads. It does not assess source acquisition, editor selection, verifier reasoning or semantic quality: controlled responses deliberately return one source-supported synthetic story. Mock token counts and zero model cost are not model measurements.

## Measured results

Both 1,000-feed local runs passed on identical synthetic fixtures: 5,800 current full-text articles (8,307 characters each), 191,808 historical editions and 767,232 historical documents. All 1,000 feeds dispatched exactly once in ten controlled batches and prepared with exact expected article counts and feed-owned source IDs. Preparation is serial; this is not 1,000 concurrent publications.

| Measurement | Baseline | Fixed |
|---|---:|---:|
| Preparation queries | 6,133 | 6,133 |
| D1 rows read | 345,510,603 | 985,803 |
| Returned bytes | 114,998,772 | 114,998,772 |
| Sum of preparation wall time | 994.49 s | 205.19 s |
| Per-feed preparation p50 | 992.7 ms | 198.8 ms |
| Per-feed preparation p95 | 1,350.1 ms | 317.2 ms |
| D1-reported SQL duration sum | 807.42 s | 9.08 s |

The 99.7% row-read reduction and approximately 4.8-fold local preparation speedup are measured. Same returned bytes and identical query counts help distinguish narrower database access from dropping evidence. Exact cohort fixtures match before/after, and the ordered 20 model-operation IDs from real durable application execution with fake transport responses are identical. No inference calls were added.

In each 24-feed full-path subset: ten nonempty editions persisted and read back, five empty windows completed QUIET with no model calls, and nine nonempty windows remained PENDING/PROVIDER_RESOURCE_WAIT after exactly 20 controlled calls. Replaying persisted deliveries caused no extra calls. The test uses a fixed logical clock intentionally holding the admission minute constant across serial wall-clock execution; it does not measure natural rolling-minute recovery or actual deadline-to-publication latency.

The 12-feed smoke independently passed nine persisted/read-back editions, three quiet windows, 18 controlled model calls and zero duplicate-delivery calls. Strengthened positive outcome assertions also reject all-deferred results, nonterminal quiet results and wrong wait reasons. Exact saved baseline/fixed results were replayed through those assertions, rather than accepting JSON or a maximum-call check as success.

Sanitized aggregate evidence: benchmarks/results/v3-selective-database-reads/thousand-feed-capacity.json and thousand-feed-operation-identities.json. Raw exact metrics, full synthetic fixtures/results and test logs remain under .local-reports/v3-capacity/. Use benchmarks/summarize-v3-capacity.cjs with the baseline and fixed reports to reproduce the aggregate.

## Confirmed cause and retained correction

SQLite selected the primary kind/ID index to satisfy ORDER BY id, scanning all records of that kind across other feeds. The status join could also begin from every publication status. An empty-history normal feed read 383,663 rows; after correction it reads 46. A quiet empty-history feed falls from 191,813 to four rows. The focused regression first failed with 201 foreign rows for two empty-history reads and now enforces fewer than ten across ordered result/history reads.

Commit d8ff8b3 adds migration 0079_feed_document_order.sql: an additive (feed_id, kind, id) index. CROSS JOIN in the two publication-history methods fixes feed-filtered editions as the outer relation, retaining identical predicates and ordering. There is no semantic filtering, prompt/model change, new inference stage, deletion or accounting change. The SQL remains compatible before migration; the index is required for the full performance gain. Independent read-only review found no important correctness issue.

Own retained history still costs work: a normal three-article feed reads 46 / 532 / approximately 2,452 rows at 0 / 96 / 480 old editions. The fix removes dependence on unrelated feeds, not every history-dependent read. Recent reader prose, full historical evidence diversity and accounting history need separate qualification.

## Validation and staging

Validation completed: 66 tests passed across nine files, one heavy load test skipped during the ordinary regression run. Coverage includes V3 source/persistence, frozen-operation recovery, creation-relative schedules, provider admission/unknown holds, publication history, scoped hydration, connector scale and retained-output replay. Worker TypeScript passed. The two explicit 1,000-feed runs and the separate 12-feed smoke also passed; negative benchmark controls first failed and then passed after outcome validation was corrected.

Staging runtime commit d8ff8b3 deployed as d2fb43f8-c04c-4565-b167-22105baca518. Only additive index 0079 was applied in this follow-up, with 6,094.86 ms SQL build duration, 653,698 rows read and 316,260 written. EXPLAIN confirms the live ordered-history query uses v1_feed_documents_scope_order. A missing-feed lookup reads zero rows in 0.457 ms. All 25 small smoke reads passed; session sample p95 was 117 ms and the two feed APIs were 803/804 ms. Five requests per route are smoke evidence, not a production latency distribution. No 1,000-feed load reached shared staging.

Existing frontend asset hashes, model settings, secrets, queues and other bindings were preserved. No production deployment, reader-notification request, paid evaluation call, cap/grant or historical hold change was initiated. Normal staging automation continues under its existing controls, so USD 0 in manually initiated inference does not mean all background staging usage is free. Safe staging evidence is in benchmarks/results/v3-selective-database-reads/thousand-feed-staging.json.

The same D1 response reports 8,254,447,616 allocated bytes. [Cloudflare documents a 10 GB per-database limit and single-threaded query execution](https://developers.cloudflare.com/d1/platform/limits/). Allocation is not a measurement of live retained-content bytes or reusable free pages. Storage growth, source overlap and retention need measurement before promising 1,000 feeds. At this deliberately busy synthetic rate, 5,800 new 8,307-character articles per half-hour would represent approximately 2.31 GB of raw ASCII text/day before snapshots, duplication, indexes or retention. That is an assumed workload calculation, not observed real traffic or a forecast for arbitrary feeds.

## Operational decision

Keep current routing, prompts, accounting, holds, concurrency and source collection unchanged. Retain the demonstrated query/index correction. Do not turn up quotas solely to make a synthetic benchmark pass. Before a 1,000-active-feed commitment, qualify provider throughput/actual cost and run isolated Cloudflare queue/read tests with full retained evidence and financial-history shapes. New paid inference requires an explicit applicable authorization; this run spends USD 0 on inference.

Historical fixture rows intentionally include the fields read by preparation, not a fully reconstructed archive of renderable old editions; full historical rendering is not qualified. The historical content hashes are synthetic fixture identifiers, not normal acquisition attestations. Production-shaped acquired-evidence integration remains covered separately by the existing V3 source tests.

## Commits and retained files

Runtime correction: d8ff8b3 (migration 0079, two history joins, scoped-read regression). Evaluation deliverables: capacity.bench.test.ts, benchmarks/summarize-v3-capacity.cjs, the three thousand-feed JSON result artifacts and this report. All commits use Ghada Al Danab as sole author and committer. Unrelated favicon and staging-config working changes are left untouched.
