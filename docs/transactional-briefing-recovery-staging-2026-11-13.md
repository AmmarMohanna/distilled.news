# Transactional briefing recovery staging rollout — 2026-11-13

Branch: ghada/v4-transactional-briefing-recovery.
Base: integration/v4-transactional-readiness at 39080382.
Code commit: 0be1250c (queue backoff fix carried forward from a7acead2).

The base already contains cutoff delivery, late-evidence carry-forward, private R2 paid-response checkpoints and canonical V3 priority readiness. The carried-forward fix prevents failed D1 diagnostic writes from losing explicit queue retry delays. The dedicated readiness wake handler and projection maintenance remain intact. Existing rollout flags are preserved; the new projection and archive flags are not enabled broadly by this deployment.

Validation: 54 tests across queue handling, publication priority, transactional readiness, response checkpointing, semantic operations and real publication integration passed. Worker TypeScript, web asset build, staging bundle dry run and separate merge review passed. Four pending staging migrations were applied: 0088_push_settlement_lookup.sql, 0089_transactional_window_readiness.sql, 0090_verified_edition_delivery.sql and 0093_cutoff_readiness_relay.sql. The first attempt hit D1 overload; the retry succeeded. A final remote ledger check found no pending migrations.

Live observation at 12:39:55 UTC: the Lebanon feed API returned 200. Edition b57a6a8788e92787c0e9571432d69cfa224ca9e4d927cbfd16f368cdde2c5af1 published at 11:58:24 UTC for intended delivery 07:30 UTC. This occurred before this branch deployment. Later 12:00 and 12:30 UTC windows remained pending, with 137 reviews pending. This is evidence of publication recovery, not acceptable delivery latency or proof that D1 overload is resolved. No factual-quality evaluation was performed in this rollout.
