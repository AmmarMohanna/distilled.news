# Briefing latency investigation and staging rollout

Branch: `backend-briefing-review`, based on
`68ce2a76c36adc1060ef908bd5fd6f9c61074bd1`. Target is exclusively
`distilled-news-staging` with `apps/worker/wrangler.staging.toml`.
Production and sources QA are outside this work's deployment/data scope.

## Baseline diagnosis

See [staging baseline](BRIEFING_STAGING_BASELINE_2026_10_18.md) for exact snapshot
times, query scope, resource IDs and historical timing distributions. These are
retained staging records, not a newly run controlled provider benchmark.

1. **Feed-turn convoy is confirmed.** The queue held the canonical feed write turn
   throughout paid semantic preparation. Historical exhausted deliveries include
   11,233 reassessments, 6,240 acquisitions, 4,150 rematches and 4,060 briefings
   reporting `FEED_TURN_BUSY`. Source recovery already isolated downloads; review
   preparation still blocked their canonical promotions and source handoffs.
2. **Repeated membership materialization is confirmed and measured.** Every Event
   lookup rebuilt/filter-scanned retained memberships despite one cached SQL read.
   With 240 current Events and 12,240 retained memberships, paired real-D1 support
   retrieval p50 fell from 6,441 to 991 ms, p95 from 10,176 to 1,431 ms, and full
   list passes from 240 to one. This is a graph lookup microbenchmark, not complete
   review or real inference latency. Small-feed p50 improvement was not established.
3. **Invalid semantic constructions are substantial retained workload.** The live
   history includes 1,123 construction rejections versus 652 successes. Frequent
   failures concern exact slot/entity source binding and material background.
   These checks protect factual quality and were not relaxed. Retained history spans
   previous code/policy versions, so this is not the new branch's measured failure rate.
4. **Backlog and spending waits are real independent constraints.** At the baseline
   snapshot, active feeds retained 1,022 pending reassessments and 226 authoritative
   rechecks. The current $50 grant had $45.631189154 confirmed grant-period cost plus
   $4.345092702 held exposure, leaving approximately $0.023718144. There were 19
   active unsettled reservations and 25 quarantined historical reservations. No
   authority, ceiling, hold or provider attempt was reset to improve the results.
5. **Publication contains substantial work beyond inference.** Historical completed
   windows had closure-to-publication p50 446,612 ms and p95 4,297,943 ms. The latest
   recorded publication took 235,076 ms in its publication execution, while three
   recorded synthesis/repair/grounding calls sum to 51,824 ms. The remaining time
   cannot all be attributed to D1 without stage instrumentation. Closure-to-selection
   for that window was 45m54.565s. Actual new-stage measurements are reported below.

## Architecture and changes

`V1_REVIEW_PREPARATION_ISOLATED=true` is enabled only in staging configuration.
Without it, the queue's original feed-turn boundary remains in effect.

- Reassessment/rematch preparation takes a durable work-scoped semantic lease,
  without the canonical feed write turn. Independent work identities can prepare
  concurrently; duplicate identities and legacy feed-wide leases remain exclusive.
  The staging rollout retains the existing one intelligence/four acquisition
  transport capacities. This isolates promotion from inference without speculatively
  increasing paid concurrency or discarding feed fairness.
- Semantic context starts from an authorized Feed/scope snapshot. A second snapshot
  rejects mixed canonical epochs before paid preparation. Durable operation intent
  and account spending authorization still commit before every provider callback.
- Canonical engine consumption reacquires the short, token-fenced feed write turn.
  It validates current evidence identity, Feed revision, the complete known Event
  catalog/version dependencies, and storyline versions, including new storyline
  roots. A stale decision retains provisional support and a durable rematch rather
  than creating an unchecked canonical identity. CAS retries re-run deterministic
  computation, never the model call.
