# Real semantic staging proof after model-contract fixes — 2026-10-06

Result: the requested failures are fixed and the retained-evidence rerun published one real model-generated edition. This supersedes the unsuccessful run documented in distillation-quality-staging-proof-2026-10-06.md. Writer/publication implementation and all existing hard validators/budgets/timeouts were preserved.

## Deployment and commits

Branch: feat/distillation-quality, based on cb4f04aa13241e70b5d26f1444dd10d823b7959f.
Code deployed: 9e4ba23d2c972520a1d663655d931b667967f6b7.

- b3956bf: rounded JEV effect-response validation and a real replay fixture/regressions.
- 620496a: compact comparative input/reference transport, decision/treatment schema, timeout classification, and exact staging-input regressions.
- 9e4ba23: reuse immutable revision role/duplicate decisions during durable semantic rematch, with replay regression.

Final normal code deployment: 50dac50e-af67-49dc-8767-2a7c7bb0f1fa.
Final active version after temporary-token removal: 066b0215-7930-4492-854c-e9e9623e8431.
Worker: distilled-news-staging. Cloudflare account e32b564514d4f9b9e383b7dd30dbb026, authenticated as distillednews.platform@gmail.com.
D1, R2, queues/DLQ, VPC binding, existing secrets and paid-source ceilings were unchanged. Cron and the ordinary queue consumer are restored. No production deployment or main change occurred.

## Exact attempts and root causes

Read the immutable staging semantic_results, editorial_plans and shortlists from remote D1 before making the fixes. No old result, receipt, intent, budget reservation or replay window was removed/reset.

JEV operation 3233a92f58b20cef4e597186d535bfcd1d63bcc0d9fc026ccbb7b6656cb894ca failed INVALID_EXPERIMENT_RESULT after 407 ms, with 799 input tokens, 140 output tokens and $0.000033558 reported usage. The original raw response had not been retained by the old code. Replaying its exact provider wire state/questions reproduced an answer that the old parser rejects: ordinal score 0.03, displayed probabilities 0.99/0.01/0/0 (displayed mean 0.01). The provider rounds score and probabilities separately. The fix checks whether the rounding intervals admit a normalized distribution and the reported ordinal mean, then derives normalized novelty from probabilities. It does not accept arbitrary contradictory distributions, missing levels, foreign choices, extra fields or out-of-range values. The raw replay envelope is committed as a fixture, with its new generation ID clearly distinct from the old attempt.

Original planner operation 40a49059f4554be3a870fb08f5e173bc6bdccafe92cb803dcee5396fb7c93364 ran for 10,155 ms and retained a $0.02 unknown-outcome reservation. The default transport had repeated long identifiers/mechanical data. Compact request-local handles reduce input and output work without changing approved text, certainty, title context, report time, reader ledger, obligations or protected effects. Handles are decoded and checked against the original shortlist by the existing hard validator. Unknown handles and cross-target facts still fail.

The first compact response, operation 03c43d36d6d6811437b5b6969d9650744876b957ad887db6c9ad69fc9fcf847d, returned in 5,451 ms but failed the existing decision/treatment invariant. An exact-input diagnostic returned DEFER with BRIEF; deferred stories must have treatment OMIT. The provider JSON schema now uses conditional typed branches: SELECT permits BRIEF/STANDARD/DETAILED with mandatory fact coverage; SUPPRESS/DEFER permits only OMIT. Instructions state that invariant explicitly. Responses are not coerced into valid plans, and the validator was not relaxed. Timeout reasons are now preserved as SEMANTIC_MODEL_TIMEOUT instead of generic provider failure.

Durable rematch consumption exposed a separate necessary retry blocker: the engine rewrote immutable role/duplicate records with a later computedAt. It now reads/reuses those exact records. The successful cached model result was consumed without another model call. This change touches intelligence reassessment only, not writer/publication logic.

## Same retained corpus and real stages

Feed: quality-proof-20261006-isolated, owner product-proof, private.
Modern connector-owned RSS source: quality-proof-20261006-isolated::rss_rss_feed_17x2tys.

Original retained RSS revision IDs remain:

- 37c25495-3179-4672-89d0-64c682114753 — Brazil election.
- 84a025ae-c6bb-4905-af2d-07d210859613 — Trump advertising.
- a76d8371-2efe-47ad-87e0-294b5f7ecb1b — second advertising revision.
- f4637e2a-77e6-41e0-a988-f7b376d45c7f — October 2 Mangione report.

