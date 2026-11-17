# Publication validation contract v2 — SPECIFICATION, revision 3

**Status: IMPLEMENTATION AUTHORIZED ON `backend-validation-contract`, DISABLED BY DEFAULT.** This file is the actual design specification, not the separate implementation plan. Revision 3 incorporates the subsequent AI-assisted revision-2 review, including proposition granularity and case-scoped acceptance. Work remains on `backend-validation-contract`, based on audit commit `de902aa07b9af523631434c6090a973fa718b3c8`. The subsequent explicit user instruction authorizes application changes on this branch and offline tests; inference spending, deployment and remote mutations remain outside this authorization.

**Outcome:** accurate, useful prose can be accepted against justified material requirements; materially inaccurate prose and unresolved semantic conflicts cannot publish. Zero known false hard rejections and zero confirmed unsafe acceptances apply to the reviewed corpus, not to all production traffic. A reject-everything or defer-everything implementation does not satisfy the outcome.

## Evaluation before implementation

An [unlabeled packet](../../../.local-reports/briefing-latency/validation-contract-review/REVIEW.md) contains all 25 distinct saved rejections and 24 positive/negative controls. Its appendices contain four complete saved drafts and 13 immutable source revisions. Proposed answers are omitted and case ordering does not expose positive/negative identifiers. Record whether the reviewer has already read the audit; that exposure prevents a claim of fully blinded review.

The first review was explicitly **AI-assisted, unblinded, without the source/draft appendices**. It reports 24 controlled labels (12 SUPPORTED / 12 ERROR under the old aggregate convention) and leaves all 25 saved S-cases null. The reported T-batch JSONs are not currently available in the workspace. Preserve that summary as review feedback; do not reconstruct or import per-case labels from totals. S-case triage is not an evidence-level label. The actual specification was not reviewed or approved in that delivery.

The later **revision-2 AI-assisted review** reports full bundle inspection and case-specific outcomes: saved cases 17 positive / 4 negative / 4 unresolved; controls 11 positive / 12 negative / 1 unresolved. It is not human execution approval or independent gold. Both complete answer JSON files are now locally verified against the frozen bundles: R2 has 235 exact witness occurrences/113 scope hashes and R3 has 243/113, with zero mismatches. Their file hashes match; the earlier 237 count is corrected. Four new required-and-communicated propositions and four optional-proposition ID mappings are recorded in the receipt. T09 is now unresolved for unsupported outlet type. Preserve the frozen older control and record the disagreement; a future "report" fixture needs a new version. The [review receipt](../../../documentation/PUBLICATION_VALIDATION_R2_REVIEW_RECEIPT_2026_10_18.md) distinguishes reported judgments from locally verified artifacts.

The original `meaning/materiality` template is superseded for new review. Preserve it and any completed answers unchanged. The revision-2 label contract has independent records:

- `reviewState`: `UNREVIEWED`, `PARTIAL`, or `REVIEWED`. An unreviewed record retains null judgments; it is not evidence-level `UNRESOLVED`.
- Per reader claim: exact reader text/scope, `support = SUPPORTED | ERROR | UNRESOLVED`, source witnesses, and error kind/facets if any.
- Per source proposition/requirement: exact proposition text and ID, `materiality = REQUIRED | OPTIONAL | NOT_NEWS | UNRESOLVED`, `communication = COMMUNICATED | OMITTED | UNRESOLVED`, justification, source witnesses, and any matching reader witnesses. Do not label an absent optional proposition as a supported reader assertion.
- Error kinds remain separate: `UNSUPPORTED_ADDITION`, `DISTORTED_FACT`, `MISSING_MANDATORY_COVERAGE`. Facets include identity, subject/predicate, quantity/unit/bound, time role, attribution, modality, negation and causation.
- Record reviewer identity, label provenance (`INDEPENDENT_HUMAN`, `HUMAN_ASSISTED`, `AI_ASSISTED`, `INVESTIGATOR`, `CONTROLLED_FIXTURE`), prior audit exposure, model assistance, and evidence actually inspected. Provenance is not inferred from the person forwarding a review.

`COMMUNICATED` requires actual same-story reader witnesses. `OMITTED` requires inspection of the full declared reader scope, including a demonstrably absent story; absent reader witness arrays alone cannot prove omission. A source quote, cited fact ID or model's echoed ID cannot establish communication.

