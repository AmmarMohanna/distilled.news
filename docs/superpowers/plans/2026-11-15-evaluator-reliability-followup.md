# Evaluator reliability follow-up implementation plan

> Execute inline using the existing research worktree. No production deployment, resource change, main merge, or historical paid-record mutation is authorized.

**Goal:** Diagnose the observed failures and push a reproducible research extension with defensible measured findings and explicit blockers.

**Architecture:** Reuse the deployed judge, schemas, grounding gate and accounting. Add an independently tested offline language-compliance check and a bounded correction policy for internally inconsistent structured reviews. Keep original assessments and changes separate; no silently discarded findings. Audit and version reference labels before any amended experiment.

**Tech stack:** Existing TypeScript/Vitest and Python analysis, independent pinned local language identification, existing OpenRouter models and immutable local SQLite/artifacts.

**Spec:** User's nine-point continuation request from commit `17edc3ec`.

## Constraints and design decisions

- The account currently has approximately negative $0.03 credit. The user selected finishing available work and pushing. Do not send fresh inference until funded and explicitly resumed.
- No deployed behavior changes. Candidate policies stay offline and versioned; deployment needs separate approval.
- Short proper nouns and inadequate language evidence abstain. Foreign quotations do not automatically make compliant narration wrong. A quote-only item is not automatically accepted.
- A contradictory narrative finding triggers one complete re-assessment against unchanged sources/inventory; never delete it to achieve a passing review. Invalid evidence and ambiguous provider outcomes remain failures. Preserve original raw replies and paid operation IDs.
- Audit complete original benchmark: controls can be overbroad; date faults are also factual; omission granularity is ambiguous. Report strict and broad detection separately and preserve disputed labels in an audit. No exposed case becomes held-out.
- Existing generation outputs are reused. Full matched paired scores need remaining credit; incomplete denominators and source-completeness limits remain visible.

## Tasks

- [x] Inventory original failures, pending calls, benchmark ambiguities and CI entry points.
- [x] Add failing tests for language compliance (en/ar/fr, headlines, proper nouns, quotations, mixed/unknown) and inconsistent-review correction, then implement minimal research-only policies.
- [x] Version and freeze audited benchmark references. Re-score saved artifacts without new paid calls; identify what is model output, deterministic language checking, schema repair request, or unperformed inference.
- [x] Validate current replay adapter against current engine interfaces, preserve baseline outputs and write a funded rerun manifest rather than resending unknown operations.
- [x] Assess held-out eligibility honestly; reject partial/exposed/unverified components.
- [x] Build one concise continuation report with all completion/failure/abstention counts, costs, paired denominators and remaining blockers.
- [ ] Run evaluation tests, new validation tests, TypeScript and CI-equivalent checks; push the branch and inspect actual GitHub checks.

## Review focus

1. Detector uncertainty must not become language correctness or a proven fault.
2. A proper name or foreign quotation must not create a false language failure.
3. Corrections must retain original evidence, coverage and unknown accounting states.
4. Revised labels cannot be advertised as untouched validation.
5. Failed evaluation rows must remain in operational completion denominators.
