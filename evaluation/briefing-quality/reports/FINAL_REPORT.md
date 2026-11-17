# Evaluation status report — October 28, 2026 (Beirut)

**Offline implementation and measurements are available; the overall evaluation is incomplete.** There are no new paid model outputs, human reference labels, interviews or participant observations. Current mechanical results are in [offline-v2.json](offline-v2.json); exact commands are in [README](../README.md). Human work is specified in [HANDOFF](../HANDOFF.md); spending approval is pending for [the bounded proposal](PAID_RUN.md).

All changes are under `evaluation/briefing-quality/` on branch `evaluation/briefing-quality-user-study`. Application code, frontend, production resources, feeds and accounting behavior were not changed. Nothing was deployed, acquired, committed or pushed. Raw evidence, generated reader text and review/participant artifacts remain Git-ignored.

## Fresh dataset verification

Aya's archive SHA-256 is `8fadc205f5f77529d430eb6037b0c43ee8e4be3cc8aa4a2b6834f37358462652`; snapshot SHA-256 is `cdba80b052b5c86285daa8cb635683caf747725076da002ad03aa76e04305ed2`. The supplied Downloads README was read. The frozen pilot overlaps the extension and is not independent test material.

All 103 checksum entries passed, with complete ZIP file coverage. All 95 cases rebuilt exactly from the original snapshot and interval plan, including historical profiles, language, source identities, original timestamps, bodies and provenance. Additional checks parse timezone-aware instants, reconstruct accepted-arrival half-open membership, enforce freeze cutoff, verify track feed ownership/sequence indices/adjacency and reject future history seeds. The 89 unassigned records matched exactly; no timestamp was guessed. The snapshot contains 912 original records and is not an atomic database backup.

The dataset contains 565 distinct acquired IDs, 817 occurrences, 13 feeds and 12 empty windows. Of the occurrences, 443 are stored COMPLETE and 374 UNKNOWN completeness; neither storage label establishes independent extraction correctness. No missing publication/acquisition timestamps were observed in the selected exported occurrences; missing-date challenges are therefore synthetic. Publication time is not event time, and availability replay is not production freshness admission or original scheduler replay.

| Output language | Cases | Development | Validation | Held-out | Exact-overlap components, dev/val/test |
| --- | ---: | ---: | ---: | ---: | --- |
| English | 75 | 54 | 15 | 6 | 2 / 2 / 1 |
| French | 6 | 3 | 3 | 0 | 1 / 1 / 0 |
| Arabic | 14 | 3 | 8 | 3 | 1 / 1 / 1 |

These remain provisional, not certified independent story splits. Whole tracks and feed/ID/exact URL/body components stay together. The new lexical/normalized-URL screen nominated **seven cross-split pairs** for steward review; false positives and missed cross-language/related developments remain possible. No model selection or held-out claim is licensed by these counts. Mechanical access to the complete archive is logged; semantic draft packets and baseline outputs are development-only.

French has only two feeds in the snapshot. Three unused French snapshot records do not create a new independent feed component. Existing development/validation material, the pilot, or a translation of exposed material must not be silently renamed held-out. The defensible default is to leave French held-out unavailable until a new previously unexamined retained independent French chronological track can be audited and semantically reviewed. New scraping/costs need separate authorization. Exploratory two-component cross-validation would not restore independent held-out evidence. The freeze tool requires an actual human certificate and refuses unresolved/linked candidate decisions.

## Completed fresh offline replay

Both extractive baselines ran chronologically on the same **60 development windows**, 120 system-window outcomes. Each has its own actual locally published reader text, explicit null-history cold starts, track resets and input hash. Neither baseline claims semantic historical novelty filtering. All-headlines can produce a substantially longer reading workload than selective systems; it is an evidence/coverage baseline, not a matched-length product substitute. Keyword filtering uses lexical interest overlap and a five-item cap.

| Language | Windows per system | All-headlines nonempty outputs | Keyword nonempty outputs | Input article occurrences |
| --- | ---: | ---: | ---: | ---: |
| English | 54 | 47 | 47 | 275 |
| French | 3 | 3 | 0 | 15 |
| Arabic | 3 | 3 | 3 | 34 |

The French keyword baseline selected nothing despite 15 input occurrences. This is an observed lexical-selection failure candidate, not a human-adjudicated count of missed important facts. Per-case outputs, inputs and reader history are retained privately. All extractive runs had zero exceptions, retries, model tokens and model costs. Those zeros say nothing about V3 operating cost.

Local latency p50/p95 and denominators are recorded separately by system/language in the machine report. They cover local selection/history handling only, excluding artifact writes, acquisition, models, database publication and notification. Three-window French/Arabic p95 values are interpolated descriptions of tiny samples, not reliable tail-service guarantees. No live end-to-end latency was measured.

| Language | System | Terminal windows | p50 ms | p95 ms |
| --- | --- | ---: | ---: | ---: |
| English | All-headlines | 54 | 0.019 | 0.054 |
| English | Keyword | 54 | 2.042 | 17.822 |
| French | All-headlines | 3 | 0.017 | 0.023 |
| French | Keyword | 3 | 1.156 | 4.760 |
| Arabic | All-headlines | 3 | 0.026 | 0.050 |
| Arabic | Keyword | 3 | 12.903 | 15.328 |

Both baselines also executed on ten separately labeled synthetic/adversarial cases: duplicates, same-URL revision, missing date, conflicting reports, incomplete evidence, empty input, high volume, cross-language repetition, embedded malicious instructions and oversized input. These results are not pooled with real-data quality. The actual V3 preparation stage ran on 60 real development cases plus all ten synthetic cases. Eight distinct normalized bodies were folded into other articles in real development, plus one synthetic revision body. Differences alone do not certify important updates. The oversized synthetic article failed explicitly before model admission.

