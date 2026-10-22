# V2 reporting windows and delivery

Reporting intervals use the existing local calendar anchors and configured
timezone. A delayed request keeps its original start and end. A 30-minute feed
has windows `[00:30,01:00)`, `[01:00,01:30)`, and `[01:30,02:00)`.

## First complete interval

Creation inside an interval skips that incomplete interval. Creation exactly at
an opening boundary includes the interval starting there. Both the scheduler
and displayed next briefing respect this rule.

| Created (Beirut) | First deadline | Reporting interval |
|---|---|---|
| 00:20 | 01:00 | 00:30–01:00 |
| 00:35 | 01:30 | 01:00–01:30 |
| 00:50 | 01:30 | 01:00–01:30 |
| 00:59 | 01:30 | 01:00–01:30 |
| 01:05 | 02:00 | 01:30–02:00 |

The same boundary calculation supports 30, 60, 120, 360, 720 and 1,440 minutes,
including local daily anchors and daylight-saving changes.

## Work before close

Keep existing continuous acquisition (normally every five minutes), immediate
reassessment, bounded rematches, and durable inference reuse. Do not defer
article intelligence until publication is due.

During the final five minutes of a live interval the existing relay constructs
a mechanical shortlist for that fixed future window. It saves the immutable
shortlist but makes no relevance/editorial/writer/verifier call and creates no
overflow deferrals or early completion. Final shortlisting reloads current
evidence and reader memory at close; new arrivals change its identity. The
existing candidate IDs, schema validation, coverage checks and publication CAS
remain authoritative. Preparation is not a latency guarantee: acquisition
polling, model processing, repairs and source outages can still delay delivery.

## New reporting, backlog and late discoveries

For V2 editorial input, usable source publication time determines ordinary
window freshness. Acquisition time never becomes a publication date. Unknown
publication dates remain retained evidence, but do not qualify automatically
as fresh news. Future-dated reporting is excluded from that window.

Pre-subscription acquisition backlog stays in the evidence/event catalog rather
than filling the first short-interval edition. A report published since feed
creation but discovered in a later interval can be considered there with its
original source date. News from a failed/pending/deferred earlier **complete**
window can also be considered later. Existing correction obligations and
deferred editorial work retain their separate eligibility. The reader's
communication ledger still suppresses already communicated meaning.

Facts whose supporting reporting predates the current interval require temporal
framing, even if only a few minutes old. Supporting evidence and event times
are preserved separately; an old occurrence does not become new merely because
a new article discusses it. Existing semantic news eligibility and editorial
judgment still apply. Pre-subscription backlog without a correction/deferred
obligation remains context, rather than an automatic catch-up news digest.

## Order and recovery

The old relay iterated database-returned pending requests and could enqueue two
windows together. It now sorts by reporting-window end and sends one runnable
publication per feed per relay. A live dispatch/processing lease stops later
admission. Consumers independently check older runnable requests, so queue
reordering cannot override the policy.

Failed, backed-off, intake-held or pending paid-result windows can be bypassed.
A cached editorial timeout/unknown result is not progress from resending the
same request: it stays recoverable while later windows can proceed. The original
request, reservation, uncertain outcome and financial receipts remain intact.
The existing inference layer still prohibits rebilling the same unchanged
unknown semantic question in a later window.

Only canonical reporting intervals enter automatic dispatch. The private staging
run exposed older one-off evaluation requests with arbitrary deadline timestamps;
these must not occupy scheduled publication turns. Both dispatch paths and queue
consumption exclude them. Explicit one-off processing remains available for
recovery; no historical request or receipt is deleted or rewritten.

An empty V2 input completes without buying editorial inference. Before marking
QUIET, its final CAS transaction refreshes source correction obligations and
rebuilds eligibility. A racing arrival leaves the request pending; incomplete
coverage is DEFERRED, not QUIET. No synthetic edition or delivery is invented.

## Validation and live evaluation

