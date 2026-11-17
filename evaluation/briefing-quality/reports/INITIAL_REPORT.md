# Initial evaluation report — October 27, 2026

## What was measured

Offline mechanical audit of Aya's `v3-extended-acquisition-20261023.zip`, followed by development-only extractive baseline generation. No live acquisition, deployment, model calls, participant observations or human quality judgments were performed. Machine-readable evidence and exact archive hash: [dataset-audit.json](dataset-audit.json).

All 103 checksummed archive entries passed. All 95 case hashes and the source snapshot hash passed. Exported article bodies and publication/acquisition/availability timestamps matched the snapshot. Reconstructed accepted-arrival membership matched every interval, and replay tracks had consecutive windows. These establish reproducibility of retained evidence, not factual correctness or healthy collection.

| Requested output language | Cases | Distinct acquired IDs | Occurrences | Empty cases |
| --- | ---: | ---: | ---: | ---: |
| English | 75 | 336 | 428 | 11 |
| French | 6 | 40 | 40 | 0 |
| Arabic | 14 | 189 | 349 | 1 |

Overall: 13 feeds, 565 distinct acquired IDs, 817 occurrences, 12 empty cases, maximum 93 articles in a window. Language means feed output language; independent source-language assessment is pending. An acquired ID is not necessarily a unique story.

Source occurrences: RSS 598; Google News 70; LinkedIn company 69; X profile 56; website 18; Telegram 6. Longer experiments overlap shorter cases; these counts are not independent observations.

## Provisional separation

| Language | Development cases | Validation cases | Held-out cases |
| --- | ---: | ---: | ---: |
| English | 54 | 15 | 6 |
| French | 3 | 3 | 0 |
| Arabic | 3 | 8 | 3 |

Assignments keep feed, track, ID, exact URL and body overlaps together. English has only five resulting independent groups, Arabic three, French two. Case counts are intentionally unequal because a 46-window chronological sequence remains intact. Semantic story overlap still requires a data steward's review. French needs additional independent material for held-out testing. Do not present these provisional splits as a certified balanced benchmark.

## Baselines and review readiness

All-headlines and interest-keyword extractive outputs were generated for 60 development cases each. These are preparation artifacts, not quality results. Review packets include original full article evidence, R1/R2 article labeling rows, expected-coverage sheets, blind output packets and a private system mapping. Unknown prior history remains explicitly unknown; neither extractive baseline claims historical novelty control.

No human labels exist yet, so accuracy, relevance, importance, completeness, semantic deduplication and novelty scores are **unavailable**. Current V3 versus improved V3 or single-LLM quality, cost and latency comparisons are **not run**. Human study outcomes are **not observed**. Zero paid calls means no paid evaluation was conducted; it is not evidence of zero-cost V3 operation.

## Representative failure risks to review

- Literal keyword overlap can miss cross-language relevance and paraphrases; it can select irrelevant articles sharing generic terms.
- Five-item selection can omit essential developments in a 93-article window; importance requires human reference coverage.
- Exact URL deduplication can suppress a material same-URL revision; different URLs can still repeat one story.
- Extracted headlines preserve source wording but can retain misleading wording or omit qualifications in the body.
- Empty intervals do not establish collector success or absence of news. Retrospective replay cannot establish production notification latency.

These are specified baseline limitations and review targets, not adjudicated observed output failures. Populate the evidence-backed failure register after review.

## Remaining work for valid conclusions

Human-review and freeze splits, add independent French data, adjudicate expected coverage, run budgeted current V3/single-LLM comparisons, and conduct the counterbalanced user study. Report all six dimensions per language with denominators and failure cases; avoid treating hundreds of overlapping records as independent samples. Operational acquisition/notification and sustained-load measurements require a separate instrumented runtime study.
