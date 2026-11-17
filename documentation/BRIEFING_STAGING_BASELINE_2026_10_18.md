# Briefing latency: staging baseline and deployment preflight

This is a read-only baseline of the existing **staging** deployment, collected on
2026-10-18 in Beirut (2026-10-17 UTC), before the briefing latency changes. It is
not an optimized deployment result or a fresh end-to-end test. Production and
sources QA were not queried or modified.

## Snapshot scope and times

The separate reads are not an atomic database snapshot. Existing staging Cron
and queues continued operating. The following times are UTC completion times of
the local, ignored JSON evidence files:

| Read | UTC completion |
| --- | --- |
| Current Worker version and bindings | 2026-10-17 22:28:51 |
| Historical timing, spending, requests and queue aggregates | 2026-10-17 22:33:08 |
| Exact current-grant exposure and concurrency amendment | 2026-10-17 22:35:49 |
| Immutable publication support lineage and recovery aggregates | 2026-10-17 22:36:58 |
| Construction rejection diagnostics and existing feed schedules | 2026-10-17 22:37:49 |
| Unpaused-feed backlog | 2026-10-17 22:39:52 |
| Latest historical publication stage metadata | 2026-10-17 22:43:59 |

Private evidence is under `.local-reports/briefing-latency/`, which is ignored.
Reports contain aggregates and internal correlation IDs, not article text,
prompts, provider response bodies, or secret values. Do not commit the database
backup or private operational exports.

## Confirmed target and rollback

- Configuration: `apps/worker/wrangler.staging.toml`.
- Worker: `distilled-news-staging`.
- Origin: `https://distilled-news-staging.distillednews-platform.workers.dev`.
- Account: `e32b564514d4f9b9e383b7dd30dbb026`; existing Wrangler OAuth login
  successfully verified this account. No new credential was created.
- Current version / rollback target:
  `82451fc7-b513-4bf0-8bb6-c9da1cfe6156`, created
  `2026-10-16T08:45:55.148311Z`, deployed `2026-10-16T08:45:57.234Z`.
- Version message: integration `d230148`, centered guest landing and large-screen
  adaptive cards; backend/live financial permissions preserved.
- D1: `distilled-news-staging`, ID
  `ab259bfe-6029-4e20-8cb6-eea6b7a67459`, primary region WEUR, read replication
  disabled. The initial reported size was 3,841,519,616 bytes.
- R2 binding `RAW_ARCHIVE`: `distilled-news-staging-raw`; direct bucket-info read
  also verified EEUR location, 22,105 objects and 955 MB (rounded provider value).
- `ASSETS` is an existing **native Workers assets binding**, serving with SPA
  fallback and `run_worker_first=true`. The R2 historical fallback prefix is
  `staging-assets/758837e409f03d248288de04909e981d680abf6a/`.
- VPC binding `SOURCE_EXECUTION_SERVICE`: service
  `01a1099d-e88a-7c23-a1c5-eeb51471e780`. Binding existence is verified; this read
  does not establish helper connectivity or a successful acquisition.
- Intelligence queue `distilled-news-staging-v1`, ID
  `c0bf9aa058114ca98fc1c773b22ed333`, and collection queue
  `distilled-news-staging-collection`, ID `67a4fc0472ed41848071ca9008016c9f`,
  each report one consumer, `distilled-news-staging`. Each also lists the
  historical integration Worker as a producer. Queue configuration reads do not
  establish current backlog size or that DLQs are empty.
- The current version retains 14 secret bindings by name, including OpenRouter,
  source execution and existing mail/provider credentials. Secret values were
  not requested. No Workers AI binding, Cloudflare AI Gateway token binding or
  OpenAI API-key binding is present in the deployed version.

The remaining staging queue resources were verified directly on October 17
around 22:58 UTC. Both main queues have staging as their sole consumer and the
historical integration Worker as an additional producer; DLQ info lists no
consumers/producers. Resource existence does not establish an empty DLQ.

| Queue | ID |
| --- | --- |
| `distilled-news-staging-processing` | `bf578e1627ff41bcb8eacf497e39eba4` |
| `distilled-news-staging-acquisition` | `d55dda5287c14092abc5968eacf7d96e` |
| `distilled-news-staging-processing-dlq` | `3a06d96704d14fdcb23176211d436c4e` |
| `distilled-news-staging-acquisition-dlq` | `23b6b57a14c9454495471557a7fce9b2` |
| `distilled-news-staging-v1-dlq` | `db9e25ffafec4d65a3df1e1b73f8048c` |
| `distilled-news-staging-collection-dlq` | `e6985f79c1cc46bcbaeca59f76f73112` |