**T08:** the road-reopened assertion can be `SUPPORTED`, while the separate bridge-closed proposition is `REQUIRED + OMITTED`, producing `MISSING_MANDATORY_COVERAGE`. **S16:** record the missing Meta development as an explicit requirement, not an unsupported assertion by another surviving story. **Optional omission:** `OPTIONAL + OMITTED` creates no factual error; any factual prose actually written is still verified. Existing aggregate `meaning=ERROR` labels cannot be mechanically converted to per-claim support errors.

Source/draft hashes stay immutable. A completed label file receives its own digest; it is not compared to the initial blank-template hash. Full normative fields and examples are in [the label contract](publication-validation-label-contract-v2.md).

The five owner-reviewed pairs remain a separate assisted subset. Investigator controls, this AI-assisted review and later independent human labels remain separate strata. Blank labels, investigator agreement and AI-produced answers are not independent human gold.

Fresh evidence review of the four unsettled groups:

| Audit group | Retained evidence | Current disposition |
|---|---|---|
| R12: Bee October 15 | The source says Thursday; report timestamp is October 15 at 00:00 UTC; no explicit event time. | Calendar resolution plausible but unproven; `UNRESOLVED`. |
| R13: Panay October 15 | The source says Thursday; same report-date limitation; no explicit event time. | `UNRESOLVED`. |
| R14: GTA November 19, 2026 | Release proposition says November 19 without year; delay history mentions May 2026. | The complete release date is not explicit; `UNRESOLVED`. |
| R18: 320+ versus over 320 | Same numeral and unit; `+` can denote an inclusive minimum, while “over” can denote strict excess. | Human-reviewed notation policy needed; `UNRESOLVED`. R17's reviewed label is not silently generalized. |

These dispositions do not assert that the drafts are false. No new evidence resolves them conclusively. No external search, new inference, or mutable present-day article replaces the saved evidence.

## 1. Explicit editorial requirements

Add a versioned v2 editorial contract while retaining legacy records and inputs verbatim. For each selected story, represent mandatory facts as `{propositionId, parentFactId, reasonCode, justification, obligationIds}`. References must be owned, unique and supported. A nonempty generic reason alone is insufficient: the decision must identify what reader misunderstanding or missing material development omission would cause.

Requirements are **propositions**, not whole mixed source sentences. Add versioned proposition IDs and parent fact/revision/span mappings when an existing fact combines essential and optional material. S03 must retain communicated Bee price separately from omitted competitor prices; S05 must retain the communicated dollar estimate/uncertainty separately from omitted GBP conversion. Shared exact source witnesses are allowed, but disposition and communication attach to the particular proposition. Do not auto-split numerical tokens or lose actor, qualifier, attribution or temporal context. Legacy fact IDs/operations remain unchanged; the new mapping and proposition requirements enter the v2 editorial and verification identity.

Structural checks validate fields, ownership and exact obligation links. The semantic adequacy of the justification is an editorial/review judgment, not a new keyword-based “generic reason” classifier. The reviewed evaluation must test both over-demanding optional detail and under-demanding material scope; adding a justification field alone does not prove either problem solved.

| Reason/disposition | Decision rule |
|---|---|
| `CORE_DEVELOPMENT` | Actor/object, action/state and material scope needed to communicate the chosen independent development accurately. |
| `MATERIAL_CHANGE` | Supported changed state, quantity, certainty or outcome whose omission would materially misstate current understanding. Novelty alone is insufficient. |
| `CORRECTION` | Explicitly linked protected correction/retraction/withdrawal obligation and the supported clarification needed to discharge it. |
| `DISAGREEMENT` | Material contradiction or attributed disagreement that prevents misleading consensus or certainty. |
| `NECESSARY_CONTEXT` | Supported identity, attribution, temporal framing or qualifier without which the communicated claim misleads. Not a license for every background fact. |
| `OPTIONAL_CONTEXT` | A nonessential detail of the chosen development whose omission does not hide a separate selected material development or protected obligation. Still fully verified if written. |
| `DEFERRED` | A selected/material independent development or required fact not delivered now. Must retain canonical pending work, with reason and future eligibility. |
| `NOT_NEWS` | Evidence-backed navigation, metadata or nonassertive material. Requires extraction provenance or reviewed source boundaries; not a cheap semantic disposal category. |