- Admission contention does not consume the canonical attempt budget. Matching
  transport generations retain durable work and recover through existing continuations
  and Cron. Successful paid results are reused; uncertain provider outcomes keep
  reservations and their existing no-blind-retry fence. Settlement remains independent
  of graph ownership so a late actual charge cannot disappear after lease loss.
- A transaction-local EventVersion membership index replaces repeated full metadata
  materialization. Staged membership writes invalidate that index; each CAS attempt
  has a fresh index. Returned rows cannot poison future reads. Historical memberships,
  exact revision provenance and the entire candidate universe are retained.
- Source feature extraction and candidate priorities are computed once per semantic
  preparation; previously the sort comparator repeatedly recomputed them. Candidate
  order/tie behavior and recall are unchanged. Storyline support reuses the existing
  per-version support map instead of repeatedly filtering retained memberships.
- Model intent authorization and post-response consumption now read exact active
  revision IDs instead of full article bodies. The restored staging snapshot's largest
  active feed has 2,137 revisions: full item/revision JSON totals 3,525,774 bytes,
  while revision IDs total 76,932 bytes (97.8% less raw selected-value payload).
  The regression reproduced two full-body reloads per operation before the change.
  The new query keeps identical Feed/source/deletion/current-revision joins and
  the same canonical CAS checks. These are payload/read-shape measurements, not a
  claimed 97.8% wall-clock or billed D1-read improvement.
  A seven-sample local SQLite replay of that restored feed measured p50 35.30→12.29 ms,
  preserving the exact ID set. It excludes remote D1/network latency and uses Python
  decoding; p95 sample maxima include cold-cache/system effects and are not a remote
  performance claim. Reproduce with
  `python scripts/benchmark-active-evidence-ids.py <restored-staging.sqlite3>`.
  A bounded **live staging D1 API** comparison then alternated full/ID read order
  across seven paired samples on the same 2,137 active revisions. Exact ID sets
  matched in every pair; D1 reported 4,285 rows read for either query (no billed-row
  reduction claimed). Server SQL p50/p95: **27.47/31.69→8.20/8.56 ms**. API round-trip
  p50/p95: **779/1,447→400/652 ms**. Returned value characters fell
  **3,523,492→76,932**. p95 is the sample maximum at n=7. API round-trip includes
  the authenticated API transport and is not Worker-binding or whole-review latency.
  The benchmark made zero provider/model calls and emitted counts/timings only.

There is no new schema migration in this implementation. Existing additive recovery
migrations 0059–0061 are necessary because this staging deployment was still at 0058.
They are validated/backed up and recorded separately below; no old migration is replayed.

## Measurements and privacy

One aggregate `V1_PIPELINE_LATENCY` record per review, rematch, publication or model
operation contains opaque correlation IDs, stage totals and numeric counters.
`V1_QUEUE_LATENCY` records native enqueue-age, consumer duration, transport attempts,
outcome, and canonical work/window identity. There is no D1 row per timer.

Stages include evidence/graph load, claim extraction/preprocessing, semantic preparation,
semantic lease/feed-turn admission, held feed turn, canonical review, storyline updates,
correction ledger, graph validation, snapshot/transaction/commit, spending reservation,
provider operation kind (including repairs/continuations), settlement and result commit.
Publication separates readiness, shortlist, editorial plan, ranking/selection, and
synthesis/verification/publication. Model operation kinds distinguish synthesis, repair
and grounding; each retains its provider latency and durable receipt identity.

Stage totals can overlap (e.g. a transaction contains graph validation). They must not
be added as independent pieces of wall-clock time. `newProviderCalls` counts started
provider callbacks; receipt counters describe durable receipts, including replay.
Reported costs are deduplicated by **retained receipt ID**, which can differ from the
requested operation ID after retry/day reuse. A settled paid response remains visible
even if canonical result consumption subsequently fails.

`outcome: SUCCEEDED` means the instrumented function returned normally. A normal
return can include a durable resource deferral, quiet result or replay; it does not
mean a semantic judgment was accepted or an edition was published. Use the durable
semantic-result status, briefing-request result and actual edition/publication rows
for success/deferred/failure counts. `publicationPublished` identifies observed new
publication paths; HTTP 200 and aggregate function completion alone are insufficient.

