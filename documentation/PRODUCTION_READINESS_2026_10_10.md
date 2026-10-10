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
- Worker and connector typechecks passed; isolated QA dry-run built.
- QA D1 export restored: 62,727,365 SQL bytes, 104 tables, integrity `ok`, zero
  foreign-key violations. The local encrypted backup and key are in ignored
  `.review-tmp/readiness-backup/`; move the key to separate protected storage for a
  retained operational backup. This drill does not prove remote D1 or R2 recovery.
- One public RSS R2 snapshot (19,646 bytes) was downloaded, restored under a new
  temporary QA object key and downloaded again. Bytes and SHA-256 matched; the
  temporary object was deleted. This is a bounded object recovery drill, not a
  complete archive restoration.

## Release gates

1. Owner verifies signup and password-reset links on the live QA frontend, then
   creates a feed, approves sources and views a grounded published edition.
2. Complete a clean full Worker suite on the final code. Record any reproducible
   failure; a selected-file pass cannot substitute for a full-suite claim.
3. Observe several enabled feeds across a sustained unattended period. Establish
   acceptable freshness, backlog age, latency, receipt growth and actual provider
   spend. A short manual collection check is only a smoke test.
4. Finish controlled Telegram edit/delete verification and remaining real provider
   cases. The previously documented Google News resolution failures remain relevant.
5. Drill remote D1/R2 restoration and Worker/VPS rollback with compatible schemas.
   Keep the last known-good Worker version, immutable assets prefix, helper backup
   and database recovery point together. Do not reverse an applied migration merely
   because a Worker is rolled back.
6. Confirm production domain ownership, account and resource bindings. Current QA
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
