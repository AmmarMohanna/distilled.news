# Short article evidence correction, 28 October 2026

Deployed Worker version: `ac505a64-183e-4011-b2a1-86a74577ea8e`.
No frontend, models, grants, source bindings, provider limits or billing holds changed.

The remaining item audit found real readable text below the former 200-character
admission threshold: two JPost podcast descriptions (193/196 characters) and one
LBC report (174 characters). The native parser already identified their explicit
publisher-owned article bodies, but acquisition rejected them as too short.

Explicit article-body or same-page structured articleBody text of 80?199 characters
is now conservatively marked PARTIAL. Acquisition, fallback and website collection
preserve that as ARTICLE_EXCERPT, with extractionComplete=false. Generic short
meta descriptions, missing-body pages, unrelated canonicals and generic navigation
are not admitted by this rule. Full-article and access/unknown-payment safeguards
remain unchanged.

Two other old jobs now returned readable exact-page evidence: a remaining Al
Jazeera liveblog summary and a 238-character LBC report. A five-job public-only
recovery manifest reused the original job/observation identities with one extra
attempt each. FEED_BUSY responses preserve saved evidence and the same approval
was reused until completion; no new paid fallback was authorized. All five jobs
were verified DONE with cumulative attempts increasing from 1 to 2. The verified
recovery total is now 97.

Validation: 35 connector primary-body/discovery/resource tests, four focused
acquisition tests (including stronger-evidence preservation), and all 34 fallback
tests passed. Worker and connector typechecks passed. Real-page previews and
private result files are ignored under `.local-reports/live-check`.

Remaining boundaries are real: the inspected MTV pages contain videos without
readable article bodies; Newscord redirects to another story; CBS investigations
redirect to custom pages without extractable bodies; category/index pages are
not individual news articles; and unresolved paid operations lack sufficient
receipts to confirm their outcome. The Al Jazeera economy article and JPost
conference page also redirect away from their originally admitted locations.
Those identities were not silently replaced. No unknown billing outcome was
settled or resubmitted, and this change does not claim that all failures are gone.
