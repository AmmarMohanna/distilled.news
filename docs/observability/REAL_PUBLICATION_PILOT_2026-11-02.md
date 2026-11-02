# Real V3 publication pilot — November 2, 2026

## Result

**The real publication path is verified; the complete 90-minute campaign is PARTIAL.** Two legitimately registered and email-verified users created four feeds. Real, newly published Telegram evidence reached unchanged V3, passed editor/verifier processing, produced four persisted nonempty editions and was read back through the reader API. Publication occurred 24–49 seconds after the scheduled time.

All ten planned opportunities resolved: **four publications, six quiet completions, no failed or unresolved windows**. However, the controller stopped at **10:04:20 Beirut**, approximately 79 minutes into the planned 08:45–10:15 observation, because a Cloudflare analytics query returned an error. Automatic cleanup completed. This is not a successful uninterrupted 90-minute run.

Paid inference: **16 calls, $0.0186864 settled, no outstanding reservations or uncertain outcomes**. The original 120-GET load overlapped quiet scheduled completions; it did **not** overlap nonempty generation/publication. A separately requested supplemental load was not approved in time and was not run. That combined-load objective remains unobserved.

## Exact implementation and isolation

- Tested code revision: `68a06eff84fddbde3825228dc0b3d5f704bdf249`; its complete GitHub workflow passed: https://github.com/AmmarMohanna/distilled.news/actions/runs/41367203246.
- Isolated Worker: https://distilled-news-staging-campaign-pilot.distillednews-platform.workers.dev.
- Deployed application version: `5dca7a48-c32d-44e7-8870-d1da93fc5916`, application revision `eceeb027a52c83fa6cd9a9a21763d60412879151`. The later tested revision changes the harness/docs, not the deployed application. Downloaded module SHA-256 matched the retained tested build: `3978f71c2fd66ab75588ef3be10d83d21c519b2f7a89cd5fedd399be6331161f`.
- Existing separate D1, R2 and five queues were reused. Production, ordinary staging, source-collection QA, frontend assets and shared helper configuration were unchanged.
- V3 remained OpenRouter GPT-4.1 editor/repair, GPT-4.1 mini verifier, prompt version 4. No prompt, model, source-permission or scheduling-policy changes were made.
- Reader notifications, alert notifications, legacy-log export and trace export remained disabled. Two authorized account-verification emails were delivered through the existing sender; these are not briefing notifications.

## Fresh authorization and setup

A fresh eight-hour approval covered at most $12 total exposure and 40 paid calls, two users/four feeds, two VUs/120 load GETs and a 90-minute observation. It was recorded at 06:28:45 UTC with a conservative expiry of 14:28 UTC. No expired pilot approval was reused.

The existing provider key had $6.67340734 remaining at preflight. Its limit was not increased. Native admission was appended at **$4.50 / 40 operations** for only the four new feeds and their two source-assessment scopes, retaining provider headroom. Historical authorizations, reservations and settlements were not rewritten.

Both users registered, received genuine email-verification messages in the authorized Gmail inbox, verified and logged in through normal APIs. Four feeds were created: English/public/every 30 minutes and Arabic/private/hourly for each user, all in Asia/Beirut. One source-assessment attempt encountered a confirmed transient rejection and succeeded after a capacity wait; no authentication or source-assessment bypass was used. Eight source-assessment calls settled at $0.0036752.

The helper was initially occupied by other reads. Native source ownership, channel configuration and authenticated access were valid. Autonomous polling subsequently acquired the articles. No additional helper capacity was provisioned.

## Source evidence and time semantics

The single authorized upstream channel was `https://t.me/lebanonnews2`. This is a small real **social-post** corpus, not a representative long-article or many-source editorial benchmark.

At 09:09 Beirut, the feeds retained 59 feed-scoped historical revisions, all published before feed creation. These were not promoted to fresh news and the 09:00 windows completed quietly without V3 calls.

Two genuine new posts then arrived:

