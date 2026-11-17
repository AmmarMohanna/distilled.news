# V7 item-local evidence trial — reject

## Decision

**REJECT this verifier-layout change.** It did not detect the actual Arabic fund/METR regressions, did not catch the retained real quantity/timing errors, and traded false positives without improving their total. More non-ok verdicts on synthetic errors are not gains when their explanations are about an unrelated topic.

V4 remains deployed. Measured V7 remains opt-in, unchanged by default. The failed item-local layout is removed from the runtime experiment switch and `verifyUser`; its exact implementation and structural tests are retained in the offline benchmark. The separate compact writer qualification check remains **unmeasured**, off by default and unpromoted. No complete prompt version was rewritten.

## Authorization and execution

Fresh user approval: eight GPT-4.1 mini calls, at most $0.15 exposure, two-hour scope. Every exact request passed native evaluation accounting admission and reservation, using the existing isolated evaluation D1. Native reservation estimates summed to $0.1060136. Actual **eight calls cost $0.0121512**, all settled; **$0 held, zero uncertain outcomes**. Eight distinct provider generation IDs and eight send-journal entries are retained privately. Historical grants/receipts/holds and deployment/account ceilings were unchanged.

No editor, repair, external judge, publication, deployment or notification operation ran. The unused dollars do not authorize extra calls: the approved call count is used. Source files were not modified.

Four matched pairs compared shared-source versus item-local presentation: English/Arabic mixed controls and English/Arabic retained real three-item drafts. Same V7 verifier system, model, temperature 0.1, JSON output, 3,000-token cap, facts, history, source text and hints; no retries. Pair order alternated. Exact requests, responses, usage and timing: [result artifact](../benchmarks/editorial-distillation/v7-evidence-results-2026-11-03.json). [Readable verbatim responses](../benchmarks/editorial-distillation/v7-evidence-responses-2026-11-03.md).

## Quality results

Labels are AI-assisted engineering expectations checked against original evidence, **not independent human ground truth**. The mixed set has six provisional errors, fourteen accurate controls and two unresolved examples excluded from counts. Real draft errors are reported separately rather than double-counting their repeated appearances as independent discoveries.

| Measure | Shared baseline | Item-local candidate |
|---|---:|---:|
| Retained Arabic draft errors accepted | 2 / 2 | 2 / 2 |
| Retained real fixed/range and timing errors accepted | 2 / 2 | 2 / 2 |
| All labelled control errors accepted | 5 / 6 | 4 / 6 |
| Intended control error identified by rationale | 1 / 6 | 0 / 6 |
| Complete evidence-linked minimal-correction finding | 0 / 6 | 0 / 6 |
| Accurate controls rejected | 3 / 14 | 3 / 14 |
| Ambiguous controls excluded | 2 | 2 |
| Complete, unique, valid item indices | Yes | Yes |

A complete actionable finding requires the actual offending claim, the relevant source passage and a minimal supported correction. Rejecting a synthetic fixture as unrelated to Anthropic does not meet it. The baseline correctly identifies future-versus-completed meaning in one synthetic error but does not give the requested complete source-passage/minimal-correction finding. The candidate's two synthetic-error drops cite an unrelated Anthropic topic instead of the intended error.

### Actual Arabic errors remain accepted

The retained three-item Arabic draft receives three `ok` verdicts in **both** layouts. In the mixed controls, the same fund/METR errors also receive `ok`:

- Fund body: “سيحصل مبدئياً على 5% من أسهم الشركة” with no stockholder-approval condition anywhere in the item. Primary source: **“Subject to stockholder approval, 5% of Anthropic’s shares will be committed today”** (`public-benefit-fund`).
- METR body: “ولا يمكن لـ Anthropic منع النشر إلا في حالات محددة”. Primary source: **“Anthropic can’t veto publication, but we can require them to redact information”** (`an-update-on-independent-evaluators`). A right to require redactions is not an exception allowing veto of publication.

The original source passages are present in the exact requests. Moving them into each item's packet is not a demonstrated solution. No repairs were executed, so none of these findings proves repaired-output quality.

### False positives: some wins, offset by new losses

The candidate accepts two concise correct Arabic controls the baseline wrongly rejects:

- A 5% plan explicitly “بشرط موافقة المساهمين”. Baseline says “intends” is too weak and demands conditionality already present.
- Independent METR publication with defined redactions, “دون حق لأنثروبيك في نقض النشر”. Baseline invents an equivalence between redaction and “partial veto,” conflicting with the primary source's explicit distinction.

But the candidate newly rejects the correct Arabic future combined 20% control, confusing the source's future combined total with already-pledged component shares. It also newly rejects the valid synthetic up-to range as unrelated to Anthropic. Both layouts reject the valid completed-transfer synthetic control for the same unrelated-topic reason. Thus total false rejection remains 3/14, not an improvement.

