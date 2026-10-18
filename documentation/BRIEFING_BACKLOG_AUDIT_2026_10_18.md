# Canonical backlog and transport audit

This read-only audit targets `distilled-news-staging`, D1
`ab259bfe-6029-4e20-8cb6-eea6b7a67459`, on 2026-10-18. It performed no queue
pull, peek, replay, purge, paid call, permission change, financial change, runtime
edit or deployment. Canonical jobs, transport generations and native DLQ messages
are separate populations; their counts must not be added or treated as identities.

## Current accepted work

The first pipeline snapshot is at **11:18:58.225 UTC**. Indexed job/recovery
classifications are at **11:22:05.588** and **11:24:35.411 UTC**. Multiple SELECTs
are bounded observations rather than one transactionally frozen snapshot.

| Population | State and cause | Age evidence | Recovery interpretation |
| --- | --- | --- | --- |
| 983 reassessments | All PENDING, zero canonical attempts, no failure code, non-exhausted, due now; all X profile sources in one enabled feed | Observed Oct 15 19:08:56.644 through Oct 16 03:16:27.431; accepted Oct 15 19:40:08.033 through Oct 16 03:20:17.678 | All 983 are unique current accepted revisions, with no intelligence receipt, missing evidence, superseded revision or deletion. They remain real unreviewed work eligible for existing dispatch, subject to admission and model authority. |
| 291 authoritative rechecks | All PENDING, zero attempts, non-exhausted, no retry timestamp; Telegram intake `QUARANTINE_REVISION_CONFLICT` | Oldest observation Oct 15 20:01:11.033; newest Oct 18 11:07:14.643 | These are repeated quarantined observations for **five unique item keys**, not 291 distinct articles. No acquired-evidence conflict ID or evidence acceptance receipt exists for these jobs. Each currently points to an item whose accepted revision came from another observation. Resolving the quarantine requires evidence-backed authority; the count cannot be safely reset. |

At 11:22, the oldest review observation is about **64.22 hours** old and its
oldest acceptance is **63.70 hours** old; even the newest acceptance is about
56.03 hours old. The oldest recheck observation is about **63.35 hours** old.
Jobs do not store a creation timestamp. These are immutable observation and
acceptance ages, not claimed exact job-creation waits.

All 983 review observations predate the first optimization release at
Oct 18 01:08:31 UTC. Of the 291 recheck observations, 238 predate that release
and 53 were observed afterwards. This is cohort timing, not proof that a release
caused a conflict. The earlier 10:36 snapshot had 288 rechecks; by 11:18 there
were three more, while the 983 pending reviews remained unchanged.

Only five of the 983 pending reassessments have retained `v1_queue_dispatches`
rows, totaling 11 sends (two or three per job); the other 978 have no retained
row in that table. None of those five leases was active at 11:22. Those records
are transport bookkeeping and do not enumerate every older delivery.

## Admission and recovery paths

`pendingV1Jobs` reads due, enabled, non-exhausted work, excludes active dispatch
reservations and full per-feed transport lanes, and returns at most five jobs per
source. Every fifth minute it orders oldest first; otherwise closed-window work
and recent evidence receive transport priority. `continueFeedReview` sends a
bounded successor after canonical completion. Connector relays and Cron retain
crash recovery. Matching busy deliveries rotate only their transport generation,
leaving canonical processing attempts unchanged. Empty native queues therefore
cannot establish that these canonical jobs were abandoned or completed.

`v1_queue_dispatches.send_count` and `connector_queue_dispatch.sends` increment
when claiming transport before the actual send, including a subsequently
declined full lane. Their differences cannot establish a successful admission
or delivery rate. The snapshots establish offered/occupied work and zero
canonical progress, not a complete event census of successful admissions.

At 11:24, the affected feed's single intelligence slot held `v1_reassess`;
the other two feeds each held `v1_briefing`. At 11:22 the affected feed also
had an active canonical write-turn lease and four unexpired waiters. The
30-minute feed had an active turn and five waiters. A lease snapshot does not
prove how long its owner had held it or identify its current code stage.

Publication still takes the outer feed turn in `withIntelligenceTurn`. Review
and rematch semantic preparation are isolated, but their deterministic
consumption must reacquire that same canonical turn. Thus long publication
execution can still contend with canonical review and acquisition promotion.
The earlier first-release live profile measured publication total p50/p95
231,258/349,650 ms and shortlist p50/p95 206,473/300,815 ms, with no new edition.
Those are historical measurements from another release; this audit does not
claim a fresh equivalent duration from the instantaneous lease rows.