`newUnderstandingFactIds` describes available supported novelty, not an instruction to reproduce every item. Do not append those IDs to `mustIncludeFactIds`. In v2, that compatibility list projects parent IDs of explicitly justified mandatory propositions, while the v2 proposition list remains authoritative; projecting a parent does not require every sibling proposition. Preserve at least one communicated supported new development, or a verified correction, for a selected story. An array of novelty IDs is not evidence of actual reader communication.

Every offered proposition, with its parent fact mapping, must have an explicit disposition: `REQUIRED`, `OPTIONAL_CONTEXT`, `DEFERRED`, or `NOT_NEWS`, with rationale for the latter three. Retain accepted evidence, requirement decisions and review history. A material development such as S16 must be required in a selected coherent story, or explicitly deferred; it cannot become optional just to reduce the requirement count. Current event identity is not regrouped in this change.

V2 deferred records carry proposition, parent fact and requirement IDs in addition to stable target and target version. Resolutions address exact work and proposition IDs; communicating one proposition cannot clear a sibling sharing its parent fact. Another story's publication, the same target's partial coverage, a window closing, or a calendar age cannot clear that work. `COMMUNICATED` resolution requires an edition plus compatible semantic reader witnesses for those facts; supersession requires a versioned evidence reason. An explicit ordinary editorial nonselection is recorded with rationale, not called delivered. Protected work cannot be demoted or retired this way. S16 must remain eligible in later selection until valid resolution.

Attribution/certainty/disagreement annotations describe how a fact must be expressed when communicated; they must not implicitly promote all incidental facts into mandatory content. Protected corrections, material contradictions, retractions, withdrawals and existing protected-work guards remain mandatory. Where their necessary scope cannot be established, defer; do not demote them through ordinary optional-context decisions.

**Source eligibility for the v2 editorial projection:** exclude demonstrated related-link navigation regions from derived eligible news propositions before editorial selection. This validation-only implementation leaves historical claim extraction and graph membership identities intact, avoiding a change to already-paid semantic review questions; no upstream graph cleanup is claimed. Retain complete raw acquired evidence and exact excluded offsets with reason/provenance. This is a narrow derived-projection change, not a new collection/acquisition workflow. Existing `claims.ts` role filtering has no navigation-region classification; the implementation needs versioned eligibility metadata and regression coverage. Use publisher/parser structural regions when available; never drop a real article assertion solely because it contains “Published”, a date or a number. An ambiguous navigation-like fragment in already flattened text stays pending eligibility review; do not silently rewrite old mentions or declare it news. This is not a blanket exclusion of plain-text articles or other supported assertions. Existing protected corrections remain pending if eligibility cannot be established. No historical source, editorial plan, model intent or receipt is rewritten.

## 2. Exact gates versus factual alarms

Preserve hard gates for schema, authorization, active immutable evidence, story/fact/reference ownership, exact support substrings, approved URLs, story presence, version fencing, obligations and accounting.

Quotation checking returns `MATCH`, `MISMATCH`, or `UNRESOLVED`. `MATCH` permits only paired quote-mark typography and a single terminal comma/full stop moved immediately across the closing delimiter, or a terminal editorial comma/full stop adjoining the closing delimiter removed when the selected quoted words are otherwise identical. Preserve Unicode words, spelling, order, internal punctuation, negation, ellipses and attribution. Do not remove punctuation globally or search another story's spans. This covers T21 and the observed comma variant; T22 changes words and is `MISMATCH`. `MATCH` proves quotation-word equivalence only, never correct attribution or complete factual support. Missing same-story support is a hard ownership failure. Unbalanced/nested/ambiguous extraction or an unresolved speaker cannot auto-approve; semantic coverage remains required. New quote forms outside the reviewed equivalence set stay unresolved.

For v2 model-generated prose, ambiguous number/date/qualifier lexical findings may become structured warnings at both precheck and post-verification boundaries **only** with complete compatible saved verification, or an existing authorized/funded compatible whole-claim plus fact-level verification path. A configured model name or an unfunded port is not availability. Exact source/report/event/observation time roles remain distinct; no date is licensed merely by appearing elsewhere in the story. Warnings never establish approval.