For the incorrect fixed-to-up-to synthetic item, the candidate returns `drop`, but its rationale only says the fixture is unrelated to Anthropic. For the incorrect future-to-completed synthetic item, the candidate again uses unrelated-topic/fixture reasoning. Neither explains the targeted quantity/timing mismatch. Counting those drops as successful factual detection would misrepresent the result.

No parser/index mapping defect was observed: every expected index occurs once. These are semantic/context judgments in a controlled mixed batch, not proof of an application ownership bug or estimates of production failure frequency. The independent retained real draft also fails, so the negative result does not depend only on synthetic fixture behavior.

## Cost, cache and latency

| Request | Input tokens | Cached input | Output tokens | Actual USD | Provider wall seconds |
|---|---:|---:|---:|---:|---:|
| Controls EN shared | 3,904 | 0 | 312 | .0020608 | 3.995 |
| Controls EN item-local | 4,735 | 0 | 350 | .0024540 | 5.541 |
| Controls AR shared | 3,352 | 1,920 | 422 | .0014400 | 4.448 |
| Controls AR item-local | 3,923 | 0 | 201 | .0018908 | 2.591 |
| Real EN shared | 3,947 | 3,712 | 42 | .0005324 | 1.845 |
| Real EN item-local | 4,083 | 0 | 42 | .0017004 | 1.513 |
| Real AR shared | 3,698 | 3,584 | 42 | .0004712 | 1.823 |
| Real AR item-local | 3,836 | 0 | 42 | .0016016 | 1.385 |

Totals: **shared $0.0045044 / 12.111 seconds; candidate $0.0076468 / 11.030 seconds**. Actual candidate cost is about 69.8% higher, substantially affected by baseline prompt-cache discounts: 9,216 cached input tokens versus zero for the candidate. Those cache counts are provider-reported, not inferred. All eight were fresh generation requests; prompt caching is not evidence that a saved answer was reused or that it caused factual errors.

At the observed token counts with the public uncached mini prices ($0.40/$1.60 per million input/output), the **counterfactual estimate** is $0.0072692 shared versus $0.0076468 candidate (+5.2%). This is not actual billing or a proven recurring cost forecast. The real batches' input-token overhead is 3.45% English and 3.73% Arabic, differing from byte-size overhead. Candidate latency is lower in aggregate but English controls are slower; one sample per request cannot establish robust speed gains.

Full-pipeline cost/latency and repair frequency remain **unmeasured** here. No editor ran. Neither cached verifier cost nor these direct-call times establish the 10% full-pipeline target. The candidate fails the factuality gate regardless of efficiency.

## Code retained and rejected

- **Removed from runtime:** item-local evidence option and rendering branch. Unknown/rejected runtime experiment values fail explicitly. No production/deployed routing changed.
- **Preserved offline:** exact packet renderer, frozen requests and provider outputs, quote-linked expectations, source-preservation/index/repair-context tests. Regeneration must match the actual paid request bytes, including hints.
- **Preserved unchanged:** V4 baseline, measured V7 stage prompts, nonblocking source-accounting diagnostic, source provenance, existing verification/repair machinery and authoritative accounting.
- **Still unmeasured:** writer-only essential-qualification check prepared in the preceding task. This authorization did not cover writer calls; none were made.

## Conclusion and next step

Do not promote this layout or treat more rejections as improvement. The result narrows the diagnosis: this simple evidence-presentation change is insufficient for the mini verifier on these examples. It does not prove an internal model cause or that every other layout/model would fail.

The next focused work is the independently prepared writer qualification check and further review of minimal supported corrections using these saved outputs. Any paid writer/full-pipeline comparison requires a new bounded scope. Do not add another verification agent, sequential call or broad prompt rewrite in response to this negative result. V7 remains unqualified until its actual Arabic output and final verification pass factual and efficiency tests.

## Final validation

- 176 briefing tests / 40 files passed; four offline layout/reproduction checks passed.
- Briefing and Worker TypeScript checks passed.
- Reproduction asserts every prepared request equals its actual paid request snapshot; moved structural tests still check full evidence, indices and repair-review context.
- Existing full GitHub Project checks at `81f8cb2` passed: https://github.com/AmmarMohanna/distilled.news/actions/runs/41673354395 . Briefing evaluation also passed. This confirms the Ubuntu pin resolved the earlier dependency-install blocker without skipping browser tests. Subsequent evidence-commit CI is reported separately.
- Both layouts reported upstream provider OpenAI and model `openai/gpt-4.1-mini`; no model/provider substitution was made.
