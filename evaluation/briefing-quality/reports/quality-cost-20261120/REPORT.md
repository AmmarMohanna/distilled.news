# Cost reduction with editorial safeguards

**Decision:** No substantial, general cost reduction was established. Keep the strong factual verifier. The retained source-schema candidate preserved the tested outputs and made a small reduction in request overhead; most observed billing savings were provider caching, which is not guaranteed. Do not enable the rejected cheaper-model or broad-schema arms.

Branch: `perf/adaptive-verification-context`, continuing `5cae8761`. Experiment-code checkpoint: `08d770bf`. No merge, deployment, deployment-variable change or production mutation occurred. This study does not change the product's beta acceptance status.

## What costs money

The two retained briefings consumed 121,157 / 262,400 input tokens and 10,923 / 22,661 output tokens in their earlier matched-stage baselines. Complete evidence, source-only indexed extraction, reader inventories and detailed final proofs account for substantial work. Repeated token labels and schema constraints add overhead. A smaller input does not guarantee a cheaper completed briefing: a changed model judgment can trigger repair, reinventory, reverification and coverage checks.

That happened here. Source-only mini routing produced 15 Arabic calls instead of seven. Narrow final-schema sharing produced 23 English calls instead of 14. In the latter, the verifier requested headline precision already represented in the body and subsequently objected to 70.9% versus 70.87%. Some objections appear unnecessary, but this study did not change factual acceptance rules or automatically overrule them. These are concrete repair-cost drivers, not proof that all adverse findings should be ignored.

## Frozen evidence and safeguards

Ten exposed, source-derived controls: six Arabic, two English and two French; five valid and five intentionally defective. They cover compound personal names, retained Arabic identity/role failures, quantities and uncertainty. Corrected controls change only the labeled identity/role. Dependent variants are not independent news events. Two retained full-engine inputs contain five Arabic and nine English stories, using their frozen evidence, history, options and source-accounting policies.

All arms use the same labels and inputs. Baselines and unchanged stages reuse **only exact completed requests**, including model, system, user, allowance and schema. Reused calls are not new paid assessments. There is no randomization, held-out sample, human accuracy study or population-level inference. Ten controls and two windows cannot establish general editorial correctness.

The approved new ceiling was $5 including new reservations. Calls were serialized; ambiguous historical hashes remained fenced; no UNKNOWN operation was resent. Every new reservation, request hash, provider receipt, response hash and cost was reconciled by the existing summarizer. Historical holds of $0.658358 and $0.012416 remain untouched and are outside this new authorization.

## Actual results, including rejected arms

Amounts below reconstruct a full generation using actual receipts for new calls plus the original unit costs of exactly reused stages. They are **not** the incremental charge for the experiment. Baseline reconstruction: Arabic $0.329698; English $0.706088. Acquisition, continuous evaluation and other product services are excluded.

| Arm | Controls completed/matched | Arabic: cost / calls | English: cost / calls | Decision |
|---|---:|---:|---:|---|
| Literal source spans v1 | 8/8, 7 matched | Not run | Not run | Reject: valid Arabic control withheld |
| Literal spans + token hints | 8/8, 7 matched | Not run | Not run | Reject: same valid control failed |
| Indexed source-only mini | 10/10, 10 matched | $0.412154 / 15 | $0.587403 / 14 | Reject global routing: Arabic regression |
| Shared final-verifier schema | 10/10, 10 matched | $0.314632 / 7 | $0.906034 / 23 | Reject: extra English repairs and changed output |
| Shared schemas across stages | 10/10, 10 matched | $0.347982 / 10 | $0.569186 / 12 | Reject: Arabic regression; regenerated reader text |
| **Source-schema sharing only** | **10/10, 10 matched** | **$0.306628 / 7** | **$0.625974 / 14** | Retain small representation candidate; no material-cost claim |

The two literal arms stopped before the final two controls and both full windows; those experiments were not completed. Other arms completed all prepared cases. No failed control was removed. Model/inventory output failure is not credited as a genuine factual detection.

The source-schema arm used nine fresh provider requests; other exact stages/controls reused retained paid responses. Both reader item arrays, including all headlines, bodies and citation IDs, match the earlier 14-story baseline **byte-for-byte**. No stories were dropped and neither window required additional calls. This demonstrates preservation on these inputs, not that the original outputs contain no errors.

