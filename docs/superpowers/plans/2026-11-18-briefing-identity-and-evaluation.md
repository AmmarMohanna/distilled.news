# Briefing identity and evaluation assurance implementation plan

**Goal:** Diagnose the two retained Arabic substitutions, reproduce evaluator false assurance and failed assessments, and implement only evidence-backed safeguards.

**Architecture:** Reuse the selected V3 engine with its V4 editorial prompt and existing evaluator. Add narrowly scoped validation at the first demonstrated failure, and a separate claim-inventory audit that cannot promote support scores. Preserve immutable historical inputs, original responses, failed states and payment uncertainty.

**Constraints:** Branch from main; no deployment, published-news changes, provider submissions or paid inference. Existing paid operation IDs and responses remain immutable. Source-grounded control cases and Arabic wording are required. No publisher quotas, global factual score or relaxed citation validation.

## Tasks

- [x] Capture immutable retained generation inputs/results, paid-stage receipts and evaluator snapshots/responses for the two defective editions and three failed assessments. Record hashes and unavailable evidence explicitly.
- [x] Trace source -> writer/repair -> verifier -> reader text; identify the actual active engine path rather than assuming the legacy proposition pipeline generated these editions.
- [x] Add offline Arabic identity/role regression tests and valid surname/paraphrase controls. Reproduce before fixing; keep fallible semantic checks distinct from deterministic identity checks.
- [x] Replay original evaluator failures under the existing validator. Correct only demonstrated contract bugs; preserve legitimate rejections and original negative findings.
- [x] Add a separate claim-inventory completeness audit, including entity/role claims and honest uncertain states. Scope support metrics to extracted assessed claims and never call an automated completeness check ground truth.
- [x] Document usefulness/selection limitations and collection/publication qualification using existing records; do not mutate or replay uncertain provider operations.
- [x] Run affected unit suites, integration checks and typechecks. Commit the isolated changes and record exact remaining limitations. Branch push is recorded in Git; no deployment is authorized.

## Review focus

1. An approved model verdict must not silently override a demonstrated source-identity contradiction.
2. Surname-only evidence cannot authorize an invented first name, but legitimate aliases and paraphrases must not be automatically called false.
3. An incomplete claim inventory cannot establish whole-briefing factual correctness.
4. Correction must not turn negative original judgments into passes without explicit supporting evidence.
5. Missing source collection, failed evaluation or uncertain payment must remain visible and outside successful factuality denominators.
