# Feed intelligence and publication continuation

Execute inline under the user's continuous implementation authorization.

- [x] Feed-scoped atomic document persistence, fenced against concurrent intake/configuration changes.
- [x] Immutable role and exact/near-duplicate decisions, preserving independent reporting.
- [x] Incremental feed-scoped Events; membership is the sole support relation.
- [x] Immutable Event/Storyline versions, including reassignment and withdrawal.
- [x] Persisted assessments and bounded reproducible selection.
- [x] Selected-evidence-only synthesis and claim grounding; immutable editions.
- [x] Approved RSS product scope lifecycle, retained publication support and bounded connector format integration.
- [x] Persisted acceptance tests and independent review; checkpoint prepared for separate coherent commits and push.

Start with conservative deterministic policies and expose replaceable typed model ports.
Do not equate a successful model call with factual support or published truth.

Verification: 68 combined downstream/migration tests passed; all seven workspace
typechecks passed. Independent review defects (membership wire-shape validation,
storyline reassignment continuity and copied-background phase merge) were fixed and
verified. The equal-timestamp duplicate grouping defect was reproduced and fixed.
Remote deployment target confirmation remains pending; local development continues.

Checkpoint verification (2026-10-04): focused downstream 94 passed, 1 opt-in test
skipped; full worker 304 passed, 1 skipped; contracts 44 passed; browser-bridge 82
passed; focused acquisition adapters 20 passed; all seven workspace typechecks
passed. The full workspace command has one unchanged source-text browser guard
failure, reproduced in isolation. Earlier engine/lease-abort timing failures passed
unchanged in isolation and broader reruns. See `documentation/V1_RUNTIME_CHECKPOINT.md`
for exact commands, current runtime boundaries and connector ownership. No new
architecture audit, JEV work or deployment is included in this checkpoint.