## Separate caching from the format change

| Source-schema arm | Arabic | English |
|---|---:|---:|
| Full input / output tokens | 120,970 / 10,750 | 261,803 / 21,964 |
| Observed receipt reconstruction | $0.306628 | $0.625974 |
| Observed reduction versus prior baseline | 7.00% | 11.35% |
| Same token totals at uncached GPT-4.1 list rates | $0.327940 | $0.699318 |
| Uncached reduction | **0.53%** | **0.96%** |

New final-verifier receipts reported 14,208 cached input tokens for Arabic and 48,896 for English. The corresponding $0.021312 / $0.073344 discounts explain most of the observed reduction. Output-token variation also contributes to normalized savings; it is not a deterministic schema saving. Do not advertise 7–11% as a repeatable consequence of this code, or claim the overall cost problem is solved.

Source-schema replays took 35.1s / 69.2s with only two / five fresh engine requests. Reused editor/inventory work did not incur its original latency. These are observed qualification replay durations, **not production end-to-end latency estimates or evidence of a speed improvement**. Per-request paid latency is retained in the receipts.

## Financial outcome

| Phase | New settled cost | Fresh calls |
|---|---:|---:|
| Literal v1 | $0.0502440 | 12 |
| Literal hints | $0.0080360 | 6 |
| Source mini | $0.6577796 | 31 |
| Final schema | $0.5842560 | 21 |
| General schema | $1.0924400 | 48 |
| Source schema | $0.4515200 | 9 |
| **Total** | **$2.8442756** | **127** |

New unresolved holds: **$0**. Unspent authorization: **$2.1557244**. No further paid calls are needed to reproduce the retained results. Account balance changes are not used as campaign spending because staging shares the account.

## Final implementation and validation

Only optional `source-definitions-v1` schema factoring remains in the engine. It replaces identical constraints with local definitions at the independent source stage. Expanding references retains every output key, enum and validation requirement. No prompts, evidence, models, citation obligations, reader outputs, output allowances or transactional/spending safeguards are removed. Product preparation does **not** emit this research policy; it is not activated by the existing compact-context flag.

Review found a generic-schema bug involving object-valued enum/const/default literals. It was reproduced failing, fixed by traversing only schema-bearing keywords, and regression-tested. Existing reference/identifier scopes cause an unchanged fallback. The corrected helper reproduced the paid schemas exactly. Rejected routes/contracts were removed from current runtime code; checkpoint `08d770bf` preserves their implementation. The current paid runner rejects those old arms rather than silently executing a different protocol.

Final engine suite: **546 tests passed**; engine, worker, qualification CLI and replay CLI typechecks passed. A separate final review found no significant issues in the lean implementation or financial/report claims. The source-only regression proves identical reader/final requests and decisions when responses are fixed. An offline exact-response replay matched **81 requests across all 22 final-arm cases**, and the earlier adaptive replay still matched its 39 requests. Neither replay reads credentials or permits network access. See `OFFLINE_CHECKS.json` for the existing broader qualification workflow. No remote CI result is inferred from local tests.

## Reproduce and inspect

`measurements.json` contains sanitized case/source/history hashes, provider generation IDs, immutable operation/response hashes, costs, failures, reuses and outcomes. Original source passages and raw paid records remain in the private retained directories; public hashes do not substitute for that evidence.

```powershell
# Public artifacts only; no model requests.
node evaluation/briefing-quality/reports/quality-cost-20261120/analyze.mjs
# Retained private records required; network forbidden in the replay.
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/replay-adaptive-context.ts .local-reports/integration/quality-cost-20261120-f
python evaluation/briefing-quality/continuous.py --output .local-reports/quality-cost-offline
```

Do not rerun a started paid directory. Earlier-arm reproduction requires the immutable checkpoint and its frozen manifests; those negative measurements are preserved. Structured definitions are supported by the [official Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs); provider acceptance was also exercised here.

**Remaining cost issue:** economical, quality-preserving generation has not been established across feeds. The safe next reduction must address duplicate immutable source work or demonstrably unnecessary repair amplification, with explicit provenance and payment recovery, rather than cutting evidence or trusting a weaker final judge. That work is not claimed completed by this study.
