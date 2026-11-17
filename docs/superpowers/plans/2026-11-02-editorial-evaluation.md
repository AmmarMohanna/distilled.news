# Controlled editorial evaluation implementation plan

**Goal:** Compare frozen V4 and two existing candidates with full-evidence, blinded, source-specific AI-assisted review. No runtime change.

**Architecture:** Offline evaluator request builder and deterministic evidence-reference audit; use existing native paid-operation admission for any later authorized requests. Evaluator is experimental assessment only, never a product stage.

**Constraints:** Zero paid requests before new approval. Preserve prompts, routing, campaign resources, financial history. Same evidence/settings in each pair. Ambiguity remains unresolved. No claim of human gold or unseen-source generalization.

- [x] Add tests for blind stable output labels, full original evidence, valid source quotations and unresolved ambiguous findings.
- [x] Implement the minimum evaluator utility and review template, with no network executor.
- [x] Calculate staged maximum requests and exposure using fresh public prices; include evaluator, verifier and repair costs.
- [x] Run briefing tests and typechecks; record the exact approval gate and unmeasured outcomes.
- [ ] Commit reviewed offline preparation. Ask for approval of the concrete first stage only; no deployed changes.

**Review focus:** Source text is untrusted; valid references are not semantic truth; primary/secondary reports are not independent corroboration; optional detail is not mandatory recall; evaluator order bias and ambiguous judgments cannot select a winner automatically.

Validation: 131 briefing tests and briefing TypeScript checks passed. No paid calls. No runtime changes. Approval request remains pending; execution is not complete.
