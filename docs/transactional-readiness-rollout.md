# Transactional readiness and private edition delivery

## Sources-QA baseline

The live Worker was on `0f665cf4` for this read-only baseline. The one-hour D1 analytics sample on November 12, 2026 ran from 15:52:58 to 16:52:58 UTC. The D1 allocation was 4,843,864,064 bytes. The sample recorded 648,829 rows read, 3,520 rows written, 2,910 read queries and 1,453 write queries. Query Insights identified the OpenRouter receipt recovery lookup as the largest reader in its sample, with 445,261 rows across 45 executions. Analytics can lag and these measurements do not attribute a reset to a single query. [D1 Query Insights](https://developers.cloudflare.com/d1/observability/find-expensive-queries/)

Five recent scheduled editions across Israeli Elections and Breaking News Test had a scheduled-to-published delay of 85.1 seconds at p50 and 92.6 seconds at p95. A separate six-request HTTP check around 17:16 UTC returned five 503s. Both feed endpoints returned 503 on both attempts. The session endpoint returned 200 once and 503 once. Worker invocation analytics for the earlier hour recorded zero invocation errors across 209 invocations. The HTTP check is a small sample and the invocation count measures a different outcome.

## Compatibility inventory

| Existing path | How it interacts with readiness and delivery |
| --- | --- |
| Connector polls, discovery, retries and provider recovery | Polls keep their current authorization, receipts and retry rules. The existing collection query evaluates resolution at the original cutoff. |
| Intake admission, acquisition claim, renewal, completion, retry, deferral and reassessment creation | `V1IntakeStore.commit` guards the scope epoch and original job state. The D1 job triggers apply membership and counter changes in that transaction. |
| Review, evidence revision and publication | `V1FeedStore.commit` guards the feed revision, scope and semantic ownership. Review job changes use the same projection triggers. Verified results, citations and delivery jobs retain their existing identities. |
| Feed edits, source changes, observation imports and removal, superseded and terminal requests | D1 retires the derived window or refreshes its generation. The next canonical observation can rebuild an eligible window. |
| Queue retries, scheduled delivery, backlog catch-up and paid-outcome recovery | Readiness events can wake the existing relay. The relay and final commit apply the current clock, source scope, spending and concurrency checks. |
| Reader routes, visibility and withdrawal | D1 authorizes each request. R2 stores the immutable reader projection. The route still obtains viewer state and feed health from the current product records. |
| Retention and operational diagnostics | Current feed retention remains in place. The new archive path compacts only verified unpaid wait payloads. Corrections, reader memory, full evidence and financial state stay available to their existing readers. |

## Deployment flags

Migrations `0089` and `0090` add the projection and archive schema. Check the actual QA bindings and pending migrations before any rollout. Index creation touches retained job and diagnostic records, so capture its duration and any D1 errors. Start with flags absent, then observe a small set of feed IDs in `shadow` mode. Both projection modes leave publication authorization in the existing scheduler and commit. A comparison logs the job-holding decision, collection resolution and verified-result availability. A stable mismatch cancels its wake and makes the projection eligible for bounded reseeding.

| Flag | Effect |
| --- | --- |
| `WINDOW_READINESS_MODE=shadow` | Enrolls open clock-scheduled V3 windows, maintains counters and compares with the current job check. Outbox events stay in D1. |
| `WINDOW_READINESS_MODE=relay` | Delivers due, current-generation events through the configured acquisition queue. Transport acceptance and consumption are separately leased. The existing relay handles replay. |
| `WINDOW_READINESS_FEED_IDS` | Restricts enrollment and relay to a comma-separated cohort. Use explicit feed IDs for the initial comparison. |
| `EDITION_ARTIFACTS_ENABLED=true` | Stages and verifies private R2 edition projections. The canonical D1 commit attaches the reference, latest pointer, publication status and delivery job. Legacy editions and unavailable artifacts still read through D1. |
| `VERIFIED_ARCHIVE_ENABLED=true` | Uses indexed pages of eligible unpaid diagnostics and manifest verification. Cleanup checks exact references before deleting an abandoned object. |

The projection seeds once per eligible window and retains up to two current windows per feed. Repeat reads depend on the window row and currently unresolved capacity waits. Seeding and final canonical coverage can still examine retained jobs. Review writes gain work while a window is enrolled. An expired window stops receiving job updates. [D1 transaction semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/) [Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)

Removing the readiness flag stops observations and extra relay events. Existing queue messages revalidate the flag, and an expired projection is inert. Removing the edition flag returns the reader to its D1 projection. Verified compaction retains a small D1 diagnostic record even for waits older than the legacy 30-day diagnostic cutoff. Turning off verified compaction preserves prior compact records and their verified archives. Keep the verified R2 prefix private and outside broad expiration rules. [R2 lifecycle rules](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)

## Measurement and decision

In the deterministic local D1 fixture with 2,000 retained failed jobs and one unresolved capacity wait, the full canonical coverage query read 4,016 rows. The existing scheduling predicate read 9 and the projection read 2. One review completion wrote 4 rows with the projection absent and 10 while enrolled. These figures isolate queries and a state transition. Shadow comparisons still use the canonical lookup and enrollment has its own cost.

Compare matched periods with similar feed counts, cadences, sources, evidence volume and reader traffic. Capture idle and active periods separately. Use D1 analytics and Query Insights for rows read and written and normalize active reads by the count of distinct completed briefings. Measure allocated size over several periods. Record R2 operations and bytes, queue operations, API status and p50/p95 latency, and actual publication time minus scheduled time. Measure missed windows by their persisted request identities and compare charged operation IDs and receipts across replays. Include quiet and deferred windows as separate outcomes. A zero denominator or absent measurement stays unavailable.

Before widening the cohort, verify that stable shadow decisions match, due windows remain accounted for, privacy and withdrawals work, and replay has zero duplicate publications or charges. Compare end-to-end API failures, lag and cost before enabling artifact reads or relay broadly. The local fixture checks query work and invariants. Sustained post-change QA performance remains to be measured.

Keep D1 for this rollout. The baseline identifies a shared accounting recovery lookup worth measuring separately. Revisit per-feed Durable Objects if measured feed coordination dominates. Revisit PostgreSQL through Hyperdrive if shared relational work dominates after selective D1 reads. Permissions and accounting require authoritative reads in either design. [Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)