Application rollback must explicitly target staging, restore the saved Worker
version and its asset state, and leave additive migrations and newly accepted
history in place. Example from `apps/worker`:

```powershell
corepack pnpm exec wrangler rollback 82451fc7-b513-4bf0-8bb6-c9da1cfe6156 --config wrangler.staging.toml
```

### Configuration drift that must be preserved

The checked-in staging file initially differed from the deployed financial and
source settings. Deploying it unchanged would alter existing authorizations.
The verified **live** values are:

```text
SOURCE_OPERATION_CEILINGS_JSON={"twitterApiIo":0.01,"apify":0.25,"zyte":0}
SOURCE_PROVIDER_BUDGETS_JSON={"x_twitterapi_io":15,"x_apify":15,"google_apify":0,"linkedin_apify":15,"zyte":0}
```

`CLOUDFLARE_IMAGE_ACCOUNT_ID` is live-only and equals the verified account ID.
`SOURCE_GOOGLE_RESOLUTION_ENABLED` is absent remotely but was `true` locally.
Preserve the live state rather than enabling a new source route during this
latency rollout. All other shared plaintext variables matched at preflight.

## Measured causes of delay

1. **Feed-turn contention and repeated transport exhaustion.** Retained queue
   outcomes contain 11,233 reassessment, 6,240 acquisition, 4,150 rematch and
   4,060 briefing deliveries exhausted with `FEED_TURN_BUSY`. Another 44,764
   reassessment and 8,428 rematch deliveries were retryable waits with
   `TEMPORARY_UNAVAILABLE`. These are delivery outcomes, not distinct abandoned
   canonical jobs, and cover different historical periods. They demonstrate
   substantial unsuccessful scheduling work; they do not alone quantify total
   wait seconds or prove one specific lock's ownership duration.
2. **Repeated rejected semantic construction.** Construction results include
   1,123 `SEMANTIC_CONSTRUCTION_REJECTED`, 652 successful, 267
   `SEMANTIC_BUDGET_EXHAUSTED`, 9 provider failures, 7 timeouts and 6 unknown
   outcomes. Most recorded rejections are source-binding checks, including
   `SLOT_VALUE_NOT_SOURCE` (256 at the first slot and 79 at the second),
   `MATERIAL_BACKGROUND` (127 at the first mention and 51 at the second),
   `SLOT_ENTITY_OWNERSHIP` (118 at the first slot), and
   `ENTITY_ALIAS_NOT_SOURCE` (96 at the first entity). Another 208 have legacy
   generic `SCOPE_DENIED`. These checks protect grounding and must not be
   weakened to improve acceptance or apparent throughput.
3. **Provider latency matters, especially editorial planning and GPT calls.**
   Persisted operation durations below establish the scale of expensive work.
   They do not isolate pure model inference from transport/adapter overhead.
4. **Almost exhausted model authority and unresolved paid outcomes.** Current
   remaining exposure headroom is about $0.0237. Existing source and model
   financial fences are real dependencies, not scheduling errors to bypass.
5. **Large active backlog and incomplete source coverage.** Unpaused feeds
   retain 1,022 pending reassessments, 226 authoritative rechecks, eight pending
   acquisitions and three running acquisitions. This is a more useful active
   baseline than the all-history total of 1,485 pending jobs.

The D1 info snapshot reports 1,211,233 read queries and 13,704,441,851 rows read
over its previous 24 hours, plus 191,885 write queries and 389,380 rows written.
This is consistent with significant scan overhead, but it does not attribute
the rows to particular review queries. One aggregate document-kind count itself
read 138,813 rows in 182.5 ms. Query-level instrumentation or query-plan checks
are required before attributing a specific graph optimization to this total.

## Historical operation latency

Nearest-rank percentiles from retained `semantic_results` with recorded
`usage.calls>0`; milliseconds. The six zero-duration construction records and
one zero-duration relevance record are retained in this historical aggregate
and are a data-quality limitation. These are operation-result samples, not
fresh provider benchmarks, distinct reviews, or review wall-clock measurements.

