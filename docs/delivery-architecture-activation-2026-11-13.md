# Staging delivery architecture activation, November 13, 2026

## Activated configuration

The staging rollout enables `WINDOW_READINESS_MODE=relay` and `EDITION_ARTIFACTS_ENABLED=true`. The temporary `WINDOW_READINESS_FEED_IDS` allowlist is removed for all eligible staging feeds. Readiness enrollment still requires an open, clock-scheduled V3 request; legacy or ineligible windows retain canonical scheduling. Production configuration is unchanged.

Readiness remains an additional reliable wake mechanism. Canonical source, account, clock, evidence, payment and publication checks remain authoritative. Artifacts store immutable edition payloads in private R2; permissions, viewer state, withdrawal and unavailable-object fallback remain in D1. This activation does not replace every database scan or offload historical evidence.

## Live qualification

- Three stable pending-window shadow comparisons for the real Lebanon feed matched independent canonical counts: zero pending jobs and five retained failed acquisition jobs. The window was `5e218ee316ceebb127019a8e81e91ecffcad8781dcb13951c624f901c71d17cb`, generation 4. Completed requests intentionally retire their projection/outbox rows.
- A real Queue event for the next window `ba4e30e40d8775ec1a7291d221a4319e033cadc992b486e094ac9a9938d48b6e`, generation 3, was sent at 21:26:21.984 UTC and consumed at 21:26:27.600 UTC with one attempt. Three replays of that consumed event executed zero relay callbacks. A later generation retained its own separate identity.
- An isolated private, zero-source staging fixture also demonstrated native Queue consumption and three suppressed duplicates, with zero model or edition records. Its exact private identity, owner, source/scope absence and absence of model reservations were checked before transactional cleanup. The fixture was removed.
- The existing 20:00 edition was projected to a 1,693-byte private R2 object, read back and checksum-verified, then attached through the existing verified-manifest/publication/delivery-job guards. A repeated application retained one reference. Strict qualification disallowed canonical fallback and confirmed identical reader payloads.
- The subsequent 22:30 edition automatically attached a new 1,223-byte R2 artifact in `REFERENCED` state. It contained one independently verified item. No manual publication-state edits or replacement paid operations were used.
- The R2 managed public development domain is disabled. Eight requests per endpoint returned 200 for the public feed and signed-out session API, and 404 for an existing private feed.

## Measurements and limits of the evidence

An identical real single-edition read examined 9 D1 rows in 3 SQL queries through canonical projection and 7 rows in 2 SQL queries plus one R2 GET through artifact delivery. Neither path wrote rows. Payloads were identical. This is a small edition, not an aggregate account cost measurement.

The small sequential HTTP samples did not establish a latency improvement: public-feed p50 was approximately 1,544 ms before and 1,631 ms after; p95 was approximately 3,053 ms and 3,107 ms. There were no HTTP failures in those samples. Shared database/provider load and different observation periods prevent a causal performance claim.

The 22:30 edition recorded publication at 22:32:58.209 Beirut time. Activation is verified; this late publication remains evidence against a production delivery SLA claim. Whole-feed reads still include retained legacy editions, current health and viewer metadata. Source coverage still includes five older unavailable article acquisitions. Other staging feeds have not each undergone an independent long-running parity or performance study.

## Tests and review

The readiness counter/outbox test and all thirteen source-to-publication integration cases passed across the verification runs. These cover artifact publication, immediate private-feed denial, owner reads, withdrawal, corruption fallback, exact source citations and receipt retention. One database fixture setup exceeded its hook timeout; the isolated rerun passed. Worker type checking and the final staging bundle dry run passed. Fresh code review found no blocking issue. Additional cleanup guards were adopted for the isolated smoke fixture.

The staging-only operator helper is `scripts/staging-edition-artifact-rollout.ts`. It defaults to dry-run, accepts an explicit feed, and can attach an artifact only for an already published V3 edition with an existing delivery job. It does not publish stories or change visibility, evidence or accounting.

Private evidence is retained in ignored local reports: the managed worktree's `readiness-live-proof.jsonl` and activation/API snapshots, plus the original workspace's `activation-relay-proof.jsonl`, `activation-native-smoke-proof.json` and `activation-artifact-read-cost.json`. Credentials and source payloads are excluded from this document.

## Rollback

Remove the readiness mode to stop additional enrollment and relay sends; queued wakes recheck the mode. Set edition artifacts off to return reads to canonical projection. Preserve verified objects and all canonical publication, evidence and financial records. Diagnostic archival compaction was outside this activation and remains separately controlled.
