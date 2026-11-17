# Staging D1 CPU resets ? 2026-10-27

Live Worker logs captured D1 CPU resets on account lookup and session admin-count reads. Accounts contains nine rows and ID lookup is indexed, so this does not prove those reads caused the reset. Retained document volume includes approximately 2.05 GB of resource waits and 2.01 GB of shortlists. No retained data or financial records were deleted.

The per-minute recovery query parsed historical provider receipts and recovery attempts. Migration 0071 adds two partial expression indexes for those metadata fields. When both indexes exist, recovery now seeks history/receipts only for eligible unresolved reservations, retaining global identity backoff and oldest-attempt order. Older unmigrated databases retain their previous query. Unary + on the string reservation ID removes SQLite column affinity so expression-index seeks work; it does not numerically convert the ID.

Deterministic replay: same candidates, 11,569 rows read before and 1,134 after (90.2% reduction). SQL time was 2 ms versus below local millisecond resolution; this is not an end-to-end production latency claim. Missing generation IDs, duplicate receipts, future lease exclusion and global backoff remain covered by regression tests.

API D1 reset/overload errors now return 503, Retry-After: 5 and DATABASE_UNAVAILABLE with a safe temporary-busy message. Unrelated programming errors remain 500. No writes, inference or financial settlement are automatically retried. The existing web feed-list loader already preserves loaded feeds on refresh failure; it was left unchanged.

The two indexes were applied only to staging, verified by sqlite_master and EXPLAIN showing a covering metadata index. Exact logs and before/after measurements are local under .local-reports/preparing-investigation/ and .local-reports/staging-database-reliability/. This is a measured hot-query improvement, not proof all D1 CPU-reset causes are eliminated. Large retained history remains; further fixes should follow observed production-shaped query evidence rather than destructive cleanup.
