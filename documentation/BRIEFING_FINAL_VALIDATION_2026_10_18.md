# Briefing latency: final implementation and staging validation

This report records the continuation on `backend-briefing-review`. All remote
changes target `distilled-news-staging`, account
`e32b564514d4f9b9e383b7dd30dbb026`, configuration
`apps/worker/wrangler.staging.toml`, D1
`ab259bfe-6029-4e20-8cb6-eea6b7a67459`, R2 `distilled-news-staging-raw`, at the
[existing staging URL](https://distilled-news-staging.distillednews-platform.workers.dev).
The existing VPC service `01a1099d-e88a-7c23-a1c5-eeb51471e780` is preserved.
Production and sources QA received no
deployment, database, queue, asset, credential or configuration change.

## Confirmed causes and implemented changes

1. Canonical feed ownership previously covered paid review preparation. The staged
   runtime now prepares under durable work-scoped semantic ownership, then takes
   the canonical feed turn for fenced consumption. Exact source/evidence, feed,
   event/storyline versions and supporting-evidence dependencies are rechecked.
   Stale prepared decisions defer through durable recovery without rebilling.
2. Repeated membership filtering, complete active-evidence authorization reads,
   correction-ledger support reads and historical shortlist expansion caused
   unnecessary retained-history work. Version-aware transaction indexes, bounded
   identity batches and policy projections preserve the complete candidate universe.
3. V8 profiling confirmed repeated fact preprocessing in shortlist computation.
   The bounded, operation-local fact-equivalence cache preserves the old algorithm,
   including malformed-input failure behavior, and recomputes after eviction.
4. The failing review's retained reuse corpus included 164 matching intent payloads,
   totaling 54,803,549 UTF-8 bytes. Reuse now reads identity/size metadata, preserves
   full ownership checks, and loads at most four candidates per page with a 2 MiB
   observed-byte target. Large individual records remain complete. Positive bodies
   are transient; compact negative receipt snapshots preserve late-result races.
   This demonstrates removed retention, not measured peak Worker heap or sole
   causality for every historical memory failure.
5. The $50 financial cap left approximately $0.0147 headroom while GPT required at
   least $0.0524288 output reservation before input. The owner explicitly approved
   one append-only increase to $51. The new immutable amendment ledger retains the
   exact original grant period, all charges/unknown liabilities and admission rules.
   Reservation insertion fences both exposure and concurrency revisions atomically.

No graph locks were removed, transport limits increased, candidate ages pruned,
model choices/routes changed, or incomplete coverage represented as QUIET.
Publication's legacy outer exclusive turn remains a measured limitation.

Live acceptance subsequently confirmed another severe shared-D1 bottleneck:
the provider-recovery candidate selector averaged 32,497 ms over 12 executions,
reading 119.6 million rows. Its history is now aggregated once in a single SQL
snapshot, preserving eligibility, global backoff and all settlement safeguards.
Five staging read-only executions of the tested replacement have p50/p95
43.93/59.08 ms and zero writes/provider calls. See the
[recovery query evidence](BRIEFING_RECOVERY_QUERY_2026_10_18.md). Its code-only
release follows the cache/exposure deployment recorded below; no further migration
or financial amendment is involved.

## Repeatable before/after evidence

| Workload | Before p50 / p95 | After p50 / p95 | Scope |
| --- | --- | --- | --- |
| 240-event/12,240-membership support lookup | 6,441 / 10,176 ms | 991 / 1,431 ms | Real local D1, complete support equality |
| Live active-ID authorization SQL | 27.47 / 31.69 ms | 8.20 / 8.56 ms | Seven paired staging read-only queries |
| 100 unchanged correction-ledger checks | 7,189.89 / 20,021.70 ms | 117.20 / 130.81 ms | Retained deterministic fixture; 240 to zero historical bodies |
| Live historical policy projection SQL | 9.286 / 17.244 ms | 1.918 / 2.390 ms | Seven paired staging read-only queries |
| Full-calendar retained shortlist wall | 16,934.30 / 22,568.72 ms | 8,038.59 / 8,138.09 ms | Five serial pairs, no provider calls |
| Full-calendar retained shortlist CPU | 16,437 / 20,532 ms | 7,811 / 8,078 ms | Same ten complete-output fingerprints |

The full-calendar replay uses the saved failed window including its calendar
metadata, 144 candidates, 1,633 facts, four unresolved targets and 224 queries.
All ten outputs have SHA-256
`0886f41ed4bd23f63dd22e4023b7e2b52475613c7ef3c6c7c8c5b2845834760c`.
Median wall time falls 52.5%; replay-region throughput rises from 3.39 to 7.63/min.
These exclude test startup and are not publication throughput or real inference
benchmarks. With five samples, p95/p99 are the sample maximum. Reproduction and
the frozen old-algorithm comparison are in the linked CPU/graph/profile reports.

## Tests and timeout investigation

The initial frozen Windows full run was **not green**: 15 case timeouts across
eight files, under severe RAM/disk pressure. All 15 subsequently pass targeted
reruns at the original case limits. The final three were also compared against
the actual pre-cache code: three passes in 87.04 seconds before, three in 85.31
seconds after. No reproducible cache-specific timeout difference was established.
Local pressure is a qualification, not a reason to erase failed runs.

Final deployed code `8a451ae39f4c319df49d3d5973501a51300c255d` has
[CI run 39131602278](https://github.com/AmmarMohanna/distilled.news/actions/runs/39131602278):

- Full Worker: **1,635 passed, 11 skipped; 231 files passed, three skipped**,
  617.60 seconds. All workspace package tests also passed. The preceding cache/
  exposure release also passed its complete Worker suite (1,633 passed, 11 skipped).
- Repository typechecks, script tests, Python source-execution tests and full
  repository build passed on CI. Local repository typechecks, web build and the
  explicit staging Wrangler dry run passed. The local generic Worker build could
  not finish its default container build because Docker CLI is unavailable;
  this is distinct from the passing staging dry run and CI build.
- Final focused memory/race tests: nine passed. Financial amendment plus existing
  spending/concurrency tests: 19 passed. Fact/correction equivalence and complete
  retained-history output equality passed. No factual/reference check was relaxed.
- Browser E2E: **373 passed, eight failed**. Six fixed-header language-layout cases
  and two missing `All feeds` button assertions fail identically in the earlier
  [082b65e CI run](https://github.com/AmmarMohanna/distilled.news/actions/runs/39110627313).
  The frontend, browser tests and Playwright configuration have no diff between
  that release and the deployed code. These are existing unresolved UI failures;
  the overall CI workflow remains red.

## Staging rollout, backup and rollback

Cache/exposure code commit: **f7fcfa15895f6842ac9c6e659a59b4d79cab589a**, pushed only to
`backend-briefing-review`. That Worker version:
**81de8398-b6b3-4a20-8ea1-260c02540563**, created
2026-10-18T12:41:42.720047Z. Deployment
**be002b22-a01d-4cb9-a8d3-67b987e2e4c3** received 100% traffic at
12:41:45.898599Z. The API confirms the version and deployed cache, transient-replay
and exposure-ledger code markers. All 56 bindings, 14 secrets, source budgets,
VPC helper, cron and four queue consumers match the prior configuration.

The staging deploy command included explicit `--config wrangler.staging.toml`,
`--name distilled-news-staging`, `--keep-vars` and commit tag. Worker upload,
version/deployment creation and settings update succeeded. Wrangler then exited 1
because a temporary local staging-scoped curl relay rejected its final read of
the account-level `workers/subdomain` URL. This was a post-deployment URL-reporting
failure, not a successful CLI exit. Independent API and trigger checks establish
the actual application rollout; no duplicate deployment was issued.

The relay was needed because direct Node HTTPS to the Cloudflare API reset before
TLS while native curl worked. It forwarded existing CLI authorization only to the
exact staging resources, listened on localhost, and changed no credentials or
Worker runtime bindings. Its lifecycle and private raw evidence are recorded
locally; signed export URLs and authentication material are excluded from reports.

Immutable frontend prefix remains
`staging-assets/905fe696899a08e0e9a0521efed549416f3f3fe7/`, with the existing native
ASSETS binding. Postdeployment root/JS/CSS/session checks pass; JS/CSS hashes match
the tested build. No frontend upload/change was needed.

Fresh pre-0062 full export was verified at 13:00:20 UTC:

- Bookmark `0000010f-000015b8-00005108-87fbeb62707ee2bf6c55795054b8fb6a`.
- SQL bytes **3,960,719,371**, SHA-256
  `612c23801dc99a154f46d53617550af87342634bfa70aa60d532e9f6edc9e197`.
- Zstd bytes **105,570,673**, SHA-256
  `713d0ad079698584f584bdf4543c13ba43e7eff1e871e3822e6cc765b380f9e9`.
- Full decompression byte count/hash match. The original pre-latency SQL backup
  and its independently verified compressed archive are also retained.

Migration 0062 was tested locally against retained financial history: original
authority/reservation/settlement values and five table counts preserved, integrity
`ok`, zero foreign-key violations. It was the only pending staging migration and
was applied once (seven commands, 2.16 ms). History advanced from 67 through 0061
to **68 through 0062**. Existing recovery migrations were not replayed. The new
amendment table was empty; retained counts were one authorization, 3,828 reservations,
3,801 settlements and one concurrency amendment before top-up.

At **13:05:14.275Z** one guarded append created exposure sequence 1, $50 to $51,
for the original staging grant. Original validFrom/validUntil remain
2026-10-12T19:15:55.700Z to 2026-10-19T19:15:55.700Z. The immutable base row remains
$50. Additional maximum exposure is $1; no automatic further increase exists.

The query-only follow-up **8a451ae39f4c319df49d3d5973501a51300c255d** subsequently
deployed successfully with Wrangler exit 0. Its full workspace tests and build
passed before rollout. The active Worker is now
**45f475b8-0d2a-4da3-9b44-bffc113ffdcb**, version created
2026-10-18T13:44:08.403324Z, deployment
**32d76037-144a-4dc6-938a-64cf0a86afb8**, 100% traffic at 13:44:10.842515Z,
tag `8a451ae39f4c`. Independent API checks verify the materialized selector in
the deployed bundle and no change to any of the 56 bindings, 14 secrets, cron,
queue consumers or asset prefix. Postdeployment HTTP/assets/session smoke passes.
There was no further migration or financial amendment. The localhost relay's
scope gained only the read-only account-subdomain GET needed for Wrangler's final
URL report, so the postdeploy CLI reporting issue did not recur.

Immediate application rollback retains all migrations and financial/history rows:

```powershell
corepack pnpm --filter @distilled/worker exec wrangler rollback 81de8398-b6b3-4a20-8ea1-260c02540563 --config wrangler.staging.toml
```

The pre-cache version `7ec08976-c164-461d-886f-9b29d48d4688`, original rollback
version `82451fc7-b513-4bf0-8bb6-c9da1cfe6156` and historical
immutable asset prefixes remain available. No rollback/drop of additive schema
or deletion/release of liabilities is part of this procedure.

## Paid-operation reconciliation

Read-only reconciliation found **44 unsettled operations and zero operations with
evidence sufficient to settle/release**: 25 quarantined ($1.470442694) and 19 active
unknowns ($2.874650008), total **$4.345092702** held. Eighteen active operations have
provider header/generation handles, but no authoritative cost/usage completion;
one active construction lacks a handle. A handle, timeout, expired lease or old
404 is not proof of nonexecution. All original holds were preserved. No uncertain
operation was reissued by the audit. See the separate paid reconciliation report.

Before amendment, reported cost $45.640445702 plus those holds left $0.014461596,
which cannot reserve the $0.0524288 minimum GPT output allowance before input.
After amendment the immediate headroom was $1.014461596. At 13:11 UTC, three new
GPT editorial operations had authoritative reported charges totaling **$0.219032**,
no new unknown holds and $0.795429596 remaining headroom. Two results succeeded;
one was deferred with `SEMANTIC_EDITORIAL_CONTEXT_REFERENCE_INVALID`. Their real
provider latencies were **15,484 / 47,580 / 72,243 ms**. This is three observations,
not a model-routing benchmark. The invalid reference was not accepted for speed.

## Live acceptance and remaining blockers

**Acceptance: BLOCKED. No newly published complete real-model briefing.** The
14:07:03.921 UTC atomic financial/edition snapshot still has **82 editions**;
latest publication remains 2026-10-16T13:21:25.910Z. This is an incomplete mission,
not successful end-to-end acceptance. No new edition's factual quality or complete
coverage can be certified, and there is no new closure-to-publication or
source-observation-to-publication duration to report.

The exact-version bounded trace contains 634 invocation records with start times
13:44:33.512-14:00:14.933 UTC: **633 `ok`, one D1 network-connection exception**,
zero observed CPU-limit/memory-limit outcomes and no D1 overload exception. This
is a small observational sample, not proof of peak heap or a permanent memory fix.
The earlier cache version's two tails included 31 then four D1 overload exceptions.
Different traffic/intervals prevent presenting these as a controlled error-rate
comparison. Small pipeline audit requests that repeatedly reset before the query
fix now consistently complete; all seven final graph/provenance/token checks are zero.

| Final trace metric | Samples | p50 | p95 | p99 |
| --- | ---: | ---: | ---: | ---: |
| Review attempt wall time | 5 | 37,450 ms | 54,668 ms | 54,668 ms |
| Transport queue wait | 181 | 1,433 ms | 459,574 ms | 1,070,055 ms |
| Transport handler wall time | 181 | 1,596 ms | 86,043 ms | 278,857 ms |
| Durable model operation, including reuse/admission | 133 | 1,243 ms | 40,983 ms | 243,775 ms |
| Publication attempt wall time | 5 | 146,725 ms | 661,592 ms | 661,592 ms |

These attempt distributions include deferrals/failures and receipt reuse. They
are not complete semantic-review or successful-publication percentiles. Four review
functions succeeded and one failed; five canonical job writes were observed. Four
publication functions failed and one returned successfully without an edition.
Of 181 transport summaries, 145 were feed-turn busy, 11 temporary-unavailable,
24 succeeded and one invalid-request. A successful handler is not an edition.

The longest real-model publication attempt, window ID
`e7c079c3a7027ebfb7a7dbb009c8a2bc7cec17871ade7774946b57f0fe7b67b2`, took
**661,592 ms (11m01.592s)** and failed:

| Stage | Measured duration |
| --- | ---: |
| Window readiness | 544 ms |
| Semantic shortlist | 240,361 ms |
| Editorial planning | 43,423 ms |
| Ranking/selection | 56,077 ms |
| Synthesis, repair, factual prechecks and associated persistence | 317,624 ms |
| Actual synthesis provider request, within that stage | 35,115 ms |
| Actual repair provider request, within that stage | 35,046 ms |
| Factual-verification result / edition commit | Not reached |

Stage and nested transaction/provider totals overlap and must not be summed
indiscriminately. This attempt made 41 CAS attempts with 17 conflicts and 623
preload queries. Across the five publication samples there were 76 CAS attempts
and 18 conflicts. The outer publication turn still covers expensive work; it has
not been removed merely to improve apparent throughput.

Both the original draft and its repair failed source/fact prechecks. Two retained
feedback documents record 30 `MISSING_REQUIRED_FACT`, 30 `LOST_QUANTITY`, eight
`UNSUPPORTED_DATE`, six `UNSUPPORTED_QUANTITY` and two `INVALID_DIRECT_QUOTE` issue
records. Counts include repeated issues across drafts, not distinct facts. The
synthesis job is durably FAILED / INVALID_REQUEST, with two paid calls costing
$0.067124 and no pending call. No unsupported text was published or relabeled a
verified quiet period. These failures are concrete acceptance blockers, rather
than a reason to weaken source fidelity. Global editorial context also rejected
results that did not exactly cover its authorized children.

The final **14:07:03.921 UTC** atomic snapshot reports:

- Original unknown operations **44**, still **$4.345092702** held, zero newly live
  or expired unknown holds. There is still no evidence to settle any original
  unknown operation; normal metadata recovery continues to report
  `PROVIDER_COMPLETION_UNPROVEN`.
- **16 newly reported operations**, actual total cost **$0.840038206** since the
  amendment, within existing model choices and authorization. Grant-period cost
  is **$46.480483908**; the effective $51 cap leaves **$0.174423390** headroom.
  That exceeds the $0.0524288 output-only minimum, but cannot reserve observed
  complete inputs requiring $0.2011592-$0.4546244. It is false to say all GPT calls
  are impossible; larger required work is financially blocked. No further increase
  is authorized automatically. Paid synthesis/repair success is not grounding success.

Canonical backlog snapshots at 13:45:14 and 14:05:12 UTC show old accepted X
reassessments **960 to 950**, plus one newer RSS job still pending. Ten net jobs
over 1,197.965 seconds is approximately **30.05/hour**, versus zero in the original
ten-minute audit. Workloads and history differ; this is observed drain, not a
controlled throughput speedup. The original 983 old jobs are now 950; the oldest
remaining observation is October 15 at 19:11:05.647 UTC, almost 67 hours old.
Authoritative rechecks increased **313 to 318** during the post-fix interval;
their required protected work remains unresolved.

Final native DLQs total **1,584**: processing 310, collection 213, acquisition 293,
V1 768. The first read-only audit had 1,532, a net increase of 52. No DLQ was pulled,
purged or replayed. Their zero oldest-message timestamps do not supply individual
ages or causes. Main-queue count metrics were 0/0/1/4 (processing/collection/
acquisition/V1); collection also returned nonzero bytes/timestamp with count zero,
so those eventually updated metrics are not proof of complete idleness. Transport
depth is not canonical pending-work count.

Remaining priorities are long publication exclusive ownership,
old accepted evidence/rechecks and coverage dependencies, unknown paid recovery,
and invalid/oversized semantic contexts. No arbitrary partial-publication timeout
or unmeasured provider substitution was introduced. Conservative existing pending/
blocked/deferred states preserve source fidelity and protected correction work.
Independent final agent review was unavailable because the agent service reached
its usage limit; release checks and the final diff were reviewed directly.

The recovery-selector CPU failure is fixed in the measured query path. The most
urgent remaining work is now the actual writer/global-context fidelity failures,
publication ownership/CAS churn, and semantic replay round trips. One model
preparation span took 264,384 ms with 1,096 preloads and failed on CAS contention;
its bounded-body paging preserves memory safety but has substantial I/O cost.
Optimizing that requires preserving ownership preflight, late-result negative
snapshots and the complete historical candidate universe, not arbitrary pruning.
Protected recheck resolution, source coverage and the old unknown provider proofs
also remain necessary. Alternative-provider benchmarks, candidate-recall pruning
and a new partial-publication contract were not validated or enabled.

D1 rejected a remote `PRAGMA integrity_check`; no full remote integrity scan is
claimed. The original complete export was restored locally and passed integrity
and foreign-key checks; 0062 also passed representative retained-finance checks.
The fresh pre-0062 archive passed byte/hash and full-decompression verification,
but was not fully restored again on the disk-constrained host. Alternative-model
or Cloudflare-route benchmarks were not run; the approved top-up was used for the
existing pipeline's bounded acceptance, without changing model/provider authority.

A final read-only proof projection at 14:12 UTC reconfirmed the original unknowns:
18 provider HEADERS receipts, zero receipts with reported cost, zero reported
semantic results and zero token-matched reported semantic settlements across
44 operations. No original operation was released or reissued by reconciliation.
