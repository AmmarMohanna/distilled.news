# V3 closed-window collection readiness

## Demonstrated problem

The clean Lebanon feed's 2026-10-28 22:02:09.437–22:32:09.437Z window still waited at 22:58Z for an unbounded Telegram poll scheduled at 22:32:02.550Z. That same poll continued draining pages collected after the cutoff. Intake had no pending pre-cutoff work, but collection readiness kept the window open. See `benchmarks/results/v3-selective-database-reads/collection-window-followup.json` for the retained observation.

## Local correction

Reuse the shared collection gate. For V3 only, an unbounded Telegram poll stops holding a closed window when its saved later page was durably handed off at or after the cutoff, every observation was observed at or after that cutoff and has a matching resolved receipt, and no receipt is unresolved. Missing timestamps, missing receipts, blocked checkpoints and incomplete handoffs remain blocking. Bounded requests and other providers do not gain this exception. Existing X/RSS behavior is retained.

The original poll remains pending and continues normally. No cursor, source evidence, job identity, ordering pointer, financial operation or reporting boundary is modified. Late discoveries retain existing freshness handling. Pre-cutoff acquisition/reassessment still blocks publication.

Before final V3 persistence, recheck collection readiness. Continuing collection is recorded in the request's coverage as `INCOMPLETE`, with `COLLECTION_CONTINUING_AFTER_CUTOFF` and a count. Verified nonempty output can publish; empty output finishes as deferred rather than falsely declaring a quiet window. This uses existing completion and coverage structures, with no new queues, migrations or inference stages.

## Validation and limits

Focused local SQL/integration regressions cover the positive release, V2 retaining its gate, negative handoff cases, exact cutoff, bounded requests, pending intake, deferred empty completion, verified edition persistence, source references and duplicate-delivery replay without additional model calls. Transport responses in publication tests are mocked; they establish integration behavior, not model quality or live latency.

The initial integration fixture inserted a source after enrollment, correctly firing a production lifecycle trigger and disabling its scope. The fixture now inserts the source before enrollment; runtime safety checks were not changed.

Run logs and exit codes are in `.local-reports/v3-window-readiness/`. No paid calls or remote mutations were made for this change. No deployment was performed. A live unattended closed-window observation remains necessary to establish the timing improvement. This is a bounded continuation fix, not a guarantee that every incomplete acquisition can publish on time.

Final validation: 60 tests passed across six files (`connector-publication-coverage`, `v3-source-integration`, `connector-briefing-priority`, `connector-work-admission`, `publication-progress`, `v3-window`); Worker `tsc --noEmit` passed; `git diff --check` passed. The six-file run took 177.76 seconds locally. This test duration is not a live publication-latency measurement.
