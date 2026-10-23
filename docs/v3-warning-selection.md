# V3 editorial selection of future developments — 2026-10-23

Final outcome: the paid eight-call comparison found no demonstrated improvement. The candidate instruction is removed from the active prompt; exact evidence is retained. Actual cost: $0.057800, all settled. See the paid follow-up below.

## Change
One editor selection instruction now explicitly includes consequential, source-supported warnings, threats, plans and official decisions relevant to the reader before execution. It requires preserving attribution, uncertainty and future timing. Routine plans, vague speculation, off-topic claims and unchanged previously reported warnings remain omittable. The same standard applies across output languages.

No verifier, repair, model mapping, article preparation, pipeline stage, scheduler or published edition was changed. No location-specific or company-specific rules were added. English and Arabic remain independent editorial runs; identical coverage is not guaranteed.

## Retained real failure
Frozen fixture `packages/briefing/test/fixtures/v3-warning-selection.json` contains the exact input sources, timestamps, URLs, prior histories, recorded results and source hashes for the 19:47:58 English / 19:48:05 Arabic editions, reporting window ending 19:44:53 Beirut. Both received posts 107633–107636. English included the electricity cutoff and warning of upcoming airstrikes; Arabic included only the electricity cutoff. Arabic explicitly omitted the warning as an intention rather than execution or a new decision. There were no verification drops.

Manual editorial assessment: a consequential imminent warning about the reader's region can deserve inclusion before execution. This does not independently verify the Telegram report or resolve its unusual attribution of a military action statement to a regional council. Accurate reporting must preserve that it is an attributed statement, not establish that the threatened action occurred. Other posts lacking a direct Lebanon connection are not made eligible simply by this change.

## Tests and evidence limits
- The regression first failed because the new selection instruction was absent.
- All 71 briefing tests (13 files) pass after the change.
- Five new tests: source-hash/equivalent-evidence/retained-omission check; English and Arabic real-evidence workflow transport; English and Arabic synthetic controls for meaningful updates, corrections, routine plans, speculation and unchanged warnings.
- Model-port responses in workflow tests are scripted and explicitly labelled. They check prompt/evidence transport, source ownership, history links and unchanged stage count. They do not demonstrate model selection accuracy, reduced omissions or semantic quality.
- Developmental labels are manually assessed, not a held-out quality benchmark. The additional public-safety snippets are synthetic, not real news evidence.
- No external inference calls, additional inference charges or deployment. Previous paid authorizations are not reused. Actual GPT-4.1 compliance and English/Arabic selection consistency under this instruction remain unmeasured.

A future authorized small comparison should hold source evidence, prior histories and model settings fixed, changing only the editor selection instruction. It should check the retained warning plus separate controls for routine/speculative/repeated reporting, material updates and corrections. Do not treat blanket inclusion of all future claims as success or require both languages to use identical prose.
- TypeScript checks passed for the briefing package and Worker; whitespace validation passed.

## Paid follow-up — candidate rejected, baseline restored

User explicitly authorized 8 GPT-4.1 calls with maximum $0.30 exposure for two hours. All 8 calls completed, each reserved through the existing D1 model-spending functions before sending. Actual charges total **$0.057800**; conservative reservations total **$0.299728**. All 8 settlements report cost, with no outstanding reservations, retries, repairs or uncertain charges. Historical financial records were not rewritten. No further paid trials were initiated.

The exact requests were frozen before authorization. Each pair holds the same source evidence, language, prior history, decoding settings and model fixed; only the editor system instruction differs. GPT-4.1 pricing was checked at OpenRouter ($2/M input, $8/M output), with matching request price ceilings. Maximum completion length was 1,500 tokens. Input reservation bounds use serialized request bytes plus 1,024 tokens, conservatively overcounting these text inputs. No request was truncated. Actual usage: 20,132 input and 2,192 output tokens.

| Input | Language | Baseline selection | Candidate selection | Baseline USD / elapsed | Candidate USD / elapsed |
|---|---|---|---|---|---|
| Retained real posts | English | Electricity cutoff + attributed future airstrike warning | Same | $0.008066 / 3.578s | $0.008124 / 3.547s |
| Retained real posts | Arabic | Electricity cutoff + attributed future airstrike warning | Same | $0.008322 / 4.720s | $0.008540 / 2.915s |
| Synthetic controls | English | Road warning + evacuation correction | Same | $0.005538 / 4.905s | $0.006172 / 3.162s |
| Synthetic controls | Arabic | Road warning + evacuation correction (labelled update) | Same | $0.006450 / 3.322s | $0.006588 / 3.498s |

Elapsed values measure the timed provider-request-through-ledger-settlement span, not pure provider latency, acquisition-to-publication time or end-to-end briefing delivery. One sample per language/variant cannot establish a latency improvement. Baseline total $0.028376; candidate $0.029424. The candidate adds 101 input tokens per editor request (about $0.000202 at these rates); output-length differences also affect measured charges. There were no verifier/repair calls, so this is not a full-pipeline cost comparison.

### Source review
- All four real-input outputs include both selected developments and omit the two unrelated regional posts. The historical Arabic omission does not recur in the current baseline replay. Historical 19:47 generation predates the concise-writing change, so the current baseline is not asserted to be the exact historical system prompt; this experiment compares current pre-candidate V3 against its one-instruction candidate on identical retained evidence.
- Both variants retain the real warning as an attributed future statement, not a completed strike. Source truth and the unusual regional-council attribution were not independently verified.
- Both variants exclude the routine workshop, vague foreign-policy speculation and unchanged boil-water warning in both languages. No indiscriminate inclusion benefit or regression was observed on this small set.
- Both variants treat the newer evacuation correction as covering the earlier extension. They retain the station neighbourhood in the covered area but omit the earlier bulletin's actionable **leave before midnight** deadline. The correction does not revoke that deadline. This is an important shared omission, not a candidate improvement.
- Both Arabic control outputs render “station neighbourhood” as “محطة القطار” (train station), adding a railway interpretation that the English synthetic source does not establish. This is a shared source-grounding issue. Arabic labels the correction as an update in both variants, while the prose does acknowledge correction.
- These findings are assistant source review, not independently human-labelled gold or a second paid verifier evaluation. Synthetic controls are not real news evidence.

### Decision
The added selection instruction showed **no demonstrated quality improvement** in this bounded comparison and did not fix the shared update-detail omission. In accordance with the requirement to retain only demonstrated improvements, restore the original editor prompt from before 4b74f65. Keep the candidate and its exact outputs in the evaluation evidence, not in the active prompt. The source fixture and transport tests remain as clearly labelled offline mechanics tests; their passing is not a model-quality claim.

No deployment or publication occurred in this experiment. The existing staging notification fix remains intact. No shared editorial-selection layer or additional verifier stage was introduced. Guaranteed cross-language matching remains outside this change.

Exact sanitized requests, outputs, provider IDs, usage, hashes and settlement read-back: `benchmarks/results/v3-warning-selection/summary.json`. Full readable drafts: `benchmarks/results/v3-warning-selection/outputs.md`. Private attempt/reservation artifacts remain ignored under `.local-reports/v3-warning-selection/`.

All 74 briefing tests pass after baseline restoration, including three recorded-result checks. Further paid testing requires separate authorization; the eight approved calls are used even though actual charges were below $0.30. Next investigation should address preservation of actionable details when folding updates into corrections, using saved failures before proposing another prompt change.
All eight responses report OpenAI as the upstream provider; provider routing did not vary in this sample. Briefing TypeScript checks pass after restoration.
