# Live publication profile and metadata follow-up

This is a follow-up to [the baseline and implementation report](BRIEFING_LATENCY_2026_10_18.md).
Only `distilled-news-staging` was queried or deployed. Model choices, permissions,
financial limits and unknown-outcome holds were preserved.

## First deployed implementation

Commit `52bdd0b68bd6c66c34b98a349d555c663ae651f5` deployed at
2026-10-18 01:08:31.139 UTC as Worker version
`2d8f4495-3233-4841-9f5b-5918be2023ec`. Deployment retained all 14 secret
bindings, D1/R2/queue bindings, the optional VPC source helper and native ASSETS.
The active immutable frontend prefix is
`staging-assets/905fe696899a08e0e9a0521efed549416f3f3fe7/`.

The bounded Observability query filters the exact staging service, uses `dry:true`,
and covers 01:08:31 through 07:06 UTC. Its 1,973 matching aggregates are below the
2,000-row request limit, all identify this deployment, and none have invalid records.
Aggregation was performed inside the API tool: returning thousands of raw records
through the tool can truncate the *tool response*, which must not be confused with
Worker log truncation. Percentiles use nearest rank. Stage totals overlap.

| Execution | Logged attempts | Wall p50 / p95 / p99, ms | Interpretation |
| --- | ---: | --- | --- |
| Review | 41 | 50,841 / 116,775 / 169,271 | 19 normal returns, 22 thrown waits/failures |
| Rematch | 206 | 13,716 / 56,884 / 64,676 | Includes 81 lease-busy and two feed-turn-busy attempts |
| Publication | 97 | 231,258 / 349,650 / 578,254 | 91 normal returns, six failures, **zero new editions** |
| Model operation | 1,629 | 946 / 22,045 / 26,557 | Mostly durable reuse; 47 new provider callbacks |

Selected review stages: semantic preparation p50/p95 16,841/50,013 ms;
graph loading 14,685/62,894; canonical review 43,911/128,349;
held canonical turn 44,150/128,519. There were nine review CAS conflicts in
110 CAS attempts. The long turn now contains deterministic work rather than paid
preparation; it still needs further reduction.

Publication shortlist p50/p95/p99 was **206,473/300,815/575,897 ms**;
editorial planning p50/p95 11,951/56,792. Publication had eight conflicts in
757 CAS attempts. Newly issued editorial-relevance provider requests (47 calls)
took p50/p95/p99 **852/1,228/23,248 ms**. These populations do not establish
performance of construction, synthesis or alternative providers.

For later same-feed comparison, the 30-minute feed had 38 publication attempts:
shortlist p50/p95 191,931/310,432 ms; total 240,798/360,753.
The other small feed had 58 attempts: shortlist 211,454/294,869;
total 225,983/319,856. The large feed had one failed 578,254-ms attempt.
These are live workload populations, not paired identical-input experiments.
Killed deliveries can terminate before the aggregate's `finally` log, so these
distributions are not complete censuses of all started queue work. Tail outcomes
and durable pending/edition counts are checked separately.

A separate 861.6-second live tail captured 338 deliveries: collection 267,
acquisition 25, V1 intelligence 23, Cron 14 and HTTP nine. It recorded no exceptions,
22 feed-turn-busy messages, one canceled acquisition, and **one V1 CPU-limit outcome**
(32,500 ms CPU, 312,449 ms wall). That delivery was rebuilding publication shortlists;
it is an unresolved reliability observation, not a passing smoke test.

## Confirmed database waste and changes

Correction refresh previously read every retained support's complete revision and
then queried current evidence separately, even when nothing changed. It now reads
current metadata in batches of at most 90 distinct revision identities, using the
existing primary keys and same feed/source ownership. Only changed revisions load
article bodies. Tombstones create obligations; missing rows remain absence, never
deletion. Materiality and per-trigger non-material resolution checks are unchanged.
Metadata lives only within the current invocation/CAS attempt; source/Feed epochs
still reject stale consumption. `SOURCE_CORRECTION_REFRESH` measures this stage.

