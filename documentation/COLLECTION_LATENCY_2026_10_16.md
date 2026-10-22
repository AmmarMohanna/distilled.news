# Collection latency recovery — 16 October 2026

Branch: `backend-sources-collection-recovery`. Target: sources QA only.

The first QA live feed exposed an admission convoy. Strict FIFO included messages
sleeping between queue deliveries, so a free turn could remain idle for an older
message. Busy deliveries retried after 30 seconds and eventually fell back to
120-second transport expiry. Article acquisition also held the Feed turn during
network I/O. These compounded into minute-scale waits per item.

Changes:

- Prioritize the oldest recently ready delivery. Keep original waiter age for
  its return, but do not reserve idle capacity for a sleeping delivery. Readiness
  is a one-second scheduling grace, independent of the five-minute waiter TTL.
- Capacity waits rotate only their matching connector dispatch token and resend
  the same work identity with a one-second delay. Stale deliveries cannot release
  a replacement. Send failures retain normal durable recovery. No canonical
  processing attempt, paid operation identity or source checkpoint is reset.
- Collection polls with INTAKE_BUSY also resume directly at their stored retry
  time. Previously the five-second retry was discovered only by the next
  minute-wide feed scan. The continuation claims a new dispatch generation and
  preserves the saved fetch and offset; actual rate-limit/failure retries are
  not accelerated by this path.
- Acquisition uses short admission phases for claiming and evidence promotion.
  Downloads and durable fetched-result storage use the existing observation
  lease and scope CAS outside the Feed turn. Evidence promotion still uses the
  Feed fence, acquisition token, ordering checks and canonical transactions.
- If evidence admission is busy after a result is stored, release only that
  acquisition lease to PENDING. Preserve fetched bytes and the actual provider
  attempt; remove only the current saved-result resume attempt. Repeated waits
  cannot exhaust recovery or trigger another fetch.

No changes to shared contracts, editorial judgments, spending authorization,
provider caps, active source configuration or teammate intelligence runtime.
No schema or frontend change required.

Local checks: admission, transport generation, acquisition and runtime regressions;
evidence ordering/replay/revocation tests, review continuation, integration safety
and 1,000-feed scheduling tests. Worker typecheck and QA dry-run build passed.
Live deployment measurements are recorded below after rollout; local tests alone
do not prove complete briefing publication or 1,000-feed live throughput.

## Initial QA measurement

First deployed version `f90659ea-63f4-40b0-8f70-605ffa2d8902` on sources QA.
Bindings remained unchanged and public feed API returned 200. Between 11:41:53
and 11:51:41 UTC reviews advanced from 7 to 24, while acquisition remained at 34
completed of 60. This is progress, not an adequate latency result; it exposed the
remaining minute-wide collection handoff retry described above. No provider
jobs or financial authorizations were reset.

Second rollout: commit `fbd733c`, active QA version
`108f3452-b2ae-4b5e-a28e-0b39273d571a` at 100% traffic, verified 11:54:30 UTC.
The public feed API returned 200. At that check acquisition was 34 DONE / 36
PENDING and review was 28 DONE / 6 PENDING. Forty-one fetched acquisition results
were retained. Collection remained INTAKE_BUSY and no edition was published.
Therefore this rollout is **not a verified resolution of end-to-end latency**.
It removes network-held turns and coarse retry delays, but the measured Feed
still has substantial canonical-processing contention. Further work must profile
canonical transaction/review duration and reduce per-feed transport contention;
do not advertise a latency target from these measurements.

Validation: 51 initial targeted regressions and 49 safety/scale regressions passed;
the final acquisition file passed 27 tests, final transport-generation file 7,
and scale/transport continuation run 29. Worker typecheck and QA dry-run passed.
Staging was not modified.

## Bounded delivery and fewer D1 round trips

Migration 0060 adds indexed, token-fenced transport slots: one intelligence
delivery and four acquisitions per Feed. Long deliveries renew their slots;
expiry recovers a crashed sender/consumer. Feeds have independent capacity.
Canonical leases, receipt identities, paid operation records and authorization
are unchanged. This is backpressure rather than a spending or polling cap.

When a lane is full, pending-job discovery stops offering more work to that
lane. A declined send releases its own canonical dispatch reservation, avoiding
a phantom two-minute delivery. Matching completion releases its transport slot
before continuing work. Queue sends compute their lease time at actual send,
rather than reusing the time the queue proxy was constructed.

Feed snapshots now read Feed/scopes and validate turn/semantic leases in one
atomic query. Commit still revalidates every epoch and token. Independent
immutable graph lookups share bounded D1 read batches; acquisition claim and
promotion prefetch their independent records. Admission offer/claim uses one
D1 batch. Slow successful Feed transactions report duration and query counts
without logging source content or credentials.

