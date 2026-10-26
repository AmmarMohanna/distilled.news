# Diagnosis-driven V3 prompt retest

## Result

The first trials were too broad to explain the failures. This follow-up traced actual instructions, inputs and returned text, shortened the editor prompt, and separated editorial recall from factual support. **No runtime change or deployment is justified yet.** The concise candidate is saved as `benchmarks/prompts/v3-v2-candidate.json`, explicitly inactive. V1 stays frozen and active repository prompts stay unchanged.

21 additional paid calls cost **$0.1675992**. Across both rounds: **32 calls, $0.3701092 actual**, within the user's $5 authorization. Final ledger read-back confirms all 32 settled and $0 outstanding for this task. Conservative reservations summed to $2.061630; that is not the charge or current held exposure. Historical holds, including the separate unresolved GLM reservation, were unchanged. This experiment stops because the candidates failed qualification, not because the budget ran out.

## Actual failures and cause evidence

### Consolidation has competing objectives

The baseline says to meet a reading guide and keep surviving drafts' facts unchanged. On the real 19-article replay it copied long drafts into a 983-word edition despite a 580-word guide. The JSON example shows `from: [0,3]`; three previous responses copied that exact combination, including a nonexistent draft 3 in a three-draft input. This is evidence of example imitation, not proof that it explains every merge.

Changing only the example to `[0]` produced 13 separate items without the unrelated merge in this sample. However, the baseline also kept those items separate, and no repeated trials establish a general improvement. It stayed 983 words: example correction alone does not improve distillation.

A compact consolidation prompt cut the result to 308 words but kept only four developments, dropping the $150 million Genesis commitment, the proposed benefit fund and other consequential news. On the three-draft transfer control it kept only one item, dropping Genesis funding and METR access. That is excessive omission, not successful distillation. Importance labels influenced selection strongly, but this does not establish that the mechanical protection alone caused the losses. No protection was removed.

### Shorter editor instructions help cost and sometimes length, but are insufficient

The first compact editor system is **2,217 characters versus 6,528** (66% shorter). The consolidation system is 1,163 versus 2,045. Evidence and history were unchanged; numerical reading budgets were not increased.

The compact Arabic editor omitted the upcoming Lebanese-front strike warning because it was an intention rather than a completed action. An isolated eligibility sentence clarified that an attributed warning or plan can be important news before it happens. The warning returned, with prospective status intact. This supports an editorial-selection cause for that omission; it is not a verifier failure.

The short candidate also adopted the source's partisan Arabic label for Israel in some outputs. That is an unwanted neutrality regression in the candidate, not a factual accusation about the baseline. Removing overlapping instructions must not remove useful safeguards.

### Filler is not solely a long-prompt or default-style problem

The unused real 30-minute window contains a presidential statement about the Tripoli/Beirut ports and reported explosions at Khiam. Both baseline languages add absence-of-detail filler. The compact editor, a positive writing example, and removal of only the generated date-style instruction did not reliably stop it.

The default style instruction asks for source publication dates/late-discovery labels while the system rejects routine publication narration. That tension is real. Removing it on identical input removed publication phrasing in the English sample but **did not remove the no-details clause**. It cannot be called the sole cause or a complete solution.

History includes prior boilerplate and can supply an unwanted stylistic example. An instruction treating history only as reader memory plus a positive concise example still left filler. This experiment does not establish history as the sole cause; previous clean-feed evidence also shows filler can occur without history.

### A second important development inside one article was missed

A truly unused later window supplied three real posts. Post `107655` contains both the US Embassy's advice to avoid Beirut/Dahieh and a separate reported strike at Kfar Tibnit. The short editor selected only the advisory. Citing that article therefore did **not** establish complete coverage of its important developments.

Adding just this selection instruction recovered the strike as a separate second item:

> An article may contain multiple independent developments. Check the whole article for additional consequential news before finalizing; selecting one story from an article does not cover its other developments.

This is a targeted positive result on a now-known development case, not held-out qualification. The recovered item again appended an unnecessary no-details sentence. This version is not ready to replace the baseline.

### One omission happens before the prompt

