# Single-disposition construction contract — 19 October 2026

## Scope and canonical unit

The assignable graph unit is **ClaimMention**, not a new passage identity. `C0`, `C1`, etc. remain request-local aliases for immutable ClaimMention IDs. Their source document/revision, coordinates and extraction boundaries are unchanged. `G0`, etc. are response-local group handles, never persistent event identities.

The new V2 contract version is `claim-disposition-v1`. Its sole membership authority is:

```text
dispositionByUnitId: { every offered C alias: one declared G ID | BACKGROUND }
```

The actual generated schema for the saved nine-unit article is committed as `benchmarks/claim-disposition-schema.json`. Each offered key is required; additional properties are forbidden; destinations are scalar strings, enumerated over offered group handles and (only for eligible units) BACKGROUND. BACKGROUND cannot be a group ID. There is no independently generated `ownedPassages`, group `claimMentionIds` or `backgroundMentionIds` field.

Groups retain event/storyline relation choices, supported entities/slots, lifecycle and optional same-group question/date references. Each has a short `occurrence` description (maximum 240 characters) for debugging/context; this text is not promoted into a source fact. The number of groups is bounded by offered units, not by an editorial three-story limit. Destination references to undeclared groups remain application errors even when the handle was among offered choices.

## Validation and compatibility

Application validation rejects unknown/missing unit keys, invalid or duplicate group IDs, undeclared destinations, empty groups, ineligible background and foreign entity/slot/question/date references. Mechanical diagnostics include code, JSON Pointer, affected identity, observed value, invariant and allowed choices where applicable. Detectable conflicts are collected, rather than reporting only SCOPE_DENIED. Legacy contradictory representations remain invalid and identify the exact competing destinations.

Only after this validation does the adapter mechanically derive downstream `claimMentionIds` and `backgroundMentionIds`. It never changes a destination, discards a unit, merges groups or supplies a missing decision. Existing `parseConstruction`, event relationship validation, source span/provenance checks and canonical graph validation still run before constructed state is consumed. Invalid proposed groups are not partially committed as approved construction; existing deferred/recovery behavior remains intact.

Construction model content is inspected for duplicate JSON object keys before exposing the parsed object, including escaped-equivalent keys. This applies to streaming and ordinary responses. Identical property names in different objects remain valid. Provider receipts and reported usage are captured before content validation, preserving financial settlement even when JSON is rejected. No extra call is made by parsing.

Successful V2 construction receipts retain the schema version, normalized disposition keyed by original ClaimMention IDs, and raw response when supplied by the actual model transport. Failure diagnostics retain original raw output; when compact parsed diagnostics exceed their existing threshold, the parsed response may be omitted but the raw string is preserved. Raw content is private retained evidence, not a console log. Existing bounded provider transport remains in force.

The contract version changes durable semantic question identity. A settled old response cannot masquerade as a new-contract success; existing conservative UNKNOWN fences still prohibit repurchasing uncertain work. The one-repair maximum remains unchanged. Repair receives precise mechanical errors and original rejected output, using the same new schema. No provider, model, grant, lease, CAS or concurrency change was introduced.

The staging three-development safeguard now checks **selected publication work** before synthesis. It no longer rejects a graph solely because it contains more than three events. It does not silently truncate selection or delete graph events.

## Context and grouping quality

Connected original paragraphs containing multiple offered mentions are rendered with exact source coordinates and original unit IDs. They are explicitly non-assignable context. C5 and C6 share their original paragraph, retaining the antecedent for “pursue them.” Adjacency does not force common ownership, and extraction boundaries are unchanged.

The prompt distinguishes occurrences/material updates from topics and paragraphs. Funding, uses, conditions and promised governance can be facets of one announcement. Historical commitments and reactions are not automatically independent new developments; separate new actions, studies, corrections, contradictions and meaningful stages remain distinguishable. No additional classifier or paid deduplication pass was added.

### Saved Anthropic article review — investigator judgment, not human gold

The complete retained five-paragraph article describes a newly announced fund, its allocation/optional allocation terms, possible uses and forthcoming governance information. The $200m employment study is described as an already-made commitment, and public distrust is contextual framing. A defensible hypothesis is one main fund-announcement occurrence with retained supporting/context facts. The text does not independently announce a new $200m study in this report. Governance disclosure is promised, not already completed.

