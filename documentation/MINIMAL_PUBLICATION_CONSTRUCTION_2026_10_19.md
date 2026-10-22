# Minimal publication construction — 19 October 2026

## Implemented boundary

The new V2 construction contract is `minimal-claim-disposition-v1`. It retains groups (`groupId`, short `occurrence`, offered canonical `eventId`/`storylineId`, `structuralRelation`, `epistemicEffects`), confidence, optional source-grounded origin dependency and the required-key `dispositionByUnitId` object. Every offered ClaimMention has exactly one scalar destination: a declared group or eligible BACKGROUND. Group handles are response-local; existing E/L references retain their canonical identities.

Entities, financial/other slots and storyline lifecycle/open-question/date annotations are no longer requested by this publication-critical contract. Explicit extra annotations are rejected, not silently discarded. The existing rich contract remains supported and validated for legacy operations and retained state. The adapter derives membership and background mechanically; empty annotation arrays do not introduce a second semantic authority.

## Confirmed dependencies

| Dependency | Preserved implementation |
| --- | --- |
| Distinct occurrences and overlapping accounts | Canonical relations, authoritative mention dispositions and engine event membership; no fixed group-count rule |
| Quantities, conditions, attribution, uncertainty and timing | `semantic-state.ts` persists source-grounded TEXT Propositions for ClaimMentions, independently of slots/entities |
| Provenance/citations | Immutable revisions, exact mention spans and source ownership remain enforced |
| Updates/corrections/contradictions | `engine.ts` retains canonical identity, semantic effects and protected correction obligations |
| Previously published information | `ledger.ts` and `shortlist.ts` retain published-history and corroboration exclusion |
| Mandatory content and factual support | Editorial proposition text, evidence bindings and existing V2 reader-witness verification remain unchanged |
| Optional enrichment | Existing versioned entities/slots and storyline memory remain readable; absent new annotations do not erase retained historical state |

Entity aliases provide supplementary candidate-ranking context, not an exclusive retrieval or publication gate. Slots provide supplementary structured deltas; text deltas and explicit epistemic effects remain available. No extraction boundaries, source text, concurrency, model choices, financial rules or verifier gates changed.

## Mechanical diagnostics and repair

Validation collects missing/unknown units, invalid/duplicate/empty groups, ineligible background, unknown canonical references and invalid relation combinations in one pass. It also reports explicitly supplied enrichment errors (foreign references, unsupported aliases/slot values and undeclared slot entities), even when the minimal schema rejects the extra fields. Diagnostics contain paths, observed values, invariants and allowed references. Only a completely valid result can reach graph mutation. Minimal repair has a new versioned identity; legacy repair identities remain unchanged. Maximum construction calls remain initial plus one repair. No additional inference stage or automatic retry was added.

## Offline verification

- 19 structural/transport/saved-response tests passed.
- 41 critical tests passed across semantic preparation, continuation, repair, semantic state, V2 publication and six new minimal graph integration cases.
- Six historical saved failed responses remain rejected. Both latest responses diagnose all three invalid slot-entity labels and the unsupported group-local alias; the initial response additionally retains its foreign C8 error.
- Explicit controlled projections of saved assignments without enrichment pass structural validation. These are test fixtures, not runtime salvage, compatible paid verdicts or independently reviewed grouping labels.
- Controlled Anthropic single-announcement construction retains all nine units and connected C5/C6 context. Separate controlled cases preserve multiple independent developments, combine overlapping articles, retain CORRECTS/CONTRADICTS obligations and exclude already published corroboration from new-news selection.
- Minimal valid state reaches actual editorial selection and simulated writing. Provider verification is not fabricated; this does not certify a real publication.
- New integration fixture setup was moved into beforeEach after initial setup-inclusive timeouts; no existing timeout or timing assertion was increased. A history fixture was corrected to use a genuinely later window and assert the existing exclusion of known repeats.

Reproduce the size/CPU comparison with `corepack pnpm exec vitest run --config scripts/vitest.minimal-construction.config.ts`. Results and generated request schema are in `benchmarks/minimal-construction-results.json` and `benchmarks/minimal-construction-schema.json`.

On identical saved evidence, request size falls 16,703 → 13,332 bytes (20.2%); controlled valid response size falls 1,536 → 1,068 bytes (30.5%). Local transport decoding, 100 samples: prior p50/p95 0.195/0.595 ms, minimal 0.082/0.250 ms. This is local decode CPU, not database, inference or end-to-end latency. The conservative construction reservation envelope falls $0.0197884 → $0.0184400 under the benchmark estimator; actual new tokens/cost are unmeasured.

The previous actual initial/repair used 4,114/5,338 input tokens and 630 output tokens each, cost $0.0026536/$0.0031432 and model callback times 7,641/7,010 ms. Removing optional fields may avoid repairs, but no live acceptance or latency improvement is claimed.

## Operational status and remaining gate

No new paid calls, remote mutations or deployment occurred. New cost is $0. Existing cumulative test spending remains $0.0148300. The prior staging Worker remains version `79b9188b-26e5-41f6-a4e4-f478390ec7e6`; production is unchanged and V2 remains disabled there. Global staging V2 remains disabled; the prior private attempt scope is consumed.

Repository-wide typechecks and the explicit `wrangler.staging.toml` dry-run passed. The initial dry-run exited nonzero because the default log directory was sandbox-restricted; rerunning with WRANGLER_LOG_PATH inside the workspace passed. A new real run requires renewed authorization, a fresh immutable attempt scope, reviewed operation allowance and actual available grant/headroom checks. Independent grouping/accuracy evaluation and real construction → writing → V2 verification → persisted edition still need demonstration. Neither the $0.20 total-cost nor under-60-second publication target has been demonstrated by these offline tests.
