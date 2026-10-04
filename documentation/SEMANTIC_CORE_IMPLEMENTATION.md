# Semantic core implementation checkpoint

This report describes the implemented branch `codex/v1-downstream-pipeline`, with final code milestone `1601777211ed8d5851a05ce93a8b6beddf7689dc`. This separate report commit follows the tested code milestone. It does not authorize deployment or claim measured editorial accuracy. The binding request is preserved in `SEMANTIC_CORE_SPEC.md`; the frozen architecture and shared connector contracts remain unchanged.

## Milestones and storage

| Milestone | Commit | Result |
|---|---|---|
| M1 | 5473349 | Synchronous Event/Storyline matcher ports |
| M2 | d7cd93c | Exact ClaimMention and SourceDocument records |
| M3 | 3606678 | Retained communication ledger and correction obligations |
| M4 | 2d21506 | Durable bounded semantic operations and JEV modes |
| M5 | 51420d7 | Semantic escalation and independent rematch recovery |
| M6 | df7661e | Supported semantic graph and structured Storyline memory |
| M7 | 9fa0150 | Persisted shortlist and protected overflow |
| M8 | 5a94f47 | Comparative EditorialPlan and plan-driven selection |
| M9 | ef7af0e | Selected-plan writer and retained fact bindings |
| M10 | 1601777 | Reader fidelity, recovery fixes and engineering replay |

No migrations were added. New immutable sidecars use the existing `v1_feed_documents` store. Existing mutable kinds, feed/source epoch CAS, source checkpoints, intake ordering, D1/R2/Queues, publication intents/reservations/drafts/verification settlement, retained immutable editions, delivery and source authorization remain in place. Claim/proposition lookups now preload bounded batches instead of reading each new ID separately; scope and immutable-conflict checks still apply.

## Files changed

Changes are confined to worker integration (`apps/worker/src/index.ts`, `types.ts`) and `apps/worker/src/v1-intelligence/`, plus the implementation plan, preserved specification and this report. Modules include claims, matchers, semantic provider/operations/routing/preparation/construction/state, rematch, ledger, shortlist, comparative planning, editorial/scoring, writer/publication/model, fidelity, store and their focused regression/replay tests. No migration, connector implementation, shared contracts package, browser package or production configuration was changed.

## Implemented pipeline

Approved source -> intake -> exact EvidenceRevision -> SourceDocument/ClaimMention -> bounded current Event/Storyline retrieval -> durable JEV judgments -> consequential/uncertain construction escalation -> synchronous fenced canonical consumption -> EventMembership plus semantic sidecars -> structured Storyline memory -> persisted shortlist plus actual reader ledger -> one bounded comparative EditorialPlan -> hard-budget selection -> selected-plan writer -> exact quote/entailment/preservation/fidelity verification -> immutable edition -> recoverable ledger projection and delivery.

Models never run inside the feed CAS transaction. Provider failure or unknown outcome does not silently become a successful judgment or quiet briefing.

