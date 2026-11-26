# Connector storage retention

The Worker keeps connector batches below 2 KiB inline. Larger RSS and provider batches write a scoped, checksum-verified object to `RAW_ARCHIVE` under `connector-batches/v1/` before D1 stores a reference and collection metadata. The repository can still read the original inline rows. Keep this R2 prefix outside general lifecycle rules because unfinished polls may need the object for recovery.

New intake handoff records store the SHA-256 digest of the canonical request. Scheduled maintenance compacts existing handoff records in batches of up to 25, preserving their exact replay and conflict checks. Canonical observations and receipts have their own records. Completed provider polls store a coverage summary for the scheduling watermark, while pending polls keep their full continuation data.

Migration `0101_connector_batch_expiry.sql` records expiry seven days after a scheduled RSS or provider poll successfully finishes. It covers the final receipted batch. Earlier pages, previously completed poll rows, direct diagnostic batches, and pending or blocked work keep their existing retention. Before deleting an expired R2 object, the sweep retains the D1 coverage summary, identity fence, and counts, and journals the object key so a failed deletion can be retried. It does not expire canonical evidence or the original source objects used for acquisition and citations.

With `STORAGE_MAINTENANCE_ENABLED=true`, the Worker runs compaction and expiry and defers scheduling new connector polls when its D1 size check reaches 9 GB. Existing scheduled polls and publication recovery keep their processing paths. The threshold uses Cloudflare's reported allocated database size. Reclaiming row payloads may give SQLite reusable space while the reported file size stays high. Resume capacity should be measured using successful writes as well as observed file size.

For deployment, apply the additive migration before enabling the new code. Keep a reader that understands digest handoffs and archived batches available for rollback. An older Worker that only understands inline data cannot replay these records. The local checks exercise the new formats, expiry, and one recovery boundary. They do not establish steady-state production capacity at 1,000 feeds.

## Qualification for 1,000 active feeds

| Schedule | Windows/day | Average model requests/minute at two calls per nonempty window and 100% nonempty |
| --- | ---: | ---: |
| Every 6 hours | 4,000 | 5.6 |
| Every 3 hours | 8,000 | 11.1 |
| Every 2 hours | 12,000 | 16.7 |
| Every hour | 24,000 | 33.3 |
| Every 30 minutes | 48,000 | 66.7 |

Test these frequencies with staggered and synchronized schedules, representative source volume, and low source overlap. Qualifying a smaller schedule mix requires enforcing that mix at admission. A 1,000-feed burst with two calls each takes at least 100 minutes at the code's default 20 requests per minute. The table excludes repairs, other inference traffic, token limits, and concurrency. Verify the actual production limits for any provider-capacity test.

- **Storage and recovery must pass independently.** Use synthetic inference to exercise acquisition, publication, expiry, an interrupted archive sweep, and D1 write failures. Measure temporary D1 bytes after retention reaches equilibrium, durable D1 growth per day and over 90 days including indexes, and private R2 growth by retention class. Measure guard headroom against outstanding settlements and publications. Keep every scheduled window in the outcome counts and verify backlog recovery without duplicates. A UI history limit leaves storage eligibility and citation obligations unchanged.
- **Provider throughput must pass independently.** With authorized live inference and the effective production admission settings, measure the sustainable rate, burst drain time, deadline misses, retries, and headroom for other calls. Both checks must pass for the schedule mix before increasing production traffic to 1,000 feeds.
