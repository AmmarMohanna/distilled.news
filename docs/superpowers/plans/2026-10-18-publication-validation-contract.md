# Publication Validation Contract Implementation Plan

> **For agentic workers:** use `superpowers:executing-plans` to implement this plan inline, task by task, after review. Do not delegate without user authorization. Steps use checkbox tracking.

**Goal:** accurate useful prose passes a justified, evidence-grounded validation contract while materially wrong or unresolved communication remains blocked.

**Architecture:** versioned explicit editorial requirements feed exact provenance checks and complementary claim/fact semantic checks. A three-state decision reducer distinguishes contradiction from uncertainty. Legacy behavior remains the default until a later authorized rollout.

**Tech Stack:** TypeScript, Zod, existing Workers/D1 document transactions, Vitest; no new provider or package.

**Spec:** [publication validation contract](../specs/2026-10-18-publication-validation-contract.md).

**Status:** draft for review. No application code has changed. Independent review labels and specification/plan review are prerequisites for implementation; no inference or deployment is part of this plan.

## Global constraints

- Branch `backend-validation-contract`; preserve `backend-briefing-review` and all audit/source-recovery work.
- No deployment, paid inference, budget change, queue replay, historical reset, or performance optimization.
- Keep exact security/provenance gates, correction protection, CAS/leases and paid-operation accounting.
- Keep current GPT/Jev choices and one-repair behavior; do not add a fallback.
- No verdict fabrication. Missing compatible saved verdicts remain explicit limitations.

## Review focus

- Novel facts omitted from prose must receive an explicit editorial disposition; deferred material cannot be resolved by a sibling publication.
- Optional facts actually communicated remain subject to full-claim verification, even though omitted optional facts are not coverage failures.
- A conflicting whole-claim positive/fact negative remains blocked after packet merging and cached replay.
- A source quote with changed words, cross-story ownership, or unresolved speaker cannot pass via typography normalization.
- V2 records cannot reinterpret legacy jobs or cause an uncertain paid operation to be reissued.

## Task 1: reviewed evaluation corpus and provenance

**Files:** existing `benchmarks/validation-audit-cases.json`, new `benchmarks/validation-contract-labels.schema.json`, new `scripts/validate-validation-labels.mjs`, new `scripts/validate-validation-labels.test.mjs`. Private review artifacts stay in `.local-reports/briefing-latency/validation-contract-review/`.

**Interfaces:** label records contain case ID, meaning, materiality, reasons and source/reader witnesses; omission reasons explicitly identify missing required propositions. The manifest pins source commit and source/draft/control SHA256 files; a completed label file gets a new digest, rather than comparison to the initial blank-template hash. `validateLabels(labels, manifest)` returns completeness and review-provenance diagnostics; it never creates expected labels or semantic verdicts.

- [ ] Obtain the reviewer's 25 saved-case and 24 control judgments. Record prior audit exposure and disagreements; preserve `UNRESOLVED` where evidence is insufficient.
- [ ] Write failing tests for missing/duplicate/unknown case IDs, blank reasons, missing required witnesses, changed source hashes, and label files that falsely identify investigator judgments as independent review.
- [ ] Implement validation of supplied labels and a provenance-separated evaluation manifest; never overwrite an existing completed label file.
- [ ] Run `node --test scripts/validate-validation-labels.test.mjs`; require all assertions pass. Commit the reviewed corpus/tools without private article bodies.

## Task 2: explicit requirements and retained editorial work

**Files:** `apps/worker/src/v1-intelligence/editorial-plan.ts`, `editorial-transport.ts`, `editorial-context.ts`, `editorial-work.ts`; new `editorial-requirements.ts` and `.test.ts`; existing `editorial-plan.test.ts` and `editorial-plan.integration.test.ts`.

**Interfaces:** `EditorialContract = 'LEGACY' | 'EVIDENCE_GROUNDED_V2'`; `MandatoryFactRequirement = {factId,reasonCode,justification}` with the spec's five reason codes; per-fact disposition `REQUIRED | OPTIONAL_CONTEXT | DEFERRED | NOT_NEWS`. `validateEditorialRequirements(plan, shortlist, contract)` validates references, reasons, complete dispositions and protected obligations. Legacy normalization remains callable for legacy records only.