Validation: 84 core/concurrency/evidence regressions passed, plus 27 final scale
and continuation checks (including full-article acquisition through review).
The other runtime/integration safety files passed 13 checks. Worker typecheck
and QA dry-run build passed. Remote QA migration list showed only 0060 pending.
Live measurements for this rollout are added after deployment.

At 12:06:55 UTC version `8d70ca7b-c4ea-4ba1-b320-63bee54da345`
was serving QA. Acquisition advanced from 34 to 39 completed and reviews from
34 to 38 by 12:09:17. A logged review transaction completed in 9,212 ms with
one CAS attempt; this is a transaction duration, not an end-to-end SLA. A live
slot snapshot showed four acquisition deliveries. No cap or payment was reset.

## Final lock-scope refinement

Acquisition claims now use their existing observation lease and source CAS
without taking the Feed turn. Only evidence promotion takes shared Feed
admission. Immutable fetched-result storage no longer increments the canonical
scope epoch: it still validates the current scope epoch, ownership lease and
immutable identity atomically, but does not invalidate an unrelated review just
for journaling downloaded bytes. A new regression checks both epoch preservation
and rejection of a replaced acquisition owner.

Supplied connector payload verification runs before Feed admission with at most
four concurrent R2 reads. The same call-scoped verified metadata cache is consumed
inside acceptance. Already receipted observations are excluded, so replay does
not require deleted historical payloads. Mutable authorization, restrictions,
authority and ordering are still checked inside the normal acceptance path.
No source contract or editorial policy is changed.

## History expansion and acquisition bookkeeping CAS

Live structured timings exposed an older Feed doing 247 preload queries and a
67,964 ms transaction with a CAS retry. Listing retained memberships had eagerly
preloaded every historical article body. That implicit expansion is removed:
review already prefetches support for current Event/Storyline versions, while
publication explicitly prefetches selected/history support. Historical references
remain accessible on demand. A regression with 1,000 retired memberships verifies
the current review does not expand those article bodies. Editorial engine and
selection-support tests preserve exact decisions/support.

Acquisition PENDING/RUNNING bookkeeping now uses an atomic exact-row job CAS,
in addition to current source authorization/epoch checks. Every transaction that
reads an ACQUIRE job supplies its observed serialized row to the atomic batch
guard. Concurrent duplicate claims cannot both win; a replaced owner cannot
persist or promote a result even when no source epoch changed. These operational
updates no longer invalidate unrelated review snapshots. Terminal failures and
canonical evidence changes still advance the epoch, preserving window-coverage
and evidence/configuration invalidation. Direct lower-level writes without a job
guard retain the original scope-epoch behavior.

Regression coverage includes a takeover exactly between lease validation and
result commit, an unrelated Feed snapshot surviving claim/result journaling,
terminal coverage invalidation, simultaneous duplicate claims and all existing
source-revocation/evidence ordering checks. No attempts, blocked jobs, grants,
checkpoints or provider reservations are reset for rollout.

## Final QA verification

Code commit `823cbb6`; QA version
`4736dd1e-43b2-4dd3-984c-966691a643ae` verified at 100% traffic.
Migration 0060 was applied before rollout. Compared to the saved QA settings,
no secrets or runtime bindings changed (the already deployed frontend prefix
was preserved). Staging was not changed.

At 12:21:05 UTC the public feed API returned 200 and reported the closed window
at **66/81 acquisitions completed, 44/66 reviews completed, 37 pending, no failed
acquisitions/reviews**. Live occupancy was four acquisition slots and one
intelligence slot, as intended. Earlier in this work acquisition was stuck at
34 and review at 40 while downloads/bookkeeping continued to invalidate reviews.

Final-version logs included a 5,590 ms review transaction in one CAS attempt
and a 20,712 ms transaction with two attempts. This confirms progress and reduced
read/retry overhead, not a universal speed guarantee. Some canonical contention
remains, external provider rate limits still apply, and the initial backlog has
not completely drained. No edition had published at this check; complete live
collection-to-publication latency and sustained 1,000-feed operation remain
unverified. The full Worker suite was not run for this request.

Final additional checks: 83 intake/runtime/scale regressions passed, the final
31 acquisition regressions passed, 66 evidence/engine/turn regressions passed,
and 14 history-prefetch/editorial/selection tests passed. These overlap earlier
test runs and are not an additive unique-test count. Final Worker typecheck,
QA dry-run and diff checks passed. Runtime timing diagnostics contain only
identities, counts and timings, not source text or credentials.
