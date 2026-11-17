# Production semantic core implementation plan

> For agentic workers: use superpowers:executing-plans inline, with one fresh whole-branch review at completion. Continue through every task without milestone approval requests.

**Goal:** Transform approved feed evidence into persistent semantic intelligence and a grounded comparative EditorialPlan, preserving publication and intake guarantees.
**Architecture:** Pure synchronous matcher ports consume prepared persisted semantic judgments inside feed CAS. Bounded provider work uses durable intent/result operations outside CAS, following the existing salience pattern. Feed-scoped semantic records project to the frozen EventVersion/EventMembership/StorylineVersion and publication contracts.
**Tech stack:** TypeScript, Zod, existing Workers/D1/R2/Queues and OpenRouter adapters; no new service or embedding infrastructure.
**Spec:** `documentation/SEMANTIC_CORE_SPEC.md` (user-supplied normative instructions); frozen Appendix C remains authoritative for existing wire contracts.

## Global constraints

- Work only on `codex/v1-downstream-pipeline`, starting at `edf7a1493cd7280958c166d7b973b8f3e2a5c806` in this existing worktree.
- Model/network calls never occur inside reassessment/feed CAS callbacks.
- Source approval, epochs, stale ordering, tombstones, exact EventMembership support and immutable editions remain mandatory.
- Meaningful information wins over brevity. Changed state/certainty, contradictions, corrections and retractions cannot disappear through cheap suppression or shortlist caps.
- Fallbacks remain available. UNKNOWN language is preserved. FAILED never becomes QUIET.
- No production deployment, new source discovery, benchmark/annotation work, secret/local report/database commits or historical migration rewrites.
- At each task: RED → GREEN, relevant regressions/typecheck, persisted invariants, self-review, diff/check, logical commit and push; continue autonomously.

## Review focus

1. Changed evidence or approval during a provider call: reject stale result consumption (Tasks 4–6, 8).
2. Lost provider outcome or concurrent delivery: reserve cost and prohibit duplicate calls (Tasks 4, 8).
3. One document contains multiple developments or attributed contradictory quantities: retain each supported mention and side (Tasks 2, 6, 10).
4. A withdrawn edition was read: retain reader ledger and correction obligations (Task 3).
5. A protected delta exceeds ordinary shortlist/output budget: preserve it for bounded editor/defer recovery; never silently discard (Tasks 7–10).

## Task 1 — matcher ports (M1)

Files: new `apps/worker/src/v1-intelligence/matchers.ts`, tests; modify `engine.ts`.
Interfaces: `EventMatcher.match(EventMatchInput): EventMatchDecision`; `StorylineMatcher.match(StorylineMatchInput): StorylineMatchDecision`. Both synchronous. Structural relation and epistemic effects are distinct. Lexical adapters preserve existing matching, role eligibility and timing behavior for this milestone.
- [ ] Add failing integration regression: injected prepared matcher can keep highly similar developments separate; existing API currently ignores injection.
- [ ] Run regression and observe failure.
- [ ] Extract current Event and Storyline matching into deterministic adapters; validate selected IDs against supplied same-feed candidates.
- [ ] Run engine regressions and worker typecheck; inspect immutable support graph and commit/push.

## Task 2 — ClaimMention foundation (M2)

Files: new `claims.ts` and tests; modify `store.ts`, `engine.ts`.
Interfaces: `extractClaimMentions(EvidenceRevision): Promise<ClaimMention[]>` pure hashing/extraction; `persistClaimMentions(FeedTransaction, EvidenceRevision)` consumes exact sentence spans. Stable feed binding plus source-intrinsic content/extractor/policy key. Fields include exact offsets/text, role, attribution, certainty/hedges, quantities, qualifiers, report/event time and dependency metadata.
- [ ] Test durable idempotent spans, quote/hedge/quantity retention, multiple developments and stale evidence isolation; observe missing records.
- [ ] Implement deterministic foundation without claiming semantic extraction quality; retain source-document/extraction provenance.
- [ ] Validate span bounds/exact text against stored evidence; run claims/engine tests and typecheck, commit/push.

## Task 3 — communication ledger (M3)

Files: new `ledger.ts` and tests; modify `editorial.ts`, `runtime.ts`, `store.ts`, lifecycle hooks where needed.
Interfaces: `projectEditionLedger(store, editionId, now)` idempotent post-publication; `rebuildLedger(store, feedId, now)`; transitional exact mention/fact refs later support propositions. Immutable ledger entries plus explicit publication/withdrawal status and correction obligations.
- [ ] Test one exact entry per actually published grounded claim, replay/backfill, withdrawal retention, revised/deleted/contradicted/retracted support obligations.
- [ ] Implement projection outside publication commit, legacy fallback for incomplete projections; obligations never erase seen history.
- [ ] Run ledger/editorial/publication/lifecycle tests and typecheck, commit/push.

## Task 4 — durable semantic relation operations (M4)

Files: new `semantic-operations.ts`, `semantic-provider.ts`, tests; modify existing OpenRouter judgment adapter only where mode support requires.
Interfaces: typed structural/effect, bidirectional entailment, material novelty and shortlist-priority judgments. Provider-neutral choice/boolean/score outputs. Durable immutable intents/results with exact input/policy/model hashes and conservative unknown-outcome accounting.
- [ ] Test actual request envelopes/schema for JEV choice, yes/no and score; malformed outcomes, scope changes, duplicate execution and cost reservation.
- [ ] Verify provider modes against official documentation; implement bounded provider adapters and reusable source-intrinsic operation keys.
- [ ] Reuse salience two-phase semantics; no request in CAS; focused provider/operation/typechecks, commit/push.

## Task 5 — escalation and REMATCH (M5)

