# Engine value study - preregistration v1

Registered before engine modifications or new inference. Base a2e111e244fe55a80e0af6aa01313ca24712f26a; isolated branch research/engine-value. Existing 54-case benchmark and six historical windows are development evidence and will not be relabeled held-out or rerun for more detection scores.

## Primary comparison and budgets

Final arms: A original frozen V3/V4 core; B selected opt-in candidate; C single-LLM with the same hard word budget as B; D existing original single-LLM (original soft guide, no hard limit); E unchanged all-headlines; F unchanged keyword. B/C receive identical sources, interests, language, style, metadata and reporting boundaries, and both permit headline-only prose. Every arm maintains its own chronological reader history from common declared initial conditions. No system sees another's outputs/history. No post-hoc truncation may remove qualifications.

B/C budget = round to tens of 200 * min(420,30+0.1*windowMinutes)/60 words, following the existing reading-budget function (110 words for 30 minutes). Freeze a Unicode word-token counter and count headline+body, not citations. Stratify languages; word counts are not equivalent reading effort between languages. A/D keep original options and their soft budget. Report all budget overruns as failures, not successful truncations.

## Prespecified requirements: no composite score

The primary comparative target is >=10 percentage points higher important-development coverage for B versus C, with an event/block-aware 95% interval excluding zero. Importance references are source-only, candidate-blind inventories; they remain fallible model assessments, reported separately by GPT-4.1 and Claude. Agreement is never ground truth. A secondary density benefit is >=10% relative improvement in source-supported important developments retained per 100 words, with visible numerator/denominator and supported essential-fact counts; empty output density is undefined.

Absolute factual gate: any independently source-confirmed material substitution of actor, location, number, date, polarity, attribution, modality or event status in a B output fails factual safety. Zero observed errors does not prove zero risk. Atomic precision target >=99% among resolved extracted claims and non-inferiority versus C at -1 point (one-sided 95% bound). Report supported/all-extracted claims, unsupported, contradicted, uncertain, unextracted-risk limitations and failure-aware bounds separately.

Citation correctness target >=99%, non-inferiority margin -1 point. Verify actual source IDs and evidence bindings; do not confuse literal quotation with semantic entailment, or citation correctness with all-supporting-publisher completeness. Relevance non-inferiority margin -5 points. Repeated-item rate may rise by at most 2 points; preserve updates, corrections and distinct recurring incidents. Language target >=99% resolved compliance and -1 point non-inferiority, with no source-confirmed wrong narration language; report detector abstentions and legitimate quotes/proper nouns separately. Output length must satisfy the shared B/C cap.

Generation cost premium is acceptable only with demonstrated primary benefit and <=2x C mean generation cost. Report dollars, tokens, calls and evaluation overhead separately. Latency criteria: mean and p95 <=2x C and mean incremental generation latency <=5 seconds. These are experiment measurements, not production SLAs. Thresholds are engineering decision criteria chosen before final data; secondary wins cannot rescue failed primary/factual gates.

## Power and uncertainty

For paired coverage gain .10, two-sided alpha .05, 80% power and paired SD .30, approximately ((1.96+.84)*.30/.10)^2=71 independent groups are required; SD .40 needs 126. The 80-120-window planning range is not evidence of adequacy. Estimate dispersion/clustering on validation only before freezing final N.

Factual precision non-inferiority at .01 margin with .10 paired discordance roughly requires 7,840 independent claim pairs before clustering. With zero errors, about 300 independent claims are needed merely for a rule-of-three upper error bound near 1%. Do not claim these precision guarantees from a small sample.

Use paired effects, equal weighting of independent event/block components, 10,000 cluster-bootstrap draws (seed 20261115), exact denominators and failure-aware bounds. Claims, translations, URLs and later windows are not independent sample units. If too few clusters exist, give descriptive results and mark superiority/non-inferiority unestablished rather than relaxing thresholds.

## Data and split certification

Screen existing retained metadata/evidence without inspecting candidate output. If deployment data lack language/subject diversity, collect public publisher evidence into research-only feeds without modifying product ingestion. Archive source responses, canonical URLs, publication/retrieval times, original source metadata, full bounded-source rosters and hashes. Distinguish complete body, headline/listing, partial and inaccessible evidence. Completeness is relative to a declared source universe/window, never all world news.

Group the same event, its corrections, updates and continuing incident chain across publishers/languages/timestamps. Record semantic grouping rationale and unresolved ambiguity. Connect chronological blocks through shared events; keep reader-history dependencies within blocks. No connected component crosses development/validation/final splits. Resets at block boundaries are common declared cold starts, not hidden source history. Previously exposed research evidence is development only. Freeze source-only manifests and chronological split/purge rules before generation, reserving latest independently eligible groups for final testing.

Include naturally available high-volume, quiet, evolving, correction, recurrence and incomplete/conflicting-evidence strata; record missing strata instead of manufacturing examples. Partial evidence can support limited factual checks but not exhaustive recall. If an adequate independent test set is unavailable, report the limitation and do not certify performance.

## Development and ablations

Audit actual paid edit/novelty/verify/repair traces and exclusions. First test narrow changes inside existing calls: explicit candidate-development accounting before compression and claim/evidence verification instead of unexplained item-level approval. Compare neither, each alone and both on development data. Reuse existing evidence-first alternatives and prior negative findings before designing another architecture. Add separate extraction or quiet-window omission calls only if development/validation measures justify the incremental cost.

Keep only changes supported by factual/coverage and cost evidence across both diagnostic judges; unsuccessful candidates remain labeled unsuccessful. Preserve original and corrected outputs, failures, uncertain inventories, abstentions and disagreements. The deployed evaluator stays unchanged; reuse its frozen protocol/local validators and independently check language/evidence. No tuning on a final score. Commit selected engine/options/protocol hashes before final generation; execute eligible final comparisons once.

## Financial and operational controls

No new paid inference until a new finite campaign cap is agreed. Free account/receipt/data checks, source collection, implementation and local tests may proceed. Begin with a small development allocation; attempt a larger comparison only if evidence qualifies and the approved exposure ceiling permits it. New exposure includes actual settled costs plus conservative UNKNOWN reservations. Preserve all earlier ledgers and holds separately. Never resend ambiguous operations, reuse a paid identity with changed inputs or clear a hold without correlated provider evidence.

All candidate features are opt-in on this branch; original defaults and frozen-request bytes remain replayable. Preserve transaction, source-accounting, citation, recovery, spending, visibility and publishing safeguards. No deployment, staging/production writes, dashboards, main merge or notifications. Report negative and inconclusive results and every unmet requirement.