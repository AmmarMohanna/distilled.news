# Parallel intelligence implementation and measured results

Latest routing update: [Cloudflare unified GPT-4.1 comparison](CLOUDFLARE_GPT41_COMPARISON.md) supersedes the native-Qwen default; its matched real comparison remains blocked on credentials and scoped capacity.

Update 2026-10-20: the initial real-provider comparison is recorded in [Cloudflare real evaluation](CLOUDFLARE_REAL_EVALUATION.md). The measurements below remain the original offline implementation report.

Branch: feat/parallel-cloudflare-event-reconciliation. Exact base: c813a27, fetched from backend-validation-contract. The original branch was not modified. Baseline schema compaction (0e069a2) and scheduling fixes (33c5a7d) are reused.

## Implementation

Bounded packet inference uses V1_INFERENCE_CONCURRENCY=2 (accepted range 1-3), isolated per-operation usage and deterministic source-order collection. Already started work drains on failure; successful operations are reused after interruption. Short bookkeeping and settlement transactions serialize locally; canonical graph mutations retain existing CAS, lease and transaction checks. This does not increase article queue capacity or account authority. Independent article preparation already occurs outside canonical write turns; packet model calls are the added parallel stage.

Short articles retain direct article-first construction. Long continuations retain the complete immutable article with every packet, exact ClaimMention coordinates and attribution. New packet dispositions permit a source unit to support several developments. Reconciliation decides stable development references rather than generating original claim assignments. Application code reconstructs membership, slots and entities from validated packets and rejects missing/duplicate references, conflicting ownership, ambiguous merges and temporal/origin conflicts. Correction, contradiction and update links are persisted with source ownership inside the canonical transaction. Historical continuation manifests pin their original legacy path; new manifests pin the selected mode. V1_RECONCILIATION_MODE=CLAIMS explicitly selects the regression path for new work.

Workers AI is the feature default, using native AI.run, with explicit OpenRouter configuration and per-task identities. All Workers AI tasks remain unqualified for real publication. See [provider configuration and mappings](CLOUDFLARE_INFERENCE.md), [prepared paid evaluation boundary](PARALLEL_INTELLIGENCE_EVALUATION.md) and [compatibility status](../benchmarks/provider-compatibility-results.json). No automatic provider fallback exists. Native token counts do not become invented dollar receipts. Uncertain operations retain their holds and fence provider/model switching. Migration 0064 adds provider admission guards; it has only been applied to local test databases.

## Offline comparison

Run: node_modules/.bin/vitest run --config benchmarks/parallel-intelligence.vitest.config.ts --silent (or pnpm benchmark:parallel when pnpm is available). Identical six-mention source, three packet calls and one reconciliation call per path; local D1 with a deterministic 1,500 ms synthetic model delay. These are single local runs, not confidence intervals or provider latency measurements.

| Reconciliation | Concurrency | Article wall seconds | Articles/minute | DB reads/writes |
| --- | ---: | ---: | ---: | ---: |
| CLAIMS | 1 | 13.37 | 4.49 | 152/133 |
| CLAIMS | 2 | 9.70 | 6.18 | 152/133 |
| DEVELOPMENTS | 1 | 11.43 | 5.25 | 148/127 |
| DEVELOPMENTS | 2 | 10.05 | 5.97 | 148/127 |

The October 20 offline rerun reduced article wall time about 27% on the legacy path and 12% on the development path with concurrency two. Development reconciliation at concurrency two was about 3.6% slower than legacy concurrency two in this final rerun, whereas the earlier run was about 13% slower. Local D1/resource noise and single runs do not justify a general latency claim; its reconciliation input was 4,695 bytes versus 2,663 because complete evidence/context is retained. We do not claim a reconciliation latency or cost win. The scalable reconstruction is retained for its static schema, mechanical coverage and reduced database work, with the legacy path available; real semantic nonregression and model performance remain qualification requirements.

All four paths had four calls, zero local CAS conflicts, zero additional calls on replay, retained Event identities on duplicate delivery, complete evidence, and zero synthetic false merges/splits. Synthetic receipts were 400 input/80 output tokens and $0.004 per path; actual paid calls and actual provider cost were zero. Token/cost fixtures cannot establish savings. Individual call latency and bytes are recorded in [raw results](../benchmarks/parallel-intelligence-results.json). Acquisition latency and actual exclusive-turn lease duration are unmeasured; canonical mutation callback duration is recorded separately.