There is no generic `AUTHORITATIVE_RECHECK` queue dispatcher. The current
automatic Telegram edit pass prioritizes up to three pending item keys per
source per interval and schedules immutable source polls. Existing resolution
functions validate an authoritative observation or later accepted state before
marking work done; repository search found no non-test calls to
`resolveQuarantinedObservation` or `resolveEvidenceConflict`. A successful
later poll is consequently not proof that every older quarantine was resolved.

For the affected feed, retained Telegram poll metadata at 11:24 includes:

| Recheck poll state | Count |
| --- | ---: |
| BLOCKED / BOUNDED_LIMIT | 165 |
| BLOCKED / RETRY_LIMIT | 11 |
| BLOCKED / UNCERTAIN_PAID_SUBMISSION | 1 |
| DONE | 43 |
| PENDING / INTAKE_BUSY | 1 |

These polls are another durable population, not a one-to-one mapping to the
291 quarantine jobs. The uncertain submission remains protected. The five-key
backlog, limited automatic key selection and missing automatic resolution call
are reasons to investigate the authority/resolution path before contemplating
any replay. No source helper request was issued by this audit.

## Other retained terminal work

The same three enabled feeds also retain **361 FAILED/exhausted acquisitions**:
38 AUTH_REQUIRED, 66 NETWORK, 173 POLICY_DENIED and 84 RECOVERY_EXHAUSTED.
By observation time, 317 predate the first release and 44 follow it (32 NETWORK,
12 RECOVERY_EXHAUSTED). This does not establish when failure was recorded.
There are also **25 FAILED/exhausted reassessments**: ten IDEMPOTENCY_CONFLICT,
five SCOPE_DENIED and ten TEMPORARY_UNAVAILABLE, all with pre-release observations.
These are distinct from the 983 eligible pending reviews. Ordinary dispatch
excludes them; expired retry timestamps do not make exhausted work eligible.
Source access, authoritative ordering and uncertain financial outcomes must be
resolved according to their canonical policies before considering recovery.

## Native queues and DLQ limits

The initial queue GET, shortly before the 11:18 D1 snapshot, returned:

| Native queue | Main backlog | DLQ backlog |
| --- | ---: | ---: |
| Processing | 0 | 310 |
| Collection | 6 | 192 |
| Acquisition | 5 | 281 |
| V1 intelligence | 6 | 749 |
| Total | 17 | **1,532** |

The 10:26 comparison was 310/192/281/748, or 1,531 DLQ messages. The observed
net increase is one V1 DLQ message. All four DLQ `oldest_message_timestamp_ms`
values were **zero**, so oldest age is **unavailable**, not zero age.
Counts are approximate native metadata; no DLQ payload or message identity was
read. Exact per-message cause, generation, historical/new cohort and recovery
classification of these 1,532 messages therefore remain **unknown**. The
historical pre-release counts 310/111/254/682 and later net increases must not
be presented as an identity-preserving partition of today's messages.

The indexed canonical outcome query for 10:36 through 11:22 returned 25 rows:
11 acquisition retry waits, three briefing retry waits, eight rematch retry
waits and three rematch delivery exhaustions, all TEMPORARY_UNAVAILABLE.
It returned no new FEED_TURN_BUSY rows. Matching busy generations normally
rotate and acknowledge without adding such an outcome row. Historical
FEED_TURN_BUSY exhaustion records can also be acknowledged, so neither old
nor current `v1_queue_outcomes` counts identify actual native DLQ contents.

## Fixed interval drain measurement

Between **11:18:58.225 and 11:29:17.164 UTC**, a **618.939-second** interval
(10 minutes 18.939 seconds), the following durable counts were observed:

| Metric | Start | End | Change |
| --- | ---: | ---: | ---: |
| Observations | 47,310 | 47,310 | 0 |
| Accepted evidence revisions | 3,994 | 3,994 | 0 |
| Intelligence receipts | 3,059 | 3,059 | 0 |
| Pending reassessments | 983 | 983 | 0 |
| Pending authoritative rechecks | 291 | 291 | 0 |
| Editions | 82 | 82 | 0 |
| Semantic results | 4,216 | 4,219 | +3 |
| Model reservations | 3,825 | 3,828 | +3 |

