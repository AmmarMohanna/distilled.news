# Verification cost fix: completed work reuse and compact proofs

Continuation of `quality-cost-20261120`, on `perf/adaptive-verification-context`. Prior negative results remain valid. Experimental checkpoint `b92d0bbc` preserves the rejected source-scope implementation; it is absent from the final runtime.

**Outcome:** Fixed repeat execution of identical validated source-only work within a briefing, reduced proof encoding overhead, and added a bounded correction for contradictory person/title inventory spans. The measured generation reduction is approximately **2% on two exposed retained windows**. This is a concrete, small improvement, not a solution to every cost driver or evidence of population-wide editorial accuracy. Independent source extraction and strong final verification remain mandatory.

## Diagnosis and fixes

1. **Repeated immutable work during repairs.** Recorded problematic paths repeated 32–45% of source-stage input bytes. A request-local memo now reuses a fully validated source-only result for identical source content/metadata/order, model and schema policy. Concurrent identical work shares the same promise. Reader inventories, factual judgments and citation judgments remain fresh. Incomplete/partially invalid source output is not cached as completed. Rejected provider promises stay fenced, including uncertain payment outcomes. The memo lives only for one generation; it does not reuse results across feeds, windows or changed evidence. Existing durable operation/receipt recovery remains authoritative after process interruption. There are no new infrastructure services or persistent cache tables.

2. **Verbose proof transport.** The compact response format shortens repeated JSON keys and derives a proof's source from its immutable passage ID. It retains every facet, FULL_READER obligation, support status, citation check, evidence pointer and full explanation. The response expands into the existing validator before acceptance. Invented/wrong-source pointers fail. Malformed individual items remain withheld after bounded correction while valid siblings survive. Adverse findings are recorded before decoding, so malformed proof encoding cannot erase a negative finding on retry. No evidence is truncated, model downgraded, allowance reduced or factual threshold relaxed.

3. **A job title mislabeled as a person's name.** A newly frozen Arabic valid control was withheld because the reader model assigned the exact same tokens to both a personal name and an occupational role. Under the new proof policy this structural contradiction triggers the existing bounded inventory correction. Distinct name/title spans remain valid. The check uses no language, title or name dictionary. It does not manufacture a passing factual verdict. If correction remains unusable, withholding remains honest.

4. **Safe product integration.** New window preparation has an explicit opt-in, `BRIEFING_VERIFICATION_COST_ENABLED=true`, additionally requiring source bindings. It freezes `compact-proofs-v1` and `within-briefing-v1` into the immutable input before requests. Old unmarked windows retain their previous requests; recovery preserves independently frozen fields without adding missing policies. The existing compact-input flag does not silently enable these changes. No deployment flag or deployment was changed in this task.

## Real-model qualification

Same ten exposed, dependent source-derived controls as the prior report: six Arabic, two English, two French; five valid and five intentionally defective. Same two retained full-engine windows, exact sources, options, history, models and original reader output hashes. No benchmark label was changed after inference. Exact completed requests were reused; reuses are not fresh paid model judgments. No UNKNOWN operation was replayed.

| Full-generation measure | Arabic, 5 stories | English, 9 stories |
|---|---:|---:|
| Prior matched-stage generation cost | $0.329698 | $0.706088 |
| Compact-proof generation reconstruction | **$0.322532** | **$0.692924** |
| Reduction | **2.17%** | **1.86%** |
| Input tokens, before → after | 121,157 → 119,486 | 262,400 → 256,358 |
| Output tokens, before → after | 10,923 → 10,445 | 22,661 → 22,526 |
| Calls, before → after | 7 → 7 | 14 → 14 |
| Reader items and citation IDs | Byte-identical | Byte-identical |
| New provider engine requests | 1 | 3 |
| Observed replay duration | 23.6s | 82.2s |

All **10/10 controls completed and matched their source-derived labels**. Both full-engine results published the original 14 stories with no dropped stories or extra repair calls. These cost reconstructions combine new receipts with the original costs of exactly reused stages, rather than presenting incremental spending as total generation cost. They match uncached arithmetic at the configured GPT-4.1 rates; the measured improvement here is not the earlier 7–11% caching discount. Output-token variation still contributes, so a fixed 2% saving on future inputs is not guaranteed. Acquisition, ongoing evaluation and other product costs are excluded.

Replay duration omits the original latency of reused stages. It is not production end-to-end generation latency or a speed-improvement claim. Memoization prevents an additional source dispatch when a matching completed result exists; its monetary benefit depends on repair/batch overlap. The two clean qualification windows did not require repairs, so **no additional real repair-path saving is claimed**. Deterministic tests demonstrate fewer calls under repeated/concurrent source work; they are not new paid-model quality measurements.