| Original source | Original publication time (Beirut) | Meaning |
|---|---|---|
| [Post 107948](https://t.me/lebanonnews2/107948) | 09:13:36 | A hostile drone flying over Beirut's southern suburbs; no actor explicitly named |
| [Post 107949](https://t.me/lebanonnews2/107949) | 09:14:16 | Israeli warplanes flying low over the south and Nabatieh |

Both postdate all four feed creations (08:34–08:35). Their original UTC timestamps, full text and URLs were retained as eight distinct feed-owned revisions. Acquisition acceptance occurred 99–299 seconds after source publication across the feeds. No date was altered and no old article was reclassified as fresh.

The 09:30 English reporting interval was 08:55–09:25. The 10:00 Arabic interval was 08:55–09:55. Scheduled delivery labels stayed fixed; source publication time was not treated as event time or replaced with acquisition time.

## Scheduled outcomes

Times below are Beirut local time. Delay uses durable publication time for published editions and durable completion time for quiet windows, not the observer's later polling time.

| User slot | Language | Scheduled | Outcome | Delay |
|---|---|---|---|---:|
| 0 | English | 09:00 | Quiet | 19.267 s |
| 0 | Arabic | 09:00 | Quiet | 28.629 s |
| 1 | English | 09:00 | Quiet | 38.066 s |
| 1 | Arabic | 09:00 | Quiet | 44.167 s |
| 0 | English | 09:30 | Published, reader read-back passed | 24.394 s |
| 1 | English | 09:30 | Published, reader read-back passed | 35.381 s |
| 0 | English | 10:00 | Quiet; did not repeat prior items | 26.844 s |
| 0 | Arabic | 10:00 | Published, reader read-back passed | 48.835 s |
| 1 | English | 10:00 | Quiet; did not repeat prior items | 45.884 s |
| 1 | Arabic | 10:00 | Published, reader read-back passed | 36.772 s |

All four nonempty editions retained two owned citations. No duplicate edition, cross-account citation, multiple provider generation IDs for one paid identity or private-reader leakage was observed. Private edition read-back succeeded for owners and failed for anonymous/other-user probes.

Verified generation took **14.109–14.767 seconds** per nonempty edition; individual provider requests took **1.569–2.508 seconds**. These are not acquisition-to-delivery times: they exclude acquisition, waiting for the reporting cutoff and waiting for scheduled delivery. Source-to-publication was approximately 16–17 minutes in English and 46–47 minutes in Arabic, primarily reflecting their scheduled intervals.

Paid results existed before their deadlines and publication reused them without another model call. English then avoided repeating the same two source revisions at 10:00 with no additional V3 calls. Arabic appropriately remained eligible because those feeds had not communicated the stories. This demonstrates exact-source continuity, not general semantic deduplication across different publishers.

## Actual inference accounting

| Stage | Model | Calls | Input tokens | Output tokens | Settled USD |
|---|---|---:|---:|---:|---:|
| Source assessment | GPT-4.1 mini | 8 | 7,456 | 433 | 0.0036752 |
| V3 editing | GPT-4.1 | 4 | 7,120 | 534 | 0.0135200 |
| V3 verification | GPT-4.1 mini | 4 | 4,784 | 120 | 0.0014912 |
| Targeted repair | — | 0 | 0 | 0 | 0 |
| **Total** | | **16** | **19,360** | **1,087** | **0.0186864** |

Actual costs include provider-reported caching effects. Do not price future runs from this one small corpus. Source-assessment costs were reconciled against eight retained provider responses in private R2. Every V3 operation had one retained provider generation ID. No paid operation was resent to recover telemetry.

Final financial read-back confirmed zero holds and zero uncertain operations. The 16 preexisting reservations/settlements remained present with their unchanged $0.1116344 settled total.

## HTTP and Grafana evidence

Actual load: **2 VUs, 120 authenticated GETs, zero HTTP errors, 120 checks passed, zero observed safety violations**. p50 was 152.494 ms, p95 937.639 ms and p99 1,121.400 ms. These are small-sample, exploratory tails.

Configuration/summary file timestamps bracket k6 execution at 08:59:41–09:01:41. Individual request timestamps were not retained. This overlaps the 09:00 quiet completions, not the later nonempty model executions or editions. No extra traffic was run without approval; the original 120-GET limit was preserved. Do not claim a completed nonempty V3-plus-k6 capacity test.

Real metrics were written to Grafana and independently queried, including 120 requests, max VUs 2, p95 937.638665 ms, paid call counts, settled costs, completion counts and approximate queue backlog. Metrics use low-cardinality environment/profile/slot labels; account/feed IDs, text, URLs and credentials were not metric labels. Private run/operation/edition/source correlations remain in local artifacts.

- Grafana: https://giganticmantel34.grafana.net/explore
- Existing dashboard: https://giganticmantel34.grafana.net/d/distilled-agentops-v1/
- Useful campaign query: `distilled_campaign_publications_read_back{slot="isolated-campaign"}`.
- Final metrics explicitly retain `asynchronous_campaign_aborted=1` and `execution_active=0`; successful publications do not turn the aborted campaign into a completed observation.

No Tempo trace correlation is newly established. Requested trace headers are not proof of exported traces.

## Measured resources and infrastructure qualification

Scoped read-back for authorization/setup through post-cleanup reconciliation observed:

- 2,062 Worker invocations; 0 Worker errors; 104.203849 CPU seconds.
- 507,668 D1 rows read; 44,733 rows written; 46,113 read queries and 19,250 write queries.
- All five queues empty after cleanup.

These totals include controller/setup/recovery work and may be affected by analytics lag. They are not pure reader-load measurements or a steady-state capacity estimate.

Applying all published [Workers overage rates](https://developers.cloudflare.com/workers/platform/pricing/) and [D1 overage rates](https://developers.cloudflare.com/d1/platform/pricing/), ignoring included allowances, gives approximately **$0.04794 for the measured Worker/D1 components**. This is not an invoice or complete infrastructure charge: R2/queue attribution remains unavailable. Actual incremental Cloudflare invoice cost is **unknown**, not zero. The $0.50 planning allowance was retained; no subscription or hosting upgrade occurred.

## Failures, corrections and limits

1. **Analytics stop:** at 10:04:20 the existing observer failed closed on `RESOURCE_ANALYTICS_UNAVAILABLE`, then archived safely. The original provider error body/code was not retained. Replaying the same scoped query over a near-identical historical window later succeeded; the precise original provider cause remains unknown. The reader now journals sanitized error codes and makes **one bounded retry of this idempotent analytics read only**. A second failure still stops. Queue, financial and source safety gates are unchanged. Tests cover both transient recovery and permanent failure; a new uninterrupted live run has not qualified this change.
2. **Quiet deadline reporting:** the observer checked a missing reader edition before a known quiet completion, falsely marking quiet windows late. A retained real case failed before the fix. Quiet completion now uses its durable completion timestamp first; missing completion time stays UNKNOWN, and genuinely late quiet/nonquiet cases remain late. Original JSON/HTML/metric samples are retained. A separate corrected replay yields 10/10 outcomes within the declared five-minute grace; the actual event table above shows all ten within one minute.
3. **Quality review:** independent AI-assisted comparison against the original posts found no material source misstatement or false merge in these outputs. English adds an unnecessary “unidentified” qualifier absent from the drone post. Arabic uses direct assertion with citations instead of explicit reportedly/reported wording; single-channel uncertainty/attribution merits further evaluation. These are recorded, not silently repaired. No independent real-world corroboration was performed, and two posts cannot establish general verifier reliability or important-news recall.
4. **Not exercised:** targeted repair, genuine incomplete-acquisition publication, late-source recovery, provider failure, worker interruption, broad semantic novelty, long articles, multi-source conflict and high-load capacity. All recorded window coverage states were COMPLETE; this is not evidence that the incomplete path works.

## Acceptance

| Objective | Result |
|---|---|
| Real registration, verification, authentication and four feeds | VERIFIED |
| Original post-creation evidence and freshness preservation | VERIFIED |
| Actual V3 edit → verify → scheduled persistence → reader read-back | VERIFIED, four editions |
| Both languages and schedules inside planned observation | VERIFIED |
| Owned citations, exact-source non-repetition, paid-result reuse | VERIFIED for observed cases |
| No duplicate edition or private-feed leakage | None observed in tested probes |
| Native inference reconciliation and historical preservation | VERIFIED |
| Real Grafana ingestion/querying and safe cleanup | VERIFIED |
| Full uninterrupted 90-minute campaign | FAILED: approximately 79 minutes |
| k6 overlapping nonempty generation/publication | NOT OBSERVED |
| Repair, incomplete-source and late-recovery execution | NOT OBSERVED |
| Broad factual accuracy or production-scale capacity | NOT ESTABLISHED |

## Reproducibility and next action

Private artifacts are in `.local-reports/real-campaigns/pilotnov03/`: frozen manifest and approval, legitimate user registry, source snapshots, original full evidence, four exact reader responses, V3 inputs/results/receipts, assessment receipts, accounting, original/corrected reports, k6 summary, Grafana read-backs, resource failure/replay, regression logs and cleanup reconciliation. Credentials and private correlation IDs are not committed.

Only narrow evaluation fixes were retained: quiet-window deadline classification and the single analytics-read retry. V3 and frontend behavior were untouched.

Before increasing load, repeat the same small pilot under explicit applicable authorization, **wait for eligible fresh evidence before spending the read-load budget**, and pace or defer the bounded GETs so they overlap nonempty processing. Verify a complete 90-minute observer period with the read-retry change. Do not infer thousand-feed readiness or run more paid trials from the unused allowance.

## Exact generated reader text

Each language produced the same text in both user slots. Bodies were empty; these are complete headline-only updates with the original linked citations.

### English

Israeli warplanes reportedly fly at low altitude over South Lebanon and Nabatieh
 [1](https://t.me/lebanonnews2/107949)

Unidentified hostile drone reported flying over Beirut's southern suburbs
 [2](https://t.me/lebanonnews2/107948)

### Arabic

تحليق طيران حربي إسرائيلي على علو منخفض فوق الجنوب والنبطية
 [1](https://t.me/lebanonnews2/107949)

تحليق مسيّر معادٍ في أجواء الضاحية الجنوبية لبيروت
 [2](https://t.me/lebanonnews2/107948)

## Regression validation

The updated framework suite passed 32 tests. Root script regressions passed 102 tests and workspace TypeScript checks passed. The retained real quiet-window regression failed before the correction and passed afterward. Final independent Grafana querying confirmed four publications, ten completed opportunities, 16 calls, $0.0186864 settled, an inactive execution and an explicitly aborted observation. The new commit's full CI result is recorded separately from the already-green tested baseline.