If verification is missing, incompatible, not authorized, unfunded, unavailable, capacity-blocked or incomplete, persist `UNRESOLVED` and leave the edition unpublished. Do not approve using lexical checks alone, invent a verdict, initiate an extra purchase, or add a repair loop. Admission must still reserve durably and atomically under unchanged existing spending rules before each authorized call; a balance snapshot does not reserve funds. If a later packet cannot be funded, partial verification cannot publish the edition. This refinement effort authorizes **zero** new inference calls. Legacy paths retain their prior conservative behavior; v2 has no new extractive bypass.

## 3. Combined semantic decision

Verify in both directions: **every reader-facing factual claim**, including optional facts chosen by the writer, must be source-supported; **every REQUIRED proposition** must have actual matching reader prose. Evaluate subject–predicate–number/unit/bound, temporal role, attribution, modality, negation and causation together, not as independent bags of present tokens. Keep whole-claim entailment and individual mandatory-fact facets. Optional facts omitted are not failures; optional facts stated inaccurately are failures.

Provide explicit same-story attribution and report/event/observation-time context. Context additions must be exact authorized evidence spans; guessed speakers or inferred dates cannot become new approved facts. A cut quotation or pronoun without a source-grounded referent remains unresolved. Preserve the existing model/provider and maximum of one existing repair; no new retry opportunity follows an unavailable verifier.

Use one decision reducer returning `ACCEPT`, `REJECT`, or `UNRESOLVED`, with reasons and witnesses:

- `ACCEPT` requires every reader claim supported, every mandatory fact faithfully communicated with exact reader witnesses, required attribution/time/qualifiers preserved, verified novelty or correction delivery, and all exact gates passed.
- Consistent evidence-grounded negative findings reject the affected communication. Missing REQUIRED prose is `MISSING_MANDATORY_COVERAGE`; it is not a false surviving assertion.
- Any claim/facet conflict is `UNRESOLVED` with `SEMANTIC_VERDICT_CONFLICT`, never `ACCEPT`. Neither a whole-claim positive nor a facet positive overrides a negative counterpart. Missing, incompatible or insufficiently evidenced verdicts also remain unresolved. Preserve existing packet negative dominance: a negative packet can never become positive after merging; a merged result may be negative or unresolved, but never accepted.
- Persist semantic uncertainty separately from provider-execution uncertainty. A paid response with conflicting judgments remains a settled paid response; do not release its accounting, call it an unknown provider outcome, or automatically buy another call.

Existing publication CAS and lease fencing remain authoritative. Successful pure validation does not bypass those gates or create an edition on its own.

## Compatibility and operational limits

V2 uses explicit `EVIDENCE_GROUNDED_V2` records and `V1_PUBLICATION_VALIDATION_CONTRACT`, default `LEGACY`. No Wrangler environment is enabled or deployed. Legacy strict schemas, prompts, policy identities, stored verdict interpretation and operation replay stay unchanged. New contract, eligibility, requirements and context participate in new immutable operation identity. Do not treat changed questions as old operations.

`verificationCompatibility` is exact and fail-closed. Compare the following canonical input manifest, with reader draft **bytes** separately hashed without normalization:

| Must match | Scope |
|---|---|
| Evidence | Account/feed, exact immutable revision IDs and content hashes, source-span offsets/quotes and selected story/candidate identities. Revalidate current authorization separately. |
| Claims | Draft UTF-8 bytes, claim IDs and order, support associations, language and complete context supplied. |
| Requirements | Exact REQUIRED proposition IDs/order/text, parent fact/revision/span mappings, requirement policy and reasons, protected correction IDs/tasks, allowed facts, reader-history/novelty inputs. |
| Execution contract | Prompt version and actual prompt bytes, request/packet schema and partition versions, semantic policy, editorial contract/version, model and provider/route identity. |
| Paid evidence | Durable operation identity and token-matched authoritative result/settlement linkage; cost receipts alone do not contain a semantic verdict. |

Any changed field, absent manifest component, missing/partial verdict or unrecognized version is `INCOMPATIBLE`; no weaker-subset exception. A legacy success may be shown as historical diagnostic evidence, not counted as v2 model evaluation. An offline migration cannot relabel or upgrade it. Reuse is additionally fenced by current source authorization and graph/feed dependencies at commit. Original failed jobs, uncertain holds and paid recovery semantics remain untouched.

