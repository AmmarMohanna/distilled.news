# Existing evaluator reliability and measured briefing quality

This study extends the operational evaluator without changing its deployed prompts, validators, model routing, accounting, dashboards or publisher. The evidence supports using it as fallible triage. It does **not** establish automated certification of briefing quality or statistical superiority over simpler baselines.

## Protocol and execution

Branch `research/evaluator-reliability`; base `c41d33b04d24b72efa7c7edf7ede0c9ad721f38f`. Protocol frozen `2026-11-14T21:40:40.287Z`, SHA-256 `058c587625e0406d181b9f702961ab6dd63935828f2c7dd0c4c3abdb5f1a3cb4`. The original disk-interrupted results are preserved in `PARTIAL_REPORT.md`; this report supersedes its experiment-status statements.

The source inventory is candidate-blind; expected labels were frozen separately and never supplied to either tested judge. References are source-relative AI-curated constructions, not human adjudication. No claim of external real-world truth, universal news importance or exhaustive news recall is made.

## Reliability measurements

Completed-only case-level any-fault metrics are below. Category-specific counts and all language strata, failures, abstentions and disagreements are preserved in `FINAL_RESULTS.json`. A temporal fault recognized as factual still counts as case-level detection. Missing/failed assessments are not counted as correct.

| Set / judge | Planned | Attempted | Completed | TP / FP / FN / TN | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| Constructed (7 event groups) / anthropic--claude-sonnet-4.5 | 42 | 42 | 37 | 16 / 1 / 0 / 20 | 94.1% | 100.0% | 97.0% |
| Constructed (7 event groups) / openai--gpt-4.1 | 42 | 42 | 37 | 14 / 0 / 3 / 20 | 100.0% | 82.4% | 90.3% |
| Retained-source (2 events) / anthropic--claude-sonnet-4.5 | 12 | 12 | 11 | 6 / 1 / 0 / 4 | 85.7% | 100.0% | 92.3% |
| Retained-source (2 events) / openai--gpt-4.1 | 12 | 12 | 12 | 6 / 0 / 0 / 6 | 100.0% | 100.0% | 100.0% |

Constructed cases are 21 matched faults and 21 known-correct controls across English, Arabic and French. The real-source set has six faults and six controls, from two retained Arabic statements, with English/Arabic/French output variants. Neither set is pooled with real published-quality measurements. Artificial prevalence and dependent translations prevent extrapolating precision to production.

### What failed or disagreed

- GPT-4.1 missed all three language swaps: French requested with English supplied, Arabic requested with English supplied, and English requested with French supplied. These passed validation and raised no alert.
- Claude caught the language swaps, but falsely marked correct controls adverse, including a valid French paraphrase of an Arabic source. Its explanation conflated source/output language and optional detail omissions. Stronger cross-family agreement is not a factual oracle.
- Both judges identified evacuation omissions in raw coverage rows, but added inconsistent factual/relevance findings. The unchanged validator rejected those complete reviews with `UNBOUND_REVIEW_FINDING`. GPT also had an Arabic repetition validation failure; Claude had an additional French quantity-case failure. These remain failures, not silently normalized outputs.
- Claude labeled wrong meeting dates as factual contradictions rather than temporally incorrect. The error was detected, but category agreement differs.

- Constructed / anthropic--claude-sonnet-4.5: target-category recall 81.2%; attempted-fault failure-adjusted lower/upper bounds 61.9% / 85.7%; completed latency p50/p95 21833/35484 ms.
- Constructed / openai--gpt-4.1: target-category recall 82.4%; attempted-fault failure-adjusted lower/upper bounds 66.7% / 85.7%; completed latency p50/p95 10153/31898 ms.
- Real-source / anthropic--claude-sonnet-4.5: target-category recall 100.0%; attempted-fault failure-adjusted lower/upper bounds 100.0% / 100.0%; completed latency p50/p95 27594/43568 ms.
- Real-source / openai--gpt-4.1: target-category recall 100.0%; attempted-fault failure-adjusted lower/upper bounds 100.0% / 100.0%; completed latency p50/p95 15884/33892 ms.

Category metrics use the frozen mask: target positive for each injected fault, all categories negative for correct controls, collateral consequences unlabelled. Full seven-category tables and language counts are in the JSON. `flagged()` also includes uncertainty and evidence limitations, so an alert is not a proven-error verdict.

## Paired comparison: actual executions

Four existing systems were run on identical full retained inputs, with a declared cold start and separate chronological output histories. No paid V3 or single-LLM output was regenerated to improve a score. Historical and prospective cohorts each have three windows from one English feed. The retained sources have partial/unknown completeness. This is a small exploratory core replay, not scheduler or end-to-end delivery benchmarking.

