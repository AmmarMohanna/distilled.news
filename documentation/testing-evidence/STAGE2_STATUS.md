# Stage 2 status ? 2026-09-27

The expanded collection and response-preservation reviews below have run. Stage 2 is **partially complete**, not a blanket provider acceptance. Expanded Zyte collection is complete; independent full-source reference gates remain open. The free-route portion of [Stage 3](STAGE3_STATUS.md) started on September 27.

| Family | Expanded collection | Checked result | Remaining limitation |
|---|---|---|---|
| Websites, direct HTTP | 30 URLs / 10 publishers | 27 article responses; three Le Monde challenges. 380 long publisher-DOM paragraphs: Trafilatura 380 preserved, Readability 378. | Two missing France24 introductions; consent/adblock contamination on two pages; six Trafilatura timestamp precision losses. Not full-body gold. |
| Websites, Playwright | Same 30 URLs attempted | 26 article captures, three challenges, one France24 HTTP failure. Both extractors now reject all three challenges after validator fix. | Browser added no Le Monde access. Different acquisition times prevent treating all text changes as extraction errors. |
| RSS | 12 feeds, 119 sampled entries before duplicate reduction | Both parsers checked against saved XML; date fallback fixed. | One source duplicate and one nine-entry feed; no full-article-body or exhaustive recall claim. |
| Google News | Six query pairs, 10 results each | 60 exact URL overlaps; Apify billing reconciled at $0.0573. | Independent publisher truth and exhaustive recall not established. |
| Telegram | Six eligible channels plus preserved selection/access failures | 50 API posts; 38 overlapping posts pass text/date/URL checks. RT landing page now explicitly flagged. | RT public preview unavailable, BBC Persian latest-ten overlap 8, official Telegram window empty. |
| X alternatives | Six profiles + four searches; 100 evaluated posts/provider | All 1,000 response-preservation field checks passed. 87 shared IDs; one shared-ID text difference (two account mentions present only in TwitterAPI.io). | Sequential snapshots and different profile semantics; source-truth, nested-post and text-discrepancy review pending. TwitterAPI.io fetched 200 raw records due page size, evaluated 100. |
| LinkedIn Apify | Four companies + four public profiles, five requested posts each | 35 posts retained; all 210 field checks passed. Final provider usage $0.0714. | Bill Gates target returned zero; five nested reposts remain semantically unverified. Bright Data excluded per user. |
| Zyte | Same expanded 30 URLs attempted | 26 captures; three Guardian HTTP 451 refusals and one Al Jazeera deadline failure. | Full quality remains unverified. $0.09 new reservations and the earlier $1 reservation are unreconciled; reservations are not actual charges. |

## Costs and exclusions

New controlled Apify usage: Google $0.0573 + X $0.044 + LinkedIn $0.0714 = **$0.1727**. TwitterAPI.io estimate: **$0.03** for 200 raw results at the earlier pilot rate; current actual billing is not verified. These figures exclude earlier pilots, server allocation and unreconciled Zyte spend. Do not call the combined total fully reconciled.

Official X API is excluded from the comparison. No calls were made to it. Bright Data remains skipped. Media is excluded. Production-use authorization is not certified by these technical tests; the user requested proceeding with alternatives after the documented terms discussion. No production deployment was performed.

## Fixes and evidence

Full VPS regression suite: **228 passed**. New changes since the initial batch: RSS updated-date fallback with provenance; Telegram missing-preview inventory issue; targeted Client Challenge rejection. Browser rescoring used saved captures. Different code versions remain recorded in acquisition/processing manifests.

Primary artifacts: `controlled-510-v1/{web-report.json,web-paragraph-review.json,web-boilerplate-review.json,browser-report.json,browser-paragraph-review.json,feed-review.json,telegram-audit.json,google-matched-report.json,x-alternatives-review.json,linkedin-review.json,failed-checkpoints.json}`. Request markers prevent uncertain automatic resubmission; raw X/LinkedIn payloads remain on the VPS private evidence paths.

## What prevents a complete Stage 2 acceptance

1. Reconcile Zyte billing for the earlier pilot and completed expansion; the old reservation was preserved and only $0.10 allowance added ($0.09 reserved for 30 requests).
2. Finish independent source-reference checks, especially full article bodies, the one cross-provider X text difference, empty LinkedIn output and nested repost semantics. Provider-field preservation is not original-source verification.
3. Resolve or explicitly accept the recorded quality failures and finalize the family selection. A five-day soak does not fix missing references.

The record deliberately reports missing and blocked results. It does not redefine the 410-item plan (legacy campaign ID `controlled-510-v1`) as fulfilled merely because the successful subset was processed.

Scope correction: 30 website articles + 120 RSS entries + 60 Google News results + 60 Telegram posts + 100 X posts + 40 LinkedIn posts = **410 requested items**, before repetitions/provider comparisons. The separate independent-review target is 100; it does not increase the source sample total.