Post `107657`, `🚨غارة تستهدف وادي الحجير`, was skipped by the existing 40-character preparation minimum. The model never saw it. The exact skip and original source are retained. This omission must be separated from editor recall; a prompt cannot recover evidence it never receives. No source acquisition or preparation code was changed as part of prompt tuning.

## Controlled results

Each paired editor input uses identical source text, timestamps, history, preparation, GPT-4.1 routing, temperature 0.1 and a 4,000-token output cap. Words include headlines and bodies; Arabic counts are not directly comparable to English. Results are single samples, not statistical performance estimates.

| Case | Baseline | Candidate | Assessment |
|---|---|---|---|
| Two-hour real Lebanon batch, compact AR | 4 important developments | 3 | Missed prospective warning; reject |
| Same batch, explicit warning eligibility | compact had 3 | 4 | Specific recall recovery; not broad qualification |
| Real 30-minute window EN | 101 words, $0.008528, 2.553 s | compact: 79 words, $0.006838, 1.874 s | Both main developments; filler remains |
| Same window AR | 90 words, $0.009296, 2.166 s | compact: 60 words, $0.006974, 1.898 s | Both main developments; no general reliability proof |
| Same window, short main-idea EN | 101 words | 68 words, $0.006464 | Cleaner body, attribution retained; headline/body still repeat some content |
| Same window, short main-idea AR | 90 words | 71 words, $0.007248 | Still adds missing-detail clause |
| Unused multi-development article | short candidate selects advisory only | explicit development check selects advisory + strike | Recovered consequential omission; filler remains |
| Large consolidation | 983 words, 13 items | compact: 308 words, 4 items | Too much important news lost; reject |

One additional call used the **unchanged normal GPT-4.1 mini verifier**, with its request captured from the existing V3 engine. It returned `ok` for the selected embassy advisory: a source-supported statement. The request contained the cited full article, including the omitted strike. The approval is **not a false factual acceptance**: the verifier checks the selected item, and that item is supported. It also does not establish editorial recall. This directly demonstrates why factual grounding and selection must be evaluated separately without adding another product stage.

The selected advisory cost $0.004314 to edit and $0.0007192 to verify, totaling $0.0050332. Model response times were 3.001 s and 1.292 s. These were separated by analysis/accounting, not a measured uninterrupted end-to-end workflow. No edition was persisted or published in this task. No repair call was required by that verifier result. No new evidence establishes verifier false-rejection rates or full-pipeline recurring cost superiority.

## What remains unchanged

No model routing, factual validation, durable operation identity, runtime prompt, publication behavior, history storage, schedule, source content, source processing or live feed changed. No deterministic prose cleanup was introduced. The existing editor → verifier → targeted repair architecture remains intact.

The draft-reference example and explicit development-level instruction are focused candidates worth retaining as research evidence. The shortened prompts have not passed a broad enough unseen evaluation, and the Arabic style/neutrality regressions block promotion. They remain inactive, not silently enabled on new or frozen jobs.

## Evidence and next step

- `benchmarks/prompts/v3-v1.json`: immutable baseline.
- `benchmarks/prompts/v3-v2-candidate.json`: shorter experimental candidate, clearly marked inactive and unqualified.
- `benchmarks/results/v3-prompt-retest/inputs.json`: exact previously unused source inputs/history, preparation skips, candidate instructions, labels and request identities. Inputs become development cases after inspection; later retries are not mislabeled held out.
- `benchmarks/results/v3-prompt-retest/results.json`: all 21 exact additional parsed outputs, tokens, charges and timings.
- `benchmarks/results/v3-prompt-retest/briefings.md`: generated text for review.
- `benchmarks/results/v3-prompt-retest/ledger-summary.json`: cumulative final ledger read-back.
- `.local-reports/v3-prompt-tuning/`: exact requests, provider payloads, reservation identities and append-only progress, local only.

Next work should use a small unseen batch with important secondary developments and concise Arabic/English target judgments, with the candidate fixed before evaluation. Do not make it an exhaustive fact-coverage contract. Separately, decide whether to admit short but substantive Telegram posts; do not describe their preprocessing loss as a model error. The remaining allowance is not a reason for another open-ended prompt search.

Validation: **100 tests passed across 21 briefing test files; briefing TypeScript check passed.** No runtime Worker files changed.