Files: new `semantic-routing.ts`, `rematch.ts`, tests; modify runtime durable dispatch.
Interfaces: uncertainty/consequence/construction escalation policy; prepared judgment with exact input fingerprint, fallback/provisional provenance. `REMATCH` state is independent of completed REASSESS and cannot block briefing dispatch.
- [ ] Test low confidence, reverse entailment disagreement, all protected effects, construction, provider unknown outcomes and bounded retries.
- [ ] Implement strong escalation over approved compact memory; DEFER creates conservative provisional state and durable nonblocking rematch.
- [ ] Run runtime/operations tests and typecheck; commit/push.

## Task 6 — semantic graph and structured memory (M6)

Files: new `semantic-graph.ts`, `semantic-state.ts`, tests; modify `engine.ts`, `runtime.ts`, `store.ts`.
Interfaces: first-class Entity aliases/provenance; TEXT Proposition and controlled StateSlot (`count`, `role_holder`, `role_status`, `process_status`, `decision_outcome`, `vote_result`, `monetary_amount`, `percentage`, `date_time`, `score_result`). Prepared construction consumes exact ClaimMention IDs, prior structured state and provider policy. Sidecars project to unchanged canonical support contracts.
- [ ] Test 12→40, may→happened, allegation→confirmation, correction/retraction, similar distinct Event, multilingual aliases, multi-development decomposition and derivative origin.
- [ ] Implement bounded recent/active candidate retrieval (not all-history pairs), semantic Event/Storyline ports preferred with deterministic fallback. Claim references and aliases must be validated against exact approved source support.
- [ ] Persist structured Storyline state with propositions/slots, questions, supported expected next date, last meaningful change and ACTIVE/WATCHING/DORMANT/CLOSED lifecycle. Retain active compact memory independent of age; never repeatedly summarize prior prose.
- [ ] Add origin/dependency metadata; unapproved origin labels affect independence only. Cache intrinsic spans/judgments and exact-evidence construction without cross-feed fact leakage.
- [ ] Run graph/engine/operations/runtime regressions and typechecks, commit/push.

## Task 7 — high-recall shortlist (M7)

Files: new `shortlist.ts`, tests; modify scoring preparation.
Interfaces: bounded compact candidates plus protected overflow; existing assessment signals remain pre-ranking/fallback. No cheap semantic suppression is permanent; include flagged repetition for comparative editor when uncertainty remains.
- [ ] Test protected effects/obligations bypass ordinary caps and old active Storylines remain retrievable.
- [ ] Implement exact supported candidate collection and compact ledger context; preserve deterministic selection for offline mode.
- [ ] Run scoring/editorial/shortlist tests and typecheck, commit/push.

## Task 8 — comparative EditorialPlan (M8)

Files: new `editorial-plan.ts`, tests; runtime/scoring integration.
Interfaces: typed persisted plan with target/support, reader state, delta, rationale/relevance, order/treatment, MUST_INCLUDE proposition refs, attribution/certainty/disagreement/questions and correction obligations. One bounded strong call over exact shortlist/Feed/window/ledger state.
- [ ] Test malicious/unsupported references, unsafe omission of protected deltas, stale communication fingerprint, lost outcomes and duplicate delivery.
- [ ] Validate model plan inside deterministic fenced consumption; final selection obeys hard budgets but does not silently lose protected work. Preserve labeled deterministic fallback plan.
- [ ] Run plan/runtime/scoring tests and typechecks, commit/push.

## Task 9 — writer integration (M9)

Files: publication/model integration and tests.
Interfaces: `SynthesisInput.editorialPlan` references exact selected plan, evidence and required facts. Writer communicates selection/order/adaptive treatment; cannot expand it. Ledger projects after actual publication.
- [ ] Test writer receives plan only for selected evidence, preserves BRIEF/STANDARD/DETAILED, quiet makes no writer call and replay cannot duplicate calls/editions.
- [ ] Integrate with existing intent/reservation/draft/verification publication path, language compatibility and communication fencing.
- [ ] Run publication/runtime/RSS regressions and typechecks, commit/push.

## Task 10 — fidelity verification and final replay (M10)

Files: verification enhancements/tests, semantic frozen replay and implementation report.
Interfaces: exact source-span fidelity, entailment, MUST_INCLUDE coverage, attribution/certainty/temporal fidelity and ledger novelty. Repair only within existing bounded policy; otherwise fail explicitly.
- [ ] Add adversarial tests proving material count, hedge, attribution, date and contradiction survive compression; exact quote alone cannot validate false prose.
- [ ] Run existing frozen replay without collection or human annotation; inspect semantic graphs, ledger/plans/support and budgets.
- [ ] Run focused intelligence/editorial/facts/preservation/publication/runtime/RSS/contracts/typechecks, broader worker/package checks where practical. Isolate timing failures unchanged; preserve unrelated browser guard.
- [ ] Fresh whole-branch review, fix material findings via RED→GREEN, final diff/check, commit/push, verify remote HEAD/clean status and report implemented/partial/fallback limitations honestly. No deployment.

## Dependency rulings

- ClaimMention→Proposition→EditorialPlan adds sidecars; EventMembership remains the sole canonical EventVersion evidence support truth.
- Ledger projection follows immutable edition commit, never participates in critical publication commit; missing projection uses legacy history until deterministic rebuild succeeds.
- Semantic operation ports are async only outside CAS; matcher ports consuming their prepared outputs are synchronous.
- M1 deliberately preserves deterministic role gates; M6 replaces those gates with mention-level semantic decisions and conservative fallback where providers are unavailable.
- No human annotations or quality benchmark are requested. Fixtures/replay prove engineering invariants only.
