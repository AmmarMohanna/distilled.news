# Approved-fact synthesis integration

Starting HEAD: `169f3898881b5425453aa817e48a076de229fab6` on `integration/staging-end-to-end-v1`. Origin matched this checkpoint after fetch; the integration worktree was clean. Main and production were not modified.

Implementation commit: `799326398ed570435e6f3ddaa0ba28f671e98950`.

## Confirmed cause and contracts

The former `extractiveDraft` copied whole EvidenceRevision bodies. When an EditorialPlan existed, it first rejected any source sentence not equivalent to a shortlist fact. The selected NASA material had source text outside the plan's approved propositions, so this correctly failed with `EXTRACTIVE_CAPACITY_UNSUPPORTED`. Neither evidence count nor length caused the observed failure.

An additional inspection finding was that `SelectedPlanStory.facts` contained every shortlist fact, and the model writer received full evidence bodies and graph state. The change filters facts to the union of the plan's explicit new-understanding, context, must-include, attribution, certainty, disagreement and open-question IDs. Required collective coverage remains separate from optional permitted context.

`ShortlistFact` retains proposition IDs, ClaimMention IDs, exact EvidenceRevision IDs, attribution, certainty/hedges and report/event times. `SynthesisWriterInput` supplies selected target identities, approved facts, their exact supported spans, treatment, required fact IDs and output language. It excludes raw Event/Storyline states, unrelated source prose and unselected plan rationale. Historical ledger context is limited to the plan's referenced entries and remains reader history, not new factual evidence.

Only literal retained source spans are admitted. Adjacent approved spans may be joined using their exact original whitespace; an intervening unapproved detail cannot be bridged. This preserves dates and times split into propositions, including `Oct. 2` and `a.m. EDT`. Incomplete abbreviation fragments, missing literal support, unsafe rebuttal extraction, language incompatibility and hard output capacity remain fail-closed outcomes. Full immutable evidence stays available internally for contextual verification and final current-evidence checks.

## Verification and reliability

Planned claims must cite retained evidence and quote within the approved spans. Model prose additionally needs the existing contextual entailment/allowed-fact verification. All must-include, attribution, certainty, disagreement and open-question facts retain collective coverage checks and reader-fidelity floors. A planned draft containing any rejected claim now fails as a whole rather than publishing a subset. No existing grounding or fidelity check was removed.

Deterministic rendering communicates only exact approved spans. The legacy no-plan full-context path retains its stricter existing capacity/language behavior. Model failure may use a safe approved-fact draft; uncertain outcomes retain their durable reservation and OUTCOME_UNKNOWN record. Restart after a publication persistence outage reuses that stored draft without a second model call. Model intents remain outside provider execution and final correctness CAS transactions, with bounded calls/tokens/cost and immutable publication identity.

The existing OpenRouter/OpenAI transport is preserved, using the restricted writer interface and version `approved-fact-spans-editorial-v6`. No live model credential is installed on the staging Worker. Twitter semantic policy and salience are DETERMINISTIC, plans are labeled DETERMINISTIC_FALLBACK, and synthesis remains disabled. Live model/JEV proof is therefore unverified; controlled model-response and failure tests cover the interface and safety behavior. No real model call was made.

## Local verification

All ten new approved-synthesis regressions pass: A/B-only rendering with C absent, whole-source-copy rejection, unapproved model fact rejection, missing required fact rejection, attribution/certainty/temporal drift rejection, exact support and immutable replay, unsafe/nonliteral fallback refusal, approved abbreviation-span joining, and durable model-failure fallback surviving a publication persistence outage without another model call.

Affected editorial, preservation, writer-plan, model, fidelity, treatment and connector tests passed their assertions. The broad eight-file run had 51 passes and four existing publication timeouts; unchanged isolation reduced these to one publication-restart case. The remaining five-second restart timeout was reproduced on the committed pre-fix publication implementation and test in temporary local files, which were then removed. No timeout or assertion was weakened. The other remaining unknown-provider-outcome case passed unchanged in isolation. The complete suite is not reported as green.