The final compact-proof plus source-memo bundle was replayed offline against all **81 recorded requests across 22 cases**, with network forbidden, and reproduced every retained decision and full engine output. This includes the final safety/partial-publication changes. Raw paid responses, receipts, sources and histories remain privately retained. Public manifests contain hashes, generation IDs, costs, outcomes and limitations.

## Rejected source-skipping shortcut and negative controls

The attempted source-scope arm skipped source-person extraction if the atomic reader inventory had no name/role surface. It retained the complete sources and strong final judgment, but it failed a frozen Arabic role-only corruption: a source statement attributed to the president was accepted under an army-commander attribution. **The shortcut is rejected and removed.** Product preparation cannot enable it; the current paid runner rejects its frozen policies rather than silently executing a different experiment. No feed/language/name routing workaround was added.

Two extra role-only controls were added before their model outputs. The initial baseline wrongly withheld the valid anonymous-president attribution because of identical person/title spans. That baseline failure remains preserved in phase h. After bounded inventory correction, the candidate accepted the valid control but missed the deliberately incorrect role attribution. Phase i then stopped before either full engine. Those two candidate cases are **1/2 label matches**, not a successful 12-case qualification. The additional wrong-role baseline was not executed. The unperformed full-engine scope comparisons are not represented as completed. The original compact-proof qualification above has ten cases; it does not acquire a 12/12 score by excluding this negative experiment.

This exposes an existing model-assessment limitation on anonymous role attribution. Removing the shortcut preserves independent source-person hints and all prior safeguards; it does not establish that the original evaluator or verifier catches every role error. The structural inventory correction is regression-tested separately from the failed scope strategy.

## Financial accounting

The original authorization remains **$5 total including new reservations**. No fresh campaign or larger ceiling was inferred from account funding.

| Phase | Newly settled | Fresh provider requests |
|---|---:|---:|
| Prior completed a–f | $2.8442756 | 127 |
| Compact proofs g2 | $0.4618760 | 14 |
| Scope h, stopped on valid baseline false positive | $0.0385960 | 7 |
| Corrected scope i, stopped on missed wrong-role fault | $0.0205920 | 4 |
| **Cumulative** | **$3.3653396** | **152** |

New unresolved reservations: **$0**. Remaining authorization: **$1.6346604**. Historical holds of $0.658358 and $0.012416 were not cleared, spent again or reclassified. An unpaid metadata GET failed before reservations in directory g; its log/lock remain preserved, and a fresh g2 directory used the same frozen protocol. The model-call campaign did not retry an ambiguous paid operation. The later Codex approval authentication interruption executed no test or paid call.

## Verification and remaining limits

**Final checks:** 561 engine tests passed across 80 files. Worker subsets passed 4/4 gating/default/redelivery checks and 7/7 frozen-policy/recovery checks (one overlapping gate test). Engine, worker and qualification/replay CLI typechecks passed. The existing six-check offline workflow passed. Regression tests cover compact proof completeness/expansion, missing explanations, invented/wrong-source passages, adverse finding preservation, partial sibling preservation, source memo completion/invalidation/concurrency, payment-error fencing and multilingual person/title overlap. Worker tests cover opt-in gating, immutable input identity, unchanged evidence and frozen policy preservation. `OFFLINE_CHECKS.json` records the existing full offline workflow; mocks/test passes are not factual quality scores.

No merge, deployment, production/staging data mutation or live-news changes occurred. The candidate must be deployed and its new flag explicitly enabled in a separately authorized rollout before it changes live costs. Rollback for new windows is the flag off; started windows retain their frozen policy and paid operation identities.

The two windows are exposed development evidence, not an independent population sample or statistically established general improvement. No human accuracy measurement, broad feed comparison or lifetime cost reduction is established. The narrower fix removes confirmed redundant work and transport overhead while preserving the tested reader outputs; substantial overall savings remain unproven.

## Reproduce without spending

```powershell
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/replay-adaptive-context.ts .local-reports/integration/quality-cost-20261120-g2
node packages/briefing/node_modules/vitest/vitest.mjs run --root packages/briefing --config vitest.config.ts
python evaluation/briefing-quality/continuous.py --output .local-reports/cost-work-reuse-offline
```

The private retained directory is required for the exact-response replay. It forbids network access. Do not rerun a started paid directory; rejected experimental reproduction uses checkpoint `b92d0bbc`, its frozen manifests and its recorded receipts. See the previous `quality-cost-20261120/REPORT.md` for all earlier negative results.
