# Minimal construction private-staging evaluation — 19 October 2026

**Published: NO.** One authorized attempt executed; all further paid calls stopped. No writer draft, final factual-verification verdict or edition exists.

## Rollout and admission

Pushed `f89b355` implementation and `cadf124` (operator-scope-only setup) to `backend-validation-contract`. Deployed only `distilled-news-staging`, account `e32b564514d4f9b9e383b7dd30dbb026`, explicit `apps/worker/wrangler.staging.toml`, as Worker **bf873d83-d8b5-4eda-9d86-d804345f4889**. The captured request confirms this Worker version. Rollback version: **79b9188b-26e5-41f6-a4e4-f478390ec7e6**. No migration or frontend change; existing asset prefix, bindings and credentials preserved. Staging database quick_check returned ok before deployment.

Fresh immutable scope: `minimal-construction-20261019-1`. Old scopes and all historical paid records were preserved. Six operator-scope/budget tests and the explicit staging dry-run passed. Core implementation verification is recorded in MINIMAL_PUBLICATION_CONSTRUCTION_2026_10_19.md.

Before spending: prior six calls settled at $0.0148300, no unknown feed operations; active account grant $63 through 2026-10-19T19:15:55.700Z; available account headroom $3.92832423 at final preflight. Allowed providers/models unchanged. Seven prospective GPT calls at $0.0229376 each plus three Jev at $0.002688 each plus prior spending yields **$0.1834572** conservative provider maximum. Atomic per-feed reservation admission also enforces cumulative paid/uncertain exposure plus the next reservation <= $0.20, alongside existing account authorization. Cumulative operation limits count all six prior failures, permitting at most seven additional GPT and three Jev operations. Actual first reservation was $0.0184400. Retained full-article evidence was reused; no collection/acquisition provider purchase was made.

## Exact outcome

Real GPT construction **passed structural validation on its first response**, with all nine ClaimMentions assigned exactly once, no extra enrichment, no foreign references and no repair. It proposed seven groups:

| Group | Actual occurrence summary | Relation | Units |
| --- | --- | --- | --- |
| G0 | Creation of the public-benefit fund | NEW_STORYLINE | C1 |
| G1 | 5% share commitment; optional additional 2% per 50% value increase | DEFER | C0, C2 |
| G2 | Possible nonprofit donations/direct distributions | DEFER | C3 |
| G3 | Prior $200m AI/job-market study commitment | DEFER | C4 |
| G4 | Bolder approaches and fund versatility | DEFER | C5, C6 |
| G5 | Public sentiment and crisis-of-trust context | DEFER | C7 |
| G6 | Future structure/governance information | DEFER | C8 |

Overall model confidence was 0.95, but six explicit DEFER relations remain unresolved regardless of confidence. The engine preserved the canonical/provisional graph and evidence, recorded semanticDeferred, and recorded rematch attempt 3 as DEFERRED / **SEMANTIC_CONSTRUCTION_UNRESOLVED**. The operator guard returned **SEMANTIC_REMATCH_NOT_SUCCEEDED**. This is a substantive semantic deferral, not a runner timestamp false negative or another enrichment-schema rejection. `engine.ts` marks construction containing any DEFER group unresolved; `runtime.ts` requires consumed work without semanticDeferred for successful rematch.

The client did not invoke publication. No optional annotations were used to block the response. No assignments were merged, rewritten or promoted to accepted identity. Fragmenting announcement facets/context into seven groups is a grouping-quality concern; no independent human boundary labels or quality success claim is available. C5/C6 stayed together. A structurally valid DEFER is not a mechanical error and did not trigger a paid repair.

Source: https://techcrunch.com/2026/10/18/anthropic-says-its-committing-5-of-its-shares-to-a-public-benefit-fund/

Retained immutable revision: `478b532d-62cc-41d0-bf16-3010a8fd98f2`. There is no actual briefing or briefing citation list to present; the source above is not a fabricated published edition.

## Actual cost and timing

| Stage | Calls | Reported provider cost | Measured time |
| --- | ---: | ---: | ---: |
| New acquisition/collection | 0 | $0 | Reused retained evidence |
| Construction callback | 1 GPT | $0.0021916 | 4.717 s |
| Construction repair | 0 | $0 | Not needed mechanically |
| Planning/writing/verification/persistence | 0 | $0 | Not reached |
| This failed attempt | 1 | **$0.0021916** | **11.1876814 s client elapsed** |
| Previous failed work | 6 | $0.0148300 | Prior reports |
| Cumulative experiment | 7 | **$0.0170216** | No successful edition |

New usage: 3,491 input / 497 output tokens; authoritative reported settlement, zero unknown feed outcomes. Provider total excludes unavailable per-request Cloudflare invoice allocation. There is no cost per successful edition because none succeeded.

Worker runner 10.182 s; tail request wall 10.307 s; CPU 382 ms. Rematch 9.948 s; preparation 6.744 s; context loading 341 ms; semantic lease admission 144 ms; model operation including bookkeeping 6.240 s; canonical review 2.647 s. Reservation 1.143 s, settlement 141 ms, result commit 164 ms. These are nested/overlapping timers, not additive disjoint stages. Publication exclusive turn was never entered; exact review turn-held time is not separately emitted. Canonical review is the measured enclosing mutation segment.

DB wrapper: 232 statements, 90,456 rows read, 257 rows written, 303.8828 ms SQL CPU, 5.689 s aggregate query wall, 332,250 response bytes. Model operation: two CAS attempts; rematch: three CAS attempts, no observed conflict/rejection or discarded conflict work. Canonical transaction wrote 56 documents and one pending job. No memory-limit error or uncaught Worker exception was captured.

The under-60-second persisted-edition target is **not demonstrated**. The elapsed time above is a stopped review, not complete publication latency; no p95 claim. Relative to the prior failed construction+repair, this run removed the mechanical rejection and repair, but different semantic outputs prevent a general speed/accuracy claim.

## Isolation and final state

Post-run read at 2026-10-19T15:42:46.111Z: private feed visibility zero, original revision ACTIVE, zero editions, zero push receipts and zero delivery jobs; seven paid operations settled, cost unchanged. Unauthenticated operator status, actual private-feed public read and public developments endpoints all returned 404. Production unchanged. Global V2 remains unset/off; V2 is scoped only inside the authenticated staging operator. The fresh review-start marker is consumed and no reviewed marker exists, so publication cannot start. Normal scheduled feed/source allowlists exclude this manual feed; its retained recovery work cannot automatically buy another attempt through normal dispatch. No recovery state was deleted.

Complete raw provider response, immutable inputs, normalized assignments, receipts, client intent and trace are preserved in ignored local reports, with hashes in `benchmarks/minimal-construction-staging-results.json`. No further inference, repair or publication attempt was initiated.

The remaining blocker is semantic grouping/identity resolution: the model used DEFER for supported announcement facets instead of producing a fully resolved construction. The next step requires offline inspection of that exact decision contract and evidence before any separately authorized paid attempt; this run does not authorize another call or weaken the unresolved gate.