Publication performs at most one additional bounded metadata-only lineage query per
newly published edition. Its failure cannot fail publication. Source-observed and
accepted-to-publication ages describe the oldest selected support; retained older
developments make these different from pure queue/processing delay.

No article text, prompt, provider response payload, credential, account email or error
message is added to these diagnostics. Existing durable provider/model receipts remain
the accounting authority. Legacy jobs lack an explicit creation timestamp; native
queue age and accepted-to-review age do not pretend to be exact legacy job-creation wait.

Generate an offline percentile/counter report from saved structured tail records:

```powershell
node scripts/summarize-briefing-latency.mjs <redacted-tail.jsonl>
```

The summarizer uses nearest-rank p50/p95/p99, emits sample counts and separates
execution phases. Do not mix deterministic fixture reports with real provider samples.

### Fresh predeployment observation

At 2026-10-17 23:56 UTC the old Worker still had 82 editions (latest
2026-10-16 13:21:25.910 UTC). Since 23:00 UTC, queue outcomes recorded 517
`DELIVERY_EXHAUSTED / FEED_TURN_BUSY`, plus one temporary-unavailable exhaustion.
Pending publication reasons included 80 awaiting reassessment, 57 incomplete intake,
28 account-resource waits, six unknown paid outcomes and two protected-work blocks.
These are all retained requests, including historical feeds, not unique active windows.

A passive 80.6-second tail captured 41 old-version invocations with zero exceptions:
21 intelligence queue invocations (wall p50/p95 37,976/56,488 ms), five acquisition
(31,619/56,996 ms), 13 collection (1,515/36,156 ms), and two Cron. These are consumer
invocation durations, including admission waits, not completed review latency.
There were no new-stage completion records in this old Worker sample.

Read-only queue metrics just before 2026-10-18 00:00 UTC showed main backlogs
processing/collection/acquisition/intelligence = 0/0/3/30; their DLQs already contained
310/111/254/682 messages. Counts are approximate distributed metrics; oldest DLQ
timestamps were unavailable (zero). No message was pulled, purged or replayed.
Empty transport queues do not imply no canonical pending work.

The offline summarizer accepts UTF-8 and Windows UTF-16LE redirected logs, JSONL,
and consecutive pretty-printed Wrangler events. Its fixture covers escaped braces
in unrelated legacy messages without admitting them to the numeric report.

## Correctness and benchmark verification

[Graph benchmark details and reproduction commands](BRIEFING_GRAPH_BENCHMARK_2026_10_18.md)
contain small/large/retained-history paired comparisons, exact support checks, timings,
operation counts and initial Windows timeout reruns. Both paths make zero provider calls.

Focused review regression run: **57/57 passed**. Subsequent integrated race/queue/privacy
run: **11/11 passed** (overlaps the first run). Integrated cases use real local D1 and
synthetic billed model ports; they are not actual provider benchmarks:

- Slow preparation permits concurrent acquisition promotion and reacquires canonical
  write ownership for consumption.
- Busy canonical admission leaves the original job PENDING with zero failed attempts.
- Replacing the same accepted evidence during a paid callback settles the reported
  charge, rejects stale consumption, and retains the replacement's pending work.
- Independent NEW_EVENT preparations overlap; serialized consumption preserves the
  first decision and a durable rematch/support for the stale sibling, with two total
  provider callbacks for two independent inputs.
- Existing replay, UNKNOWN, lease expiry/replacement, source revocation, construction
  repair and continuation tests preserve their financial/canonical invariants.

Independent review found no Critical canonical-integrity issue. Findings corrected:
receipt/request identity cost deduplication, settlement visibility after failed
consumption, missing queue/window correlation, and missing integrated race coverage.
Nested model records inherit their review/window correlation only within the same
Feed; a dedicated isolation test covers cross-Feed context exclusion.

