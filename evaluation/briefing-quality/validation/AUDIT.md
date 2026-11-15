# Existing evaluator audit

Base: `c41d33b04d24b72efa7c7edf7ede0c9ad721f38f` (`integration/v4-transactional-readiness`). Research branch: `research/evaluator-reliability`.

## Reused implementation

- `worker/src/protocol.ts`: complete retained-input contract, source/passages, exact evidence resolution, atomic claims, coverage, item judgments, operational flags, metrics and alert behavior.
- `worker/src/grounding.ts`: candidate/history-blind inventory, separate entailment gate, structured coverage and exact reader-history ownership. These are the current V3 semantics, not an older judge prompt.
- `worker/src/complete-review.ts`: the existing one-time correction for missing inventory assessment rows. No extra retry/repair policy was introduced for this experiment.
- `worker/src/budget.ts` and evaluator migrations: reservation before send, durable generation correlation, settled response reuse and unknown-outcome fences. The experiment uses independent local SQLite databases and file-backed R2-compatible immutable evidence; it cannot modify live accounting.
- `evaluate.py:baseline`: the existing all-headlines and Unicode-token keyword baselines.
- `replay.ts:runOne`, `publishHistory`, `budgetPort`: the actual current V3 engine, the existing one-editor single-LLM baseline, per-system reader history, and offline generation accounting. Do not equate a local core replay with Worker delivery performance.

The unchanged evaluator suite passed 104 tests before the experiment. Tests demonstrate implementation behavior, not model reliability.

## What must be measured, not assumed

1. Exact quote membership and valid JSON are not entailment proofs. The additional grounding judge can reject unsupported inventory entries, but is another model assessment rather than an independent factual oracle.
2. `claimExtractionCompleteness` is explicitly unestablished. A supported-claim ratio can look perfect while a judge fails to extract a false clause. The benchmark therefore labels source-relative mutations independently of extracted claim counts.
3. Development importance remains an editorial judgment. Coverage faults in this benchmark use explicit, narrowly stated feed requirements, such as naming every district under a mandatory evacuation order. These do not establish universal news importance.
4. `flagged()` includes limitations, uncertain assessments and incomplete evidence. It is a triage alert, not a binary proven-error verdict. Strict adverse-category detection and alert false positives are reported separately.
5. Grounded findings must agree with their structured adverse assessments and name an actual item. An inconsistent narrative finding can cause `UNBOUND_REVIEW_FINDING` and fail the entire review. Such failures are not clean results; effective reliability must include them.
6. Current completeness repair handles only missing development rows. Other malformed or internally inconsistent assessments remain failures. Primary results preserve this behavior; the study does not tune it after observing test labels.
7. Raw matched translations and injected variants are dependent. The constructed 42-case roster has seven event groups, not 42 independent news events.
8. False-positive and precision estimates depend on the artificial challenge prevalence. They cannot be transferred directly to production incidence. The category scoring mask is frozen in the dataset manifest: injected target categories are positive; known-correct controls are negative for all categories; collateral consequences of faults are not assumed negative.
9. Existing retained roster metadata contains English and Arabic, with no French among the selected latest 100 records. Constructed French controls do not supply French real-briefing evidence.
10. Exposed historical cases remain exploratory. A post-freeze timestamp alone does not establish event independence; source identity, translations, related updates and prior development exposure also require qualification.

## Preservation

No Worker, publisher, source collector, model route, live schema, dashboard or notification configuration is changed. No production output is rewritten to improve a score. Source text, generated prose and model responses remain under ignored `private/`; public reports contain aggregates, identities and hashes. Provider failures, parser failures, storage interruptions and unknown costs must remain visible.
