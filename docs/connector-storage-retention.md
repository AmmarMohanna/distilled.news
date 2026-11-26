# Connector storage retention

The Worker keeps connector batches below 2 KiB inline. Larger RSS and provider batches register an upload in D1, write to `RAW_ARCHIVE` under `connector-batches/v2/`, and verify the checksum by reading the object back. D1 consumes the upload intent atomically when it attaches the reference. The sweep retries deletion by exact key for unattached uploads after a 24-hour grace period. A sweep claim prevents a late writer from attaching the object. The repository still reads inline rows and legacy `connector-batches/v1/` objects. Keep both prefixes outside general lifecycle rules because unfinished polls may need them for recovery. The upload sweep covers journaled writes. It cannot identify unjournaled legacy orphans.

New intake handoff records store the SHA-256 digest of the canonical request. Scheduled maintenance compacts existing handoff records in batches of up to 25, preserving their exact replay and conflict checks. Canonical observations and receipts have their own records. Completed provider polls store a coverage summary for the scheduling watermark, while pending polls keep their full continuation data.

Migration `0101_connector_batch_expiry.sql` records expiry seven days after a scheduled RSS or provider poll successfully finishes. It covers the final receipted batch. Earlier pages, previously completed poll rows, direct diagnostic batches, and pending or blocked work keep their existing retention. Before deleting an expired R2 object, the sweep retains the D1 coverage summary, identity fence, and counts. A transient deletion failure backs off for two minutes. An invalid or out-of-scope reference is quarantined in `connector_batch_expiry.quarantine_reason`, along with the original record for inspection. Other due batches continue. Canonical evidence and the original source objects used for acquisition and citations retain their own lifecycle.

With `STORAGE_MAINTENANCE_ENABLED=true`, the Worker runs compaction and expiry and defers scheduling new connector polls when reported D1 allocation reaches 9 GB. Existing scheduled polls and publication recovery keep their processing paths. On a queue-scheduled Worker between 9 and 9.5 GB, an operator can send an authenticated `POST /api/internal/storage/collection-canary` with `feedId` and `sourceId`. A 4 MiB transactional write-and-cleanup probe must succeed without growing reported allocation. A successful probe grants one admission for that source and expires after 15 minutes. An intervening allocation change invalidates the grant, and a deployment-wide cooldown limits repeated probes. The feed's other due work remains scheduled for rechecking. General admission resumes when reported allocation falls below 9 GB. If the canary is rejected or the database remains above the threshold, plan storage reclamation or a verified compact database cutover before reopening general admission.

Apply migrations `0101` and `0102` before enabling the new code. Keep a reader that understands digest handoffs and both archive formats available for rollback. An older Worker cannot replay the new tracked archive format. The local checks exercise expiry, recovery, and real SQLite page reuse. Production capacity at 1,000 feeds still requires separate qualification.

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