An initial large historical Arabic trial (three-window track, 615 article occurrences) executed all-headlines/keyword selection. Single-LLM and V3 both failed citation validation on the first window. Those model outputs cited internal IDs instead of supplied S-labels; costs and failure artifacts are retained. They are not converted into low-quality published prose or used to claim a baseline win.

The Windows Python adapter initially used CP1252, causing keyword hashing to fail on UTF-8 data. A regression test reproduced the failure; explicit UTF-8 fixed the research adapter. All six existing all-headlines outputs were byte-equivalent after the correction. Keyword outputs were generated deterministically and scored in a separate supplement. Original adapter failures remain available. No application selection or production pipeline was changed.

| Cohort / system | Generated | Assessed | Failed assessment | Claim support | Citation correctness | Development recall | Repetition | Output words |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| recent-historical / all-headlines | 3/3 | 3/3 | 0 | 100.0% | 100.0% | 100.0% | 0.0% | 616 |
| recent-historical / keyword | 3/3 | 2/3 | 1 | — | — | 0.0% | 0.0% | 47 |
| recent-historical / single-llm | 3/3 | 3/3 | 0 | 100.0% | 100.0% | 75.0% | 0.0% | 141 |
| recent-historical / v3 | 3/3 | 0/3 | 3 | — | — | — | — | 82 |
| prospective / all-headlines | 3/3 | 3/3 | 0 | 100.0% | 100.0% | 66.7% | 0.0% | 121 |
| prospective / keyword | 3/3 | 0/3 | 3 | — | — | — | — | 47 |
| prospective / single-llm | 3/3 | 3/3 | 0 | 100.0% | 100.0% | 25.0% | 0.0% | 41 |
| prospective / v3 | 3/3 | 2/3 | 1 | 100.0% | 100.0% | 100.0% | 0.0% | 32 |

Ratios above pool reported numerators/denominators among completed assessments only. They are not a fair paired superiority estimate when availability differs. Empty-output claim/citation denominators are unavailable, not perfect. All-headlines is deliberately an unmatched-length coverage/reading-load comparator. Keyword filtering is the existing Unicode-token lexical algorithm, not a translation-aware model.

### Same-window paired differences

| Cohort / baseline | Completed V3-baseline pairs | Mean claim-support difference | Mean recall difference |
| --- | ---: | ---: | ---: |
| recent-historical / all-headlines | 0 | — | — |
| recent-historical / keyword | 0 | — | — |
| recent-historical / single-llm | 0 | — | — |
| prospective / all-headlines | 2 | 0.0% | 0.0% |
| prospective / keyword | 0 | — | — |
| prospective / single-llm | 2 | 0.0% | 0.0% |

Differences are V3 minus baseline on the same windows with both reviews completed; null-denominator metrics are omitted, and denominators vary by dimension. These tiny, connected samples have no inferential confidence interval. Inventories are independently candidate-blind but can vary between assessments, so development recall has additional judge variance. GPT judging GPT-generated systems also creates potential family bias.

## Actual published briefings, kept separate

Six already-paid deployed GPT-4.1 reports were retrieved and verified against the exact retained snapshot hash. They assess the real published output with its actual prior history, unlike the cold-start replay. They are observations from the existing fallible evaluator, not ground-truth accuracy measurements.

| Cohort / edition | Claims judged | Claim support | Citation correctness | Development recall | Status |
| --- | ---: | ---: | ---: | ---: | --- |
| recent-historical / `41de1d7ad9e1` | 2 | 100.0% | 100.0% | 50.0% | flagged |
| recent-historical / `5b5376c73917` | 1 | 100.0% | 100.0% | 100.0% | flagged |
| recent-historical / `f9387f2b30a2` | 0 | — | — | — | flagged |
| prospective / `daf249163750` | 2 | 100.0% | 100.0% | 100.0% | flagged |
| prospective / `4389e5bdc270` | 0 | — | — | — | flagged |
| prospective / `2ff099366744` | 0 | — | — | 0.0% | flagged |

Independent new assessment was also attempted with both families; completed and rejected assessments are enumerated in the JSON. Most were rejected by OpenRouter’s in-flight-credit guard. No disagreement is inferred where one judge failed to produce a review. Existing evidence-completeness limitations mean apparent omission or clean support cannot establish external completeness.

## Accounting and operational limitations

Confirmed cost of this research across every new local ledger and generation journal, including failed attempts: **$2.647022**. Outstanding conservative reservations: **$2.179596**. Total recorded call identities: **417**.
Provider rejection responses recorded: **19**. These include HTTP 402 `in_flight_budget_exhausted`, distinct from exhausted key balance. They remain recorded with their original local UNKNOWN holds; rejected requests are not claimed as completed inference. No automatic retries or rewriting live financial history occurred.

The initial two storage-interrupted paid stages remain unresolved, with no durable generation receipt sufficient for safe recovery. No repeat inference was sent for those operations. Settled outputs were reused. Existing deployed-report retrieval incurred no new judge call; its historical cost is outside the new research total.