The full run exposed an inherited read-cost fixture expecting `list('memberships')`
to load historical article bodies implicitly (108 reads against a six-read bound).
The file was unchanged from base `68ce2a76`; restoring that eager expansion would
undo the source-recovery optimization. The fixture now explicitly requests all 104
supports of the 100 current Event versions and prefetches them before inspection.
Its exact-value assertions and six-read bound both pass. No canonical loading or
historical-provenance behavior was weakened to satisfy the fixture.

The full run also exposed an unchanged model-availability fixture creating a Feed
now and expecting dispatch of its already-closed daily window. Source-recovery's
existing `feedExistedInWindow` gate correctly rejects a window preceding creation;
neither this test nor that dispatch gate had changed from base. The fixture now uses
the first actual `nextLiveBriefingAt` boundary after creation, asserts that ordering,
and retains all model-setup, zero-attempt and resumed-dispatch assertions. The product
gate is preserved; the corrected file is rerun separately from the full-run record.

Final repository-wide typechecks, all five library/package builds, frontend build,
and explicit staging Worker dry run passed. Script tests pass **28/28**.

The complete serial Worker command finished in 4,006.92 seconds: **222 files passed,
three failed, three skipped; 1,597 tests passed, four failed, 11 skipped** (228 files,
1,612 tests). The four failures were the inherited model-availability fixture above,
one explicit 15-second quiet-corroboration timeout, and two explicit 25-second
semantic-coverage timeouts. The original complete log/JSON result is retained.
All three affected files were then rerun serially: **35/35 passed**, retaining their
original assertion limits. No runtime code changed during full regression execution;
only the already-executed inherited scheduling fixture was corrected for its rerun.
All 1,601 non-skipped Worker cases therefore pass across the complete run and rerun;
the original full command itself was not green and is not represented as such.

Other workspace coverage: core 43/43, contracts 44/44, connectors 256/256, web 34/34.
Agent runtime's full run passed 266, skipped two and timed out one browser lease-abort
case; its isolated rerun passed. Browser bridge initially had four startup/cleanup
failures in parallel; its full serial rerun passed 82/82. These original failures
are retained, not counted as passing runs. No unrelated browser implementation changed.

## Publication latency policy

No arbitrary deadline or new partial-publication contract is introduced. Existing
window-closure observation cutoffs, collection gates, accepted-evidence dependencies,
protected correction obligations and truthful PENDING/BLOCKED/DEFERRED/QUIET behavior
remain authoritative. Later observations do not indefinitely extend an older window.
Ready closed-window priority and oldest-work recovery from the source-recovery branch
are preserved. A missing authorization is a wait, not a verified quiet period.

A new bounded partial-publication state is **not validated or implemented by this
change**. The measured p95 window delay spans several 30-minute schedules, model
authorization is nearly exhausted, and substantial accepted review work remains.
Those observations do not establish a safe coverage cutoff. Adding one would require
an explicit client-visible coverage contract, protected-correction handling and paired
quality/live evidence; a timeout alone would conceal the current coverage problem.

## Provider evaluation limits

Model choices remain Jev `typesafe/jev-1.13` and `openai/gpt-4.1-mini` through OpenRouter.
Historical model latencies in the baseline compare different operation populations,
not identical saved questions and not model decision quality. No provider speed change
is claimed. The staging Worker has no Cloudflare AI inference binding or corresponding
alternative-route credential; equivalent Cloudflare-hosted/routed/Clef inference could
not be benchmarked. Low remaining spending authority also precludes an honest paid
multi-provider benchmark. No hidden fallback or new financial authorization was added.

