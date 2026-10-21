# Automatic storage maintenance verification — 2026-10-21

Target: `distilled-news-joud`, database
`85d1c3a5-1004-4cfc-9da1-dd5a87dab9a2`, existing private raw R2 bucket.

- 27 distinct targeted tests passed across storage maintenance (6), protected
  routes (2), image job dispatch/leases (4), image generation (4), image serving
  (1), and semantic operation identity/accounting (10).
- Worker typecheck, generated Joud binding types, Wrangler dry run and patch
  whitespace checks passed. The new index-only migration 0060 was applied
  remotely after confirming it was the sole pending migration.
- Permanent minute-Cron maintenance was observed in production through its
  persisted cursor and query metadata. Reported database allocation decreased
  from 9,999,998,976 bytes at failure to 9,952,542,720 bytes during recovery.
  The database still reported critical allocated capacity; the legacy backlog
  takes multiple automatic passes to clear. Offloaded JSON-byte counters are
  separate from physical allocation and may undercount overlapping passes.
- Both existing multipart-abort and new diagnostic-prefix 90-day R2 lifecycle
  rules were confirmed remotely. Image and source prefixes are excluded.
- The stalled coconut-in-Australia illustration changed from pending/zero
  attempts to ready/one attempt/no error at 11:06:22.731 UTC.
- Its public sketch route returned HTTP 200, `image/jpeg`, 749,006 bytes and
  valid JPEG magic. The downloaded image was visually inspected: a complete
  violet pencil coconut-palm illustration, not a blank image or placeholder.
- The dedicated image queue's producer and consumer attachment was verified.
  Duplicate deliveries across old and new queues are covered by the lease test.

No manual accelerated cleanup pass was run: automatic approval review rejected
20 immediate passes pending explicit user approval. Scheduled maintenance was
deployed and ran independently as the permanent policy.

This verifies recovery and diagnostic lifecycle behavior, not unlimited storage
or tenant database partitioning. The remaining scaling boundary is documented
in `STORAGE_OPERATIONS.md`. Canonical records and unknown paid outcomes were
excluded from maintenance throughout.