- [ ] Write failing tests: novelty IDs do not expand explicit requirements; missing/foreign/duplicate requirement reasons reject; navigation may be explicitly `NOT_NEWS`; protected corrections cannot become optional; an uncommunicated independent Meta development stays deferred.
- [ ] Add versioned schema, wire aliases, immutable plan fields and exact reference validation. Ensure `mustIncludeFactIds` mirrors justified v2 requirements. No implicit promotion through attribution/certainty annotations.
- [ ] Persist/reconcile deferred material using existing editorial work; assert optional/sibling publication does not mark it delivered. Preserve protected legacy checks.
- [ ] Run focused requirements/editorial/context/work tests with `vitest run --maxWorkers=1`. Confirm legacy snapshots and original normalization tests still pass in legacy mode. Commit.

## Task 3: exact prechecks with factual warnings

**Files:** `writer-feedback.ts`, `fidelity.ts`, `publication.ts`; new `publication-prechecks.test.ts`; existing `writer-feedback.test.ts` and `fidelity.test.ts`.

**Interfaces:** `assessWriterDraft(input, draft, allowedSpans, contract)` returns `{blockingIssues, factualWarnings}`. Existing `inspectWriterDraft` preserves legacy behavior. Quotation comparison returns `MATCH | MISMATCH | UNRESOLVED` with same-story evidence witnesses and presentation transformations.

- [ ] Write failing tests for reviewed quotation/duration/price positives, changed quotation words, malformed/nested quote ambiguity, foreign support, unapproved IDs/URLs and missing/duplicate stories.
- [ ] Implement reviewed quotation presentation equivalences only. In v2 with a compatible semantic path, lexical number/date alarms become warnings at both precheck and post-verification boundaries; without that path preserve fail-closed behavior.
- [ ] Assert warnings alone neither repair nor approve a draft; exact failures still block. Optional communicated facts are fully verified. Run focused tests, including legacy fidelity regressions. Commit.

## Task 4: complementary semantic verdicts and compatibility

**Files:** new `apps/worker/src/v1-intelligence/publication-validation.ts` and `.test.ts`; existing `publication.ts`, `writer-wire.ts`, `model.ts`, `verification-packets.ts`, `runtime.ts` in that directory; `apps/worker/src/types.ts` for the default-off contract option. Tests: `writer-wire.test.ts`, `verification-occurrences.test.ts`, `verification-packets.test.ts`, `approved-synthesis.test.ts`, `scheduled-writer.test.ts`.

**Interfaces:** `ValidationDecision = {status:'ACCEPT'|'REJECT'|'UNRESOLVED', reasons, witnesses}`. `decidePublicationValidation(input, verdicts)` requires complementary claim/fact coverage and exact prerequisites. `verificationCompatibility(savedInput,currentInput)` returns `COMPATIBLE | INCOMPATIBLE` with field diagnostics; absence is not a verdict. New contract selection defaults to legacy and participates in immutable operation input identity.

- [ ] Write failing tests for whole-positive/fact-negative and reverse conflicts, missing/duplicate facets, false source-only witnesses, unknown time/speaker, lost negation/causation/quantity, pending protected corrections, and a reviewed valid supported draft.
- [ ] Preserve individual fact facets and whole-claim entailment; add the explicit three-state reducer and source-bound attribution/time context. Keep packet negative dominance and uncertainty blocking.
- [ ] Persist validation uncertainty without changing provider settlement or buying a repair/verification retry. Assert the archived B verdict blocks; changed prompts/contracts cannot reuse legacy receipts or mutate failed jobs.
- [ ] Add default-off v2 selection only; leave all Wrangler configs untouched. Run focused suites; commit only after all pass.

## Task 5: honest offline acceptance report

**Files:** extend `benchmarks/validation-precheck-audit.test.ts`; new `documentation/PUBLICATION_VALIDATION_CONTRACT_2026_10_18.md`.

- [ ] Replay reviewed labels separately from investigator controls. Reuse only compatible saved semantic verdicts; record exact absence/incompatibility, with network forbidden.
- [ ] Report all three outcomes, false acceptance/rejection counts, actual positive acceptance, unresolved positives, and compatible-verdict coverage. Controlled model-port fixtures are not measured model quality.
- [ ] Require zero known false hard rejections, zero confirmed unsafe acceptances, unchanged exact-gate negatives, and no unresolved contradiction approved. If no reviewed positive has compatible inference evidence, mark final semantic acceptance **UNVERIFIED**, not passed.
- [ ] Run `corepack pnpm --filter @distilled/worker exec vitest run --maxWorkers=1`, `corepack pnpm -r typecheck`, and repository builds relevant to changed code. Investigate failures without relaxing assertions.
- [ ] Commit/push the separate branch for review. Do not merge, deploy or initiate live tests. Report any remaining quality/evaluation gap before returning to latency work.