The replay regression reproduces a concrete preparation risk: two same-URL bridge reports with different statuses become one source body while both IDs are associated with it. In the controlled fixture, the later failed-inspection sentence disappears. This is a synthetic counterexample about current preparation, not a claim that eight real factual mistakes occurred. App behavior is preserved. Known historical factual failure fixtures remain unchanged and were rerun as regression tests, not relabeled as new benchmark quality measurements.

## Implemented comparison and analysis

The isolated harness imports the actual core V3 editor → verifier → targeted repair path. GPT-4.1 edits/repairs and GPT-4.1 mini verifies; replay clock is the window end. It preserves raw input artifacts and records V3's existing normalization/dedup/skip behavior. The single-LLM baseline uses full raw articles and one GPT-4.1 editor call, with the same interests, output-language/reading-budget instructions and own-history selector; it has no verifier, repair, tools or retrieval. All published history is actual system prose. No reference text is used as memory. A candidate model variant was not introduced because there are no adjudicated development findings to validate one yet.

The current proposal selects nine consecutive development windows across three independent tracks, including one empty interval. Zero-call preflight passed the revised complete-input limits for all nine before generated history growth. The first preflight correctly rejected Arabic inputs under an overly small proposed guard; this was corrected before requesting spending approval. The current manifest hash is `592b5940e47963f4e22c2f7bc9432347c562409f3c495bd3c9c6721a7388aca0`. Estimated normal cost is $0.82/24 calls; requested hard caps are $5/60 calls/$0.50 reservation per call. Chunking, repairs, malformed replies and real output lengths can change actual spend. See the provider-linked estimate and execution path in [PAID_RUN](PAID_RUN.md).

This is a **core model replay**, excluding Worker account reservations/settlement, scheduler freshness, pending-source carry, runtime recovery, live publication and notifications. Those production mechanisms remain untouched. A local append-only journal reserves before send, records successful response usage, retains unknown-outcome holds and fences transport retries/restarts. The runtime analyzer includes failed-attempt costs, unresolved-cost bounds, failures, corrective retries, tokens, published/empty/rejected/missing cases and p50/p95 over declared populations. There are no paid latency/cost results yet.

Quality analysis separately implements accuracy, relevance, importance-weighted coverage, critical-fact completeness, all-fact recall, duplicate rate and novelty precision. It validates finite counts and private evidence, separates human from AI origin and development from validation/held-out, and reports per-case plus micro/macro results, numerators, denominators, undefined/missing judgments and paired differences. Uncertainty uses the independent leakage component, not overlapping windows; with fewer than five components it reports ranges and suppresses a bootstrap interval. Current per-language component counts are too small for strong inference.

The expected roster contains **240 missing human case/system judgments** (60 cases × four systems). Human factual quality metrics are unavailable for every system/language. Agreement analysis likewise has zero paired reviewed units: 275 English, 15 French and 34 Arabic article-occurrence pairs are missing for each dimension. Kappa is null, not perfect. Duplicate acquired IDs across windows are deliberately different review contexts. Reference packets include source pointers, candidate coverage/excerpts, mechanical duplicate/recurrence groups, relevance hints and uncertainty; all are AI-generated drafts pending full-body human review. Blind extractive packets and immutable independent-review/adjudication workflows are prepared.

## Participant work and validation

Screening, consent drafts in all three languages, interview questions, observation fields, four-way counterbalancing and multilingual A/B task drafts are provided. The six task packs have evidence-linked draft comprehension prompts. Human reference answers, acceptable alternatives, importance and A/B difficulty/story-independence matching remain required, as does an actual V3 output in the Distilled condition. The packs are therefore not ready for participants today. No participants were contacted or fabricated. The new study analyzer validates pairing, count/rating ranges, missingness, timeouts/withdrawals and repeated participants; it reports time, missed information, comprehension, usefulness and effort separately. Empty-template plumbing validation recorded zero participants.

Validation passed **134 tests**: 21 Python evaluation tests, ten new replay tests, 100 existing briefing tests and three exporter tests. The standalone TypeScript check passed. Initial command/setup failures (missing pnpm, sandbox loader access, an incorrect package-relative Vitest config path) were corrected; none are semantic model results. Repeated preparation runs are preserved privately, not counted as extra independent cases.

The final [validation record](validation.json) rechecked all 21 recorded source hashes with zero mismatches, exact public/private proposed-manifest equality and Git-ignore protection for the snapshot. The private `run-20261027/observed-failures.json` register links the three empty French keyword outputs and the synthetic revision counterexample to their retained evidence. `BRIEFING_EVAL_OPENROUTER_KEY` is currently absent; no credential was read or printed.

Git revision: `c5f6b08aea98406d26474c49e77f82f4cd150786`. Python 3.11.9; Node 24.11.1; Vitest 3.2.6. The machine audit and proposed manifest record source/config/prompt hashes, including the evaluator and current engine. No provider version has been measured in a new call; requested aliases and provider-returned identifiers will be recorded if authorized. Historical benchmark prices/outputs are not new measurements.

Remaining inputs are specific: explicit spending approval and a dedicated evaluation key; a steward's semantic split decisions plus genuinely independent French retained data if French held-out claims are required; independent proficient reviewers and adjudicated references/output labels; and actual consented participant observations/interviews. Follow [HANDOFF](../HANDOFF.md), rerun analyses after those inputs arrive and update this report. Until then, overall evaluation completion and product-quality/user-benefit conclusions remain unsupported.
