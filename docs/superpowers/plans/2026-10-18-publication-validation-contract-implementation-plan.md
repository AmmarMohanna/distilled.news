# Publication Validation Contract — IMPLEMENTATION PLAN, revision 2

> **For agentic workers:** use `superpowers:executing-plans` to implement this plan inline, task by task, after review. Do not delegate without user authorization. Steps use checkbox tracking.

**Goal:** accurate useful prose passes a justified, evidence-grounded validation contract while materially wrong or unresolved communication remains blocked.

**Architecture:** versioned explicit editorial requirements feed exact provenance checks and complementary claim/fact semantic checks. A three-state decision reducer distinguishes contradiction from uncertainty. Legacy behavior remains the default until a later authorized rollout.

**Tech Stack:** TypeScript, Zod, existing Workers/D1 document transactions, Vitest; no new provider or package.

**Spec:** [actual design specification](../specs/2026-10-18-publication-validation-contract-specification.md), including [label contract revision 2](../specs/publication-validation-label-contract-v2.md).

**Status: approved for refinement only, NOT for execution.** The received review is AI-assisted, not independent human gold, and did not inspect saved-case source/draft appendices or the actual specification. No application code has changed. Complete specification/plan approval and genuine evidence-level review are prerequisites. No inference or deployment is authorized by this plan.

## Global constraints

- Branch `backend-validation-contract`; preserve `backend-briefing-review` and all audit/source-recovery work.
- No deployment, paid inference, budget change, queue replay, historical reset, or performance optimization.
- Keep exact security/provenance gates, correction protection, CAS/leases and paid-operation accounting.
- Keep current GPT/Jev choices and one-repair behavior; do not add a fallback.
- No verdict fabrication. Missing compatible saved verdicts remain explicit limitations.
- `UNREVIEWED` null labels are not evidence-level `UNRESOLVED`; optional omission is not a false assertion.
- No legacy success receipt is counted as v2 semantic evaluation. V2 unavailable/unfunded verification leaves the edition unresolved and unpublished.

## Review focus

- Novel facts omitted from prose must receive an explicit editorial disposition; deferred material cannot be resolved by a sibling publication.
- Optional facts actually communicated remain subject to full-claim verification, even though omitted optional facts are not coverage failures.
- A conflicting whole-claim positive/fact negative remains blocked after packet merging and cached replay.
- A source quote with changed words, cross-story ownership, or unresolved speaker cannot pass via typography normalization.
- V2 records cannot reinterpret legacy jobs or cause an uncertain paid operation to be reissued.

## Task 1: reviewed evaluation corpus and provenance

**Files:** existing `benchmarks/validation-audit-cases.json`; normative `docs/superpowers/specs/publication-validation-label-contract-v2.md`; after execution authorization, new `benchmarks/validation-contract-labels.schema.json`, `scripts/validate-validation-labels.mjs`, `scripts/validate-validation-labels.test.mjs`. Private v1 packet and labels remain unchanged; v2 answers are separate.

**Interfaces:** per-case `reviewState`, per-reader-claim support/errors, per-proposition materiality and independent `COMMUNICATED | OMITTED | UNRESOLVED`, exact witnesses and full-scope omission witnesses. Preserve three error kinds: unsupported addition, distorted fact, missing mandatory coverage. Manifest pins immutable source/draft/control hashes; completed labels get a separate digest. `validateLabels(labels, manifest)` returns completeness/provenance diagnostics and derived case outcomes without creating labels or semantic verdicts.

- [ ] Obtain the actual referenced T-batch JSON files if supplied; retain them as AI-assisted v1 review, not independent gold. Do not reconstruct 24 labels from the 12/12 totals. Leave all S-case labels null until actual evidence-level review.
- [ ] Obtain genuine review of the full saved appendices and self-contained controls using v2 fields. Record exposure/assistance; keep AI-assisted, investigator, assisted-human and independent-human strata separate.
- [ ] Write failing tests for missing/duplicate/unknown IDs, null unreviewed versus reviewed unresolved, blank reasons, missing witnesses, changed source hashes, and falsely claimed independence. T08 must have supported surviving prose plus missing required bridge coverage; optional omission is not an unsupported reader claim.
- [ ] Implement validation of supplied labels and a provenance-separated evaluation manifest; never overwrite an existing completed label file.
- [ ] Run `node --test scripts/validate-validation-labels.test.mjs`; require all assertions pass. Commit the reviewed corpus/tools without private article bodies.