The real-D1 regression failed at 240 historical body reads before the change. It
now requires zero body reads and three metadata queries for unchanged history.
On the same 100-support fixture, five alternating paired samples measured
p50 **8,489.34 -> 145.45 ms**, p95 **12,179.32 -> 1,401.58 ms**. The p95 is the
sample maximum; another local run measured 6,615.26 -> 102.68 ms p50. Local process
load is variable. These are database-path measurements with **zero provider calls**,
not inference or end-to-end claims. Material revision, deletion, missing-source and
scope-change races are tested. A live read-only invariant check found zero identity
mismatches across 3,678 evidence rows and identical old/new matches for all 145
distinct retained ledger supports.

The frozen final 14-file regression run repeated that benchmark: p50
**7,189.89 -> 117.20 ms**, p95 **20,021.70 -> 130.81 ms** (five alternating pairs,
zero provider calls). The old-path p95 contains a large local outlier; retain all
samples rather than selecting the fastest run.

Adaptive omission reuse also loaded whole historical shortlists solely to inspect
`policyVersion`. One active feed retains 132 shortlists totaling 162,874,015 characters.
The transaction now projects only policy metadata, checks global ID/Feed ownership,
overlays staged writes, and leaves the complete immutable-document cache untouched.
Missing/old policies still cause reconsideration; no candidate or protected work is
pruned by this optimization. The legacy-support lookup also uses the existing tested
EventVersion membership index.

Seven alternating **live staging D1 API** pairs on one referenced historical
shortlist returned identical ID, ownership and policy each time:

| Metric, p50 / p95 | Full historical document | Policy projection |
| --- | ---: | ---: |
| Server SQL, ms | 9.2864 / 17.2437 | 1.9176 / 2.3896 |
| Authenticated API round trip, ms | 983 / 26,078 | 565 / 677 |
| Selected value characters | 1,156,294 | 34 |
| D1 rows read | 1 | 1 |

The API p95 includes one large transport outlier; it is not a Worker-binding
latency estimate. No billed-row reduction, model-call reduction or complete briefing
speedup is inferred from this table. Actual Worker stage results follow deployment.

## Reproduction and quality boundaries

Run local D1 cases serially from the repository root:

```powershell
corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/ledger-read-cost.test.ts src/v1-intelligence/shortlist-metadata.test.ts --maxWorkers=1
```

The ledger test retains the frozen old unchanged-support algorithm and alternates
order on identical real-D1 data. Metadata tests cover 200 retained documents,
duplicate/missing identities, foreign Feed rejection, staged documents, complete
cache reads after projections, policy-compatible omission reuse and stale scope CAS.

The live SQL comparison uses the same `kind='shortlists' AND id=?` primary-key read:
`SELECT id,feed_id,json ...` versus
`SELECT id,feed_id,json_extract(json,'$.policyVersion') AS policy_version ...`.
Compare decoded full-document policy/identity with the projection inside the client;
return only counts/timings, never source text. Seven pairs alternate query order.

For a portable replay against a restored staging export:

```powershell
python scripts/benchmark-shortlist-policy.py <restored-staging.sqlite3> --id <retained-shortlist-id>
```

On that same retained document, seven paired local SQLite samples measured full
read/decode p50/p95 29.22/48.17 ms versus 8.88/13.14 ms for the projection.
All identities and policies matched. This excludes Cloudflare and network time;
the script opens SQLite read-only and emits no article text.

At 07:03 UTC, durable staging counts were 47,276 observations, 3,994 revisions,
3,052 intelligence receipts, 4,199 semantic results, 3,808 reservations and 82 editions.
Since the 01:06 cutover snapshot this is +74 observations, +1 revision, +21 receipts
and +48 results/reservations, with **no newly published briefing**. The newest retained
edition remains 2026-10-16 13:21:25.910 UTC. Normal scheduler progress is not a
controlled throughput benchmark.

Grant-period reported charges rose by **$0.006057114** to $45.638508578;
held liabilities remain $4.345092702 across 44 unsettled operations. Remaining
exposure authority is **$0.016398720**. Replayed receipt costs must not be summed
as new spending. Accepted backlog, account-resource waits, incomplete collection,
unknown outcomes and model-context continuations remain visible. No unproven hold
was released and no paid call was forced past authorization.

