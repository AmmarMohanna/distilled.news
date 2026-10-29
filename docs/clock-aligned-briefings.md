# Clock-aligned delivery for new feeds

## Behavior

New feeds created through the supported interval selector use local clock boundaries. A feed created within ten minutes of an interval's opening joins its next close; creation later than that skips one close. The ten-minute boundary is inclusive to the millisecond: 03:10:00 qualifies for 03:30, while 03:10:00.001 first delivers at 04:00.

| Interval | Created (local) | First intended delivery |
|---|---|---|
| 30 minutes | 03:08 | 03:30 |
| 30 minutes | 03:11 | 04:00 |
| 30 minutes | 03:38 | 04:00 |
| 60 minutes | 03:08 | 04:00 |
| 60 minutes | 03:11 | 05:00 |
| 120 minutes | 02:08 | 04:00 |
| 360 minutes | 18:08 | 00:00 next day |
| 720 minutes | 12:08 | 00:00 next day |

The same ten-minute grace is used for longer intervals. Daily delivery retains the user's selected local time rather than forcing midnight or changing that selection. Existing timezone/DST calendar behavior is reused. Subdaily delivery anchors are midnight, ensuring minute labels :00/:30; an alternate subdaily :15/:45 anchor is rejected for this policy. New daily selections must also use :00/:30; the editor uses a half-hour step and the backend validates it. Existing daily selections, including other minutes, remain unchanged.

Reporting closes **five minutes before intended delivery**. For a feed created at 03:08:

- First reporting interval: 03:08–03:25; intended delivery 03:30.
- Next interval: 03:25–03:55; intended delivery 04:00.
- Next interval: 03:55–04:25; intended delivery 04:30.

The first window starts at creation, including when a close is skipped. Later windows begin exactly where their predecessor ended. The lead moves the evidence cutoff; it does not discard the final five minutes, which belong to the next reporting interval.

V3 begins its existing editor/verifier workflow once the cutoff is ready. The verified result is saved durably and the request waits with `AWAITING_SCHEDULED_DELIVERY` and `nextAttemptAt` set to the intended time. The scheduler reuses that result at delivery; no additional model stage or recurring call is introduced. Nothing is published early. If collection, verification or recovery takes longer, publication remains subject to the existing safeguards and can be late; the five-minute allowance is not a delivery-time guarantee.

## UI and timestamps

New editions retain `scheduledFor` separately from actual `publishedAt`/`createdAt` and evidence `windowStart`/`windowEnd`. Feed row clocks, day headings and source-detail headings use intended time. Thus an edition intended for 03:30 but persisted at 03:32 is labeled **03:30**. Actual timestamps remain unchanged for unread status, freshness, accounting and audit. Older editions without a durable delivery label retain their existing display fallback; they are not retroactively relabeled.

## Compatibility and deployment

Migration `0081_clock_aligned_delivery.sql` adds the nullable `briefing_schedule_clock_start_at` column and a scoped request lookup index. It does not update any existing feed. The server sets the marker only for a newly created feed with an explicit supported interval. Existing legacy clock schedules and creation-relative schedules retain their original behavior, exact identifiers, pending windows and paid operations.

Ordinary edits preserve the marker. Interval/timezone/daily-anchor edits preserve already-recorded coverage, including pending requests; the new cadence starts at that coverage's end. Missed clock windows are materialized consecutively, one per scheduling tick, without retrieving all historical request payloads. The lookup is covered by the new index, verified through EXPLAIN in the database regression.

Apply migration 0081 before deploying the backend. Deploy the matching frontend for intended-time labels. No live migration, feed mutation, paid experiment or deployment was performed for this implementation. The unrelated favicon edit was not included.

## Validation

All inference transports in these tests are mocked; actual paid inference cost was $0. No claim of improved live latency is made.

- Full app and product-enrollment suite: 70 passed, including clock creation, unchanged edits and preservation of pending coverage. After final daily-choice and compatibility assertions, the complete API/schedule run passed 108 tests (60 API and 48 schedule). Both old clock and precise creation-relative schedules are checked.
- Scheduling/publication/recovery suite: 104 passed before the final anchor-rejection case was added. This includes all intervals, exact grace threshold, early cutoff, complete coverage, DST/midnight, canonical validation, consecutive outage recovery, paid-result reuse, old scheduling and collection readiness.
- The timed V3 regression was then expanded and passed again: verifies at 12:25, remains unpublished and undispatched at 12:26, is automatically dispatched at 12:30, and a simulated late delivery persists at 12:32 with label 12:30. No repeated model calls, no early delivery job, and post-cutoff evidence remains eligible for the next window. Health reads correctly report NOT_DUE before the cutoff and PUBLISHED afterward; audit lookup uses the same canonical window identity as execution. Two additional legacy health-read regressions passed.
- Product-feed and source integration: 11 passed, preserving full source text, provenance, stored citations and replay behavior.
- Frontend helper/editor suites: 19 passed; intended-time labels do not change actual publication timestamps, new daily choices use half-hour increments, and legacy daily time inputs retain minute precision.
- Worker and frontend TypeScript checks passed. Frontend production build and Worker deployment dry run passed.

Logs are retained in `.local-reports/clock-aligned-schedules/`. This is local integration evidence. A fresh new-feed staging observation remains necessary after deployment to measure actual deadline-to-publication timing under the new policy.
