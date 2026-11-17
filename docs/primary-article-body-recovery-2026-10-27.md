# Primary article body recovery — October 27, 2026

The Pandemic QA feed had twenty extraction failures. Inspection of saved provider responses and anonymous publisher HTTP responses confirmed that several pages contained usable text but the extractor selected related-story cards or classified the page as a listing.

## Implementation

Code commit `6d96941` on `aya-ghada-integration` updates shared deterministic HTML extraction. It recognizes an article body despite multiple page headings, handles CMS body wrappers including Drupal and Elementor, preserves adjacent prose sections, and omits nested related article cards. The body selector checks prose length and link density and bounds heading searches. The change is structural and does not filter for relevance or importance.

It preserves exact URL checks, publication-date handling, readability/restriction safeguards and paid-operation identities. Real listings and publisher challenges remain distinct from article bodies. It does not add PDF/OCR decoding, video transcription or publisher authentication.

## Retained-page validation

| Publisher | Before | After |
| --- | --- | --- |
| Boston University | 79-character featured card | 10,731 characters of primary article text |
| National Academy of Medicine | 195-character related-story card | 6,599 characters of primary article text |
| Washington Times | 78-character podcast promotion | 3,065 characters of primary article text |
| CIDRAP | Misclassified listing including other briefs | Article, 2,530 characters |
| Institut Pasteur | 46-character related-story teaser | Article, 20,490 characters |
| Infection Control Today | Misclassified listing | Article, 8,757 characters |

These lengths are extracted text measurements, not proof of completeness or factual accuracy. Acquired heuristic text remains UNKNOWN completeness. The actual Frontiers magazine/listing remains a listing; the University of Toronto security challenge and CBS HTTP 406 remain failures. IDSE's saved response lacks usable article prose; GAO's video-description page remains outside the recognized article body in this change.

## Checks

307 connector tests and 21 Worker article-fallback tests passed, along with Worker TypeScript and the QA dry-run build. The initial connector suite had one local Cloudflare database test exceed its 15-second timeout; both tests in that file passed when rerun with a 60-second timeout. A new-test run encountered a module-loading timeout and passed unchanged when rerun independently. Skipped tests are not counted.

Full publisher content and operational receipts are private under ignored `.local-reports/aya-ghada-qa-deploy/pandemic-body-inspection/`. The original frozen benchmark datasets were not changed.

## QA deployment and recovery

Deployment and bounded recovery results follow. Production and staging are outside this deployment.

Deployed `6d96941` plus the headline-header follow-up `e49de79` to sources-QA. Final version: `958c3c79-45da-4901-a6e2-6803715bcdce`, deployed October 27 at 18:05:58 UTC. Live resource/variable bindings matched before and after upload; existing secrets and assets were retained. Both public homepage and feed API returned HTTP 200.

The headline-header follow-up adds one regression, bringing validation to 308 connector tests plus 21 Worker fallback tests (329 unique tests). The focused discovery, integrity, acquisition and body-selection subset passed again after that follow-up.

All eleven selected jobs, representing six distinct publisher articles and their Google News observations, received exactly one bounded recovery authorization. At the live verification snapshot, ten were DONE with retained readable bodies and one was RUNNING after Google-resolution capacity waits. The direct Infection Control Today observation had already succeeded, so all six distinct publisher layouts were proven through actual acquisition and persistence. Observations, cumulative attempts and previous failure details were retained; DONE jobs can still carry their historical diagnostic fields, which are not current failures.

Live retained body lengths: Boston University 10,709, National Academy of Medicine 6,599, Washington Times 3,065, CIDRAP 2,530, Pasteur 20,490 and Infection Control Today 8,757 characters. Providers included readable HTTP, anonymous Playwright and durable Zyte response reuse. All retained heuristic bodies were marked UNKNOWN completeness.

The first attempt to enqueue the recovery batch returned a queue API error after some messages were accepted. Normal QA relay and job leases continued processing; a source-scoped relay wake was accepted without forcing a new source snapshot or resetting job/financial state.

The Pandemic public API subsequently reported five published editions and publicationState `published`. Other source restrictions and non-article responses still produce source warnings; they have not been hidden or represented as successfully fetched articles. No production or staging deployment was performed.


Final read-back confirmed **all eleven recovery jobs DONE**, including the Google News Infection Control Today observation, with retained article text and original observation IDs. Final Worker TypeScript also passed. The private `article-body-recovery-status.json` records the final state; the earlier ten-DONE snapshot above documents intermediate progress only.
