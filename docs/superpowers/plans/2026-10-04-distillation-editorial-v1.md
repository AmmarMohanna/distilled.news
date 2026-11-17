# Distillation editorial behavior v1 implementation plan

> Execute inline using superpowers:executing-plans and regression-first verification.

**Goal:** Communicate new supported understanding relative to the feed's published history, with interval-aware context and bounded synthesis.
**Architecture:** Extend existing selection metadata and publication inputs. Keep immutable evidence/version/assessment/edition references, source fences and reserved model-call recovery. No reader-memory subsystem or new intelligence owner.
**Tech stack:** Existing TypeScript, D1/R2/Queues, shared contracts, Vitest/Miniflare; a standard timezone library if needed.
**Spec:** User-supplied editorial request in attachment f7925484-147c-41b7-af79-2f2a68056cd9, frozen architecture Appendix C, checkpoint 5116318.

## Global constraints and rulings

- Existing connector wire contracts stay unchanged. Detailed editorial decisions are immutable selection metadata linked to exact WindowScore/candidate IDs.
- Compare actual previously published claims and exact version lineage, not all evidence that happened to support an old event.
- Preserve numerical changes, negation, attribution, uncertainty and unresolved discrepancies. Conservative deterministic equivalence may retain extra information; it must not guess that distinct facts are equivalent.
- Normal live intervals are 30/60/120/360/720/1440 minutes; use IANA timezone/optional local anchor. Historical weekly/UTC objects remain readable and reproducible; weekly is excluded from new live scheduling.
- Quiet windows settle the existing briefing request without an edition or notification job.
- Expensive synthesis follows selection. JEV is optional experimental scoring, not a selector or required runtime dependency.
- Acquisition gold fixtures are not salience/usefulness human gold. Search and verify labels; absent valid labels, quality comparisons remain pending human labels.
- Deployment remains blocked on explicit development/test target confirmation. Continue all independent local work.

## Review focus

1. Corroboration with changed wording must not repeat an already communicated fact; differing numbers/negation must not be collapsed.
2. Published support can contain uncommunicated facts: only published claims count as reader knowledge.
3. A new phase may create a different Event in the same Storyline; continuity must follow stable lineage.
4. Source revocation or publication concurrency must invalidate a stale editorial snapshot before provider/publication effects.
5. DST gaps/overlaps and local anchors must use timezone-library disambiguation; old UTC windows must retain their identity.

## Tasks

### 1. Previous-edition awareness and quiet-window decisions
Files: new `apps/worker/src/v1-intelligence/editorial.ts` and `editorial.test.ts`; extend scoring/selection metadata, publication/runtime regression tests and test utilities.
Produces `EditorialDecision` with exact prior edition/version references, supported new facts, reason codes, inclusion/suppression, context/treatment and repeat penalty. Consumes feed-fenced transaction, target identity/lineage and stored published claims.
- [x] Write real-D1 repeated/corroboration/material-change/uncommunicated-fact tests; run red.
- [x] Implement conservative supported-fact comparison and persist metadata in selections; suppress empty/repeat/corroboration-only windows.
- [x] Verify focused editorial/scoring/publication/runtime tests and workspace typecheck; inspect diff/check; commit and push.

### 2. Live intervals and timezone windows
Files: add schedule helper/test; extend FeedRecord/product configuration/runtime and additive migration only if current product fields cannot express duration.
- [x] Test all six durations, Beirut delivery anchor, DST forward/back transitions, historical UTC reproduction and weekly exclusion.
- [x] Use standard timezone-aware logic; persist concrete window bounds/configuration without six ranking engines.
- [x] Verify integration/types; inspect diff/check; commit and push.

### 3. Explainable reasoning, adaptive treatment and storyline synthesis
Files: editorial/scoring/publication/model and behavior fixtures.
- [x] Test quiet/noise/low-information windows, fewer-than-budget stories, 30m versus 24h treatment and long-window storyline grouping.
- [x] Derive treatment/context from supported delta, complexity and interval; pass this guidance to bounded synthesis, retain exact provenance.
- [x] Verify scores remain distinct, deterministic filtering occurs before generation, and no forced story count; commit and push.

### 4. Disagreement and uncertainty preservation
Files: publication/model/grounding fixtures.
- [x] Reproduce conflicting quantities and caveat loss in synthesis.
- [x] Preserve each material side with exact evidence support; reject/remove outputs that invent consensus or discard required caveats.
- [x] Verify model reservation/recovery and historical support regressions; commit and push.

### 5. Optional scorer and evaluation seams
Files: focused salience scorer adapters, frozen unlabeled evaluation inputs/schema and reproducible harness; separate storyline-change experiment.
- [x] Inspect existing JEV provider and labels; reuse suitable transport, not browser action-choice logic.
- [x] Test deterministic scorer and synthetic JEV/GPT adapters with strict schema/budgets/fallback; no production promotion.
- [x] Implement valid Recall@K/NDCG/noise/omission/repeat/information-loss metrics only with appropriate labels; report pending human labels separately from measured latency/cost.
- [x] Verify harness reproduces input identities and never changes frozen labels; commit and push.

### 6. Whole-phase behavior review and verification
- [x] Review important-information suppression, continuity, uncertainty, exact provenance, quiet windows and unnecessary abstractions.
- [x] Run affected focused and broader suites, full worker, contracts, workspace types/builds and practical workspace tests; isolate failures without weakening assertions/timeouts.
- [x] Push implementation checkpoints; close with final report commit and verified remote/clean status. Deployment remains pending a confirmed authorized target.

## Progress ledger

