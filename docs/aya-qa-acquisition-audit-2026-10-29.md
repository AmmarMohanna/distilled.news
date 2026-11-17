# Aya QA acquisition audit — 29 October 2026

The retained audit covers the four active feeds owned by `aya-admin-20261027` on sources-QA. Full article data, source IDs, job IDs and private operational snapshots remain in ignored local reports.

## Observed state

- Israeli Elections and Invisible Cyberwar had no FAILED acquisition jobs. Completed jobs can retain previous failure metadata; that metadata does not make them failed again.
- The Pandemic feed had 71 pending/running Google News acquisitions and one running social acquisition in the snapshot. Its oldest sampled resource waits reached 82 and 71. Google News had 22 retained failures: 15 access/payment requirements, four rendered-text extraction failures and three upstream HTTP 400 errors. ProMED had 131 retained login-redirect failures.
- OpenAI retained 39 failures after the two verified-redirect recoveries: 31 unavailable article-text responses, five old exhausted dependency waits, two unresolved/lost paid-response jobs and one HTTP 404. The other AI feed sources had no failed acquisitions in the snapshot.
- No active acquisition budget-exhaustion job was found in these four feeds. The separate report about budget waits must not be assumed to describe this deployment's current failures.
- Both deployment-local helper slots had lease records. This alone does not establish stale reservations or prove VPS occupancy. Leases already expire and have owner-fenced release/reclaim tests.
- D1 returned HTTP 429 / code 7429 during follow-up reads, including overload and CPU-limit-reset responses. These interfere with diagnostics and background recovery independently of article readability.
- The existing `distilled_bench` SSH key was refused by root@148.230.109.96. VPS task/process/log inspection and deployment of helper diagnostics require restored access.

## Changes

1. Distinguish Worker-local slot denial (`HELPER_LOCAL_CAPACITY_BUSY`), an authenticated helper BUSY response (`HELPER_GLOBAL_CAPACITY_BUSY`), HTTP 429 (`HELPER_HTTP_RATE_LIMIT`) and generic HTTP 503 (`HELPER_SERVICE_UNAVAILABLE`). Preserve retryability; do not mislabel every 503 as occupied capacity. Parse only bounded error JSON and expose no source inputs or credentials.
2. Back off repeated capacity waits from five seconds to a maximum of one minute, retaining provider Retry-After deadlines, attempts, resource-wait counts and recoverable job state. This reduces repeated database/queue pressure without discarding missing evidence.
3. Treat confirmed pending acquisition budget denials as incomplete window coverage rather than unfinished active acquisition. Preserve pending jobs for recovery; do not describe empty incomplete windows as no news. Ordinary backpressure still blocks until acquisition progresses.
4. Add an authenticated VPS status endpoint with active count, configured capacity, operation kinds, phases and elapsed time. No source URLs, request bodies, tokens or Telegram session information are returned. This helper change is prepared locally and must not be reported deployed until VPS access is restored.

## Validation

Transport classification, slot expiry/owner fencing, recovery attempt preservation, budget coverage and adaptive capacity-wait tests passed locally. The six helper-server tests include authentication, redaction, active task visibility and Telegram serialization. These tests do not establish the reason for live VPS occupancy. Login/paywall responses, unknown paid outcomes, missing/deleted articles and absent provider body text remain factual conditions requiring individual handling, not successful acquisition records.

## Retained short-text inspection and recovery

All 31 retained OpenAI text-failure HTTP responses were integrity-checked and extracted locally without paid scraping. Twenty-three contain a readable primary description between 80 and 199 characters. They can be retained as `ARTICLE_EXCERPT` / `PARTIAL`, with `quality.extractionComplete=false`. The criterion requires a primary article title and at least 30 characters / 25 letters beyond that title and standard navigation labels; corrupt or restricted text still fails. It does not promote title/date/CTA-only video pages into complete article evidence.

Eight sampled payloads remain unusable under this criterion: one publisher HTTP 500 response and seven very short/title/navigation-only pages. A successful HTTP transport is not proof of available article or video transcript content.

Live diagnostics after the first Worker deployment showed six sampled Google News waits caused by `HELPER_LOCAL_CAPACITY_BUSY`, one by the VPS helper's `HELPER_GLOBAL_CAPACITY_BUSY`, and one previously waiting job completed. This establishes both admission layers are involved, but does not explain which processes occupy the VPS. SSH access is still required for that investigation.

The coverage query now explicitly selects PENDING/RUNNING/FAILED instead of `state != DONE`. With the existing scope/feed and pending-job indexes, EXPLAIN changes from using only source/kind to using source/kind/state; completed history is excluded by the index lookup rather than visited and filtered. A SQLite fixture with 1,000 completed historical jobs confirms identical coverage counts and use of the full existing index prefix. This is targeted evidence of less query work, not proof that all D1 reset causes are resolved. No new index or migration is introduced.

At the user's explicit approval, the 20 feeds owned by `canary-aya-20261029` were temporarily paused; all four `aya-admin-20261027` feeds were verified active. Feed records, retained evidence and schedule timestamps were preserved. The pause must be reported to the user and considered before any later canary measurements.
