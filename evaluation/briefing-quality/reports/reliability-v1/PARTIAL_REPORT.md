# Evaluator reliability: partial measured report

The existing evaluator is useful for triage, but these measurements do not establish reliable automatic certification of briefing quality, nor superiority of Distilled.news over simpler baselines. The run is incomplete because the local disk filled. No production code, deployment, accounting, dashboards or publication behavior changed.

## Scope and frozen protocol

- Branch: `research/evaluator-reliability`, based on `c41d33b04d24b72efa7c7edf7ede0c9ad721f38f`.
- Protocol frozen at `2026-11-14T21:40:40.287Z`, SHA-256 `058c587625e0406d181b9f702961ab6dd63935828f2c7dd0c4c3abdb5f1a3cb4`.
- Constructed sources: 42 cases, 21 injected faults and 21 correct controls, three languages, seven event groups.
- Independent references derive from the supplied source assertions and controlled transformations. Tested judges never see expected labels. References are AI-curated, not human gold. Valid paraphrases and a necessary update are negative controls.
- A separate 12-case real-source challenge set was constructed from two retained events, preserving quantities, uncertainty and attribution across three output languages. It has **not been run**. It is not full-window published-output quality.
- The original 104 evaluator tests passed before inference; eight analysis/benchmark-construction checks are separate from those model measurements.

## Completed model measurements

These are the actual completed subsets, not the planned 42 cases per model. Missing and failed reviews are not counted as correct outputs. The subsets differ and must not be used to rank the two judges.

| Judge | Attempted | Completed | Correct controls | Case TP / FP / FN / TN | Precision | Recall | F1 | p50 / p95 ms |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| anthropic--claude-sonnet-4.5 | 13 | 11 | 7 | 4 / 0 / 0 / 7 | 100.0% | 100.0% | 100.0% | 21053 / 36406 |
| openai--gpt-4.1 | 27 | 23 | 13 | 9 / 0 / 1 / 13 | 100.0% | 90.0% | 94.7% | 8703 / 18324 |

Case detection means any strict adverse category. Target-category detection is different: a wrong date can be detected as factual without being labeled temporal. No completed correct control triggered the deployed alert in either partial subset. This small constructed sample does not establish a production false-positive rate.

| Category | GPT TP / FP / FN | GPT F1 | Claude TP / FP / FN | Claude F1 |
| --- | --- | ---: | --- | ---: |
| factual | 1 / 0 / 0 | 100.0% | 0 / 0 / 0 | unavailable |
| citation | 2 / 0 / 0 | 100.0% | 0 / 0 / 0 | unavailable |
| coverage | 0 / 0 / 0 | unavailable | 0 / 0 / 0 | unavailable |
| relevance | 2 / 0 / 0 | 100.0% | 1 / 0 / 0 | 100.0% |
| repetition | 1 / 0 / 0 | 100.0% | 1 / 0 / 0 | 100.0% |
| temporal | 3 / 0 / 0 | 100.0% | 0 / 0 / 1 | 0.0% |
| language | 0 / 0 / 1 | 0.0% | 1 / 0 / 0 | 100.0% |

The prespecified scoring mask evaluates each injected target category as positive and all categories as negative on correct controls. Collateral effects of a mutation are unlabelled, not asserted negative. These are targeted challenge metrics, not a complete deployment category-confusion matrix. Zero positive observations produce unavailable recall/F1, not a perfect score. Full counts, language strata, uncertainty, failures and disagreements are in `aggregate-results.json`.

## Errors missed, failures and disagreements

- GPT-4.1 accepted an English statement when French was explicitly requested; its explanation called the English output correct. The result passed validation and raised no alert. Claude correctly flagged the language mismatch.
- Claude recognized the wrong meeting date as a contradicted factual claim and raised an alert, but labeled the temporal dimension correct because the future tense was appropriate. This is a category disagreement, **not an undetected date error**.
- GPT failed validation on all three attempted language versions of the evacuation-omission fault. Claude failed the attempted Arabic version. Their raw coverage rows correctly identified the omitted district, but extra narrative findings mislabeled the omission as factual/relevance despite otherwise supported/relevant item assessments. The unmodified validator rejected these with `UNBOUND_REVIEW_FINDING`. No result was silently repaired or counted as a clean briefing.
- Storage interruption also left unfinished paid stages. Parser/provider/storage failures are preserved; unresolved operations are not resent.

- anthropic--claude-sonnet-4.5: completed target-category recall 75.0%; failure-adjusted lower/upper bounds among attempted target faults 50.0% / 83.3%. These bounds do not include unattempted cases.
- openai--gpt-4.1: completed target-category recall 90.0%; failure-adjusted lower/upper bounds among attempted target faults 69.2% / 92.3%. These bounds do not include unattempted cases.

There are 2 preserved structured disagreements among jointly completed cases. Translations and paired mutations are clustered by their shared event; the seven constructed groups do not justify broad statistical superiority claims.

## Actual historical baseline execution

Existing all-headlines and keyword implementations executed on three consecutive retained Arabic windows on 1 November. All 615 input article occurrences were supplied without truncation. These are one exposed, overlapping historical track; extraction completeness flags are absent from the export. They are not untouched held-out events.

| Window end UTC | Input occurrences | All-headlines items | Keyword items |
| --- | ---: | ---: | ---: |
| 2026-11-01T17:55:00.000Z | 205 | 205 | 5 |
| 2026-11-01T18:55:00.000Z | 214 | 214 | 5 |
| 2026-11-01T19:55:00.000Z | 196 | 196 | 5 |

Those six deterministic executions made zero model calls and incurred zero model cost. Their selection/reading-load observations are **not quality scores**. Single-LLM and V3 generation, blind paired semantic scoring, and untouched event-independent chronological testing have not run. Therefore there is no measured finding that Distilled.news is better than any baseline. The paired runner reuses the existing engine and baseline implementations, but available code is not an executed experiment.

## Actual cost and interruption

- Confirmed cost across every local ledger, including failed reviews: **$0.544161**.
- Unresolved reservations in interrupted stages: **$0.186499**, preserved separately; they are not settled as zero.
- Recorded paid-stage rows: 119. Full provider response IDs, usage, actual stage latency and immutable requests/responses remain private.
- Prices were read from OpenRouter before execution. Existing accounting/prompt/validator code was reused; no live financial records were modified.
- The disk filled during execution. Subsequent read-only remote-snapshot retrieval and proposed reproducible-build cleanup could not pass automatic approval because the approval service timed out/disconnected. Those actions were not executed. At least 1 GB of free disk space was requested before resuming paid work.

## What remains unperformed

1. Finish the frozen synthetic roster, without resending unknown or terminal operations.
2. Execute the separate frozen real-source challenge set and retain its metrics separately.
3. Complete qualified full-window V3/single-LLM generation and paired blind baseline quality assessment.
4. Qualify genuinely untouched, event-independent chronological windows after protocol freeze. No held-out quality score is reported.
5. Obtain independent human/expert calibration if a claim of factual scientific accuracy is desired. Automated agreement alone does not supply it.

The direct evidence supports one actionable conclusion: treat the current evaluator as fallible triage, display failed/unassessable evaluations explicitly, and validate schema robustness and requested-language adherence on new independent material before using its scores as product-quality proof.

## Validation record

The eight analysis/construction checks and the offline TypeScript check passed. The latter included the existing generated Worker bindings. No additional inference was run to tune the primary scores after inspecting failures.
