# Feed artwork loading and recovery

Feed artwork is generated once by the existing durable queue and saved in R2. Image GETs never generate artwork.

Public artwork now uses private browser HTTP caching for five minutes and supports ETag/304 revalidation after visibility checks. The processed transparent image is retained in bounded browser storage for seven days; in-memory reuse lasts an hour. Concurrent public cards share one download/conversion. Private or unknown-visibility artwork bypasses those caches and keeps no-store requests/responses.

Missing artwork is polled only when the server confirms a pending/running generation job using Retry-After. Polling backs off and remains bounded; an absent job no longer causes twenty futile reads. Ordinary feed creation/save already calls queueInitialFeedSketch. Feeds inserted outside that path need their missing durable jobs restored explicitly; this change does not add a population-wide generation sweep.

On staging, only the three product-proof Lebanon feeds missing job records were repaired using INSERT ... ON CONFLICT DO NOTHING. All three jobs reached ready on their first attempt; existing images were not replaced. The private clean feed remains inaccessible anonymously. Existing queue processing performs the R2 existence check before generation. No briefing, source evidence or historical financial records were changed.

Read-only browser measurements after recovery: existing Lebanon image 50,207 bytes / 613 ms download / 143 ms conversion; Lebanon news 570,573 bytes / 2,220 ms / 220 ms; Lebanon news2 698,845 bytes / 439 ms / 103 ms. Converted images were 68,751 / 254,653 / 326,439 bytes, all within the existing persistent-cache size limit. These single observations are not a latency distribution; repeat cached visits avoid the network/conversion, while first visits still download an image.

Validation: 60 frontend tests, 9 focused Worker tests, all workspace typechecks. Regressions cover concurrent public cards, private cache exclusion, no-job polling, ETag reads after authorization, and existing queue idempotency. Raw timing and repair artifacts remain ignored under .local-reports/.