Focused tests cover the creation examples, timezone/DST boundaries, chronological
dispatch, consumer reordering, backoff bypass, retained paid timeout accounting,
preparation without inference, final arrivals, quiet-completion races, source
backlog, temporal framing, failed-window carry, publication replay and correction
integrity. Provider doubles in these tests do not establish real latency or cost.

Final focused runs passed 85 tests across six files (56 D1 integration/recovery
tests and 29 scheduling/classification tests). Worker typechecking and the
staging Wrangler dry-run bundle also passed. Additional scoring, paid-operation,
product enrollment, atomic quiet-coverage and correction regressions were run.
On Windows, run D1 suites sequentially; the final integration command uses
`--testTimeout 30000 --hookTimeout 30000` because the default five-second limit
can dispose a local database while a valid integration test is still running.

Read-only staging baseline on 21 October at 01:58 Beirut showed the 01:00 request
waiting on `SEMANTIC_OUTCOME_UNKNOWN` and the 01:30 request on
`SEMANTIC_MODEL_TIMEOUT`. The feed had 60 reservation-backed operations and
$1.622328 settled model cost at that snapshot. This predates these changes and
is not an optimized timing result.

This change has not been publicly deployed and no paid inference was started
for its tests. The existing staging Worker also serves active public feeds and
runs notification maintenance. Its old isolated private mission explicitly
forbids queue sends, so that mission is not an unattended scheduler proof.

For a private unattended evaluation, use one private feed, no notification
destinations, the existing OpenRouter model and an explicit currently valid
evaluation allowance. Observe at least two consecutive reporting intervals
without manually invoking processing. Record source publication, observation,
acquisition, admission, preparation, editorial, writing, verification and actual
edition persistence times; attach reservation/settlement IDs, model call counts,
reported cost and any bypass reason. Review the persisted text against acquired
sources. Do not report delivery improvement until this run is measured. Preserve
all pre-existing holds and do not change account or provider configuration.

The first private unattended activation acquired article bodies but admitted no
new model calls: three earlier unresolved OpenRouter operations occupied all
provider slots. Two had provider generation records marked cancelled; the
requested model alias resolved to a dated canonical model, and the existing
recovery check did not recognize that terminal response. The third had no saved
generation handle. This is a capacity/accounting blocker, not evidence of timely
publication. Financial settlement and any changes to existing holds require the
operator's separate approval. The test was paused without releasing holds.

### Operator reset of historical holds

An explicitly approved hold reset archives the exact reservation identities as
`model_execution_quarantines`. Provider concurrency ignores only markers bound to
the same reservation ID, feed, account and token. Request rate limits still count
actual admissions. Reservations, receipts, unknown billing exposure and operation
retry fences remain intact; this does not claim provider cancellation or zero cost.
The reset does not require retiring the current feed. It creates no new spending
authorization and does not alter settled financial records.

### Freshness before paid intelligence

V2 reassessment checks the source publication time before semantic construction
or identity review. Initial articles published before feed creation are retained
as acquired evidence with a `review_admissions` record (`BACKLOG_RETAINED`), and
their intake job completes without claiming semantic processing. They create no
new event, paid intent, or rematch. Existing backlog rematches are excluded from
automatic dispatch; already queued deliveries repeat the same admission check.
No historical results, operation identities or financial records are rewritten.

News published since subscription remains eligible for early continuous review,
including late discovery after its original window. Source revisions affecting
existing graph evidence and publication-memory evidence still receive review.
Missing publication dates are not replaced by acquisition timestamps; the
existing editorial unknown-date rules continue to apply. Final window filtering,
editorial judgment, correction handling and factual checks remain in place.

AI News4 metadata replay: all 20 saved articles precede feed creation
(2026-10-21 07:52:38.665Z) and are excluded before inference. The earlier live
snapshot had 106 calls and no in-window articles. This replay establishes admission
behavior, not a new real-model publication or measured provider savings.