| Capability | Implemented behavior | Practical limit |
|---|---|---|
| ClaimMention | Immutable exact UTF-16 spans, source text, sentence-level reporting-role hints, attribution, certainty/hedges, quantities, qualifiers, report time and origin metadata | Extraction is a conservative sentence foundation, not a general multilingual semantic parser |
| Entity | Stable feed identity, immutable alias versions, exact supporting mentions and provenance | Canonical labels are model normalization; no external entity graph/resolver |
| Proposition | Lossless TEXT statements tied to exact mentions and EvidenceRevisions | General predicate/argument canonicalization is not implemented |
| StateSlot | Supported controlled attributes, exact value/asOf text, entity/Proposition/mention refs and uncertainty | Opportunistic model interpretation; not a general temporal state solver |
| Event matching | SAME_EVENT, NEW_EVENT_EXISTING_STORYLINE, NEW_STORYLINE or DEFER; epistemic effects independent of structural identity; multi-development grouping | Semantic accuracy is not calibrated/measured; bounded retrieval may miss a relevant older target |
| Event updates | Exact immutable versions/memberships; prior supported claim subsets/entities/slots survive support removal | Canonical memberships remain the sole evidence relation; sidecars do not authorize unrelated facts |
| Storyline | Exact EventVersion refs, grounded propositions/slots, state, chronology, lifecycle, open questions, supported expected date and last meaningful change | Model directives when available; explicitly labeled deterministic memory otherwise |
| Retrieval | Recent/current eligible targets and active roots, alias and lexical priority hints | No exhaustive all-history comparison, vector database or global world state |
| JEV | Documented choice, noul Boolean probability, ordinal score; structure/effect, bilateral entailment, material novelty and editorial priority | Probability concentration is an escalation guard, not a calibrated correctness score |
| Strong escalation | Low concentration, asymmetric/insufficient entailment, material novelty, protected effects, new construction and truncated cheap inputs | Sentence count alone no longer forces strong construction for pure corroboration |
| DEFER/REMATCH | Conservative provisional Events, completed REASSESS, separately queued bounded rematches; any deferred group schedules repair; success follows committed outcome | Three rematch attempts with backoff; exhausted uncertainty remains explicit |
| Origins | Explicit/inferred dependency metadata changes independence counting without adding an approved source | Inferred syndication identity remains uncertain; no unapproved origin facts enter synthesis |
| Ledger | Actual published prose/facts, exact support, targets, visible Proposition links and collectively verified fact bindings; withdrawn seen history retained | Paraphrase bindings rely on contextual verification; projection is outside critical publication commit |
| Corrections | Contradiction/retraction/revision/deletion obligations; backfill also inspects current support; resolution requires supported changed facts and verified visible corrective treatment | Source-status-only notices without supported changed facts remain unresolved |
| Shortlist | Persisted exact facts/support, suspect repetition flags, protected classes and explicit ordinary overflow; old unresolved work remains retrievable | Cheap hints are not permanent semantic judgments; finite ordinary cap remains |
| Protected deltas | Changed state/certainty, contradiction, correction, retraction, source obligations, material qualifier changes and deferred work | Hard capacity may explicitly defer them; they cannot silently become quiet |
| EditorialPlan | Exact target/fact/ledger/obligation refs, new understanding, required facts, rationale, order, treatment and decisions for every offered target | One bounded comparative call; unavailable/oversized/invalid results use labeled fallback |
| Selection | Plan authority precedes synthesis; required older attribution/qualifier evidence is included; hard limits can create explicit deferred work | Exact-version completion fence is conservative for superseded deferred work |
| Writer | Only selected targets/support/plan; BRIEF/STANDARD/DETAILED, facts, attribution, certainty, disagreements, questions and correction context | No tools, search, source expansion or story selection; two-call synthesis/verification budget |
| Verification | Exact stored quote spans, offered-ID validation, contextual entailment, collective required coverage, quantity/date/qualifier floors, complete story coverage, relevant full reader-history novelty and correction-delivery checks | No universal semantic proof; numeric normalization and English floors are conservative, translation relies on model verification |
| Fallback | Existing lexical matcher/ranking remains available; semantic offline plan preserves exact supported facts; whole-document extraction refuses unselected developments | Explicitly weaker than semantic editing; no third paid repair call—publication fails safely when necessary |

## Calls, costs and source boundaries

Semantic operations persist an immutable input/model/policy intent before calling providers, and settle immutable results outside CAS. Replays reuse results. Unknown outcomes are not reissued, retain reservation and close further calls in the budget bucket. Default semantic bucket limits are 20 calls/$0.10 with $0.02 reserved per operation, plus response/input/timeout bounds. Provider-reported overrun fails closed and records the actual charge; a reservation is not a guarantee of the provider's ultimate bill. Strong-model transport defaults to configured GPT through OpenRouter when authorized/configured; model choice remains replaceable. Existing synthesis caps retain at most two calls and a $0.10 briefing budget. The implementation does not establish measured sustained production cost.

