# Database concurrency rollout

Branch `database-v4-readiness`, off `v4-readiness-validation`. It addresses the QA finding that 40 concurrent reads (20 feed pages and 20 admin traces) made D1 answer `DATABASE_UNAVAILABLE`.

## What changed

| Change | Flag | Default |
| --- | --- | --- |
| Source availability on the feed page reads only this feed's acquisition jobs. Before, SQLite drove the query from the deployment-wide `ACQUIRE` index, so every feed page read every feed's job history. | none | on |
| Feed page, edition detail and search reuse the latest-100 edition list per isolate, keyed by `v1_feed_read_versions` (migration 0095). Collection status is reused for `FEED_STATUS_CACHE_SECONDS` (default 15). Concurrent misses share one build. The feed page sends a weak ETag and answers 304. | `FEED_READ_CACHE_ENABLED` | off (on in the QA config) |
| The web app sends `If-None-Match` and, after 429, 502, 503, 504 or a network error, holds every refresh (interval, focus, visibility, reconnect) for 30, 60, then 120 seconds. Healthy refreshes stay immediate. | none | on |
| Read-only GET routes (feed, edition, search, developments, sketch, evidence, explore, admin trace) use a D1 session. Signed-in readers start on the primary; anonymous readers can be served by a replica. | `D1_READ_SESSIONS_ENABLED` | off (on in the QA config) |
| On those routes, a plain `SELECT`/`WITH` (or an all-read batch) refused as overloaded is retried once after 100 to 300 ms. Writes are never retried this way. | none | on |
| The admin pipeline trace runs at most 2 at a time per isolate and answers `429 TRACE_BUSY` with `Retry-After: 2` beyond that. | `ADMIN_TRACE_MAX_CONCURRENT` | 2 |
| Cron backfills verified R2 copies of published V3 editions, up to 5 per tick, newest first. | `EDITION_ARTIFACT_BACKFILL_ENABLED` plus `EDITION_ARTIFACTS_ENABLED` | off |
| The D1 reset diagnostics proxy also wraps sessions. | none | on |

## Migration 0095

`0095_feed_read_versions.sql` adds `v1_feed_read_versions` and triggers that bump it when an edition, its publication status, or its delivery artifact is written or removed. Job, request and poll writes never touch it. It also adds `v1_verified_archives_record` for the backfill. Both are small. The numbering follows `0094_model_wait_lookup.sql` on `v4-readiness-validation`; nothing else uses 0095 on the remote branches checked.

A feed with no publication write since the migration reads as version 0. That is still a stable cache key, and its first publish moves it to 1.

## Measured effect

Local D1 seeded like QA (20 feeds, one with 1,500 jobs and 100 editions), via `pnpm --filter @distilled/worker perf`:

| Request | Before | After, cache off | After, cache warm |
| --- | --- | --- | --- |
| Feed page, heaviest feed | 19 queries, 13,274 rows read | 19 queries, 9,140 rows | 3 queries, 5 rows |
| Feed page, typical feed | 14 queries, 3,177 rows | 14 queries, 483 rows | 3 queries, 5 rows |
| Edition detail | 6 queries, 133 rows | 6 queries, 133 rows | 3 queries, 5 rows |
| Admin trace overview | 16 queries, 688 rows | unchanged; capped at 2 concurrent per isolate | |

## Rollout on Sources-QA

1. Apply migration 0095: `wrangler d1 migrations apply DB --remote -c wrangler.dataset-qa.jsonc`.
2. Deploy. The QA config now sets `FEED_READ_CACHE_ENABLED` and `D1_READ_SESSIONS_ENABLED`.
3. Turn on read replication for `distilled-news-qa-v3-fresh`: in the Cloudflare dashboard on the database's settings, or through the D1 REST API with `{"read_replication":{"mode":"auto"}}`. Without it, sessions still work and use the primary.
4. Optional, when you're ready: set `EDITION_ARTIFACTS_ENABLED=true` and `EDITION_ARTIFACT_BACKFILL_ENABLED=true`. Watch for `edition_artifact_backfill` log lines. When one reports `"candidates":0`, the backfill is done and its flag can be removed. It writes private R2 objects only.
5. Measure with `QA_BASE_URL=… QA_EMAIL=… QA_PASSWORD=… node scripts/load-qa-reads.mjs --steps 10,20,50,100 --seconds 60`.
6. Send Query Insights for the hour after deploy: `wrangler d1 insights distilled-news-qa-v3-fresh --remote --timePeriod 1h --sort-by reads --limit 15` (and again with `--sort-by time`).

Rollback: remove the flags and redeploy. The 0095 table and triggers are harmless when unused.

## Deferred, pending measurements

- **Poll jitter.** Collection runs are keyed by 5-minute clock buckets, so all sources start a run at the same minute. At QA scale that is about 30 polls per 5 minutes. Spreading them would move some polls across the reporting cutoff, which changes which items land in a window. It is worth doing only if Query Insights show that minute dominating writes.
- **Batched dispatch writes.** Same reason: no measurement yet shows they matter.
- **Progress counters.** `productPublicationProgress` still counts the feed's jobs on a cache miss. A trigger-maintained counter would add a write to every job transition, the same write amplification as window readiness. With the status cache, the count runs at most once per feed per 15 seconds per isolate.
- **The admin trace's `sqlite_master` read.** It is a read of the small schema table, and some tests create tables mid-run, so a process-wide cache would be unsafe. The concurrency cap addresses the actual overload.
- **Other indexes.** Query plans on the hot read paths show no full table scans after the availability fix. Covering indexes on `v1_jobs` would add write cost to every job update, and SQLite cannot cover these JSON expressions anyway.
