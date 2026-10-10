# Production readiness checks — 2026-10-10

Live email-link testing is deferred to the owner. Do not bypass verification or
declare the complete live user journey verified before that test.

## Implemented in this change

- Provider jobs use a five-minute renewable lease. Renewal and final completion
  are fenced by job version and an unexpired lease. A worker that loses its lease
  cannot acknowledge the job. Existing durable paid-operation replay remains in
  place; an uncertain paid submission still requires repair rather than resubmission.
- Maintenance drains up to four jobs from each scheduler, interleaved, instead of
  one. The default 90-second budget is checked between jobs; it does not interrupt
  an in-flight request. Configuration accepts 1–20 jobs and 1–600 seconds.
- Owner source-health responses expose structured alerts for blocked jobs, active
  credential/budget failures, uncertain paid submissions and a backlog more than
  30 minutes overdue. Historical failure counts remain separate. These are API
  diagnostics, not an outbound notification delivery service.
- QA measurements include pending/due jobs, oldest due time, per-feed latest
  accepted batches, receipts, reported provider costs and database growth.
  Reservation ceilings are not actual invoices; missing cost telemetry remains unknown.
- `scripts/verify-d1-backup.mjs` encrypts a SQL export, decrypts it and restores it
  into local SQLite. It checks content equality, database integrity and foreign
  keys, and emits counts for comparison. No SQL is executed on a live database.

## Verified locally

- Connector regression suite: 197 tests passed, including lease renewal, lease
  loss, backlog draining and durable paid replay.
- Affected Worker suite: 77 tests passed across app, connector runtime, health and
  retention. This includes signup/verification/password reset through API routes,
  source approval/authorization, grounded publication and retention recovery.
- Final source-health query integration: 23 runtime/health tests passed.
- Full serial Worker suite: **894 passed, 10 skipped, zero failures** across
  141 files (139 passed, two skipped). The final health tests are included.
- Worker and connector typechecks passed; isolated QA dry-run built.
- QA D1 export restored: 62,727,365 SQL bytes, 104 tables, integrity `ok`, zero
  foreign-key violations. The local encrypted backup and key are in ignored
  `.review-tmp/readiness-backup/`; move the key to separate protected storage for a
  retained operational backup. This drill does not prove remote D1 recovery.
- Remote D1 restoration was attempted against a newly created, unbound scratch
  database. The SQL upload stalled; a bounded upload retry failed before SQL
  ingestion was acknowledged. Remote restore therefore remains unverified. The
  scratch database `distilled-qa-recovery-20261010` was deleted afterwards; the
  running QA database was not replaced or restored.
- One public RSS R2 snapshot (19,646 bytes) was downloaded, restored under a new
  temporary QA object key and downloaded again. Bytes and SHA-256 matched; the
  temporary object was deleted. This is a bounded object recovery drill, not a
  complete archive restoration.
- Worker rollback: deployed previous QA version
  `eb8994d8-b6b6-43f6-816b-a22f7042ad02`, verified frontend and session API HTTP
  200, then restored final version `09fb81f7-42cb-474b-9b2d-a681a69d7508` and
  repeated both checks successfully. Cron remains disabled.
- VPS helper rollback: restored the saved prior Python helper, checked an offline
  RSS fixture through the authenticated service, restored current helper hash
  `4e58367968611eb0689c978235c766408d4b33db53e727f0171fd595ed022821`, and repeated
  the fixture successfully. The service remained active.

## Bounded live collection study

Eight maintenance ticks ran over 22.35 minutes with BBC RSS, JPL RSS and Google
News on separate QA feeds. Mean maintenance time was 113.76 seconds; maximum was
186.70 seconds. The 90-second slice is a soft boundary between complete jobs,
not an upper bound for the whole maintenance request.

BBC completed polls successfully. Google collected listings, with 129 additional
intake receipts across the study; a long-running Google job renewed its lease.
All 74 observations in the publisher-link audit still used Google listing URLs,
so this study does **not** verify publisher-link resolution. JPL RSS returned a
forbidden response (`AUTH_REQUIRED` coverage), and its new jobs were blocked.

D1 grew by 3,387,392 bytes from the baseline. This includes changed observations
and retained batches; do not extrapolate it as a steady rate without a longer
study and a retention plan that preserves published provenance. Paid reservations
did not increase, and all five paid-provider budgets remained zero.

The 11 old pending provider jobs were cancelled because their sources were not
enabled. Three new Google jobs completed; two Google continuations were still
pending when the study stopped. After pausing sources, a final maintenance tick
cancelled those continuations. The final audit has zero enabled sources, zero
enabled scopes and zero pending scheduler jobs. Historical blocked jobs remain
available for investigation; they were not silently reset or resubmitted.

## Release gates

1. Owner verifies signup and password-reset links on the live QA frontend, then
   creates a feed, approves sources and views a grounded published edition.
2. Observe several enabled feeds across a sustained unattended period. Establish
   acceptable freshness, backlog age, latency, receipt growth and actual provider
   spend. A short manual collection check is only a smoke test.
3. Finish controlled Telegram edit/delete verification and remaining real provider
   cases, including Google News publisher resolution and the blocked JPL RSS feed.
4. Complete remote D1 and full R2 archive restoration with compatible schemas.
   Keep the last known-good Worker version, immutable assets prefix, helper backup
   and database recovery point together. Do not reverse an applied migration merely
   because a Worker is rolled back.
5. Confirm production domain ownership, account and resource bindings. Current QA
   account lists only QA and staging D1 databases; the checked-in default Worker
   still names legacy `lownoise-news` resources. Do not deploy that configuration
   as a shortcut to promote QA to `distilled.news`.

## Gradual rollout procedure after gates pass

Export D1 and record a recovery point before migrations. Verify the intended
production D1/R2/queue/VPS bindings and mail secrets, then dry-run the production
configuration. Deploy with sources paused, cron disabled and paid budgets zero.
Check signup/reset and publication on the canonical domain. Admit two free sources
on separate feeds, set four jobs per scheduler per tick and a 90-second slice, then
enable five-minute polling. Expand only after freshness and backlog remain stable.
Admit paid sources individually with bounded operation ceilings and conservative
aggregate provider budgets below the authorized per-source cap; reconcile actual
provider usage before increasing them. Preserve existing reservations when changing
budgets. If errors/backlog/spend exceed agreed bounds, pause affected sources and
polling first, restore the known-good Worker/helper if needed, then verify health.