Every acquired/semantic/publication input remains tied to current approved FeedSource scope and exact retained evidence. Input changes and current target/reader-history changes are fenced before consumption/publication. No publisher was added, no sources were fetched for the final engineering replay, and no source catalog or production deployment was changed.

## Final review and rulings

One fresh whole-branch reviewer identified seven Important defects and no Critical/minor findings. The fix pass reproduced and addressed: plan novelty omitted from actual required coverage; incomplete reader-history comparison; support-removal scope widening; false correction completion; old-edition completion of newer work; partial/stale rematch loss; source-change recovery before ledger projection; and sentence-count strong escalation. The frozen replay additionally exposed selection of insufficient evidence for older required attribution; a single-Event regression reproduced and fixed it. Test records distinguish genuine assertion RED runs from fixture mistakes or setup timeouts.

Rulings made during implementation:

1. Historical ledger projection uses internally derived immutable edition inserts outside active-feed CAS, permitting tombstone backfill. Cost if wrong: projection must remain internal and scope-bound.
2. TEXT graph truth retains exact source statements instead of generated paraphrases. Cost if wrong: more conservative equivalence/editor work.
3. Correction obligations lacking a supported changed fact and verified corrective delivery remain unresolved. Cost if wrong: source-status-only notices need a future dedicated runtime notice contract.
4. Deferred work completion requires the exact target version and creation before the resolving edition. Cost if wrong: superseded work can need explicit reconciliation.
5. Accuracy, calibration, translation/editorial quality, sustained throughput/cost and corpus quality remain unmeasured. Cost if wrong: engineering evidence must not be presented as editorial-quality measurement.
6. Cross-feed semantic cache reuse is not implemented; source-intrinsic keys support future work while current operations remain feed/revision bound. Cost if wrong: additional calls across feeds.

Deferred minors: none identified by the final reviewer.

## Verification and replay

The final workspace command `corepack pnpm typecheck` passed all seven package typechecks, including the worker. The following checks ran without timeout or assertion inflation:

| Exact command | Result |
|---|---|
| `corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence --maxWorkers=1` | 173 passed, 10 opt-in skipped; 40 passed files, 2 skipped; exit 0 |
| `corepack pnpm --filter @distilled/worker exec vitest run --maxWorkers=1` | 441 passed, 10 skipped, 4 timeout failures; all four passed unchanged in isolation |
| `corepack pnpm --filter @distilled/contracts test` | 44 passed |
| `corepack pnpm -r --workspace-concurrency=1 --no-bail --filter '!@distilled/worker' test` | contracts 44, core 43, connectors 100 and web 5 passed; agent-runtime 261 passed/2 skipped/4 failed; browser-bridge 79 passed/3 failed plus cleanup-hook timeout |
| `node --test scripts/*.test.mjs` | 4 passed |
| `corepack pnpm typecheck` | All seven packages passed |
| `git diff --check` | Passed before final commits |

Focused semantic integration covered claims, graph state, preparation, durable operations, comparative planning, writer integration, support selection and rematch recovery (21 passed). The final writer/model/fidelity regression group passed all 11 tests, including a negative independent novelty verdict. Oversized multilingual construction reproduced an INVALID_REQUEST and now defers before any provider call, preserving normal reassessment/provisional-event/rematch recovery. Seven fresh-review regressions reproduced real assertion failures before fixes and passed afterward.

Worker isolation used `corepack pnpm --filter @distilled/worker exec vitest run <file> -t '<name>' --maxWorkers=1` with these unchanged tests:

- `src/v1-intelligence/editorial.test.ts`: a distinct supported consequence remains eligible while repeated background is recognized.
- `src/v1-intelligence/engine.test.ts`: equal acceptance timestamps do not hide copies; unrelated same-country developments stay separate.
- `src/v1-intelligence/engine.test.ts`: changed evidence reassigns support without mutating old versions; ordered deletion withdraws future support.
- `src/v1-intelligence/publication.test.ts`: restart after durable model draft and grounding resumes publication without a second paid call.

