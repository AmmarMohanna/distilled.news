# Publication validation contract v2 — review draft

**Scope:** the user's 18 October direction following the [validation audit](../../../documentation/BRIEFING_VALIDATION_AUDIT_2026_10_18.md). Work on `backend-validation-contract`, branched from audit commit `de902aa07b9af523631434c6090a973fa718b3c8`. This is a contract redesign, not a performance sprint. This specification is ready for review; product implementation has not started.

**Outcome:** accurate, useful prose can be accepted against justified material requirements; materially inaccurate prose and unresolved semantic conflicts cannot publish. Zero known false hard rejections and zero confirmed unsafe acceptances apply to the reviewed corpus, not to all production traffic. A reject-everything or defer-everything implementation does not satisfy the outcome.

## Evaluation before implementation

An [unlabeled packet](../../../.local-reports/briefing-latency/validation-contract-review/REVIEW.md) contains all 25 distinct saved rejections and 24 positive/negative controls. Its appendices contain four complete saved drafts and 13 immutable source revisions. Proposed answers are omitted and case ordering does not expose positive/negative identifiers. Record whether the reviewer has already read the audit; that exposure prevents a claim of fully blinded review.

Complete [labels-to-complete.json](../../../.local-reports/briefing-latency/validation-contract-review/labels-to-complete.json), or provide equivalent case-ID answers. Each case needs:

- Meaning: `SUPPORTED`, `ERROR`, or `UNRESOLVED`.
- Materiality: `REQUIRED`, `OPTIONAL`, `NOT_NEWS`, or `UNRESOLVED`.
- A reason and exact source/reader witnesses. Omitted information is not automatically a false assertion.
- Reviewer identity, date, previous audit exposure, and whether model assistance was used.

For omission cases, `meaning` judges the assertions the reader actually sees; `materiality` judges the omitted proposition at issue. State in the reason whether a required proposition is missing. Thus `SUPPORTED` assertions can still have a material coverage failure. Final acceptance requires both supported meaning and complete required coverage. Source/draft hashes are immutable; the label-template hash records its initial blank state, not a requirement that completed labels stay blank. Hash and retain the completed review separately.

The five owner-reviewed pairs in the audit remain a separate, assisted review subset. The investigator's 24 existing control labels are hypotheses until human review. Neither blank labels nor investigator agreement count as independent approval.

Fresh evidence review of the four unsettled groups:

| Audit group | Retained evidence | Current disposition |
|---|---|---|
| R12: Bee October 15 | The source says Thursday; report timestamp is October 15 at 00:00 UTC; no explicit event time. | Calendar resolution plausible but unproven; `UNRESOLVED`. |
| R13: Panay October 15 | The source says Thursday; same report-date limitation; no explicit event time. | `UNRESOLVED`. |
| R14: GTA November 19, 2026 | Release proposition says November 19 without year; delay history mentions May 2026. | The complete release date is not explicit; `UNRESOLVED`. |
| R18: 320+ versus over 320 | Same numeral and unit; `+` can denote an inclusive minimum, while “over” can denote strict excess. | Human-reviewed notation policy needed; `UNRESOLVED`. R17's reviewed label is not silently generalized. |

These dispositions do not assert that the drafts are false. No new evidence resolves them conclusively. No external search, new inference, or mutable present-day article replaces the saved evidence.

## 1. Explicit editorial requirements

Add a versioned v2 editorial contract while retaining legacy records and inputs verbatim. For each selected story, represent mandatory facts as `{factId, reasonCode, justification}`. Reason codes: `CORE_DEVELOPMENT`, `MATERIAL_CHANGE`, `CORRECTION`, `DISAGREEMENT`, `NECESSARY_CONTEXT`. References must be owned, unique, and supported; justification must be nonempty and explain reader necessity.

`newUnderstandingFactIds` describes available supported novelty, not an instruction to reproduce every item. Do not append those IDs to `mustIncludeFactIds`. In v2, that compatibility list is the exact projection of explicitly justified mandatory facts. Preserve at least one communicated supported new development, or a verified correction, for a selected story. An array of novelty IDs is not evidence of actual reader communication.

Every fact offered for selection must have an explicit disposition: `REQUIRED`, `OPTIONAL_CONTEXT`, `DEFERRED`, or `NOT_NEWS`, with rationale for the latter three. This is a durable editorial decision, not deletion of evidence. `DEFERRED` material remains canonical pending work through existing editorial work records; successful publication of a sibling or optional subset must not resolve that material as delivered. Do not classify another independent development as optional context merely to fit one story. Current target grouping is not rewritten by this change.

Attribution/certainty/disagreement annotations describe how a fact must be expressed when communicated; they must not implicitly promote all incidental facts into mandatory content. Protected corrections, material contradictions, retractions, withdrawals and existing protected-work guards remain mandatory. Where their necessary scope cannot be established, defer; do not demote them through ordinary optional-context decisions.