## Untouched-window decision and unperformed work

Retrieved roster: 28 snapshots, including 22 post-freeze windows. **Zero** nonempty post-freeze windows have complete retained-source declarations. Event independence from earlier related news is also not certified. The three wholly post-freeze chronological windows were exercised and reported as exploratory; they are **not** relabeled independent held-out data.

A fully observed fair paired campaign, independent human calibration and event-independent complete-evidence confirmatory testing remain unperformed. Provider/storage/schema failures are not substituted with configuration, tests or favorable subset scores. There is no statistically supported conclusion that Distilled.news outperforms simpler baselines.

## Conclusion

The evaluator detects many straightforward source-relative quantity, modality, citation and relevance faults, but its language judgments and schema robustness are unreliable enough to prevent automatic quality certification. Cross-family judging exposes genuine disagreements and false positives; it should remain an offline diagnostic until independently calibrated. Use metric-specific evidence, retain failed/unassessable states, and validate new independent source-grounded cases before treating automated scores as proof of product quality. No production change was made to chase these scores.

## Provider balance clarification

A subsequent authenticated read of the account credit endpoint reported total credits $7,619 and usage $7,618.956905921: about **$0.043094079 account balance**. This is distinct from the key’s approximately $16.77 remaining spending allowance. The nearly depleted account balance explains persistent admission refusals; continuing the missing model assessments requires account credit, not a new application monetary limit.

## Case-level detection by language

| Set / judge / language | Completed | Failed reports | TP / FP / FN / TN | Precision | Recall | F1 |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| synthetic / anthropic--claude-sonnet-4.5 / en | 12 | 1 | 5 / 0 / 0 / 7 | 100.0% | 100.0% | 100.0% |
| synthetic / anthropic--claude-sonnet-4.5 / ar | 13 | 1 | 6 / 1 / 0 / 6 | 85.7% | 100.0% | 92.3% |
| synthetic / anthropic--claude-sonnet-4.5 / fr | 12 | 2 | 5 / 0 / 0 / 7 | 100.0% | 100.0% | 100.0% |
| synthetic / openai--gpt-4.1 / en | 13 | 1 | 5 / 0 / 1 / 7 | 100.0% | 83.3% | 90.9% |
| synthetic / openai--gpt-4.1 / ar | 11 | 3 | 4 / 0 / 1 / 6 | 100.0% | 80.0% | 88.9% |
| synthetic / openai--gpt-4.1 / fr | 13 | 1 | 5 / 0 / 1 / 7 | 100.0% | 83.3% | 90.9% |
| realSourceChallenges / anthropic--claude-sonnet-4.5 / en | 4 | 0 | 2 / 0 / 0 / 2 | 100.0% | 100.0% | 100.0% |
| realSourceChallenges / anthropic--claude-sonnet-4.5 / ar | 3 | 1 | 2 / 0 / 0 / 1 | 100.0% | 100.0% | 100.0% |
| realSourceChallenges / anthropic--claude-sonnet-4.5 / fr | 4 | 0 | 2 / 1 / 0 / 1 | 66.7% | 100.0% | 80.0% |
| realSourceChallenges / openai--gpt-4.1 / en | 4 | 0 | 2 / 0 / 0 / 2 | 100.0% | 100.0% | 100.0% |
| realSourceChallenges / openai--gpt-4.1 / ar | 4 | 0 | 2 / 0 / 0 / 2 | 100.0% | 100.0% | 100.0% |
| realSourceChallenges / openai--gpt-4.1 / fr | 4 | 0 | 2 / 0 / 0 / 2 | 100.0% | 100.0% | 100.0% |

Language strata are tiny matched variants, not independent multilingual population estimates. A blocked stage without a terminal result remains included in the attempt/financial register even when absent from failed-report counts.

## Replay adapter boundary

Evaluator snapshots do not retain the full original publisher identity; the existing replay adapter uses article IDs as source metadata. The reused core replay also does not apply every deployed rollout flag, scheduling policy or Worker publication mechanism. Citation failures in that replay cannot be directly attributed to current production output. The separate deployed reports assess actual published prose and its actual history.

## Reproduction and validation

Run `python evaluation/briefing-quality/validation/final_report.py` from the research worktree to rebuild this report from the ignored private run artifacts. Source hashes recorded after execution are in the JSON; they support reproduction but are not falsely represented as preregistered hashes. The original blind-run manifest and pre-inference protocol freeze remain immutable.

Twelve analysis, privacy, denominator and multilingual bridge regression checks passed. The unchanged evaluator suite passed 104 tests; the offline TypeScript check passed. These are recorded separately from model measurements. All raw evidence, provider replies, generation journals and rejected artifacts remain private; public structured reports contain metadata, hashes, counts, errors and scores. No Worker or dashboard was deployed.