All four passed in isolation. These are resource-sensitive deadline failures, not assertion failures; semantic persistence adds overhead and the broad run is not claimed green. Bounded preloading reduced repeated ClaimMention/Proposition reads without weakening scope or immutability validation. The broad worker run preceded the last novelty/input-bound guards; the final focused v1 run and final workspace typecheck cover those later changes.

Package isolation used `corepack pnpm --filter <package> exec vitest run <file> -t '<name>' --maxWorkers=1`. Agent-runtime ACCESS_DENIED, dormant challenge and closed-loop lifecycle cases passed unchanged. Browser-bridge FENCING and REDIRECT cases passed unchanged. Two unrelated failures remained reproducible:

- Agent-runtime `test/trusted-browser-api-guard.test.ts`: scanner rejects `.dispatchEvent(` in existing `src/browser.ts`; this was reproduced at the initial baseline.
- Browser-bridge `test/bridge.secret-leak.test.ts`: line 95 expects no browser temporary directories after 500 ms, but Windows Playwright directories remain. Synthetic marker sink and disk-hit assertions passed before this cleanup failure; this is not evidence of an observed secret leak. The broad run also timed out in cleanup; the isolated cleanup hook completed.

The agent-runtime, browser-bridge, contracts and core package sources are unchanged from the starting commit. No unrelated browser-source changes were made to force green.

Frozen replay command, with `DISTILLED_SEMANTIC_FROZEN_REPLAY=true` and `DISTILLED_SEMANTIC_REPLAY_STAGE=postfix`:

`corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/semantic-replay.test.ts --maxWorkers=1`

All four tests passed within their original deadlines:

| Cadence | Windows | Published | Quiet | Failed |
|---|---:|---:|---:|---:|
| 30 minutes | 49 | 20 | 29 | 0 |
| 2 hours | 13 | 11 | 2 | 0 |
| 6 hours | 5 | 5 | 0 | 0 |
| 24 hours | 2 | 2 | 0 | 0 |

The same 30 frozen RSS excerpts were ingested chronologically into four independent databases. Corpus SHA-256 remained `16e0a591731274890548418bf7e0db20596659cd9b28a8938308f7db5efa32db`. Exact quote spans, retained graph/edition support, fidelity audits and publication replay were checked. The route was `DETERMINISTIC_FALLBACK_NO_PROVIDER`, with zero model calls. This does not validate live JEV/GPT semantic quality. Initial replay deadline/scope failures and their artifacts remain preserved; the support-selection defect was reproduced and fixed before the successful four-cadence replay.

Local raw logs, corpus, persistent test databases and complete replay provenance are retained under ignored `.local-reports/semantic-core/`. They are not committed. No Recall@K/NDCG, human labels, annotation templates or benchmark-quality claim was generated by this task.

## Deployment and readiness

No deployment. Production activation remains gated by the existing downstream/source/model configuration. This checkpoint implements the engineering mechanisms described above; it does not establish calibrated semantic/editorial quality, general multilingual claim parsing, global shared caching, a general temporal entity solver, automatic reconciliation of superseded deferred versions, or independent correction notices supported only by source lifecycle metadata.

## Implementation classification

- Fully implemented engineering mechanisms: matcher ports, immutable source spans and graph records, durable bounded judgments, scope/race fences, rematch recovery, actual-publication ledger, protected shortlist/deferred work, comparative plan integration, writer/verification plumbing and retained provenance.
- Partially implemented semantics: conservative sentence extraction, entity normalization, opportunistic StateSlots, bounded matching, inferred origins, novelty/correction interpretation and English fidelity floors. These are functioning mechanisms with the limits stated above, not calibrated semantic guarantees.
- Fallback-only validation: the final real-news frozen replay exercised deterministic behavior. Provider interfaces and decision paths were tested with controlled responses; no live semantic provider call was made during this implementation run.
- Not implemented: cross-feed cache reuse, general multilingual claim/argument parsing, general temporal state solving, calibrated editorial quality, automatic superseded-work reconciliation, source-status-only correction notices, or a third paid repair call.
