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

## Final audit marker

The exception now adds optional replayDiagnostic: VERIFIED_IDENTICAL_CONTENT_ORDERING_PRESERVED to its durable intake receipt. Ordinary replay retains its existing receipt shape; old receipts remain valid. Contract validation permits this literal marker only on REPLAY decisions. The stored receipt and repeated-delivery identity are tested. No ordering pointer or downstream job is added by this diagnostic. Final verification: 50 Worker intake/evidence/conflict tests and 45 contract tests passed; Worker and contracts TypeScript checks passed. This follow-up remains local, unpushed and undeployed.

## Authorized staging live test

On October 29 Beirut time, the user authorized live testing. Commits a6edc43 and 82a9e7b were pushed and deployed to distilled-news-staging as f9626179-9bfa-4ea1-b448-73b07c9bfa13. No schema migration or frontend change was required. Exact existing asset hashes, queues, model configuration and secrets were preserved; feed/session reads passed and signed-out summary invocation returned 401 without inference.

Read-only observation confirmed the exact original article and all canonical ordering fields remained byte-for-byte unchanged. No new observation of the targeted duplicate arrived during the bounded observation period, so no replay diagnostic was written. Existing cached quarantined receipts correctly retain their original terminal decisions. This is a successful deployment/smoke check, NOT proof that the exception executed live or that the old collection backlog recovered. No live quarantine was manually resolved, no financial record was changed, and no paid evaluation request was made. Protected financial snapshots compare equal. A fresh independent handoff or separately authorized existing quarantine re-evaluation is still required to exercise the exception on this retained item.

Live evidence is in .local-reports/v3-replay-live/; sanitized outcome is benchmarks/results/v3-selective-database-reads/verified-replay-live.json.

## Exact one-quarantine re-evaluation

The user subsequently authorized re-evaluating one retained quarantine. The existing runtime payload verifier independently checked the exact downloaded scoped R2 bytes, including content-address hash, representation, completeness, URL and publisher binding. The existing feed write-turn lease and intake transaction re-evaluated only observation 31aa7795ff7a7bb7f2e648bfddf78c746797e10df119bfd7a575ae24089ed200. No origin authority was asserted to permit replacement.

Live read-back at 2026-10-28T22:34:15.843Z confirmed REPLAY_IDENTICAL / RESOLVED with the dedicated diagnostic. Receipt identity was preserved, canonical evidence and revision JSON remained byte-for-byte identical, no new target jobs appeared, and the existing authoritative-recheck job became DONE. No paid inference or financial-record mutation occurred.

The owning poll had already entered BLOCKED / RETRY_LIMIT before re-evaluation. Its saved response still contains the old quarantine, so checkpoint advancement is NOT yet proven. Re-evaluation does not silently reopen exhausted polls. Resuming that exact poll via recoverConnectorPoll is the separate remaining action; no retry counter was reset or poll recovery initiated in this test. Sanitized evidence is in benchmarks/results/v3-selective-database-reads/single-quarantine-live.json; exact before/payload/after records remain local under .local-reports/v3-single-quarantine/.