Saved Laplace/Replit schemas still compact from 2,452 to 168 and 1,197 to 126 enum occurrences. Development schema enum occurrences stay 17 through 2,000 ClaimMentions. At 2,000 mentions, mechanical reconstruction retained every exact membership; reconciliation output reference payload was 860 bytes versus 60,195 bytes for regenerated assignments. These are synthetic coverage/scale results, not model quality judgments. [Saved evidence report](../benchmarks/parallel-saved-evidence-results.json) also checks the historical V2 ACCEPT receipt and locally available private artifact hashes; it does not replay paid inference or republish anything. [Corpus manifest](../benchmarks/parallel-intelligence-corpus.json) distinguishes synthetic contracts, existing regressions and historical provider evidence.

## Verification and boundaries

All seven workspace TypeScript projects passed no-emit checks. The final focused batch passed 17 tests. [Verification summary](../benchmarks/parallel-verification-results.json) records batch counts and typecheck exits. The publication, direct construction, article-history, material-update and correction regression batch passed 69 tests. Semantic preparation passed 17 tests, including selected novelty pricing. Focused tests cover bounded concurrency, partial outcomes, unknown execution, provider switch fencing, atomic global provider admission, schema translation, strict output decoding, shared ownership, development reconstruction and durable replay. Existing OpenRouter model, V2 contract and recovery regressions were also run; no factual assertion was weakened. Test runner setup/default timeouts were adjusted for local Miniflare startup, without changing existing explicit per-test limits.

No production or shared staging deployment, paid evaluation, notification, grant renewal, ceiling change, uncertain-hold release, historical receipt rewrite or branch merge has occurred. The 16 rematches were not retried or changed. Real deployment requires model/schema/account compatibility, manually reviewed quality including invalid ACCEPT/false merges/splits, output and rate-limit verification, authoritative Cloudflare billing/recovery, valid spending authorization and capacity, followed separately by deployment permission.

## Reviewable commits

- d62e67c: bounded independent packet inference.
- fd74bda: Cloudflare-first routing, native adapter, qualification gates and provider admission.
- The subsequent development-reconciliation commit contains construction, reconstruction, regression fixtures, benchmark artifacts and this report. Exact changed files are available with git diff --name-status c813a27..HEAD.


## October 20 offline validation follow-up

Paid Cloudflare evaluation is deferred at the user's request. This follow-up made zero paid inference calls and no remote financial changes or deployments.

Review found an ambiguous reconciliation output that could declare SAME_OCCURRENCE across separate groups and silently lose that link. It now fails closed. Review also found that fragments of one correction/update must merge independently from their outgoing relationship to an antecedent. The static provider schema now requires an explicit `mergeSameOccurrence` boolean: merged correction/update/contradiction fragments retain their exact claims and link to the distinct antecedent. Application parsing remains compatible with old single-development and SAME_OCCURRENCE outputs; ambiguous multi-development linked outputs without explicit merge intent are rejected. Enum occurrences remain 17. Regression tests reproduced both failures before the fixes and passed afterward.

The new [historical OpenRouter replay](../benchmarks/offline-openrouter-v2-replay-results.json) feeds all 12 saved controlled questions/verdicts through the current V2 reducer without inference. All 12 older verdicts lack required sourceSupported/readerEntailsProposition fields and are UNRESOLVED. The exact base commit already required those fields: these historical answers are incompatible baseline artifacts, not fresh ACCEPTs or evidence of a feature regression. No missing factual judgments were filled in. The successful private-staging V2 ACCEPT report and its nine locally available artifacts retain their recorded hashes; that artifact check is not a new publication or semantic re-verification.

Final checks: 12/12 focused reconciliation, continuation and bounded-concurrency tests; 3/3 offline benchmark/replay tests; seven workspace typechecks. The broader initial run passed 100 assertions and failed the two newly introduced red regressions against code loaded before the fixes; both regressions are covered by the final green focused run. Existing history, material-update, source ownership, publication V2 and semantic preparation assertions in that initial batch passed. [Follow-up verification](../benchmarks/offline-architecture-verification-results.json) records these batches without counting overlapping tests as unique.

Ruling: retain bounded concurrency and development reconstruction for measured local concurrency benefits, exact mechanical evidence coverage, static schema size and fewer database operations. Do not promote new provider/model tasks or claim real model-quality equivalence from these offline results. The legacy CLAIMS route and explicit OpenRouter baseline remain available. Real Cloudflare qualification, payment and deployment remain deferred.
