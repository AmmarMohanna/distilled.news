# Continuous personalized news: offline readiness report

The closed-loop harness is implemented and verified. **No new evidence yet establishes that V4 delivers better editorial quality than a strong continuous single-LLM editor.** No paid model calls ran; actual new model spend is **$0**. Binding-budget experiments, their immutable protocols, prepared cases, earlier negative findings and historical financial records remain unchanged.

## What this evaluates

The actual current V3 generation core with V4 editorial prompt and selected invocation policies is compared with the existing strong one-generation editor. All arms receive identical eligible retained sources, interests, language, 110-word allowance, schedule and common final factual/novelty guard. Every arm starts empty and sees only its own actual committed publications at the next window. Rejected drafts, failures and QUIET results never become reader history. Pre-guard drafts and complete call traces remain available for attribution; this shared research guard is additional to V4's internal verification, not a change to deployed publishing.

The strong service has the same modeled checkpoint/recovery support as V4. The simple scheduled service uses the **same editorial implementation** but lacks automatic prepublication result recovery. It still has persistent history, idempotent publication and UNKNOWN no-resend protection. A shared-checkpoint ablation removes that capability difference. Recovery gains must therefore be credited to operational support, not multi-stage editing.

Existing product clock/cutoff helpers and history publication code are reused. Actual Worker CAS/checkpoint/artifact/UNKNOWN fixtures are tested separately. The portable runner simulates dispatch/storage contracts; it does not measure deployed Cloudflare reliability or reproduce every production intake admission policy. Its fixed whole-sequence retained source pool is identical across arms, while actual reader histories evolve independently.

## New source-derived controls

Two constructed chronologies contain 8 ticks each, 2 reader profiles each, 22 expected developments and 29 source articles in total. English and Arabic interests cover transport/utilities and education/business. Source-authored atomic facts, occurrence identities, relevance and correction parents precede outputs. The sources include attributed uncertain reports, reversals, recurring distinct incidents, unchanged reports, late discovery and quiet opportunities. Complementary developments are not automatically marked superseding.

These are fictional source-grounded controls, not independently reported natural news. No untouched real-news cohort is certified. Windows, translations, profiles and related developments are dependent; there are only two constructed sequence clusters. The smallest proposed pilot uses one cluster and supports descriptive diagnosis only.

## Actual offline results

These measurements use a **scripted reference oracle**, not V4 or a paid LLM. The oracle sees the reference facts solely to exercise history and scoring contracts. It is never used as a candidate generator in the proposed real-model experiment.

| Control, both chronologies | Scheduled jobs | Relevant units recognized at horizon | Interrupted correction delivery delay | Duplicate reader publications |
|---|---:|---|---|---:|
| V4-labeled and strong-labeled scripted arms, minimal-support lane | 64 | All 22 per arm | 120,001 ms | 0 |
| Simple-labeled scripted arm, minimal-support lane | 32 | All 22 | 1,800,001 ms; 4 interrupted jobs fail | 0 |
| All arms, equal-checkpoint lane | 96 | All 22 per arm | 120,001 ms | 0 |

Total: **192 scheduled jobs**, 192 scripted generation executions, 264 dispatch attempts and 24 suppressed duplicate deliveries across both capability lanes. All arms eventually receive the same recognized units in these oracle controls. The 1 ms component is an injected synthetic generation duration, not measured inference speed. Recovery and correction delay differences disappear with shared support. This is the expected harness behavior and supplies no editorial superiority claim.

Regression controls also verify amnesiac repetition, false QUIET, missing/uncertain factual mappings, citation identity, language/profile isolation, stale-history blocking, word-budget rejection and no automatic retry of an uncertain provider request. Parent linking uses actual prior-publication IDs: a parent first mentioned earlier in the same edition is not already communicated reader history. Arbitrary paraphrases and extra contradictory text receive no exact-match factual credit and remain unknown rather than false by default.

## Verification