Starting local/remote HEAD verified clean at 5116318a7744f3f0da61f68a6bff5443c8296fb3 after fetch.
Pre-flight: Tasks 1/3/4 share EditorialDecision → SelectionRecord → SynthesisInput; retain optional fields for historical selections. Task 2 supplies interval duration/context to the same window policy. Task 5 returns EventSalienceAssessment-compatible values; it cannot override WindowScore or selection.
Ruling: Native inline execution and logical pushes are explicitly authorized by the attachment; no ordinary plan approval pause.

Milestone A review/verification (2026-10-04):
- Actual published claims, exact immutable targets and stable storyline lineage determine communicated state. Supporting-but-uncommunicated facts remain eligible.
- Narrow lexical equivalence retains argument order, tense/progressive distinctions, punctuation attribution, quantities/signs/units/operators, negation and caveats. This is conservative deterministic equivalence, not general semantic entailment.
- Immutable SelectionRecord metadata stores supported delta, typed decisions/context/treatment/repeat penalty and exact prior references. No new table or shared connector contract was introduced.
- Communication fingerprint invalidates stale selection/WindowScore context. Publication and provider reservations recheck it. Known settled jobs may resume with a new communication context while retaining consumed calls/tokens/cost/attempts; unknown provider outcomes remain closed.
- Source-epoch changes trigger selected-support revalidation before another provider call. Unrelated approved ingestion remains permitted; revocation stops provider use.
- Quiet runtime windows settle the existing request DONE without edition, synthesis or delivery. Direct empty publication is rejected before opening jobs.
- Regression-first reproductions included repeated output, lost uncommunicated facts, numeric/attribution false equivalence, stale cache/commit, stale-job recovery, revocation and harmless concurrent ingestion. All concrete review findings were fixed; independent review reported no remaining important A finding.
- Final focused command: corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/editorial-facts.test.ts src/v1-intelligence/editorial.test.ts src/v1-intelligence/scoring.test.ts src/v1-intelligence/publication.test.ts src/v1-intelligence/runtime.test.ts --maxWorkers=1 — 5 files, 29 passed (122.56 s).
- Earlier publication-recovery runs hit the existing 5 s deadline under load; isolated rerun and final sequential focused run passed without changing its timeout/assertions. Newly authored multi-stage fixtures declare 15/25 s limits from creation.
- Contracts: corepack pnpm --filter @distilled/contracts test — 44 passed. Workspace types are rerun before commit.
- No deployment, remote migration, real model/provider call or production proof in this milestone. Tasks 2–6 remain in scope and follow this checkpoint.

Milestone B verification (2026-10-04): six live intervals with IANA local anchors and explicit DST policy; historical UTC weekly retained, live weekly excluded. Focused product/schedule/runtime/scoring/RSS: 34 passed, 1 opt-in live RSS skipped. Full API: 50 passed, including regression-first anchor preservation. Workspace typecheck: all seven projects passed. Review found and fixed legacy cadence override and stored-anchor reset. Worker dry-run bundle passed with --containers-rollout=none; full workspace build completed web and worker bundle but existing container build requires unavailable Docker. No deployment or remote migrations. Milestones C-I remain in scope.

Milestone C/F/H: interval-weighted WindowScore, typed adaptive guidance, long live Storyline targets, delta-covering evidence choice, bounded recent synthesis context and conservative explicit boilerplate suppression implemented. Important review defects (material clause suppression, lexical false irrelevance, unbounded model history) corrected. Focused18pass +facts/model6pass; publication recovery isolatedpass unchanged5s timeout. No new table/shared contract. G and I/evaluations remain in scope.

Milestone G: extended existing grounding call with required-fact preservation and reader-visible coverage, whole-story reading budget, negation/caveat guards. Regression RED reproduced truthful one-sided loss and missing uncertainty. Review found collective-verdict clipping and split-negation holes; both fixed with fixtures. Final preservation7pass. Broader run editorial11+treatment4+preservation5 passed; publication8 hit unchanged5s deadline and isolated full file is being rerun. Experimental scorer work/evaluation remains in scope.

Milestone I/evaluation: deterministic live scorer seam and experimental JEV/GPT adapters, separate Storyline judge, frozen unlabeled corpus, strict input/output-bound human label contracts and event/distillation metrics implemented. Actual deterministic measurements zero calls/cost; native provider experiments unavailablelocalkeys; quality pending genuinehumanlabels. Synthetic transports/arithmetic only are not human gold. Cost-overrun accounting review defect reproducedREDandfixed; late-result/unknown-call closure tested. Independent final review no materialremainingfinding. Broaderverification follows.

Latest I focused verification: scoring/treatment/RSS/model/salience/evaluation — 6 files, 20 passed, 2 explicit opt-in skips; worker typecheck passed. User clarified both JEV and GPT must use OpenRouter. Both experimental adapters already do; exact model IDs and a local key are pending, so native calls remain unmeasured.

Final review corrected migration loader compatibility and bounded exact prior material support (0dc01bc). Reviewer reports no further material findings. Full worker corrected rerun:63 files,369 passed,2 opt-in skipped; all earlier SQL/deadline failures passed without assertion/timeout changes. Native OpenRouter smoke subsequently succeeded four calls USD0.000454630 after owner supplied ignored localkey; human quality still pending. Standalone bridge/final cleanpush verification follows.

Final corrected fullworker369pass2skip/63files; standalonebridge82pass; final7workspacetypespass; finalworker-onlydryrunpass5041.88KiB. Rootknownbrowserguardfailurepersists; generation-change scheduling failurepassedisolated5tests. Exact commands and concrete persisted-state examples are recorded in documentation/V1_EDITORIAL_BEHAVIOR.md. Humanlabels/deployedproof remain external dependencies, not claims of completion.