## Task 2: explicit requirements and retained editorial work

**Files:** `apps/worker/src/v1-intelligence/editorial-plan.ts`, `editorial-transport.ts`, `editorial-context.ts`, `editorial-work.ts`, `claims.ts`; new `editorial-requirements.ts`, `news-proposition-eligibility.ts` and tests; existing editorial/claim-extraction tests.

**Interfaces:** `EditorialContract = 'LEGACY' | 'EVIDENCE_GROUNDED_V2'`; `MandatoryFactRequirement = {factId,reasonCode,justification,obligationIds}`. Apply the spec's materiality table and complete dispositions `REQUIRED | OPTIONAL_CONTEXT | DEFERRED | NOT_NEWS`. `validateEditorialRequirements(plan, shortlist, contract)` validates references/reasons and protected obligations. Deferred records/resolutions identify exact fact/work IDs. `classifyNewsPropositionEligibility(revision, regions)` returns source-bound versioned eligible/navigation/uncertain spans without altering raw evidence. Legacy normalization stays callable unchanged.

- [ ] Write failing tests: novelty IDs do not expand requirements; missing justifications/reason codes and foreign/duplicate references reject; protected obligations cannot become optional/deferred-as-done; independent S16 remains pending. Evaluate semantic adequacy of materiality reasons against reviewed fixtures, not a new generic-keyword hard gate.
- [ ] Write ingestion-projection tests for navigation regions and exact offsets, genuine article assertions containing dates/“Published”, ambiguous flattened fragments, unchanged raw content hashes, and protected corrections. Do not add a broad number/date deletion heuristic.
- [ ] Add versioned schema, wire aliases, immutable plan fields and exact reference validation. Ensure `mustIncludeFactIds` mirrors justified v2 requirements. No implicit promotion through attribution/certainty annotations.
- [ ] Persist/reconcile fact-scoped deferred material: another target, sibling story, partial same-target coverage, window closure or age cannot resolve S16. Require compatible edition reader witnesses for delivered resolution and explicit evidence for supersession. Preserve protected legacy checks and raw records.
- [ ] Run focused requirements/editorial/context/work tests with `vitest run --maxWorkers=1`. Confirm legacy snapshots and original normalization tests still pass in legacy mode. Commit.

## Task 3: exact prechecks with factual warnings

**Files:** `writer-feedback.ts`, `fidelity.ts`, `publication.ts`; new `publication-prechecks.test.ts`; existing `writer-feedback.test.ts` and `fidelity.test.ts`.

**Interfaces:** `assessWriterDraft(input, draft, allowedSpans, contract)` returns `{blockingIssues, factualWarnings}`. Existing `inspectWriterDraft` preserves legacy behavior. Quotation comparison returns `MATCH | MISMATCH | UNRESOLVED` with same-story evidence witnesses and presentation transformations.

- [ ] Write failing tests for reviewed quotation/duration/price positives, changed quotation words, malformed/nested quote ambiguity, foreign support, unapproved IDs/URLs and missing/duplicate stories.
- [ ] Implement only the spec's paired typography and terminal punctuation equivalences. T21 passes quote-word equivalence; T22 word changes, foreign support, unresolved speaker and nested/unbalanced parsing cannot auto-approve.
- [ ] Convert ambiguous lexical alarms to warnings only with complete compatible verification or existing authorized/funded whole-claim plus fact-level work. A missing/unfunded/incompatible verifier yields `UNRESOLVED`, no publication, no automatic purchase/repair loop and no v2 extractive bypass.
- [ ] Assert warnings alone neither repair nor approve a draft; exact failures still block. Optional communicated facts are fully verified. Run focused tests, including legacy fidelity regressions. Commit.

## Task 4: complementary semantic verdicts and compatibility

**Files:** new `apps/worker/src/v1-intelligence/publication-validation.ts` and `.test.ts`; existing `publication.ts`, `writer-wire.ts`, `model.ts`, `verification-packets.ts`, `runtime.ts` in that directory; `apps/worker/src/types.ts` for the default-off contract option. Tests: `writer-wire.test.ts`, `verification-occurrences.test.ts`, `verification-packets.test.ts`, `approved-synthesis.test.ts`, `scheduled-writer.test.ts`.

