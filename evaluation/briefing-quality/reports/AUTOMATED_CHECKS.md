# Automated evaluation checks — November 1, 2026

The added offline gate passes 197 automated tests: 59 Python evaluation tests,
35 replay/provider-double tests, 100 existing briefing-engine regressions and
three exporter tests. TypeScript checking also passes. Run
`python evaluation/briefing-quality/continuous.py` to reproduce the gate; its
per-stage logs and latest JSON report are under ignored `reports/continuous/`.

Coverage added in this pass includes ZIP/checksum safety, interval admission,
duplicate and future history inputs, semantic split certification, missing and
invalid quality labels, deterministic aggregate comparisons, participant
pairing/count/rating boundaries, timeouts and missing denominators, unknown
financial outcomes, duplicate journal states, reservation ordering, token/cost
validation, concurrent call ceilings and report failure/timeout behavior.

Tests identified and fixed unsafe checksum-path handling, silent acceptance of
invalid/duplicate runtime accounting records, nonfinite budget/request limits,
invalid provider token counts and same-timestamp report-directory collisions.
Application and production accounting code were not changed.

A separate read-only check of the retained local dataset passed for all 95
cases and matched its snapshot hash. It counted 443 COMPLETE and 374 UNKNOWN
article occurrences. Those are retained completeness labels, not an independent
claim that extraction or factual reporting is correct. No private article text
is included in this report.

Paid model calls: 0. Deployed briefings inspected: 0. Human labels/participant
outcomes collected: 0. The previous dated reports remain historical records.
The evaluator source changes invalidate the old paid proposal's source hashes;
a fresh exact manifest must be reviewed before paid execution.

The continuous workflow and tests remain local/uncommitted on the evaluation
branch. They have not been enabled on GitHub or deployed. See
`../CONTINUOUS_EVALUATION.md` for activation requirements and the proposed
evidence-grounded LLM reviewer design.
