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

Apply migration 0081 before deploying the backend. Deploy the matching frontend for intended-time labels. At completion of the local implementation, no live migration, feed mutation, paid experiment or deployment had been performed. The subsequently authorized staging activation is recorded below. The unrelated favicon edit was not included.

## Validation

All inference transports in these tests are mocked; actual paid inference cost was $0. No claim of improved live latency is made.

- Full app and product-enrollment suite: 70 passed, including clock creation, unchanged edits and preservation of pending coverage. After final daily-choice and compatibility assertions, the complete API/schedule run passed 108 tests (60 API and 48 schedule). Both old clock and precise creation-relative schedules are checked.
- Scheduling/publication/recovery suite: 104 passed before the final anchor-rejection case was added. This includes all intervals, exact grace threshold, early cutoff, complete coverage, DST/midnight, canonical validation, consecutive outage recovery, paid-result reuse, old scheduling and collection readiness.
- The timed V3 regression was then expanded and passed again: verifies at 12:25, remains unpublished and undispatched at 12:26, is automatically dispatched at 12:30, and a simulated late delivery persists at 12:32 with label 12:30. No repeated model calls, no early delivery job, and post-cutoff evidence remains eligible for the next window. Health reads correctly report NOT_DUE before the cutoff and PUBLISHED afterward; audit lookup uses the same canonical window identity as execution. Two additional legacy health-read regressions passed.
- Product-feed and source integration: 11 passed, preserving full source text, provenance, stored citations and replay behavior.
- Frontend helper/editor suites: 19 passed; intended-time labels do not change actual publication timestamps, new daily choices use half-hour increments, and legacy daily time inputs retain minute precision.
- Worker and frontend TypeScript checks passed. Frontend production build and Worker deployment dry run passed.

Logs are retained in `.local-reports/clock-aligned-schedules/`. This is local integration evidence. A fresh new-feed staging observation remains necessary after deployment to measure actual deadline-to-publication timing under the new policy.

## Staging activation — October 29, 2026

After authorization to continue, runtime commit `87cb674` and its matching frontend were deployed to **https://distilled-news-staging.distillednews-platform.workers.dev/**. Active version: `9fafd946-697d-44f1-b9c2-624e00d386bd`, at 100% traffic. Production was not changed.

Only migration **0081** was applied and recorded in `d1_migrations`. The migration listing also included older files 0071–0080, while earlier indexes were already present. An isolated directory containing only the exact committed 0081 file prevented replaying those older migrations; their schema and ledger entries were left alone. Original schedule origins and null clock-policy markers were checked for all **33 existing feeds**. Bindings, secrets configuration, compatibility settings and queue consumers were preserved.

The first deployment failed at Cloudflare's asset-upload-session API with error `10013`, before Worker activation. One identical retry succeeded; no runtime workaround or alternate asset route was used. Earlier CLI authorization error `7403` cleared after the existing Wrangler session refreshed. Neither failure required a code change.

Live static checks returned 200 and byte-matched the built HTML, JavaScript, CSS, service worker and logo. The deployed favicon was explicitly preserved rather than taking the unrelated local edit. Both public Lebanon feed APIs returned 200, and the private clean-feed API remained inaccessible anonymously (404).

### Zero-inference live save/read-back test

A fresh isolated QA identity was seeded directly, avoiding registration/verification emails. It used the real login and feed save/read/delete handlers. A static app icon was prefilled in its illustration cache to prevent an image model request. One private, source-free feed was created at **2026-10-29T09:44:18.925Z**, then saved/read back across all six intervals. Its original creation marker remained exact through these edits.

| Interval | Intended delivery returned by staging (UTC) |
|---|---|
| 30 minutes | October 29, 10:30 |
| 60 minutes | October 29, 11:00 |
| 120 minutes | October 29, 12:00 |
| 360 minutes | October 29, 18:00 |
| 720 minutes | October 30, 00:00 |
| Daily, selected 12:30 | October 30, 12:30 |