**Interfaces:** `ValidationDecision = {status:'ACCEPT'|'REJECT'|'UNRESOLVED', reasons, witnesses}`. `decidePublicationValidation` independently checks all actual factual prose and every required proposition. `verificationCompatibility(savedInput,currentInput)` compares the spec's exact evidence/claim/requirement/execution/paid-evidence manifest, including draft UTF-8 bytes, prompt/packet schema, model/provider and editorial contract. Any changed/missing component is incompatible. `V1_PUBLICATION_VALIDATION_CONTRACT` defaults to `LEGACY`.

- [ ] Write failing tests for both claim/facet conflict directions, missing facets, false source-only witnesses, wrongly communicated optional facts, unknown speaker/time role, subject–predicate–quantity/unit swaps, modality, negation, causation and pending corrections. Require real matching reader prose for every mandatory proposition.
- [ ] Add a compatibility mutation matrix: revision/hash, feed/story/fact IDs, draft bytes, context, language/history, prompt, packet schema, semantic policy, model/provider route, editorial contract/version and paid token linkage. Any mismatch or absent manifest cannot reuse a legacy success as v2 verification.
- [ ] Preserve individual fact facets and whole-claim entailment; add the explicit three-state reducer and source-bound attribution/time context. Keep packet negative dominance and uncertainty blocking.
- [ ] Persist conflicts as `UNRESOLVED/SEMANTIC_VERDICT_CONFLICT` and consistent negative findings as rejection. Preserve paid settlement independently; no new purchase or repair opportunity, unknown-hold release, failed-job reset or CAS bypass. B's archived contradictory verdict remains blocked and historical only if incompatible with v2.
- [ ] Add default-off v2 selection only; leave all Wrangler configs untouched. Run focused suites; commit only after all pass.

## Task 5: verification cost accounting without concurrency changes

**Files:** existing `model-capacity.ts`, `verification-packets.ts`, `latency.ts` as reused interfaces; offline evaluation harness and report. Add counters at existing diagnostic/transaction boundaries after authorization; do not change concurrency or add an exclusive feed turn.

- [ ] Test packet-count upper bounds for zero, one and multiple stories, whole-context admission and pair fallback; use the original-plus-one-repair allowance, not a hidden retry.
- [ ] Record actual payload bytes and configured per-packet reservation bounds before any authorized live test. The spec's static descriptor bound is $0.458352/packet, at most $2.750112 for three stories/two full pair-fallback passes; this is neither spend authorization nor measured v2/provider cost.
- [ ] Report planned/cached/new authorized/unavailable packet counts, upper-bound reservations, actual reported cost, verification wall time and existing lock-held time. Do not double-count reused costs or acquire a new long exclusive turn. Keep actual v2 cost UNMEASURED until its payload exists; actual provider measurements require separate spending approval.

## Task 6: honest offline acceptance report and future rollout gates

**Files:** extend `benchmarks/validation-precheck-audit.test.ts`; new `documentation/PUBLICATION_VALIDATION_CONTRACT_2026_10_18.md`.

- [ ] Replay independent-human, assisted-human, AI-assisted, investigator and controlled-fixture cases separately. Reuse only exactly compatible verdicts; preserve legacy results as historical diagnostics. Record missing/incompatible coverage with network forbidden.
- [ ] Report all three outcomes, false acceptance/rejection counts, actual positive acceptance, unresolved positives, and compatible-verdict coverage. Controlled model-port fixtures are not measured model quality.
- [ ] Require zero known false hard rejections, zero confirmed unsafe acceptances, unchanged exact-gate negatives and no unresolved conflict accepted. Score accuracy only on gold-plus-compatible-verdict cases; report all unreviewed, missing, incompatible and unresolved counts. If that intersection is empty, final semantic accuracy is **UNMEASURED**, not 0% errors.
- [ ] Run `corepack pnpm --filter @distilled/worker exec vitest run --maxWorkers=1`, `corepack pnpm -r typecheck`, and repository builds relevant to changed code. Investigate failures without relaxing assertions.
- [ ] Commit the separate branch for review; push only if branch-push authorization is clear. Do not merge/deploy/initiate live tests. A representative independently reviewed holdout, not used for tuning, and a separately budget-authorized controlled staging publication are mandatory later gates before rollout. Report remaining gaps before latency work.