The four existing acquired revisions/ClaimMentions were reused. Brazil's already valid GPT state was reused; all three deferred revisions completed their existing durable rematch attempt 1 successfully. Real typesafe/jev-1.13 RELATION_EFFECT records succeeded. Active semantic states have GPT/JEV provenance, not deterministic foundation. A prior emptied Event remains as historical withdrawn state rather than being deleted.

The two advertising revisions are consolidated into one current Event and one shortlist fact with both evidence IDs, both mention IDs, merged proposition IDs, uncertainty and exact title context. Immutable underlying proposition history remains; dedup is not destructive deletion.

The fresh rerun window is 2026-10-06T14:47:59.027Z–15:17:59.027Z. Brazil's unchanged state falls outside this later window, so its prior real semantic state is retained but it is not in this edition. This is not an identical-window whole-edition comparison. No fresh source fetch or paid source-provider call was made in this rerun.

Successful comparative operation: 76c9ab60550605c05a7810fcd450c165f9c6f1893ac188233c45bda00d4f0bba, real openai/gpt-4.1-mini, 4,599 ms, 1,456 input/361 output tokens, $0.00116 confirmed. Route GPT. The publication-bound plan snapshot uses the same real operation; it did not make a second editorial model call.

Published immutable BriefingEdition:
b2368b4e12819694be72fb005dddeecf2bd1581e1f0156ee5c4952c5ff11da4f.
Published at 2026-10-06T15:24:15.751Z, two stories.

- SYNTHESIS: OPENROUTER/openai/gpt-4.1-mini, SUCCEEDED, confirmed; 1,274 input/153 output tokens, $0.0007544.
- GROUNDING: OPENROUTER/openai/gpt-4.1-mini, SUCCEEDED, confirmed; 1,402 input/409 output tokens, $0.0012152.
- Semantic verifier preserved both required facts, certainty, attribution, temporal relations and reader spans. Fidelity passed with MODEL_VERIFIED entailment and no repair.
- Writer prompt remains approved-fact-spans-editorial-v15; zero writer/publication code changes.

All unsuccessful plans remained blocked by the scoped proof guard. No fallback edition was published. The two older fallback plan records remain for audit only.

## Browser, privacy, costs and tests

Real authenticated Chromium opened /product-proof/distillation-quality-proof-2, expanded the full brief and opened both report dialogs. The advertising claim appears once and is self-contained. The dialogs expose the original BBC article/video URLs. API read status 200 for owner, 404 for anonymous direct access. Reload returned the same edition ID and exactly one edition; no duplicate publication appeared.

New paid calls in this task: 10 persisted intelligence/editorial calls, two writer/verifier calls, three bounded diagnostic calls. Reported incremental cost including diagnostics: $0.007856016. No paid source-provider calls. Old $0.02 planner and $0.02 contaminated-attempt reservations remain conservative unknown charges; they were not erased or declared confirmed invoices.

Final regression matrix: 10 files, 25 tests passed. Workspace typecheck passed. Worker staging deployment build passed. git diff --check passed. Earlier parallel test runs hit local 10s setup and 25s integration timeouts; the same suites passed unchanged in isolation and in the final sequential run. No assertion, timeout or runtime model deadline was increased.

Paused the proof feed after publication, preserving its edition. Removed the temporary diagnostic/proof endpoint and temporary WEB_OPERATOR_RUNTIME_TOKEN. Normal staging /health returns 200; private-feed boundary remains 404. Existing global staging model settings were preserved; real model flags were scoped to this controlled run, not enabled across unrelated feeds.

## Remaining product-quality observations

The older Mangione report was selected for this first edition; the reference shows October 2, but the generated prose does not date that old reporting. The first-edition exemption/temporal editorial treatment still needs a separate product-quality review. The collapsed frontend preview also splits U.S. prematurely. Those behaviors were not changed because this task explicitly freezes writer/publication logic and focuses on the two model-contract failures. Real-model execution is now proven; this is not a claim that all editorial quality issues are resolved.

Protected complete snapshots, provider diagnostic envelopes and browser screenshots remain in ignored .review-tmp and scoped staging R2 proof objects. No credential values are in this report or committed fixtures.