Final workspace typecheck, staging dry-run build and `git diff --check` pass. No D1 migration or shared contract schema changed.

## Staging deployment

Worker: `distilled-news-staging`, account `e32b564514d4f9b9e383b7dd30dbb026`. Version `ccf9bd7e-f19e-4bdf-88a4-81e045947f9b`, deployment `601170b9-cd3b-4838-9567-7add41dd2d5f`, deployed October 5 at 15:53:15 UTC. Bundle SHA-256: `260ad226384e40de1b1b421e6d57dd5160778e1e7dced5dd4703abed04b75d0b`.

Verified bindings remain the staging D1 `ab259bfe-6029-4e20-8cb6-eea6b7a67459`, R2 `distilled-news-staging-raw`, queue `distilled-news-staging-processing`, and VPC `01a1099d-e88a-7c23-a1c5-eeb51471e780` through SOURCE_EXECUTION_SERVICE. Secret names APIFY_API_TOKEN, ZYTE_API_KEY, SOURCE_EXECUTION_TOKEN and TWITTERAPI_IO_API_KEY were preserved; no values were read, logged or committed. All provider ceilings and the Twitter D1 limit remain zero.

The original terminal failed window was preserved. A new closed downstream-only window spans October 1 00:00 UTC to October 5 15:53:42.603 UTC, submitted through the real processing queue. It reuses the 20 persisted Twitter revisions and existing semantic state. Before replay, there was one cumulative paid Twitter operation, 20 evidence revisions, 20 canonical Events and 20 Storylines, and no Twitter edition. Publication proof results are recorded below when verified.

## Verified publication

Edition `1f0a78b598087ebd59a7e763f011fc31b4b74538fd332c333a18354715df3a4b` published at `2026-10-05T15:55:24.475Z`. Both its briefing request and synthesis job are DONE without failure. The edition contains three stories using `deterministic-approved-facts-v3`, prompt `approved-fact-spans-v3`, provider NONE, zero model calls/tokens/cost and grounding policy `approved-spans-entailment-preservation-v3`.

Exact retained evidence references:

- `b0130410-27bb-44b3-bcaa-1bd25c9437ed`
- `6f0c4d40-ac1b-44f3-bb2c-98798eb50eef`
- `97bc9859-d02c-4d41-b878-576c6561d518`

Independent inspection of the persisted plan, shortlist, source revisions and edition confirmed exact source support, approved-only rendering and all required coverage for each story. They communicate 2, 3 and 2 approved propositions respectively. The first source contains three additional shortlist facts that the plan did not approve; all three are absent from reader-facing output. Every non-whitespace character in each published source quote is covered by approved fact spans. The date `Oct. 2` and time `a.m. EDT` survive adjacent-span rendering. Persisted reader fidelity passed and rejected-claim count is zero.

The real public edition endpoint returned HTTP 200 with response SHA-256 `34a5537d60a7306a9a280d63c84a2ab463d3823de1d30a17e7fb85607dbf310d`. Two identical downstream queue messages were submitted to test publication replay; final immutable-state checks follow.

After duplicate delivery, the public response hash was unchanged, with exactly one edition, one delivery job and three communication-ledger entries. Synthesis stayed DONE with callsUsed zero. Final counts remained one cumulative paid Twitter operation, 20 revisions, 20 canonical Events and 20 Storylines; duplicate revision groups were zero. There were no Twitter model intents/executions. D1 provider limit and Worker provider ceilings remained zero. The retained $0.01 reservation belongs to the earlier ingestion operation and is not a new charge or an actual cost report.

The synthesis failure mode is fixed and proven in staging using the existing data. Remaining limitations are live-model/JEV verification without credentials, deliberately fail-closed handling of facts without safely recoverable exact spans, the existing baseline publication timing failure, and the previously reported legacy feed UI/read-model bridge. This proof establishes immutable publication and its real edition/evidence API; it does not claim a live OpenRouter run or a completed browser presentation bridge. Production and main remain untouched.
