# Validation-contract review

Branch: `backend-validation-contract`, based on audit commit `de902aa07b9af523631434c6090a973fa718b3c8`. The owner chose to provide the next human review. No application code, inference, deployment, budget, or remote data has changed.

Read the [49-case packet](../.local-reports/briefing-latency/validation-contract-review/REVIEW.md). It contains 25 saved rejection groups and 24 controlled cases without proposed labels, with [four full drafts](../.local-reports/briefing-latency/validation-contract-review/drafts.md) and [13 retained source revisions](../.local-reports/briefing-latency/validation-contract-review/sources.md). These private files stay local; public repository clones do not contain article bodies.

For each case, supply:

1. `SUPPORTED`, `ERROR`, or `UNRESOLVED` for the draft's asserted meaning.
2. `REQUIRED`, `OPTIONAL`, `NOT_NEWS`, or `UNRESOLVED` for the source detail at issue.
3. A short reason and exact supporting source/draft passages. For omissions, say whether required information is missing, even if the surviving assertions are true.

Use the [JSON template](../.local-reports/briefing-latency/validation-contract-review/labels-to-complete.json), or reply by case ID in batches. Record prior exposure to the audit. This is human review independent of the investigator, not a claim of fully blinded or multi-reviewer adjudication. Uncertainty is a valid result; no case needs to be forced into pass or fail.

The three inferred calendar dates and `320+` boundary remain unsettled on the saved evidence. The prior five owner-reviewed pairs remain a separate assisted subset. Existing investigator labels will not be renamed as human labels.

The [design](../docs/superpowers/specs/2026-10-18-publication-validation-contract.md) and [implementation plan](../docs/superpowers/plans/2026-10-18-publication-validation-contract.md) address the three requested changes. Novelty no longer implies mandatory reproduction; every mandatory item needs justification; deferred material remains visible; exact gates remain authoritative; complementary semantic checks reject or defer conflicts.

Implementation is gated on the reviewed evaluation set and design/plan review. No deployment or inference is included. Later reporting must distinguish actual positive acceptance, false acceptances, false rejections, unresolved cases, and saved-verdict compatibility. A pipeline that approves nothing has not demonstrated reliable validation.