A subsequent **read-only catalog/schema check** against the authorized staging
account's `/ai/models/search` and `/ai/models/schema` endpoints found
`@cf/cloudflare/clef`, `clef-omni` and `clef-flash`; searches for `jev` and `gpt-4.1`
returned no catalog matches. This does not rule out third-party AI Gateway routes.
Clef-flash's schema supports typed `noul`/choice/score questions (up to 64 questions,
255 choices), but explicitly states that long state text is truncated. Its output
reports input/output tokens, not an actual dollar-cost receipt. It is therefore a
plausible separately authorized structured-decision candidate, not a proven drop-in
replacement: context coverage, wire translation, exact billing settlement and decision
quality require validation. No inference or paid request was made by these GETs.

## Staging deployment and end-to-end verification

Pre-change Worker/rollback version: `82451fc7-b513-4bf0-8bb6-c9da1cfe6156`.
Pre-change immutable assets: `staging-assets/758837e409f03d248288de04909e981d680abf6a/`.
New immutable assets uploaded to staging only:
`staging-assets/905fe696899a08e0e9a0521efed549416f3f3fe7/` (16 files plus manifest).
The native ASSETS binding remains in place. Google Apify and Zyte source ceilings
remain zero, and all other live budget/credential/binding values are preserved.

The 3,653,075,739-byte SQL backup completed and was restored as a local SQLite database.
SHA-256: `ccf4b1d34b84d33f0a43d3a83ef23f0a120c6aefd9295ded427aca2626791b8a`.
Local restoration verified integrity `ok` and zero foreign-key violations. Applying
0059–0061 to that full restored history preserved all 121 preexisting table counts
(except the expected three migration-ledger additions), created four empty operational
tables, and again passed integrity and foreign-key checks. Original SQL is unchanged.
Remote D1 rejected `PRAGMA integrity_check`; local full-export verification supplies
the integrity evidence, not a fabricated remote PRAGMA result.

Remote migration/deployment and full-suite results are still being recorded. This
section is an execution record, not a claim of completed rollout or publication.

Migrations 0059, 0060 and 0061 were applied to staging at 2026-10-17 23:18:12–13 UTC.
The fresh remote pre/post comparison found no changes to any recorded retained-record,
provider-operation, reservation/settlement or authorization count/value; only migration
history changed from 64 to 67. No existing migration was replayed or reversed.

Rollback command (requires the explicit staging config):

```powershell
corepack pnpm --filter @distilled/worker exec wrangler rollback 82451fc7-b513-4bf0-8bb6-c9da1cfe6156 --config wrangler.staging.toml
```

Rollback changes the Worker/application version; additive schema and financial/history
records must remain. Old immutable assets are retained.

## Remaining priorities

Final concurrency audit found and reproduced a supporting-evidence race: an Event's
root version can remain unchanged between source-revision replacement and its pending
reassessment. Prepared decisions now carry their complete evidence dependency IDs;
canonical consumption checks these against the authorized active IDs in the current
CAS snapshot. A retired dependency defers to durable rematching without repeating the
settled paid call. The new real-D1 regression failed before this fence and passes after
it; the five-file preparation/routing/operations/lease suite passes all 38 tests.
Repository-wide typechecks also pass after this change.

- Complete the live comparison only within existing spending authority. A successful
  HTTP response, deployment or unit suite is not proof of real-model publication.
- Profile serial correction-ledger current-evidence lookups and the publication
  intervals now exposed by stage instrumentation. Do not attribute unmeasured waits
  wholesale to the database.
- Publication retains its legacy outer feed turn, including paid writing. This
  change isolates review preparation, not every expensive publication operation.
  Outer publication admission is visible in queue duration/busy outcomes rather
  than a separate inner PUBLICATION timer. Exact legacy job-creation-to-dispatch
  waits remain unavailable where old jobs lack a creation timestamp.
- Evaluate construction binding rejection rates on the new branch with identical
  saved inputs and a separately authorized benchmark budget. Preserve source-span,
  material-mention and correction checks.
- Evaluate more than one same-feed review transport slot only after stale-preparation
  and account contention are measured live. Conservative initial rollout keeps one.
- Establish a compatible, explicit partial-coverage publication policy after accepted
  review backlog and model authorization constraints can be tested safely.