An independent clock calculation matched every response. The owned-feed list read back the saved schedule, a daily `12:15` edit returned 400, and anonymous access remained 404. There were **zero sources, zero sketch jobs and zero model spending reservations**. Paid inference cost: **$0**. The QA account, feed and static icon were removed; no existing feed was edited, and no publication or notification was triggered by this test.

Sanitized results: `benchmarks/results/v3-selective-database-reads/clock-aligned-deployment.json`. Exact deployment/API traces and cleanup proofs: `.local-reports/clock-aligned-live/`.

**Limit:** this verifies real deployed creation, edits, persistence, API privacy and frontend assets. It does not measure a newly clock-aligned feed generating and publishing a real nonempty briefing at its first deadline. Timed generation, held verified results, late labels and retry reuse are proven by local integration tests; actual new-policy deadline-to-publication latency still requires a natural feed window or a separately authorized paid trial. No unused earlier paid authorization was reused.

## Authorized automatic timing trial — October 29, 2026

One new private QA feed used the deployed runtime `87cb674`, the existing approved `https://t.me/lebanonnews2` source, and the normal automatic collector/scheduler. No operator triggered generation. Authorization allowed at most four GPT-4.1/mini calls and $0.20 conservative exposure for this single window, expiring at 16:15:52 Beirut. A feed-scoped atomic reservation trigger enforced the bound without changing shared accounting mode or historical grants. Fourteen synthetic admission checks passed before activation. Unknown charges would block further QA admission. An append-only close record now permanently closes this trial's new-call admission; the feed is paused and retained for audit.

| Observation | Beirut time, October 29 |
|---|---|
| Feed created; reporting begins | 14:30:43.377 |
| Fixed evidence cutoff | 14:55:00 |
| Automatic request and saved empty result | 14:57:07.107 |
| Intended delivery | 15:00:00 |
| Automatic completion | 15:00:48.103 |

The request reached `DONE / QUIET / NO_SELECTED_DEVELOPMENTS`, with complete collection coverage. Eighteen acquired records all predated creation; the newest publication was 14:21:11. A separate read-only public-channel check shortly after cutoff also found no newer post. The frozen V3 input contained zero articles, so the engine correctly made **zero model calls**, incurred **$0 inference cost / $0 outstanding model reservations**, and created **no edition or delivery job**. It saved the empty result and waited with `AWAITING_SCHEDULED_DELIVERY` before completing 48.103 seconds after the intended time. One request existed, with no duplicate downstream work.

This is live evidence of automatic window creation, freshness exclusion, durable quiet results and scheduled completion. **It does not establish nonempty generation/publication latency, model quality, or a successful paid inference path under the trial guard.** No new news arrived, and the unused allowance was not used to replay old articles or start a second window. No publication timestamp or reader-text review exists for this quiet result.

Observer recovery: Cloudflare database access briefly returned `7403`; refreshing the existing CLI session restored observation. The initial final reader check returned 404 because the directly seeded QA account lacked the username alias normally created at registration. Adding only that QA fixture alias restored owner read-back (200, empty editions); anonymous access remained 404. These were observer/fixture issues and required no product runtime change. The scope was already closed and the feed paused before the reader-check correction.

The 38 historical grant records and shared tracking configuration byte-matched the pretrial snapshot. No historical financial records were changed, no holds released, and no account cap changed. The QA-only guard and append-only trial records remain for audit. No reader notifications were sent; production was untouched. Exact local authorization, input/result documents, collector observations, accounting snapshots and HTTP checks are retained in `.local-reports/clock-timing-trial/`. Sanitized result: `benchmarks/results/v3-selective-database-reads/clock-aligned-timing-trial.json`.

Next useful validation is a fresh, naturally nonempty window under a separately applicable authorization; this trial did not authorize another window.

### Subsequent nonempty trial

Under a new explicit four-call/$0.20 authorization, a separate private QA feed automatically published two source-grounded items at **16:00:50.463 Beirut**, for its **16:00** intended delivery. Three fresh AjaNews posts were processed; two settled model calls cost **$0.005714**, with no repair. Sources and reader persistence were checked. See [the complete nonempty-trial report](clock-aligned-nonempty-trial.md), including the local observer outage, delayed QA cleanup and limits of this one-window result. No runtime changes or further deployment were needed.