This is a hard admission limit for new GPT work: the configured verified GPT-4.1-mini
capability allows 32,768 output tokens at $0.0000016/token, reserving **$0.0524288**
for output alone, before input. Current semantic construction/planning/synthesis
admission uses that descriptor. Remaining $0.016398720 cannot authorize such a new
call. Lowering the descriptor, weakening reservation bounds or increasing the grant
merely to obtain a passing smoke result would violate this rollout's constraints.

One actual new revision was traced without reading/logging article text:
observed 01:01:10.678, accepted 01:37:49.033, review receipt 04:42:50.182 UTC.
Observation-to-acceptance was **36m38.355s** and acceptance-to-receipt **3h05m01.149s**.
Its receipt is `PROCESSED` with `semanticDeferred=true`; it is **not proof of completed
semantic review**, and no new edition follows it. Synthesis, verification, commit,
window-close-to-publication and observation-to-publication timings for a new live
edition are therefore unavailable, not zero. The 22 completed busy-delivery samples
in the later tail had queue-wait p50/p95 1,349/401,057 ms; these are a contended,
incomplete sample, not overall queue admission percentiles.

Fixture correctness/provenance can be verified; the factual quality and complete
coverage of a *new live edition* cannot be certified without a newly published edition.
No new partial-publication contract or arbitrary coverage timeout is enabled.

## Metadata release verification

Code commit **`082b65e7d3e73e7c5d2bdd357cedea2c4475c2ad`** was pushed only to
`backend-briefing-review` and deployed using:

```powershell
corepack pnpm --filter @distilled/worker exec wrangler deploy --name distilled-news-staging --config wrangler.staging.toml --keep-vars --tag 082b65e7d3e7 --message '<metadata optimization release>'
```

Worker version **`7ec08976-c164-461d-886f-9b29d48d4688`** was created at
**2026-10-18 08:11:29.232 UTC** and receives 100% of staging traffic. The API
verified its exact release tag and found **zero changed or missing bindings**
against the first deployed version, including all 14 secrets. The immutable asset
prefix is unchanged. There is no model capability override. No further migration
was required; history remains 67 named migrations including:

- `0059_connector_feed_turn_waiters.sql`
- `0060_connector_work_slots.sql`
- `0061_connector_collection_windows.sql`

Repository-wide typechecks, rebuilt web assets and the explicit staging Worker dry
run passed for this code. The 14 affected complete test files finished in 1,300.96
seconds with 115 passes and three timeouts. Those exact three cases passed in
isolation with their original 15/15/30-second limits. The additional store,
membership-index and protected-blocking files had 12 passes, one 90-second timeout
and two local workerd startup failures. Membership passed 2/2 on rerun; the protected
correction lifecycle passed alone under its original 90-second limit. Thus **133
affected tests pass across the runs/reruns**; neither initial command was fully green.
The prior release's complete 228-file Worker run and other workspace results remain
recorded in the main report. They are not represented as a fresh full-repository
test run after this metadata follow-up.

The Windows host was found with zero free disk space during final validation.
After rechecking the original SQL export's exact recorded SHA-256, only the derived
3,830,231,040-byte local SQLite restore was removed, recovering about 3.83 GB.
The original 3,653,075,739-byte SQL backup and all restoration/integrity/migration
validation reports remain intact. No remote data was changed by this cleanup.
The reproducible local benchmark can restore the retained SQL export again when
space permits. A stopped in-progress test during cleanup is not counted as passed.

Immediate application rollback for this follow-up:

```powershell
corepack pnpm --filter @distilled/worker exec wrangler rollback 2d8f4495-3233-4841-9f5b-5918be2023ec --config wrangler.staging.toml
```

The original pre-task rollback version remains
`82451fc7-b513-4bf0-8bb6-c9da1cfe6156`; neither rollback reverses additive schema or
erases financial/source history. Production and sources QA were not deployed or
queried for this rollout.
