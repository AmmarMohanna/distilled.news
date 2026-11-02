# Publication pilot blocker follow-up

Status: **BLOCKERS INVESTIGATED; REPEAT PUBLICATION PILOT NOT RUN.** No new paid model calls. Fresh spending approval is pending; the previous pilot approval is not reused.

## Queue age

The prior `oldest_message_timestamp_ms=0` mapping was correct: Cloudflare defines zero as unknown, and describes queue counts as best-effort. GraphQL backlog averages and consumption lag cannot substitute for oldest-unacknowledged age. References: [native metrics](https://developers.cloudflare.com/api/resources/queues/methods/get_metrics/) and [queue metrics](https://developers.cloudflare.com/queues/observability/metrics/).

A bounded non-leasing [peek](https://developers.cloudflare.com/api/resources/queues/subresources/messages/methods/peek/) succeeded on the isolated acquisition queue (HTTP 200, zero messages at 00:05:12 UTC). Peek does not establish complete oldest-message coverage for delayed/in-flight messages; a sample is deliberately NOT used as exact queue age. No pull, acknowledgement or purge was performed.

The existing observer now privately retains each queue's valid native oldest timestamp within the same campaign/account/queue. If a later nonempty observation has no timestamp, the retained timestamp supplies a **conservative age upper bound**, explicitly marked `NATIVE_RETAINED_UPPER_BOUND`, with its original evidence time. New messages are timestamped when enqueued; removing earlier messages can make this bound overly old, not younger. This inherits native metrics' best-effort limitation; it is not an exact census. Without a valid native receipt the age remains null and the existing safety stop remains. The prior run cannot retroactively acquire evidence it did not retain.

Confirmed additional defect: resource readings were reused for five minutes with a frozen age. Every guard evaluation now advances measured age by elapsed time, using each queue's measurement timestamp. Missing backlog/bytes, unknown positive backlog age, stale snapshots, invalid observation times and the existing 15-minute age/20-message backlog limits remain fail-closed. Positive bytes with a zero approximate count are not treated as empty. Financial uncertainty guards are unchanged.

Durable acquisition/reassessment `enqueuedAt` and request timestamps remain independently available through the bounded campaign snapshot. They describe canonical work; they are not relabeled as the age of every physical message. No new table, queue, collector or monitoring framework was introduced.

## Telegram: actual failure and recovery

The private admin campaign API now has one read-only diagnostic for the already-authorized channel. It runs existing identity resolution and at most 20 public post reads. It exports only step kind, HTTP status, duration, an allowlisted error code, record count and publication-time bounds. No post text, provider error prose, token, session or URL is exported. Existing admin authentication, same-origin checks and isolated/default-off gates remain.

Actual isolated observations on November 2 UTC:

- 00:12:00: identity resolution HTTP 200; post read HTTP 503 `BUSY`; existing adapter classified `BACKPRESSURE`.
- 00:12:24: post read HTTP 503 `BUSY` again. Helper status showed both global slots occupied by other reads.
- 00:13:24: bounded status checks found one free slot.
- 00:13:25: post read HTTP 200; 20 valid records. No login, session reset, capacity change, permission bypass or new host was needed.

Capacity contention is **demonstrated for these failures**, followed by recovery with unchanged authentication/configuration. This does not prove every earlier generic runtime failure had that cause. Ordinary source-assessment behavior was not rewritten.

## Fresh evidence and next execution gate

Those 20 real posts range from 2026-11-01T10:43:26Z to **2026-11-01T20:33:59Z**. The latest is 22:33:59 Beirut November 1, before the previous pilot feeds were created. They cannot be promoted to fresh news. A separate local read of the authorized BBC RSS URL failed during TLS connection setup; that does not establish whether the deployed collector can reach it.

The repeat must use real registration/email verification/login/feed APIs, preserve source timestamps and initial-backlog exclusion, and wait for actual post-creation eligible evidence. Align setup so both 30-minute and hourly deadlines fit the 90-minute observation. Do not claim publication success merely because empty windows complete.

A fresh request has been presented: at most $12 total exposure / 40 paid calls, eight-hour validity, same two users/four feeds, two VUs/120 GETs and 90 minutes. No grant has been appended and no paid request sent under it. Provider headroom at 00:12 UTC was $14.30819054, subject to unrelated account activity; recheck before admission. Plan $10.5 maximum native model exposure, $0.5 attributable infrastructure allowance and $1 stopping reserve inside $12. Preserve authoritative admission, uncertain holds, call ceilings and cleanup protections.

The existing runner starts k6 30 seconds before the first scheduled delivery; the repeat must enable its existing Grafana export option and preserve the full observation period, edition read-backs and independent factual assessment. Quiet completion, publication, repair execution, unfinished-acquisition handling and late-source recovery must each be reported separately; none is newly established here.

## Deployment, tests and operational state

Only the isolated campaign Worker was updated: application revision `eceeb027a52c83fa6cd9a9a21763d60412879151`, version `5dca7a48-c32d-44e7-8870-d1da93fc5916`. All existing bindings/secrets were inherited and checked unchanged; frontend assets were preserved. Cron remains disabled, previous accounts/feeds remain archived, and production/ordinary staging were untouched. Logs, tracing and notifications were not enabled.

Focused results: campaign API 10 tests passed; helper and retained publication regression 10 tests passed; real-campaign framework 30 tests passed; all workspace TypeScript checks passed; 102 root script tests passed. Baseline GitHub CI was checked rather than assumed green: `d37dc8c` had one Miniflare synchronous proxy assertion failure in the existing indefinite-publication test (2,673 Worker tests passed). That exact file passes locally, including both entailment branches; no unrelated V2 product changes were made. Updated CI status will be recorded after push.

Read-only usage preflight around 00:22 UTC: 358,593 account Worker requests; 39,893.879254 CPU seconds; 9,771,962,285 D1 rows read; 12,173,595 D1 rows written month-to-date. These are account-wide, not attributable pilot costs. Grafana returned 43 active billed series against 10,000 included, and zero trace usage. Queries succeeded. No invoice-based incremental charge is asserted to be zero. New paid inference cost: **$0, 0 calls**.

Private append-only diagnostics and receipts are in `.local-reports/real-campaigns/pilotnov02/follow-up/`; prior artifacts and financial/publication history remain intact. Exact new pilot measurements, published content, citation review, reuse/idempotency and reconciliation remain **NOT RUN**, pending fresh authorization and eligible evidence.
