# Verified duplicate intake replay — local change

The observed clean-feed delay was held by a pending Telegram poll with a BLOCKED checkpoint and a durable QUARANTINE_REVISION_CONFLICT receipt. The incoming message carried telegram_edit_timestamp metadata; its retained current observation had none. Both had the same accepted content hash. The pure revision-ordering policy treats the mixed metadata as incomparable before checking identity of content.

The local intake change acknowledges REPLAY_IDENTICAL only when a proposed UPSERT has independently verified payload content, an active existing revision, identical content hash, the same representation and no completeness downgrade. It does not replace the article or advance current observation, fetch sequence, source revision, publication date, provenance or canonical ordering. Changed or unverified payloads, deletions, foreign ownership and representation downgrades keep existing protection. Stale comparable revisions keep their prior handling.

This is implemented in apps/worker/src/v1-intake/intake.ts. It changes only the conflict decision at intake; the shared ordering policy is unchanged. The regression first reproduced quarantine for a verified duplicate. Controls exercise unverified, changed and downgraded inputs, with existing deletion, CAS, immutable receipt and conflict tests included in the broader run.

This change is local and NOT deployed. It does not automatically resolve retained quarantines. A retained provider snapshot may require an explicit existing quarantine-resolution path before its checkpoint can progress; no live receipt or source record was modified.

## Separate completed work

The priority dispatcher fix (7484310) is already deployed to isolated staging as 5660c75a-f00c-434c-9970-23e34ecda1d6. It skips unknown-outcome windows before selecting the oldest priority candidate, matching the canonical relay. Twenty related tests and Worker typecheck passed. The retained unknown clean-feed request remained PENDING; its send count remained 222 between 20:49Z and 21:01Z, rather than repeatedly refilling the single intelligence lane. This does not eliminate legitimate collection waits.

The authorized six-call verifier trial completed at USD 0.0044108 with every charge reported and settled. It compared identical frozen requests/model/settings, adding only explicit allowance for complete headline-only reporting. Baseline and candidate both caught four factual-error controls and falsely rejected the supported retained headline. The candidate was rejected; no live prompt, model or validation was changed. Exact requests, responses, local task-budget ledger and shared reservation/settlement read-back remain under .local-reports/v3-delivery-diagnosis/. Sanitized results are in benchmarks/results/v3-selective-database-reads/headline-verifier-negative-result.json.

Initial local budget-database initialization failed before admission; read-only proof found zero shared reservations and no provider request. A shorter workspace path fixed initialization under the original authorization/expiry. No provider retries or extra paid trials were run.

## Validation

All 50 tests passed across intake.test.ts, evidence.test.ts and conflicts.test.ts. Worker TypeScript checking passed. The initial positive duplicate regression failed before the implementation change; changed, unverified and downgraded controls passed after correction. The first downgraded fixture also required matching proposal completeness to make its handoff structurally valid; this test-data correction did not change product validation.
