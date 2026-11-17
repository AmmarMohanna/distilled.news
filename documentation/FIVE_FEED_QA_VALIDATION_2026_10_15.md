# Five-feed sources QA validation — October 15, 2026

Status: completed October 16 at 01:34 Beirut. Five feeds tested; only Telegram
demonstrated publication end to end. All five temporary feeds are paused.

## Environment and controls

- User explicitly requested deployment to **sources QA**, not staging.
- Tested application commit: `09e511b`, including integration merge `46da843`.
- QA backend deployment version: `db46df0f-a395-413f-895a-efb854397706`.
- Frontend activation created version `21164b47-5242-411a-baeb-0c5b0fb8316d`.
- Immutable frontend prefix: `staging-assets/8d74e45cd53c2a526f2d5234be4c7d154e7c4045/`.
- Applied missing additive migration `0052_model_spending_concurrency_amendments.sql`.
- Verified no unrelated bindings changed or disappeared. Existing secrets and
  source budgets were preserved. Staging was not deployed or reconfigured.
- User explicitly authorized $5 total AI test exposure, then separately approved
  recording seven legacy QA model calls under the QA OpenRouter ledger account.
  Six retained their reported costs; the seventh retains its unknown $0.02 hold.
  No historical operation was reset, reissued or declared successfully reviewed.
- Grant expires October 15 at 22:14:23 UTC / October 16 at 01:14:23 Beirut.
- Existing QA semantic-review and salience policies remain `DETERMINISTIC`;
  real OpenRouter publication is enabled. This is not a live semantic-review
  model-quality benchmark. The grant permits GPT-4.1 and GPT-4.1-mini only.

## Five normal API-created feeds

All use the existing QA test owner, English output and 30-minute Beirut schedules.
Each was created through authenticated `POST /api/me/feeds`, not direct inserts.

| Case | Source input | Reader path below the QA origin |
|---|---|---|
| World RSS | `rss: https://feeds.bbci.co.uk/news/world/rss.xml` | `/qa-source-owner/qa-five-feed-1-world-rss/` |
| NASA website | `https://www.nasa.gov/news/all-news/` | `/qa-source-owner/qa-five-feed-2-nasa-website/` |
| Telegram | `https://t.me/AJANews` | `/qa-source-owner/qa-five-feed-3-telegram-news/` |
| ECB Google News | `news: "European Central Bank" (rates OR inflation)` | `/qa-source-owner/qa-five-feed-4-ecb-google-news/` |
| NASA social | `https://x.com/NASA` and `https://www.linkedin.com/company/nasa/` | `/qa-source-owner/qa-five-feed-5-nasa-x-linkedin/` |

Origin: https://distilled-news-sources-qa.distillednews-platform.workers.dev

## Measurements, not assumptions

All five creation requests returned 200. All five public feed APIs returned 200.
All five browser pages loaded their correct titles and reader controls. Initial
loading placeholders were not counted as successful rendering.

At 20:22:30 UTC:

| Feed | Acquisition done | Review done / pending | Result so far |
|---|---:|---:|---|
| World RSS | 29 | 17 / 12 | Full article bodies acquired; review progressing |
| NASA website | 1 | 1 / 0 | Quality failure: listing incorrectly accepted as one full article |
| Telegram | 4 | 4 / 0 | Collection and review completed |
| Google News | 3 | 3 / 0 | Partial collection: 63 failed article acquisitions, others still pending/running |
| X + LinkedIn | 102 | 1 / 101 | Collection works; review backlog grows under continued acquisition |

These are job counts at one snapshot, not unique-story counts or a claim of
complete recall. The first observation of both social families found distinct
item keys for each retained revision; no duplicate-revision count was inferred
from repeated scheduler calls.

## Reproduced issues

1. **Acquisition/review contention.** QA tail retained
   `V1_INTAKE_CAS_EXHAUSTED` for X (12 retries; approximately 13–19 seconds) and
   `V1_FEED_CAS_REJECTED` with a changed source epoch on Google News. Transport
   retries record `TEMPORARY_UNAVAILABLE`. Review continuation does not solve
   acquisition write contention or continuous invalidation of review snapshots.
2. **RSS timestamp precision loss.** At 20:18 UTC, all 29 BBC revisions differed
   from their precise collection publication hints: article metadata replaced
   hours/minutes/seconds with midnight. Example: feed hint
   `2026-10-15T16:52:44Z`, retained `2026-10-15T00:00:00Z`. Article acquisition
   currently prefers extracted article metadata to the connector hint. Google
   article dates also differed; those differences require distinguishing original
   publication from update/report dates, not blindly copying the feed timestamp.
   Telegram and both social families retained their collection timestamps in
   the checked sample. No future publication timestamps or cross-feed revision
   ownership mismatches were found in the five cases at that measurement.