Navigation metadata stays in immutable source evidence. A new derived editorial disposition can mark it `NOT_NEWS`; the runtime cannot infer this solely from a broad date or number regex. No historical evidence, fact, editorial plan, model intent or usage receipt is rewritten.

## 2. Exact gates versus factual alarms

Preserve hard gates for schema, authorization, active immutable evidence, story/fact/reference ownership, exact support substrings, approved URLs, story presence, version fencing, obligations and accounting.

Quotation checking compares quoted words and their owned source spans. Permit reviewed typography and terminal comma/full-stop placement differences. Do not normalize away changed words, negation, ellipses, internal punctuation with semantic effect, or speaker changes. Ambiguous quote parsing is unresolved; it is not an automatic pass.

For v2 model-generated prose, number/date/qualifier lexical findings are structured warnings for semantic adjudication, both before and after verification. They cannot override a valid evidence-grounded semantic decision solely because a regex found `>2`, a date, a product-name numeral, or a rounded headline number. Warnings never establish approval. Exact normalized values are useful inputs; identity, proposition, unit, bound and time role must still be checked. Preserve conservative legacy behavior for legacy records and any path without a compatible semantic verifier.

## 3. Combined semantic decision

Keep individual claim entailment **and** mandatory-fact checks. Provide explicit same-story attribution and report/event/observation-time context. Context additions must be exact authorized evidence spans; a guessed speaker name or inferred event date cannot become a new approved fact. A cut quotation or pronoun without a source-grounded referent remains unresolved. Preserve the existing model, provider and single-repair policy.

Use one decision reducer returning `ACCEPT`, `REJECT`, or `UNRESOLVED`, with reasons and witnesses:

- `ACCEPT` requires every reader claim supported, every mandatory fact faithfully communicated with exact reader witnesses, required attribution/time/qualifiers preserved, verified novelty or correction delivery, and all exact gates passed.
- Evidence-grounded negative findings reject the affected communication. A whole-claim positive cannot override a negative fact facet, including B's wrong attribution.
- Missing, incompatible, internally conflicting or insufficiently evidenced verdicts are `UNRESOLVED`. A facet-level positive cannot override a whole-claim negative. Preserve negative dominance across verification packets.
- Persist semantic uncertainty separately from provider-execution uncertainty. A paid response with conflicting judgments remains a settled paid response; do not release its accounting, call it an unknown provider outcome, or automatically buy another call.

Existing publication CAS and lease fencing remain authoritative. Successful pure validation does not bypass those gates or create an edition on its own.

## Compatibility and operational limits

V2 has an explicit contract version and a default-off runtime option; no Wrangler environment is enabled or deployed in this work. Legacy strict schemas, prompts, policy identities, stored verdict interpretation and operation replay stay available unchanged. V2 intents include the new contract, requirement decisions and context in their input identity. Do not treat changed questions as old operations.

A saved verdict is reusable only for identical authorized claims, support, allowed facts, mandatory-fact meanings, context, language, novelty/correction tasks and compatible verification policy. A weaker or altered requirement list alone does not prove compatibility. Incompatible or missing verdicts are recorded as unavailable, not synthesized, upgraded or reissued. Original failed jobs and all 44 uncertain paid holds remain untouched.

No deployment, budget increase, paid inference, queue recovery, acquisition change, event regrouping, model replacement or performance refactor. No planned D1 schema migration: use additive versioned document fields; revisit only if implementation proves otherwise. No public publication-state or client contract change.

## Acceptance and evidence

1. Freeze independently reviewed labels and source/draft hashes before using them as acceptance expectations. Keep human labels, investigator labels, actual provider verdicts and controlled test verdicts distinguishable.
2. Preserve every exact security/provenance gate through negative tests: foreign feeds/facts/receipts, invalid citations/URLs, stale evidence and versions, missing stories, changed quotation words and protected corrections.
3. Reviewed valid cases have zero false hard rejections. Reviewed negative cases have zero confirmed `ACCEPT` decisions. Demonstrate actual `ACCEPT` on reviewed positives with compatible verdicts; unresolved positives are not counted as successes.
4. Report accepted/rejected/unresolved counts, false acceptances, false rejections, positive acceptance and compatible-verdict coverage separately. Unreviewed and incompatible cases do not disappear from denominators or become passes.
5. Replay A and B unchanged where compatible. B's contradictory verdict cannot publish. No claim of final model accuracy for A without a saved compatible verdict. Controlled semantic fixtures prove reducer behavior only.
6. Run focused contract/publication/packet/correction tests, full worker tests and typechecks after implementation. No live acceptance or reliability declaration until separately authorized, larger reviewed evaluation and controlled live testing.
