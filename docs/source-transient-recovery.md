# Transient article acquisition recovery

The source lane now tries its existing authorized anonymous exact-URL article
adapter after public transport failures and HTTP 408, 425 and 5xx responses,
in addition to the existing 403/406 recovery. Returned articles must still pass
identity, size and readability checks; helper evidence retains unknown completeness.

Without a usable fallback, 408/425 and server failures use durable bounded retries
instead of being classified as unsupported. Known anonymous helper transport
timeouts/outages and temporary helper HTTP responses also record retryable NETWORK
failures rather than leaving the job RUNNING until its lease expires.

Authentication requirements, policy denials, body limits, rate limits, paid-provider
fences, maximum attempts and publication-window eligibility remain in force. This
improves recovery; it cannot guarantee access to every publisher.

Validation: 15 focused recovery regressions passed and worker TypeScript passed.
The QA build dry run passed with live resource bindings and variables preserved.
The existing Guardian recovery batch had 11 of 16 articles DONE at inspection;
the remaining five had reached their attempt limit or were awaiting lease recovery.
No feed dates, schedules, paid histories or exhausted jobs were reset for this change.

Deployed to `https://distilled-news-sources-qa.distillednews-platform.workers.dev`
on October 22, 2026, version `b6c9ebe7-5127-4d25-b69d-3216a041a101`.
Post-deployment checks confirmed HTTP 200, matching frontend assets, unchanged
live bindings/variables, and successful session and explore API responses.
The preservation check passed for all 56 frontend and 33 protected backend files.