3. **Website listing mistaken for article.** NASA's “All NASA News” page became
   a 5,775-character `FULL_ARTICLE` containing unrelated article excerpts, with
   no publication date. The listing detection misses this path/layout. It must
   discover independent article URLs, not promote the listing as article evidence.
4. **Misleading mixed acquisition-error wording.** Google News has a mixture of
   `AUTH_REQUIRED`, `POLICY_DENIED` and `UNSUPPORTED`. The browser warning says
   the entire failure count consists of authentication failures. The warning
   chooses one failure reason but applies the total count to it.
5. **New-feed pre-creation quiet window.** Each new feed received a quiet result
   for 19:30–20:00 UTC, before its approximately 20:11 UTC creation. The reader
   consequently says “No new developments” while the first real collection is
   still under review. That is not proof that the collected stories were rejected.

## Final results and cleanup

Final measurement: October 15 at 22:34:32 UTC / October 16 at 01:34:32 Beirut.
The run covered several naturally scheduled windows, not just manual requests.

| Feed | Acquisition done | Review done / pending | Published editions | Final outcome |
|---|---:|---:|---:|---|
| World RSS | 31 | 31 / 0 | 0 | Collection and review complete; publication requests failed with `SCOPE_DENIED` |
| NASA website | 1 | 1 / 0 | 0 | Listing/article quality failure; paused before publication |
| Telegram | 9 | 9 / 0 | 3 | End-to-end publication demonstrated |
| Google News | 22 | 20 / 2 | 0 | Incomplete intake coverage; first real window failed with `EXTRACTIVE_CAPACITY_UNSUPPORTED` |
| X + LinkedIn | 218 | 212 / 6 | 0 | Both families collected; publication remained `AWAITING_INTAKE_REASSESSMENT` |

The social revisions comprise 199 distinct X items and 19 distinct LinkedIn
items. The initial review stall eventually progressed, but still prevented the
scheduled briefing from completing during this run. This is not evidence of
acceptable latency at 1,000 feeds.

Google News additionally had 185 failed acquisition jobs: 33 `AUTH_REQUIRED`,
105 `POLICY_DENIED`, 44 `RECOVERY_EXHAUSTED`, and three `UNSUPPORTED`; six jobs
were running at measurement. Social had one `RECOVERY_EXHAUSTED` acquisition.
These are job outcomes, not counts of distinct unavailable publishers.

The first Telegram edition was published at 20:32:33.515 UTC / 23:32:33.515
Beirut, approximately 154 seconds after its window ended. Its four source
references were checked against revisions belonging to this feed: exact retained
publication timestamps and quoted text matched. Public Telegram widgets checked
for two references also matched the original timestamps. The reader's expanded
stories and source-reference dialog were inspected. Stored verification marked
four claims entailed and temporally valid; this does not independently establish
the truth of the source's claims. Later editions bring the final total to three.

Final date comparison: 31/31 RSS and 20/22 Google revisions differed from their
collection hints; Telegram and social had zero differences. The RSS precision
loss is reproduced; Google differences need publication/update provenance review.

Reported AI cost for these five feeds totaled **$2.2346228**:

| Feed | Reported AI cost (USD) |
|---|---:|
| World RSS | 1.962698 |
| Telegram | 0.0453948 |
| Google News | 0.22653 |

No new unsettled model reservations appeared in the measured spending query.
The historical unknown $0.02 model hold remains intact. The $5 grant expired at
22:14:23 UTC; later windows correctly report `ACCOUNT_AUTHORIZATION_REQUIRED`.
No grant was extended to bypass that expiry.

Source-provider accounting is separate: LinkedIn recorded 17 operations with
$1.000013 summed reservation ceilings; X recorded 11 with $1.10 summed ceilings.
These ceilings are not actual provider invoices. Each family had one unknown
operation at the final snapshot. Neither was reset or automatically reissued;
authoritative provider reconciliation remains required.

All five pause requests returned 200 with `paused: true` at 22:34:44–46 UTC.
Pausing preserves evidence, history and unresolved operations; it does not assert
that already-running deliveries have been cancelled. No staging deployment or
configuration was changed. A final settings comparison found no missing bindings
or unrelated binding changes. Private raw diagnostics remain ignored locally.

## Next implementation priorities

1. Diagnose the RSS publication `SCOPE_DENIED` using retained proposal/binding
   diagnostics; preserve scope validation rather than weakening it.
2. Fix listing discovery and timestamp provenance/precision before treating
   acquired bodies as reliable article evidence.
3. Reduce acquisition/review contention and make bounded scheduling windows drain
   under continuing collection; distinguish delayed work from successful emptiness.
4. Address Google coverage/capacity failures and report mixed acquisition reasons
   accurately. Reconcile unknown paid operations without duplicate charges.
5. Repeat the five-feed run after fixes, then perform a separate load test. This
   validation does not establish production readiness or 1,000-feed capacity.
