# Creation-relative subdaily briefing schedules

New product feeds configured for 30, 60, 120, 360 or 720 minutes persist an
optional schedule origin at creation. Their first reporting interval starts at
that exact instant and closes one interval later. For example, 19:05:40.123 at
30 minutes closes at 19:35:40.123, then 20:05:40.123 and 20:35:40.123.

Subdaily intervals measure elapsed time; midnight and DST do not reset their
phase. Daily feeds retain local delivery anchors and calendar/DST behavior.
The deadline closes the reporting interval; collection, Cron cadence, model
processing and validation can still delay actual publication.

## Compatibility and edits

Migration `0069_creation_relative_schedules.sql` adds one nullable column,
`briefings.briefing_schedule_origin_at`. It does not backfill existing feeds.
Feeds without an origin keep `local-calendar-anchors-v1`; opted-in subdaily
windows carry `creation-relative-v1` and the origin. Both contracts remain
valid for publication and recovery. Existing IDs still hash feed/start/end;
no historical window, job, receipt, grant or reservation is rewritten.

Product synchronization includes the origin only when present, preserving the
exact old configuration JSON for legacy feeds rather than forcing re-enrollment.
The application uses the same timestamp for the origin and the database insert.
Clients cannot select or overwrite the origin through the feed-edit input.

Title, source and timezone edits retain the origin. A timezone edit changes the
local display, not elapsed-time boundaries. On a subdaily interval change, the
new interval starts at the previous schedule's last recorded closed boundary
(or its origin if no close was recorded). Existing pending windows retain
original metadata and recovery identities. A shorter interval may already have
closes due at edit time; the dispatcher creates consecutive requests one per
tick, also supporting catch-up after an outage. Repeated ticks reuse requests.
Existing backed-off/uncertain-window bypass and chronological delivery remain.
Daily transitions continue using the existing full local-calendar-window rules;
they do not turn daily delivery into a rolling elapsed 24-hour timer.

## Scope and validation

Runtime changes are confined to scheduling, feed configuration persistence and
synchronization, and typed window validation. V3 models, prompts, selection,
verification, source collection mechanisms and queues are unchanged.

Focused tests cover creation-relative deadlines and millisecond precision,
all subdaily intervals, midnight/DST, unchanged legacy and daily windows,
API edits, D1 persistence and synchronization, automatic V3 queue dispatch,
publication/read-back with provider doubles, settled-call crash recovery,
old pending-window identity, duplicate ticks and missing-close catch-up.

No paid inference, remote migration or deployment was performed for this change.
Migration 0069 must be applied before deploying this code. Existing staging
continues running the prior commit until deployment is separately requested.

### Changed files

- `apps/worker/src/v1-intelligence/schedule.ts` and `scoring.ts`: opt-in origin,
  elapsed boundaries and canonical window validation.
- `apps/worker/src/app.ts`, `repository.ts`, `v1-intelligence/product.ts` and
  `packages/core/src/types.ts`: creation-time persistence, reads, synchronization
  and schedule edits.
- `apps/worker/src/v1-intelligence/runtime.ts`: recognize and dispatch consecutive
  relative closes using existing durable requests and queue coordination.
- `apps/worker/migrations/0069_creation_relative_schedules.sql`: nullable opt-in.
- Focused regressions in `app.test.ts`, `v1-intelligence/schedule.test.ts`,
  `product.test.ts` and `v3-window.test.ts`.

During implementation, the interval-edit regression demonstrated why advancing
straight to the last clock-computed close could skip unrecorded coverage. The
final edit path uses the last recorded close instead; no-recorded-close cases
retain the original origin. Initial and final run logs are retained locally in
`.local-reports/creation-relative-schedules/`.

Final validation: 160 distinct focused tests passed across ten Worker files.
The final four-file rerun passed 112/112 (API, product persistence, schedule and
V3 window tests); the unchanged window-delivery suite passed 10/10, and the
additional runtime/scheduled-writer/migration/product admission checks passed
38/38. Worker and core TypeScript checks passed. All model responses in these
checks are local test doubles; these results do not measure real model latency,
actual publication delay or factual quality.
