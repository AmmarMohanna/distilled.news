# Offline binding-budget preparation

Start with [REVIEW.md](REVIEW.md) for the diagnosis and [PROTOCOL.md](PROTOCOL.md) for arms, source qualification, measurements and stop/go criteria. The earlier frozen negative study is unchanged. No new paid results exist.

Candidate: `packages/briefing/src/compact-selection.ts`. Compares compact-unit selection before composition against corrected immutable statements and a strong one-generation editor, with the same final semantic safeguard. Extra candidate extraction/retention checks are charged, not credited as free baseline work.

## Local commands: no keys or inference

```powershell
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/binding-budget/run.ts --dry-run
node node_modules/vitest/vitest.mjs run --root packages/briefing --config vitest.config.ts test/coverage-first.test.ts test/compact-selection.test.ts
node node_modules/vitest/vitest.mjs run --config evaluation/briefing-quality/vitest.config.ts evaluation/briefing-quality/binding-manifest.test.ts evaluation/briefing-quality/binding-preflight.test.ts
```

`cases.json.gz` contains complete constructed current sources, fixed prior reader text, independent expected facts, event/occurrence IDs, exact evidence spans and pressure metadata. Use Node zlib `gunzipSync` to inspect, or rebuild with `build.ts` **before approval only**. The compressed artifact reduces disk use; it is not inaccessible external data. Code hashes normalize CRLF toLF for cross-platform verification; compressed bytes and JSON input identities remain pinned. Rebuilding after a paid run would create a new protocol, never overwrite its evidence.

## Execution is locked

`run.ts --execute development <private-approval-file>` is available only after a new explicit financial cap tied to the exact protocol hash and a source-only semantic/pressure audit. There is no approval file in this branch. An approval artifact must record a real user instruction: explicitUserApproval, protocolHash, split, ceilingUsd, sourceAudit.status=qualified, compressionChallengePassed and independenceChecked. These are not permission granted by this README. Live account/key allowance and prices are checked only after that gate passes, then the existing persisted campaign ledger enforces the ceiling including unknown reservations. Do not create another root to evade the cap.

The current runner executes all12windows of the approved split. A smaller4-window pilot needs a separately pinned scope before any request. Development and validation must not run concurrently; shared ledger locks and unknown operations are not auto-retried. Validation requires the documented development go decision and explicit scope approval. No final held-out set is enrolled and no production route imports the new candidate.

Estimated unspent costs: $6–12 per12-window split; $12–24 for all24windows. A4-window scope would be roughly$2–4. Nominal/max provider calls:210/288 per split. These estimates require live price verification after approval and can be blocked by conservative reservations even below expected actual usage.