No deployment, budget increase, paid inference, queue recovery, acquisition transport change, event regrouping, model replacement or performance refactor. Narrow derived navigation eligibility is in scope as above. No planned D1 migration: use additive versioned document fields; revisit only if implementation proves otherwise. No public publication-state/client contract change.

## Verification cost and time boundaries

Admission of previously precheck-blocked drafts can add paid verification; this is a cost tradeoff, not a measured latency improvement. Use existing `partitionVerification` and admission envelopes without changing concurrency. For `S` nonempty story groups, at most one whole-edition packet is preferred; the current context fallback has at most `S*(S-1)/2` packets for `S>=2`, one for `S=1`, zero for no claims. Each fallback packet covers at least one previously uncovered pair. At most original plus the single existing repair may require verification; there is no new verification/repair retry loop. Bound calls by `P(original)+P(repair)`, not by “one API request”.

For packet `j`, its conservative reservation bound remains `requestBytes_j * inputRate + maxOutputTokens_j * outputRate` from the actual configured capability. A fitting packet also satisfies `requestBytes_j + maxOutputTokens_j <= contextTokens`. The repository's recorded GPT-4.1-mini descriptor has context 1,047,576, maximum output 32,768, input rate $0.0000004 and output rate $0.0000016. Under that descriptor the absolute per-packet envelope is **$0.458352**; three stories with worst-case pair fallback across both passes have at most six packets, **$2.750112**. These are static configured ceilings, not current provider quotes, actual charges, available budget or permission to spend. Overrides require recomputation; actual v2 packet sizes/costs are **unmeasured** until its schema/payload exists. Actual inference cost cannot be measured in this refinement without separately authorized calls.

Proposed counters: planned packets, compatible cached packets, new authorized calls, unavailable packets, summed reservation upper bound, actual provider-reported cost, verification wall time and existing exclusive-turn time. Do not sum reused receipt costs as new spend. Require per-evaluation payload/admission reports before any paid live test. Do not add a new exclusive feed turn, graph lock or concurrency change; persist validation diagnostics in existing transaction boundaries. The existing long publication turn remains a known limitation and is not fixed here. Offline analysis performs zero model calls.

## Acceptance and evidence

1. Freeze independently reviewed labels and source/draft hashes before acceptance scoring. Keep independent human, assisted human, AI-assisted, investigator and controlled-fixture strata separate; do not pool them as gold. The reported 49-case AI-assisted review is case-specific, not independent gold or whole-edition certification; its complete witness-label JSON has passed local artifact/structure verification, which does not adjudicate model accuracy. Preserve per-draft results before an any-version-negative regression summary. S12 original coverage failure must not be projected onto the repaired legal scope.
2. Preserve every exact security/provenance gate through negative tests: foreign feeds/facts/receipts, invalid citations/URLs, stale evidence and versions, missing stories, changed quotation words and protected corrections.
3. Reviewed valid cases have zero false hard rejections. Reviewed negative cases have zero confirmed `ACCEPT` decisions. Demonstrate actual `ACCEPT` on reviewed positives with compatible verdicts; unresolved positives are not counted as successes.
4. Report each review stratum's total, reviewed/unreviewed and evidence availability; then compatible/incompatible/missing semantic-verdict coverage; then `ACCEPT/REJECT/UNRESOLVED` on the scored intersection. False acceptance = `ACCEPT` on independently reviewed negatives; false rejection = `REJECT` on independently reviewed positives. Report unresolved positive/negative rates separately. If there is no gold-plus-compatible-verdict intersection, final decision accuracy is **UNMEASURED**, not 0%. Keep all excluded counts visible.
5. Replay A and B unchanged where compatible. B's contradictory verdict cannot publish. No claim of final model accuracy for A without a saved compatible verdict. Controlled semantic fixtures prove reducer behavior only.
6. After implementation authorization, run focused eligibility/contract/publication/packet/correction tests, full worker tests and typechecks. Before rollout, require an independently reviewed representative holdout not used to tune the rules, followed by a separately budget-authorized controlled staging publication test. No production reliability or successful-publication claim follows from synthetic routing tests or this refinement.