This is an AI-assisted investigator assessment. **No independent human-reviewed event-boundary labels have been supplied.** Human expectations remain PENDING and are separate from the model's previous five-group prediction. The controlled two-group positive replay is a structural fixture, not a claim that two is the correct event count. Neither one nor five groups is treated as quality ground truth.

## Exact replays and tests

Original source/evidence and historical result hashes are checked before private saved-case replay; those artifacts and prior receipts are unchanged.

- Both first-run saved governance-ownership failures remain rejected by canonical validation and by the new contract.
- Both subsequent saved responses remain rejected unchanged. Diagnostics identify C6 → [G2, BACKGROUND] and C7 → [G3, BACKGROUND].
- Controlled positive decisions decode and pass existing source/canonical validation; independent developments remain distinct and overlapping coverage can reference an offered existing event.
- New required-key output has no second membership representation. Missing/unknown keys, prototype-sensitive unknown keys, scalar-shape violations, empty/duplicate/unknown groups, foreign references and ineligible background are covered.
- Streaming/non-streaming duplicate-key tests preserve reported costs. A durable oversized-diagnostic regression preserves exact raw failed output and reuses the receipt without another call.
- A synthetic integration test commits valid construction to the graph, runs comparative editorial planning/selection and invokes a simulated writer. It deliberately stops before verification, without inventing a compatible provider verdict or claiming an accepted real briefing.

Verification: 48 tests passed across the nine-file focused run. The structural rerun passed 26 tests, including one additional unknown-key test; the subsequent transport run passed all 10 tests, adding explicit scalar/reserved-identity coverage. Separate selection-limit and raw-retention regressions each passed, and the offline schema/preflight test passed: **53 distinct tests checked across these runs**. Repository-wide typechecks passed; the final Worker typecheck and explicit staging dry-run passed. No full Worker suite was repeated and no timeout was increased.

Reproduce focused coverage with `corepack pnpm --filter @distilled/worker exec vitest run src/strict-model-json.test.ts src/v1-intelligence/construction-transport.test.ts src/v1-intelligence/construction-owned-replay.test.ts src/v1-intelligence/semantic-model.test.ts src/v1-intelligence/semantic-preparation.test.ts src/v1-intelligence/semantic-construction-repair.test.ts src/v1-intelligence/semantic-continuation.test.ts src/staging-mission.test.ts src/staging-mission-budget.test.ts --maxWorkers=1`. Private historical replay tests explicitly skip if saved artifacts are unavailable. Run the two added targeted tests in `runtime.test.ts` and `semantic-operations.test.ts` by their descriptive names. Run schema preflight with `corepack pnpm exec vitest run --config scripts/vitest.claim-disposition-preflight.config.ts`.

## Separate measurements and next real attempt

New-contract real first-response acceptance, repair success, false splits, false merges and background classification error rates are **unmeasured**, not inferred from fixture acceptance. No reviewed grouping gold exists. Structural evidence coverage is complete by required keys; semantic adequacy remains a separate question. Tests do not establish model reliability.

The saved initial request fits the existing staging envelope: **16,703 input bytes**, reservation upper **$0.0197884**. This includes context/schema and is not an observed token bill. A prospective seven-GPT/three-Jev worst-case provider envelope plus **all $0.0090332 prior failed spending** totals **$0.1776604**, below $0.20. Future actual planner/writer/verifier payloads still require admission. Infrastructure invoice costs are unavailable. No new provider cost was incurred here and no complete-path latency improvement is claimed.

The existing private runner's immutable review marker has already been consumed. Its current nine-GPT cumulative operation limit leaves only five new GPT slots after four settled historical calls; that does not cover a fresh seven-call repair worst case. A new explicitly reviewed immutable attempt scope/call envelope is therefore needed before execution, without deleting old markers or resetting holds. No such new run was activated by this change.

Remaining gates: renewed deployment/spending authorization; reviewed fresh attempt scope; current grant validity/headroom, evidence eligibility and isolation checks; actual real-model construction/verification and factual review. The under-60-second persisted-edition target remains unproven.

**No deployment, activation, paid inference or publication occurred for this correction.** Remote staging remains on `521ef96a-cc4a-431e-8f80-a0a7f764e6bf` from `e38af92`, with its existing consumed private-run scope. Production V2 remains disabled and production is untouched. Local changes are intended for the next separately authorized private staging attempt.