| Model / operation | Samples | p50 | p95 | p99 | Deferred results |
| --- | ---: | ---: | ---: | ---: | ---: |
| GPT-4.1-mini construction | 1,796 | 4,839 | 16,176 | 30,787 | 1,144 |
| JEV relation | 555 | 842 | 1,532 | 2,369 | 105 |
| JEV relation/effect | 128 | 577 | 1,291 | 2,162 | 1 |
| JEV editorial relevance | 749 | 850 | 1,656 | 10,334 | 39 |
| GPT-4.1-mini comparative editorial plan | 244 | 16,186 | 38,273 | 47,913 | 74 |
| GPT-4.1-mini publication synthesis | 55 | 16,390 | 41,421 | 48,315 | 0 |
| GPT-4.1-mini publication grounding | 35 | 15,823 | 58,871 | 78,993 | 0 |
| GPT-4.1-mini publication repair | 38 | 22,874 | 54,133 | 58,495 | 0 |

One historical GPT-4.1 construction record took 10,284 ms and was deferred; that
model is not in the current grant and is not a candidate for an authorized test.
No mocked timing is presented as live inference. No endpoint/model change is
supported by an equivalent-input comparison here.

## Historical publication and evidence lineage

- Requests: 43 explicitly `PUBLISHED`, 24 `QUIET`, 10 `DEFERRED`, 125 legacy
  `DONE` without a result, 265 `FAILED`, and 179 `PENDING`. Do not classify the
  legacy result-less records as quiet or published without inspecting editions.
- For 43 requests with `PUBLISHED` and `completedAt`, window-close to request
  completion was p50 **446,612 ms (7.44 min)**, p95 **4,297,943 ms (71.63 min)**,
  p99 **19,914,139 ms (331.90 min)**. Request completion is slightly later than
  the immutable edition commit.
- For all 82 immutable editions with support, earliest supporting source
  observation to edition commit was p50 **7,443,401 ms (124.06 min)**,
  p95 **67,869,396 ms (18.85 h)**, p99 **143,766,348 ms (39.94 h)**. Every edition
  support revision resolved in the retained revision table. These times include
  the intended briefing schedule and older supporting developments. They are
  not pure processing latency and do not establish factual correctness alone.
- The most recent retained publication was edition
  `62c05d3253da7f491a7da32df3e193cc806f5c50a696ebaed262caafe591326a`,
  Feed `briefing_7cf3de95-82fc-4d7e-a801-c74e3329d139`, committed
  `2026-10-16T13:21:25.910Z` for the window ending `12:30:00Z`. Its supporting
  observation was `09:31:14.570Z`, accepted evidence `09:44:41.561Z`, and stored
  publication execution duration 235,076 ms. It contains one story and one
  linked revision, generated by GPT-4.1-mini through OpenRouter. This is a
  **pre-change historical publication**, not proof of a new successful test.
- Active request waits include 52 awaiting reassessment on Feed `06b310b2...`,
  37 incomplete coverage plus 17 reassessment on Feed `7cf3de95...`, and
  20 incomplete coverage on Feed `4d69fb82...`. Each latter feed also has 12
  account-resource waits. Oldest active reassessment observation is
  `2026-10-15T19:06:57.027Z`; oldest active awaiting-review window ends
  `2026-10-15T19:00:00Z`. The all-history oldest pending date (October 6) includes
  inactive/historical feeds and must not be reported as active backlog age.

For that latest historical edition, exact retained stage metadata gives the
following timeline on October 16 (UTC). Stored timestamps are record timestamps,
not a complete execution trace:

| Stage | Timestamp / measured duration |
| --- | --- |
| Window closes | 12:30:00.000 |
| Briefing request created | 12:30:09.851 |
| Selection computed | 13:15:54.565 |
| Synthesis execution record | 13:18:26.636 / 18,284 ms |
| Repair execution record | 13:19:40.787 / 19,126 ms |
| Grounding execution record | 13:20:56.360 / 14,414 ms |
| Verification result persisted | 13:21:09.272 |
| Grounding result persisted | 13:21:09.604 |
| Fidelity result persisted | 13:21:13.563 |
| Edition committed | 13:21:25.910 |

The three recorded model durations total 51,824 ms, compared with 235,076 ms
stored publication execution. The difference includes other work, waits and
recovery; it must not all be attributed to D1. Window closure to selection alone
is 45 minutes 54.565 seconds. This supports investigating admission and readiness
alongside inference. The exact stage records were read at 2026-10-17 22:43:59 UTC.

## Spending, provider recovery, and test limits

The existing single-account model grant is valid from
`2026-10-12T19:15:55.700Z` until `2026-10-19T19:15:55.700Z`, with $50 maximum
exposure and only `typesafe/jev-1.13` / `openai/gpt-4.1-mini` allowed. Its base
concurrency is 21, with existing amendment sequence 1 raising the effective
limit to 25. Exact current-grant charges were **$45.631189154** and unsettled
held exposure **$4.345092702**, leaving **$0.023718144** headroom. All-history
reported model spending is higher and must not be substituted for grant-period
charges when checking admission.