- **23 new deterministic tests passed** across the five continuous-study files.
- Existing regression runner passed: 411 briefing-engine tests, 193 evaluation tests (170 pre-existing and 23 new), 68 evaluation Python tests, 2 analysis Python tests, 3 exporter tests and five existing typecheck scopes.
- Another 14 research-validation Python tests and 5 coverage-analysis Python tests passed.
- New source-linked continuous-study TypeScript project passed.
- Three selected actual local Worker fixtures passed, with 100 other cases skipped: durable-result recovery, uncertain-operation reservations and verified-edition artifact attachment. Scripted provider receipts in those fixtures are not charges. Full Project CI and production throughput were not established by those three checks.

Commands are in README; public source/code hashes, reference data and results are in EXECUTION_PLAN.json, sequences.json and OFFLINE_VERIFICATION.json. Full scripted trajectories and machine-readable regression logs are retained in the ignored private directory. Only evaluation research files are added; product implementation, deployments, dashboards and published data are untouched.

## Smallest meaningful future pilot and exact cost arithmetic

One complete chronology × 8 ticks × 2 interests/languages × 3 systems = **48 scheduled jobs**, with each system's actual outputs feeding its subsequent history. Independent source-only inventories are prepared without candidate text, but include actual reader history. Therefore each arm needs its own inventory/grounding requests unless complete settled request hashes match. The initially considered shared-source inventory budget was corrected before any inference; matching source pools alone does not justify reuse. Existing GPT-4.1/Claude diagnostic assessment receives blinded candidates and each actual prior history; failed/rejected slots remain unperformed assessment opportunities. Neither judge agreement nor exact string checks are treated as general truth.

| Component | Planned calls | Modeled USD |
|---|---:|---:|
| V4 editor | 16 | 0.339200 |
| V4 mini novelty/verification/common guards | 48 | 0.157440 |
| Strong and simple editors | 32 | 0.678400 |
| Strong and simple common guards | 32 | 0.104960 |
| GPT source inventories/grounding | 96 | 1.920000 |
| Claude source inventories/grounding | 96 | 3.168000 |
| GPT candidate reviews | 48 | 1.440000 |
| Claude candidate reviews | 48 | 2.376000 |
| GPT bounded corrections, 25% scenario | 12 | 0.360000 |
| Claude bounded corrections, 25% scenario | 12 | 0.594000 |
| **Total scenario** | **440** | **11.138000** |

This is exact arithmetic on planning assumptions, not a price guarantee: archived GPT-4.1 $2/$8, mini $0.4/$1.6 and Claude $3/$15 per million input/output tokens. Per-call tokens are explicit in the manifest. Generation/common guards total $1.28; diagnostic assessment totals $9.858. Before corrections there are 416 nominal calls. Planned admission ceilings allow up to 704 calls, including bounded engine stages and up to 96 consistency corrections, but a separate financial ceiling takes precedence and can stop the campaign early. QUIET/cached/failed slots can reduce realized calls. Prices and account balance have not been checked live.

A proposed **$15 exposure ceiling is unapproved**, includes new unresolved reservations and is not guaranteed to finish the worst case. Source acquisition, D1/R2/Queues/hosting bills remain unmeasured and must be itemized separately. No prior hold is cleared or reused. A paid adapter still needs explicit authorization, live preflight and the existing append-only reservation/receipt machinery; the offline injected port alone is not financial enforcement.

## Decision and remaining uncertainty

Proceed only after a separate explicit cap, source/protocol hash validation, live prices/account preflight and safe provider reconciliation. Stop on ambiguous provider outcomes; never replay an UNKNOWN operation. Publication duplication, source-confirmed material factual errors and stale-history publication are safety failures, not excluded samples. Report all scheduled jobs, unresolved assessments, factual/citation findings, delays, failed slots, tokens and costs.

The inherited comparative coverage/factual non-inferiority targets are not relaxed. One constructed sequence cannot establish them for a news population. The pilot can reveal whether existing novelty, correction handling and recovery work under endogenous histories and whether V4's extra generation cost buys any observed coverage advantage. A substantive superiority claim requires independent real-news sequences and event-group-aware uncertainty; there is currently no such evidence. If the strong continuous single-LLM service matches V4, that remains the result.
