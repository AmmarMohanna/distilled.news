# Evidence-first protocol fix (v2) - local validation

Status: **implemented opt-in; not deployed or model-qualified**. V4 stays selected. The paid v1 experiment, original prompts and all exact retained responses remain frozen and reproducible. No further paid inference, cloud deployment, publication or notifications were performed.

## Fixes

- `architecture: 'evidence-first-v2'` uses passage references instead of model-copied source quotations. The application resolves exact original text, offsets, content digest and source ownership. Unknown, discontiguous, cross-owner and invented references remain invalid; an unexpected `quote` field is rejected rather than silently trusted.
- Previous reader coverage is presented as `P1`, `P2`, etc. The application maps an explicitly selected alias back to its original canonical item ID when constructing the result. Canonical IDs remain in the private result audit, not model bookkeeping. **Null, unknown or ambiguous targets are never inferred**, even with only one earlier item.
- Malformed development records are isolated by their explicit IDs. Valid neighboring developments can reach verification. Duplicate bindings, orphan/missing records and unidentified fragments receive distinguishable `recordFailures` and recoverable source holds. Unknown scope is carried conservatively without inventing a semantic assignment.
- The same isolation applies to targeted repair: one malformed repaired record no longer discards a separate valid repaired record. No repair may expand source scope, change prior-reference fields or importance or introduce a new development. Unrequested fragments are diagnosed and never published.
- Explicitly held evidence is distinguished from genuinely unaccounted input. An invalid exclusion cannot silently label lost evidence irrelevant or discard a separately validated item.
- Verification still receives all original evidence and fallible development records. Whole source passages appear once in that context; proof metadata does not duplicate the same passage text. Exact application-resolved text remains in the durable audit. Source passages are coarser pointers than selected quotations; semantic accuracy still requires real model evaluation.

Normal generation remains two calls; at most one repair and one recheck gives four. Provider error propagation, native admission/settlement, uncertainty handling and publication validation are unchanged. No semantic keyword rules, framework, extra agent, database migration, queue or environment switch was added.

This is a protocol revision of the same candidate, not a new V3 editorial architecture or a promotion of V7. The old `evidence-first-v1` selector keeps its exact behavior. The Worker freezes v1/v2 as distinct input fingerprints, and recovery preserves the selected protocol. Default production selection remains V4.

## Evidence and regression tests

- New failure-first tests cover exact passage retrieval without copying, compact prior mapping, refusal to guess null/unknown targets, mixed valid/invalid records, duplicate/orphan bindings, partial repair, original-source verification, false-approval limitations, source accounting and the four-call cap.
- Historical paid-response replay still reproduces **all 39 original request hashes**, final prose, holds and usage for V4/V7/v1. The older rejection evidence has not been rewritten into a success.
- `v2-offline-controls.json` contains six **explicitly modified fixtures**, derived from the retained v1 responses by removing copied source-quote fields and mapping only already-explicit canonical prior IDs. Prose and factual statements are unchanged. Verification is scripted and labeled as such; these are not new model responses or factual-quality judgments.
- Five migrated fixtures can reach the mock verifier; the Arabic casualty fixture's null update target remains held. This demonstrates contract behavior only. A separate fixture explicitly selects `P1` and confirms canonical persistence without semantic guessing.
- Removing redundant copied quotations reduces the compact fixture JSON by **9-32%** across these six examples. That measures characters in modified saved fixtures, **not actual model tokens, generation latency or provider cost**. The 10% full-pipeline efficiency target remains unproven.
- The local Worker integration tests both v1 and v2 through native durable operations, publication storage and separate reader read-back. Each uses two mocked provider calls, succeeds once and replays without new model calls, duplicate editions/delivery work or feed-pointer changes. Their usage receipts are mocked and must not be represented as paid evidence.

Relevant files: `packages/briefing/src/evidence-agent.ts`, `evidence-tools.ts`, `engine.ts`, additive result types, Worker frozen-input selection, and the new `evidence-agent-v2*.test.ts` regressions. No deployed editor/verifier prompts or routing were changed.

## Verification and next step

**224/224 briefing tests passed** (46 files), including historical paid-response replay. Both briefing and Worker TypeScript projects passed. Three focused Worker/D1 integration cases passed: v1 and v2 persistence/replay, plus partial publication with the held revision recovered into the next window while the accepted source is not re-offered. The full Worker suite is not claimed as rerun for this fix.

Additional paid calls: **0**. V4 remains selected; v2 is opt-in only. Actual new-model compliance, factual accuracy, Arabic writing, important-development coverage, repair rate, cost and latency need a **fresh authorized real comparison**. The unused previous $7 is not treated as permission for another experiment.

The retained fund/METR factual risks are not claimed solved by these mechanical fixes. The next evaluation must check whether the model now delivers accurate, useful items under the revised contract, including valid concise controls and the previously false-rejected casualty figure. Do not promote from mocked results.