There are 44 unsettled reservations, 25 explicitly quarantined. Nineteen still
count against effective concurrency; quarantine does not release financial
exposure. Eighteen unsettled operations have an OpenRouter generation handle.
Historical metadata-recovery attempts record 1,574
`PROVIDER_COMPLETION_UNPROVEN` and 158 provider HTTP 404 results. A handle is not
proof of terminal billing or a usable semantic result.

The existing provider-recovery path performs metadata GETs and only settles
after exact reservation/model/generation binding, terminal finish status and
reported cost are proven. No provider lookup, settlement, quarantine change or
liability release was triggered by this investigation. A future successful
lookup can settle spending; it does not reconstruct a lost canonical semantic
answer or authorize repeating a paid call.

At this headroom, one small existing reservation might still be admitted, but a
new complete acquisition/review/editorial/synthesis/verification run cannot be
promised to fit. Do not increase caps, add grants, release unknown liabilities
or switch to unapproved models to make a test pass. Passive observation of
existing feeds and reuse/recovery of already durable results are appropriate.
No Cloudflare inference comparison was executed: the deployed environment has
no corresponding AI binding/gateway credential, no alternative-model grant,
and insufficient demonstrated budget for a meaningful comparison. Cloudflare
third-party routing must not be described as Cloudflare-hosted inference.

## Migrations, backup, and reproducibility

Remote history contains 64 named migrations, through
`0058_connector_intelligence_turns.sql`. Duplicate numeric prefixes are real
independent migrations; names are authoritative. The following branch-required
additive migrations are absent remotely, and their four tables do not exist:

1. `0059_connector_feed_turn_waiters.sql`: FIFO waiter table and ordering index.
2. `0060_connector_work_slots.sql`: transport slot table and indexes.
3. `0061_connector_collection_windows.sql`: frozen collection windows and
   anonymous origin cooldowns, with indexes.

No migration was applied by this preflight. Export was started explicitly with
`d1 export DB --remote --config wrangler.staging.toml` into the ignored report
directory; full download, hash and local restore must be confirmed before a
migration. A GB-scale export is in progress as of this document's creation;
this paragraph does **not** claim a completed verified backup. Remote
`PRAGMA integrity_check` was rejected with `SQLITE_AUTH`; local restoration is
the integrity verification path. The remote table/migration SELECTs succeeded.

Commands use the existing Wrangler 4.100.0 installation, an explicit staging
config, and an ignored `WRANGLER_LOG_PATH`. Remote CLI calls required normal
network access/OAuth refresh outside the restricted sandbox. Initial sandboxed
OAuth refresh failed; the elevated read-only retry verified the existing login.
Two subsequent read-only diagnostics hit transient provider fetch/internal
errors and were retried. One baseline UNION exceeded D1's compound-SELECT limit
and was split into separate SELECTs. None of these retries called a model.

Reusable SQL source and raw aggregate responses are in the ignored reports:
`baseline.sql`, `live-baseline-queries.json`, `exact-model-admission.json`,
`publication-and-recovery.sql`, `publication-and-recovery.json`,
`rejection-diagnostics-and-feeds.json`, and `active-feed-backlog.json`.
Published-lineage queries expand only the 82 edition support-ID arrays and join
revisions/observations by exact primary key. No historical article bodies are
returned. Repeat the same queries for a comparable diagnostic snapshot, but
do not call a mixed historical workload an equivalent before/after benchmark.

Fresh instrumentation is still required for queue creation-to-dispatch,
dispatch-to-consumer, feed-turn wait, actual review wall time, canonical CAS
conflicts/retries, and per-stage graph/database time. Those measurements are
not reconstructible honestly from the existing result timestamps alone.

## Subsequent backup and migration verification

The export later completed at exactly 3,653,075,739 bytes; SHA-256
`ccf4b1d34b84d33f0a43d3a83ef23f0a120c6aefd9295ded427aca2626791b8a`.
Full local restore verified 2026-10-17 23:02:33 UTC: integrity `ok`, zero foreign-key
violations. Applying 0059–0061 locally to the full snapshot preserved all 121
preexisting table counts (migration ledger +3 only), created four empty operational
tables, and passed the same integrity/FK checks at 23:15:17 UTC.

The deployment owner applied exactly those three migrations to staging at
23:18:12–13 UTC. Fresh remote pre/post SELECT results were identical for all recorded
retained/financial/provider values; migration history alone increased 64→67.
This supplements, rather than rewrites, the original preflight's pending status.
