# Human evidence and output review

Current artifacts live in `private/run-20261027/`; paths below refer to files under that run unless explicitly stated otherwise. Use `evaluate.py agreement/quality` for current analysis. The legacy `suite.py score` does not provide the current macro/paired/missing-judgment analysis. Add `cluster` and `judgmentOrigin` to adjudicated JSON records. Preserve R1/R2 originals; status `reviewed` marks an actual completed independent human judgment, never an AI draft. The current draft packets have no human-certified reference facts.

Use categorical spellings `yes/no/uncertain` for relevance and `new/update/correction/repeat/uncertain` for novelty. Reference importance is 0–3 with 3 essential; V3 output importance is a different scale with 1 lead. Unknown initial history precludes claims about complete historical novelty; explain any cold-start convention. Reviewer identity mappings and certificates remain private.

## Review unit and roles

A case is one feed's interest profile, language, time window, retained article evidence and relevant previous published reader text. It is not an individual article. Judge developments and atomic facts against this evidence, not general knowledge. A claim supported by an unreliable source may still be source-faithful; flag source uncertainty separately rather than claiming external truth verification.

Recruit two reviewers competent in each assessed language (one person may cover several), plus an adjudicator. Reviewers first work independently. Calibrate on development only. Reviewers must read full bodies, not only titles. Do not use an assistant's suggested annotations as completed human judgments. Record actual reviewer IDs, dates, rubric version and reasons for changes.

## Expected coverage before seeing system outputs

Use `private/article-review.csv` for R1/R2 article judgments, then `private/expected-coverage.csv` for adjudicated development-level coverage. Mark relevance yes/no/uncertain relative to interests. Assign importance 0=irrelevant, 1=useful context, 2=material development, 3=essential development. Give shared development IDs to reports about the same event, but retain distinct facts and revisions. Expected coverage must list atomic facts, evidence article IDs, exact supporting excerpts and importance. Mark conflicting evidence and uncertainty explicitly. Human-written coverage is a reference for scoring, never input history for a system.

Novelty labels: new development, material update, correction, repeated/confirmation only, or uncertain. Compare to prior actually published content for the system being scored. A different URL or changed text alone does not establish novelty. A new confirmation can be relevant if it materially changes confidence; reviewers must explain why.

Adjudicate every material disagreement. Preserve R1/R2 originals and create a separate resolved version. On the double-reviewed subset report raw agreement and Cohen's kappa for categorical relevance/novelty, weighted kappa for ordinal importance, confusion counts and sample sizes. Do not calculate agreement from adjudicated labels. With small or skewed samples discuss unstable kappa. At least all critical facts and a stratified 20% of other material should be independently reviewed; ideally review all cases twice.

## Output scoring

Review `private/blind/` with `private/output-review.csv`; keep `reviewer-key.json` from reviewers. Break output into atomic factual claims. Each claim is supported, contradicted, unsupported, ambiguous, or not factual. Record evidence IDs/excerpts for each decision. Count contradicted/unsupported separately in the narrative; ambiguous claims are not automatically supported. Exclude nonfactual stylistic text from claim denominators.

| Dimension | Quantitative measure | Review requirement |
| --- | --- | --- |
| Accuracy | supported claims / factual claims | Preserve qualifiers, actors, numbers, dates, attribution; flag severity |
| Relevance | relevant output items / output items | Judge against retained user interests |
| Importance | sum covered reference importance / sum reference importance | Credit each reference fact once |
| Completeness | essential facts covered / all essential facts | Essential means adjudicated importance 3; also report all-fact recall separately |
| Deduplication | redundant output items / output items (lower better) | Distinct updates are not duplicates |
| Novelty | meaningfully new eligible items / eligible items | Requires earlier published reader text; unknown history means unavailable |

The scorer's `criticalRecall` is essential-fact completeness; `coveredWeight/expectedWeight` is importance-weighted coverage. Add unweighted all-fact recall in the final report from the preserved coverage table. Do not collapse dimensions into an unexplained overall score. Zero denominators are N/A. Report counts with every ratio and macro per-case scores alongside micro totals; repeated occurrences are not independent examples. A no-news output with important input has missed coverage, even if it has no factual claims to assess.

For the qualitative 0–4 sheet use 0=severe failure, 1=major deficiencies, 2=mixed/partial, 3=minor deficiencies, 4=meets reference; leave unavailable dimensions blank with reasons. These ratings supplement evidence counts and are not interchangeable with ratios. Output language fluency and article language should be recorded as additional checks, not assumed from the feed's requested output language.

## Challenge coverage

Tag real cases for empty window, high volume, repeated URL, changed body, missing date, partial text, ambiguous attribution, conflicting reports and correction. Mechanical matches nominate candidates; humans certify the category. If a category is absent, record the gap.

Separate synthetic fixtures may vary a development case to introduce a contradictory number, prompt-injection text, duplicate paraphrases, incorrect timestamp, truncated body, unsupported causal claim or cross-language repetition. Preserve the original and transformation in a private manifest; label `synthetic_challenge`. Never mix synthetic results into real-article scores. Expected behavior: retain uncertainty, avoid unsupported claims, consolidate true duplicates, respect evidence as data, and report insufficient evidence rather than fabricate. These scenarios are a test specification, not proof that any system has passed them.

## Failure register

Record case ID, blind system ID, language, dimension, severity, output excerpt, reference evidence IDs, explanation, likely cause, proposed improvement and retest status. Include typical and severe failures, not only selected successes. Never publish full copyrighted article bodies or identifiable participant details.
