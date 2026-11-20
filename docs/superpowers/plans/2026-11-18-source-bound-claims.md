# General source-bound claim verification

Goal: replace the selected Arabic role/name heuristic with language-independent reader-claim extraction and cited-evidence assessment in the existing verifier path.

Constraints: no deployment, paid inference, historical evidence rewriting, provider retries after unknown outcomes, or new model routing. Preserve legacy frozen policies. Do not claim semantic correctness from substring checks.

Design: the first bounded verifier-model request sees only complete reader text and extracts atomic factual facets with exact reader spans. The second request assesses every facet against only that item's cited evidence and separately checks inventory completeness against the whole reader text. Code enforces complete text-span coverage, all item/facet decisions, exact source quotations and citation membership, complete/uncertain inventory states and agreement between adverse facets and publication verdicts. Source truth and semantic entailment remain model judgments. Existing repair, partial publication, accounting and carry-forward remain authoritative.

1. Write multilingual regression cases for full identity/roles, quantities, locations, negation, attribution, dates, aliases and uncertainty; include malformed inventories and provider failures.
2. Implement inventory and binding parsers plus bounded model orchestration. No automatic rewriting or conversion of uncertainty to support.
3. Freeze a new policy in new window inputs; legacy snapshots retain original bytes. Stop selecting the Arabic heuristic for new windows.
4. Keep evaluator whole-text completeness separate from truth judgments and label legacy Arabic diagnostics explicitly. Do not enable an extra paid evaluator stage by default.
5. Run affected full suites and typechecks. Report offline success separately from unperformed real-model qualification and measured cost/latency.
