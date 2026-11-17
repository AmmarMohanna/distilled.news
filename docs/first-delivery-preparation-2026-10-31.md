# First delivery: minimum preparation on the recurring schedule

New live feeds use `clock-aligned-delivery-v2`: select the earliest delivery on the chosen recurring schedule that is at least fifteen minutes after creation, inclusive. There is no separate startup edition. Subdaily delivery stays on the existing local clock grid; daily delivery keeps the selected local time and timezone/DST disambiguation.

Examples in the feed's local timezone:

| Schedule | Created | First intended delivery |
| --- | --- | --- |
| Every 30 minutes | 03:08 | 03:30 |
| Every 30 minutes | 03:15 exactly | 03:30 |
| Every 30 minutes | 03:15:00.001 | 04:00 |
| Hourly | 03:11 | 04:00 |
| Daily 08:00 | 07:40 | 08:00 today |
| Daily 08:00 | 07:50 | 08:00 tomorrow |
| Daily 08:00 | 08:11 | 08:00 tomorrow |

The allowance is measured forward from creation, not from the previous interval's opening. Daily creation too close to delivery may wait slightly over 24 hours; DST still follows calendar-local time.

## Evidence and publication

The first evidence window starts at the exact persisted creation instant, including milliseconds. Its cutoff remains five minutes before intended delivery, leaving at least ten minutes between creation and cutoff. Later windows start at the previous cutoff, without gaps or overlap. Intended `scheduledFor`, evidence boundaries and actual publication time remain distinct. Existing V3 verification, early-cutoff preparation, delayed publication and verified-result reuse are preserved.

## Persistence and compatibility

Migration `0082_first_delivery_preparation.sql` adds nullable `briefing_schedule_policy`, constrained to the new policy with a clock origin. New-feed creation assigns it server-side. It maps through `BriefingConfig.briefingSchedulePolicy` and the product enrollment bridge into `LiveSchedule.clockPolicy`; canonical new windows carry the version marker.

No backfill or automatic policy migration occurs. Absent markers retain existing calendar, creation-relative and clock-v1 behavior, including historical window identities. Ordinary edits and source re-enrollment cannot upgrade a retained admission policy. Pending windows retain their exact JSON and evidence ownership; cadence edits continue after recorded coverage. Repository updates retain the stored admission policy even when callers omit metadata.

This migration must be applied to the exact deployment database before deploying code that uses it. It has only been tested against local fixtures here; no remote migration, deployment, paid provider operation or reader notification is authorized or performed by this change. Frontend source and design are unchanged.

## Validation

- Initial algorithm regressions failed before implementation; the new-policy and retained scheduling tests then passed 86/86.
- Six complete focused files passed 204 tests: API, product enrollment, new preparation rules, retained schedules, V3 publication/recovery and migrations. The additional real D1 repository INSERT/readback/immutable-save test passed separately (205 distinct focused cases overall).
- One early run saw an unchanged product test's local D1 socket close; the complete serial rerun passed. No timeouts or assertions were relaxed. A later new-test timestamp assertion was corrected to inspect `created_at` in D1 rather than expecting a field the public DTO intentionally omits.
- Workspace and E2E TypeScript checks passed. Workspace build passed, including Worker `--dry-run` only.
- Existing script/evaluation checks passed 103 tests, Python helper checks passed 32, and observability/Wrangler schema validators passed.
- Fresh independent code review found no actionable defects in policy propagation, migration, window validation, chronological recovery or legacy preservation.

The full workspace, browser matrix and AgentOps fixture jobs are verified by the unchanged GitHub Actions workflow on the pushed commit. Local focused results are not represented as a second complete local workspace run.
- Local k6 smoke passed (exit 0); fault-proof produced its required threshold failure (exit 99), accepted by the harness.
