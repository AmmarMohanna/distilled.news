# Article tracking-alias recovery — October 28, 2026

The Israeli Elections QA feed rejected an Al Jazeera liveblog with `INVALID_RESULT / FALLBACK_CANONICAL_MISMATCH`. Its RSS URL included `traffic_source=rss`; the publisher canonical identified the same origin/path without the tracking parameter. Anonymous HTTP returned 200 and confirmed that canonical link. There was no durable Zyte operation for the failed job.

Commit `a3a96fa` uses one comparison-only article identity helper in HTTP, browser and Zyte acquisition checks. It ignores the known attribution parameters `traffic_source`, `utm_*`, `fbclid` and `gclid`, retains all other query parameters, and preserves the existing trailing-slash/fragment alias behavior. Domain, scheme, credentials and article path checks remain enforced. Original observations, source URLs, content identities and paid-operation request bodies/keys are not rewritten.

A bounded operator recovery of this specific historical identity rejection requires exact original-URL evidence and an equivalent safe publisher canonical URL. Generic INVALID_RESULT recovery remains refused. Existing unknown-payment gates and cumulative attempt limits remain intact.

34 URL/fallback tests, two existing recovery refusal tests and one new canonical-evidence recovery test passed (37 focused checks total). Worker TypeScript and the QA build passed. The first version of the new recovery fixture incorrectly attempted to update an immutable observation; the test was corrected to use its existing immutable URL and passed. No production observation immutability guard was changed.

The saved anonymous Al Jazeera HTML contains title/canonical metadata but no extracted body. A read-only raw-HTML acquisition probe could not complete without rendering; this is not evidence of successful live recovery. The normal anonymous browser fallback remains necessary. Full publisher HTML and private receipts remain under ignored local reports. QA deployment and live recovery results follow below.

QA deployment version `5262f098-ead0-41bc-b0e7-b741c9c11a57` activated October 27 at 23:55:48 UTC (October 28 at 01:55:48 Beirut). Existing bindings, secrets and assets were retained; public homepage and feed API checks returned HTTP 200. The upload was slow but returned success; no duplicate upload was attempted while its outcome was pending.

The exact failed observation received one recovery authorization under `qa-tracking-alias-fix-20261028`, recording both original and verified canonical URL. Its cumulative attempts advanced from one to two; no observation, date, request hash or financial history was rewritten. Queue acceptance was confirmed. Live persistence outcome is recorded below.

Final read-back confirmed the Al Jazeera job DONE on cumulative attempt two. It retained 459 characters through `private_public_http`, marked completeness UNKNOWN, with the original RSS tracking URL and original observation identity. Historical failure fields remain on the DONE record as history, not a current failure. The public Israeli Elections feed returned HTTP 200, publicationState `published`, one edition and zero source warnings. This does not establish that this article was included in the briefing or that the retained text is a complete liveblog.

The code and evidence are on `aya-ghada-integration`. Only QA was deployed; production/staging and the frozen benchmark datasets were not modified.