Observed **net review/recheck backlog drain and publication throughput were
zero per hour** in this interval. A separate completion-timestamp query at
11:28:54.406 returned no intelligence receipt computed since the first snapshot.
There is no observed canonical receipt or edition completion to support a
positive gross completion rate. Three new semantic result/reservation rows show
ongoing runtime activity; neither row count proves a successful semantic judgment,
a newly billed callback or a canonical commit. This audit initiated no model work.
Two RUNNING acquisitions at the start were absent from the final active set,
while accepted revision count stayed unchanged; this is not evidence of two
successful acquisitions. Latest edition remains Oct 16 13:21:25.910 UTC.

Final queue GETs completed at 11:29:01.714 UTC: main backlogs
processing/collection/acquisition/V1 = **0/9/4/6**, DLQs = **310/192/281/749**.
The DLQ total was unchanged at 1,532 across this short measurement. Their ages
and identities remain unknown. This interval predates the CPU-cache release;
it is a pre-release operational baseline, not a post-release verdict.

Pending briefing request reason projections stayed unchanged across the interval:
89 AWAITING_INTAKE_REASSESSMENT, 52 ACCOUNT_RESOURCE_WAIT,
59 INCOMPLETE_INTAKE_COVERAGE, two SEMANTIC_OUTCOME_UNKNOWN and four
SEMANTIC_MODEL_CONTEXT_CONTINUATION_REQUIRED (**206 total**). Oldest pending
window end is Oct 15 16:00 UTC; newest is Oct 18 11:00 UTC. These are retained
request labels, not a fresh recomputation of every historical request's blockers.
In particular, 24 awaiting-reassessment labels belong to the other two feeds
that currently have no active pending/running jobs in this query scope.

## Evidence and reproduction

Private metadata-only artifacts under `.local-reports/briefing-latency/`:

- `backlog-audit-initial-pipeline.json`: first five SELECTs and D1 execution metadata.
- `backlog-audit-initial-queues.jsonl`: GET-only native queue metrics.
- `backlog-audit-details.sql` / `.json`: indexed state, age, cause, dispatch,
  slot, turn, waiter, recent-outcome and generation aggregates.
- `backlog-audit-recovery.sql` / `.json`: current-evidence identity checks,
  slot kind, receipt completion timestamps and Telegram poll aggregates.
- `backlog-audit-final-pipeline.json`: 11:28:54 snapshot plus the explicit new
  receipt timestamp query (9m56.181s after the first snapshot).
- `backlog-audit-final-pipeline-after10m.json`: final 11:29:17 canonical snapshot
  satisfying the ten-minute comparison interval.
- `backlog-audit-final-queues.jsonl`: final GET-only native queue metrics.

The nine detail SELECTs read 26,555 rows in 148.65 ms reported D1 SQL time,
with zero rows written and all `changed_db=false`. Recovery SELECTs also report
zero rows written (15,092 rows read, 99.23 ms SQL). Article bodies, prompts, provider payloads and credentials
were neither printed nor added to this report.

Use the existing authorized staging CLI, collapsing newlines for native Windows
argument handling; `--file` returns an import summary rather than SELECT rows:

```powershell
$sql = (Get-Content .local-reports/briefing-latency/backlog-audit-details.sql -Raw) -replace '\r?\n', ' '
corepack pnpm --filter @distilled/worker exec wrangler d1 execute DB --remote --config wrangler.staging.toml --command $sql --json
```

Source references: `v1-queue-dispatch.ts`, `connector-review-continuation.ts`,
`connector-work-admission.ts`, `connector-scheduling.ts`,
`connector-intelligence-turn.ts`, `connector-runtime.ts`,
`v1-intake/intake.ts`, `v1-intake/conflicts.ts`,
`v1-intelligence/runtime.ts` and `v1-intelligence/semantic-preparation.ts`.
See also [the live publication profile](BRIEFING_PUBLICATION_PROFILE_2026_10_18.md)
and [the main investigation](BRIEFING_LATENCY_2026_10_18.md).

The safe next measurements are canonical receipt/edition completion and
admission/delivery rates over a fixed interval, plus the post-CPU release tail.
The existing insufficient headroom for new required GPT work cannot be bypassed
to manufacture a successful publication, and unknown holds cannot be released
without settlement evidence.
