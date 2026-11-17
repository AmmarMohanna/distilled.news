# Scheduled V3 publication follow-up

## Evidence and scope

The retained Football QA traces distinguish completed model work from delivery:

- The 23:00 window had model results before 23:00, then a busy feed turn, a later pending-intake deferral, and publication at 23:05:12.
- The 23:30 window hit busy feed turns twice and published at 23:31:02. Delivery retries made no additional model calls.
- These observations support three specific corrections. They do not establish that every delay was caused by the two-minute transport lease.

Changes are local on the existing activation branch, based on `390b3e1`. Existing staging deployments and the separately maintained source QA deployment are unchanged. No paid inference was initiated.

## Changes

1. After a fenced preparation-delivery completion releases its execution slot, a retained V3 request waiting for scheduled delivery sends a delayed wake to the existing acquisition relay queue. It does not reserve an intelligence slot while sleeping or delay/coalesce unrelated relay traffic. The persisted feed due time and unchanged request `nextAttemptAt` retain Cron recovery. Duplicate or lost wakes remain subject to existing relay admission, canonical window identity and publication idempotency. A wake within fifteen minutes of its deadline is bounded; a completion just after its deadline wakes immediately. Cloudflare Queue delivery is approximate, not an exact timer.
2. Only a scheduled, already verified V3 result at/after its deadline can defer unfinished acquisition. The readiness hint requires the current feed revision, matching immutable input fingerprint, explicit V3 engine and a published result. Final publication still rechecks live source ownership, active revisions, settled paid operations and the validated result projection. Unfinished reassessment is not exempted. Unstarted, rejected, manual and V2 work retains existing readiness behavior. Deferred acquisition remains pending/running and is recorded as `ACQUISITION_DEFERRED_AFTER_VERIFICATION`, with `deferredJobs` and incomplete coverage. Late evidence remains eligible through the existing later-window path.
3. Under existing isolated publication preparation, the final successful publication commit can precede recent ready waiters. It never preempts a held lease. Ready work aged ten seconds regains precedence; preparation and inference retain normal ordering. Existing lease renewal, CAS, fencing and admission checks are unchanged. The latency diagnostic `publicationCommitPriority` distinguishes this path. Deployments without isolated publication preparation keep their existing outer ownership boundary.

## Validation

Regression evidence is retained locally in `.local-reports/scheduling-*.log`. Tests cover deadline wake generation, stale completion tokens, queue-send failure with durable recovery, released execution slots, saved-result reuse, incomplete coverage without terminating acquisition, dispatcher admission, invalid readiness hints, source revocation, crash recovery, uncertain paid operations, publication idempotency and bounded lock priority. Six regression files passed 83 tests (including the then-current 45 V3 cases); the 15 locking tests passed separately. The subsequently added readiness-negative case and updated dispatcher case passed in a focused two-test run. The final ten transport tests plus coverage test passed again. This covers 99 distinct tests across seven files. Workspace TypeScript checks passed. The first redirected full-run wrapper returned a PowerShell native-command warning status for Node SQLite ExperimentalWarning, while Vitest reported all six files and 83 tests passing; direct subsequent focused runs exited successfully.

The new wake and pending-acquisition regression tests failed against the prior implementation and passed after the correction. The initial negative test attempted to mutate an immutable saved result and was correctly rejected by the database; the test now inserts separate immutable negative fixtures. No immutability trigger or accounting protection was disabled.

## Operational limits

No live timing improvement is claimed yet. A staging rollout followed by observation of a fresh, nonempty scheduled window is required to measure deadline-to-publication improvement. Model work finishing late, an actively held feed lock, provider recovery or queue backlog can still delay delivery. These changes remove demonstrated avoidable waits without promising instantaneous publication or changing financial limits, model routing, prompts, collection scheduling or frontend behavior.

When integrating with a newer source QA branch, retain its additional collection-backpressure/unavailable-source coverage and V3 readiness changes; do not overwrite those files wholesale with this branch's older versions.
