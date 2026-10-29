# Clock-aligned V3: nonempty staging trial

October 29, 2026. Runtime `87cb674`, staging version `9fafd946-697d-44f1-b9c2-624e00d386bd`. No runtime, prompt, model-routing or deployment changes were made for this trial.

## Outcome

The automatic workflow acquired three genuinely new Arabic AjaNews posts, selected two developments, generated and verified an English briefing, held its result until the intended delivery, and persisted one reader-accessible edition at **16:00:50.463 Beirut**, **50.463 seconds after its 16:00 schedule**. Two paid calls cost **$0.005714**, with no repair, duplicate operation or outstanding charge. A separate assistant review found no material error against the sources. This is evidence for one small successful nonempty window, not a general reliability or throughput guarantee.

The private QA feed is paused, and its append-only admission-close marker is installed. No reader notification or production mutation occurred. All 38 historical authorization records and the shared tracking configuration match the pretrial snapshot. No historical hold, receipt, cap or grant was changed.

## Exact timing and calls

Times below are Beirut local time (UTC+02:00).

| Event | Time |
|---|---|
| QA feed created; first reporting interval begins | 15:39:21.317 |
| Source publications admitted | 15:45:04, 15:51:34, 15:52:04 |
| Fixed reporting cutoff | 15:55:00 |
| Automatic request created | 15:56:00.538 |
| Verified held result first observed | 15:56:49.017 |
| Intended delivery / reader label | 16:00:00 |
| Durable publication and edition creation | 16:00:50.463 |

Total cutoff-to-publication time was **350.463 seconds**. The first shortened interval was 15:39:21.317–15:55, consistent with the ten-minute creation grace. Initial collection backpressure cleared without operator intervention. Three older posts were acquired but excluded; three fresh posts entered the frozen input. Post-cutoff arrivals did not expand it.

| Stage | Model | Input tokens | Output tokens | Provider-reported USD | Engine stage elapsed |
|---|---|---:|---:|---:|---:|
| Editor | `openai/gpt-4.1` | 1,925 | 166 | 0.005178 | 7.279 s |
| Verifier | `openai/gpt-4.1-mini` | 1,220 | 30 | 0.000536 | 6.769 s |
| Total | | 3,145 | 196 | **0.005714** | **14.048 s** |

The durable operation transport latencies were 3.282 and 2.279 seconds; engine-stage elapsed times also include accounting/persistence work. Neither measure alone is deadline-to-publication latency. Conservative reservations totaled $0.058728; both were fully reported/settled, so outstanding exposure is $0. The new user approval allowed four calls/$0.20 for two hours, one first window, at most one repair. A tested exact-feed-only SQLite admission trigger enforced these limits and prevented new paid operations outside the first-window execution period. No untracked direct inference requests were made. Incremental Cloudflare infrastructure charges are not separately available; the measured cost here is inference.

## Exact published briefing

**Tel Aviv court approves government decision to extend Al Jazeera office closure in Israel for 90 more days**

[Source: AjaNews, 15:51:34](https://t.me/AjaNews/519150)

**Israeli election committee: Likud gains one seat to 27, Shas reduced to 6 seats**

[Source: AjaNews, 15:45:04](https://t.me/AjaNews/519149)

Both bodies are intentionally empty; these complete headlines total 32 words. The existing verifier accepted both with `ok`, and no repair was invoked. The third source, [a Dura incursion and mural destruction report](https://t.me/AjaNews/519151), was explicitly omitted as a routine security incident.

## Evidence review and persistence

The review was a separate assistant assessment using the original Arabic posts, not an additional paid evaluator or independent human review. It found:

- The court headline preserves approval of the government closure extension and the 90-day duration. Omitting the accompanying ban on work is acceptable compression, rather than an unsupported contrary statement.
- The election headline preserves the election committee attribution, one-seat gain, Likud's 27 and Shas's six. The source states the gain was at Shas's expense.
- The two developments remain separate. Neither invented dates, consequences, routine sourcing commentary nor absence-of-information filler was added.
- The Dura omission is defensible for this broad World News profile; it does not establish good recall across other profiles or larger batches.

Mechanical checks confirmed all three frozen article texts match their original public-channel snapshot, all timestamps fall inside the fixed interval, the saved pre-delivery result is unchanged after publication, and persisted story text/evidence matches the reader API. There is one edition, one delivery-job record, two semantic operations and successful fidelity/publication records. Owner read-back returned 200; anonymous access returned 404. The reader receives `scheduledFor=14:00Z` and actual `publishedAt=14:00:50.463Z` separately. No notification delivery was tested or claimed.

## Observer interruption and limits

The local observer lost connectivity after its 15:59:08 read and resumed at 17:28. Publication time is supported by durable request, edition and publication-status records; it was not observed in real time. The server-side budget guard remained active throughout. After access recovered, admission was closed and only this QA feed was paused.

Because local cleanup could not run immediately, three later QA windows were materialized automatically: one quiet, one failed and one pending with `TEMPORARY_UNAVAILABLE` at audit. They are not additional evaluation trials. There were still exactly two paid operations and one edition across the entire QA feed. The guard barred paid operations after 16:25. These scheduling attempts and the delayed cleanup are retained as trial-control limitations, not hidden or counted as successful publications. Historical records and pending jobs were not reset or deleted.

The run proves a source-grounded nonempty automatic publication close to schedule for three short posts. It does not establish repeated-window reliability, saturated-feed latency, long-article behavior, repair recovery, independent confirmation of Telegram claims, or notification delivery. No further paid trial was initiated.

Local raw evidence: `.local-reports/clock-timing-trial-2/` contains the approval, source snapshots, frozen inputs, exact provider requests/responses, reservations/settlements, progress log, edition/read-back, source review, all-window audit and briefings. Sensitive session material remains local and uncommitted. Sanitized metrics: `benchmarks/results/v3-selective-database-reads/clock-aligned-nonempty-trial.json`.

## Read-only staging follow-up, 17:57–17:59 Beirut

No model calls, deployments, feed edits or financial changes were initiated. The homepage returned 200 (one observed request, 1.825 seconds). Three existing public feed APIs returned 200 and reported `published`:

| Feed | Latest reporting cutoff (UTC) | Actual publication (UTC) | Delay from cutoff |
|---|---|---|---:|
| AI NEWS | 15:15:45.676 | 15:16:22.102 | 36.426 s |
| Lebanon news | 15:44:53.352 | 15:45:33.850 | 40.498 s |
| Lebanon news2 | 15:44:53.352 | 15:45:41.184 | 47.832 s |

These feeds retain their legacy schedules; the delays above are measured from their reporting cutoff, not new-policy intended delivery. None of the nine active feeds has the new clock-policy marker, as expected from new-feed-only enrollment and paused QA fixtures. Reader API responses contained 57, 92 and 100 editions respectively, with no duplicate `(windowStart, windowEnd, cadence)` in those returned sets. This is not an all-history duplicate audit or p50/p95 latency benchmark.

An indexed, scalar-only unresolved-request read found 48 pending records: 28 awaiting intake reassessment on the Bitcoin feed, and 20 with uncertain semantic outcomes across several feeds. Another 105 failed and 762 done/deferred records remain recoverable history, not 915 simultaneously executing jobs. The pending uncertainty records were not retried or financially altered. Their existence does not imply the currently publishing Lebanon/AI feeds are stalled. Intake reassessment on the Bitcoin feed is the clearest separate backlog to investigate next; it is not established as a new-clock regression. Evidence remains local in `.local-reports/staging-post-trial-health/`.
