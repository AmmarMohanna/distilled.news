# Briefing evaluation research: continuation findings

**Finding:** the existing evaluator is useful triage, with demonstrated language and structured-output weaknesses. The available evidence does not establish that the current Distilled.news engine outperforms all simpler baselines. This continuation adds safeguards and revalidates saved evidence; it does not claim new paid-model measurements.

## What was actually done

- Audited all 54 original benchmark source/reference pairs: 42 constructed cases and 12 retained-source mutations/controls. Source IDs, exact source text and hashes matched. No original reference or paid artifact was overwritten.
- Flagged semantic limits: wrong dates overlap factual/temporal categories; partial district coverage depends on inventory granularity; “correct control” does not independently certify that every judge-selected important development is covered. The v2 audit masks control coverage instead of treating subjective omissions as known false positives. References remain AI-curated, not human gold.
- Added a pinned independent TinyLD 1.3.4 narration checker. It assesses requested output language, allows multilingual quotations, and abstains on names, short ambiguous text and mixed narration. Its scores are not calibrated probabilities.
- Added one bounded, separately accounted correction path for internally inconsistent judge output. It retains the original response, source inventory and paid record. Invalid foreign evidence is not repaired; a still-inconsistent response remains failed. This path passed regression/provider-double tests but has not been validated in new live model calls.
- Retrieved and verified six original frozen engine inputs, including real publisher metadata and source-accounting, citation and novelty policies. The new replay adapter mirrors the actual `v3-window.ts` invocation. Earlier core-default replay scores are preserved and cannot be advertised as current-engine performance.

## Independent language revalidation (zero inference calls)

| Source set | Eligible controls/swaps | Classifiable | Abstained | TP / FP / TN / FN among classifiable |
| --- | ---: | ---: | ---: | --- |
| synthetic | 24 | 20 | 4 | 2 / 0 / 18 / 0 |
| real-source | 6 | 4 | 2 | 0 / 0 / 4 / 0 |

The checker flags two of the three recorded GPT wrong-language misses and abstains on the third. The combined candidate result marks that third case uncertain, not correct. This is development revalidation, not a fresh GPT/Claude rerun or held-out sensitivity estimate. No high score is inferred from excluding abstentions.

## Recorded model results and failures

The prior blind run attempted 42 constructed cases and 12 real-source cases per judge. GPT completed 37/42 and 12/12; Claude completed 37/42 and 11/12. Completed-only constructed any-fault precision/recall/F1 were GPT **100% / 82.4% / 90.3%**, Claude **94.1% / 100% / 97.0%**. Real-source completed-only results were GPT **100% / 100% / 100%**, Claude **85.7% / 100% / 92.3%**. Different failed subsets, dependent translations and artificial prevalence prevent treating these as a ranking or production accuracy.

This continuation prepared **9** consistency-correction requests from saved failed replies and sent **zero**. Original failures, full seven-category TP/FP/TN/FN, precision/recall/F1, language strata and masked denominators are in `RESEARCH_RESULTS.json`. Original provider rejections, unknown operations and schema failures remain failures; raw concern detection is not promoted to a successful review.

## Which system performs better?

- **Wrong-language injections:** Claude detected all three in the original completed sample; GPT missed all three. Claude also had false positives on legitimate controls. No overall family superiority follows.
- **Simple source-relative quantity/modality faults:** GPT detected all six real-source mutations in the small completed sample. Two events translated three ways are not six independent events.
- **Earlier core-default baseline trials:** among completed historical assessments, all-headlines had 100% judged development recall versus 75% for single-LLM, at 616 versus 141 output words. On two prospective matched V3/single-LLM assessments, observed claim-support and recall differences were zero. These results are exploratory, small, incompletely assessed and **not** a completed current-engine comparison.
- **Actual published briefings:** six existing deployed reports were previously snapshot-hash verified; all five extracted claims were judged supported and correctly cited, while potential omissions appeared in some windows. Partial evidence and a fallible judge prevent certification of factual completeness.
- **Current-engine superiority:** inconclusive. Original frozen options are now available, but the fully matched current-engine generation/judging campaign is unperformed because account credit is exhausted.

## Costs, validation and blockers

New inference calls/cost this continuation: **0 / $0**. Prior confirmed study cost: **$2.647022**. Prior conservative unresolved holds: **$2.179596**; those are not settled charges. No old ledger was rewritten.

The provider account was approximately **-$0.03**, despite about $16.37 of unused key allowance. The user selected finishing available work and pushing. Fresh full GPT/Claude reruns, paid consistency corrections and complete current-engine paired scoring remain blocked by account funding. No exposed development window has been relabeled untouched; no suitable certified event-independent held-out set was established.

Local check runner status: **passed**. It covers evaluation Python tests, evaluator/replay tests, existing engine tests, exporter tests and three TypeScript checks. Research Python tests are run separately. GitHub workflow results for the pushed commit are reported separately, not assumed from local tests.

All candidate behavior stays offline. No deployment, production resource change, dashboard change, publication modification, or merge to main was made. Before any monitoring deployment, obtain separate approval and validate the new policy with fresh independent data and complete failure-aware measurement.
