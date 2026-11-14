# Transactional briefing recovery staging rollout — 2026-11-13

Branch: ghada/v4-transactional-briefing-recovery.
Base: integration/v4-transactional-readiness at 39080382.
Code commit: 0be1250c (queue backoff fix carried forward from a7acead2).

The base already contains cutoff delivery, late-evidence carry-forward, private R2 paid-response checkpoints and canonical V3 priority readiness. The carried-forward fix prevents failed D1 diagnostic writes from losing explicit queue retry delays. The dedicated readiness wake handler and projection maintenance remain intact. Existing rollout flags are preserved; the new projection and archive flags are not enabled broadly by this deployment.

Validation: 54 tests across queue handling, publication priority, transactional readiness, response checkpointing, semantic operations and real publication integration passed. Worker TypeScript, web asset build, staging bundle dry run and separate merge review passed. Four pending staging migrations were applied: 0088_push_settlement_lookup.sql, 0089_transactional_window_readiness.sql, 0090_verified_edition_delivery.sql and 0093_cutoff_readiness_relay.sql. The first attempt hit D1 overload; the retry succeeded. A final remote ledger check found no pending migrations.

Live observation at 12:39:55 UTC: the Lebanon feed API returned 200. Edition b57a6a8788e92787c0e9571432d69cfa224ca9e4d927cbfd16f368cdde2c5af1 published at 11:58:24 UTC for intended delivery 07:30 UTC. This occurred before this branch deployment. Later 12:00 and 12:30 UTC windows remained pending, with 137 reviews pending. This is evidence of publication recovery, not acceptable delivery latency or proof that D1 overload is resolved. No factual-quality evaluation was performed in this rollout.

Deployment confirmed: staging version fe6d3176-e066-4a8f-b229-4fe158aff293 at 12:42:22 UTC, serving 100% traffic. Post-deployment page and feed API checks both returned HTTP 200. Latest published edition remained the 11:58:24 UTC edition above; later on-time publication is not yet established.

## Follow-up: remaining publication blocker

Code 8f1ed652 corrects the backlog catch-up eligibility lookup. A live trace showed publication failing with D1 overload while Query Insights measured the catch-up candidate query at 15,677 ms and 85,169 rows. EXPLAIN showed its correlated paid-window lookup scanning the general feed/kind index despite the existing v1_semantic_intent_budget index. The corrected indexed variant, measured read-only on staging, used 27 rows and 1.2477 ms. This is one query comparison, not a sustained service latency benchmark.

A new retained-history regression failed at 252 rows before the fix and passed after it. All 12 catch-up tests passed; the separately added missing-index compatibility test also passed (13 tested cases total). Worker TypeScript, staging dry run and separate review passed. Payment identity, uncertainty fencing, eligibility predicates, source visibility and editorial policy are unchanged. Older self-hosted schemas fall back only on the specific missing-index error.

Staging deployment: ec4e9680-880a-49a0-a73c-548b8c406d73. A saved-answer-only replay of the oldest pending edition reused 16 responses with zero provider calls and identified the next incomplete coverage audit. Its existing queue identity was woken after deployment. Final publication and subsequent schedule recovery remain under observation.

## Follow-up: final-publication source hydration

A later real trace reached all 25 model steps, including verification and repairs, but failed during final edition construction at a single-revision SELECT. The frozen edition contains 913 source revisions. v3Edition loaded each one sequentially through tx.revision, repeating that work on a rejected or interrupted transaction. Its transaction computation reached 32 seconds before the observed D1 overload.

Code f0352fcd calls the existing transaction-scoped preloadRevisions before the unchanged validation/construction loop. This replaces 913 individual hydration requests with 11 batches for this input. Every frozen revision is still checked, including missing/foreign failure behavior; live source authorization and final CAS remain authoritative. The new regression failed with three individual reads before the fix, then passed with all three supporting citations retained. All 15 targeted hydration/citation/cutoff/revocation/replay tests, TypeScript, staging dry run and separate review passed.

A read-only replay against the actual frozen input and retained semantic results returned a publishable eight-item result, reusing all 25 paid answers with zero provider calls. This establishes replay and editorial pipeline completion, not live publication or independent factual-quality acceptance. The corrected Worker is being deployed and live publication remains the required final check.

Live publication confirmed on the deployed bulk-hydration version c6c2706c-e351-41d3-85b5-ab4f50c25c48: edition 7cee72288ebe24160d83996461dbda5b2dfac7db85e11731aaede22e942cf313 became DONE/PUBLISHED at 13:40:46.945 UTC (15:40 Beirut), for intended delivery 12:00 UTC. The public feed returned HTTP 200 with this edition first at 13:43:10 UTC. The Worker trace reports PUBLICATION SUCCEEDED, 11 preload queries, zero individual revision reads and no MODEL_OPERATION stage on that final saved-result publication attempt. Its full invocation took about 26 seconds. A separate read-only real-data hydration probe validated all 913 revisions with 11 bulk queries and zero point reads, writes or provider calls; its CAS retried source/feed changes before succeeding. Later 13:00 and 13:30 UTC windows remained pending at this check. D1 overload responses still occur intermittently; this proves recovery of the blocked edition, not production-wide on-time delivery or complete backlog clearance.

Automatic follow-through: the untouched 13:00 UTC window was superseded at 13:47:01 UTC. The 13:30 UTC window then acquired a normal execution lease at 13:48:42 UTC and saved fresh editorial results from 13:49 onward without an operator wake for that window. A direct readiness check showed no intake hold or pending collection and an existing automatic dispatch claim. This verifies automatic progression beyond the recovered edition; the next edition's final publication and sustained on-time scheduling are not yet established.
