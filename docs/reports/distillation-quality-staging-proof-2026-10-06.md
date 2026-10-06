# Distillation quality staging proof — 2026-10-06

Result: deployment succeeded; complete real-model product proof FAILED. No fallback edition was counted or published.

## Deployment

Requested branch: feat/distillation-quality, cb4f04aa13241e70b5d26f1444dd10d823b7959f.
Original staging deployment: 334ad178-3079-4a4b-aff0-3c5b6cdb42d3.
Final code deployment: abe6c608-c376-45ad-9f2b-8aea8d4921e6.
Final active version following temporary-secret removal: 14b166e3-beab-49fb-b199-b86324b55558.
Cloudflare login: distillednews.platform@gmail.com; account e32b564514d4f9b9e383b7dd30dbb026.
Worker distilled-news-staging; D1 ab259bfe-6029-4e20-8cb6-eea6b7a67459; R2 distilled-news-staging-raw; processing queue and DLQ unchanged; VPC service 01a1099d-e88a-7c23-a1c5-eeb51471e780.
Final deployment uses the branch's normal staging entry point and configuration. Cron runs every minute. Existing provider ceilings and model settings were preserved. The temporary real-model proof override is no longer deployed. This is NOT a claim that normal staging feeds now use semantic/model routes.
Main, production, and unrelated local work were untouched. An accidental suffixed Worker distilled-news-staging-staging was created by an incorrect --env argument and then deleted. Its queue-consumer attachment failed; normal staging queue consumer was preserved.

## Baseline and source lineage

Saved the existing Staging Product Proof edition 2707538d9b5876ebf50e7beff609e6cf71d13a7fc433c41e7cc298eecea64c8a before deployment. Its three stories used deterministic-approved-facts-v3 / provider NONE. The Trump advertising story repeated the same claim twice. This was not a successful model-written briefing.

Replayed four retained BBC World RSS EvidenceRevisions, preserving body, title, canonical URL, publication time, publisher and content hash verification:

- 37c25495-3179-4672-89d0-64c682114753: Brazil election; 2026-10-05T20:42:19Z.
- 84a025ae-c6bb-4905-af2d-07d210859613: Trump advertising; 2026-10-06T01:58:29Z.
- a76d8371-2efe-47ad-87e0-294b5f7ecb1b: second retained advertising revision, same claim/time.
- f4637e2a-77e6-41e0-a988-f7b376d45c7f: Mangione arrest footage; 2026-10-02T20:37:34Z.

This corpus shares the duplicated advertising claim with the baseline, and substitutes old reporting for the baseline's explosion story to test freshness. It is not an identical whole-edition comparison.

The initial replay omitted required acquisition proposals and received four durable REJECT_UNSUPPORTED receipts. The harness was corrected without modifying those receipts. The first feed also received ordinary queued RSS work after source approval; this introduced three unrelated observations and deterministic state. That attempt cannot be counted as a clean real-model proof. No paid source provider was enabled. Its one JEV call succeeded and one gpt-4.1 construction call timed out/failed with unknown reported charge.

A second isolated private Feed, quality-proof-20261006-isolated, used the normal owner create API and modern approved connector-owned RSS source. The temporary harness acknowledged queued work for this Feed only, leaving other queue consumers/messages operational; it manually drove core production acquisition, reassessment and publication functions. All four retained revisions were durably accepted. This proves retained-payload replay through intake, not scheduler-triggered execution. The fixed closed publication window was persisted once; repeated publication calls could not generate new windows to evade budgets.

## Measured stages

| Stage | Observed outcome |
| --- | --- |
| Real source evidence | Four retained immutable revisions accepted and acquired; no fresh source fetch in the isolated replay |
| ClaimMentions | Four stored mentions |
| Propositions | Four stored proposition documents; successful cross-Event dedup NOT demonstrated |
| Self-contained facts | Advertising facts carry exact title provenance and RESOLVED_BY_CONTEXT; no writer output exists to assess final prose |
| Freshness/novelty | Original report times preserved, including October 2; first edition is exempt from OLD_RECAP labeling, so continued-feed stale demotion NOT demonstrated |
| Real JEV structural matching | Three successful typesafe/jev-1.13 RELATION calls |
| Real JEV effects | One paid RELATION_EFFECT returned INVALID_EXPERIMENT_RESULT |
| Strong semantic construction | Two successful and two deferred openai/gpt-4.1-mini construction operations; deferred operations had reported token/cost usage |
| Event/Storyline | Four Events, three Storylines; three current semantic states provisional; one current state has GPT provenance |
| Comparative EditorialPlan | Real OpenRouter attempt failed with SEMANTIC_PROVIDER_FAILURE and unknown reported charge; stored route DETERMINISTIC_FALLBACK |
| Real writer | Not reached |
| Real semantic verifier | Not reached |
| BriefingEdition | Zero; fail-closed proof guard blocked fallback planning before synthesis/publication |

The duplicate advertising fact remains in two provisional Event candidates. Therefore neither successful dedup nor improved final briefing quality can be claimed. Provider/validation error masking limits diagnosis: reported usage on failed construction means a response was billed, but the precise underlying validation error was not captured. Do not assume all SEMANTIC_PROVIDER_FAILURE records are network failures.

Isolated feed: 9 real model calls, $0.004212086 reported spend plus a $0.02 reservation for the unknown planner outcome ($0.024212086 accounted total). Initial contaminated attempt: one reported JEV call $0.000042756 and one unknown construction outcome reserved at $0.02. Combined known spend $0.004254842; combined accounted spend/reservations $0.044254842. Reservations are not verified invoices. Paid source-provider calls: zero; the initial ordinary RSS fetch was free.

Existing durable budgets retain unknown-charge reservations and prevent unsafe retry. No cached result, receipt, failed model record, or budget was deleted or reset. No timeout/assertion was increased to obtain a passing proof.

## Browser and cleanup

Real Chromium owner session visited /product-proof/distillation-quality-proof-2. Owner feed API returned 200; UI rendered "no published briefings". Actual anonymous /api/feed/product-proof/distillation-quality-proof-2 returned 404. Since there is no edition, citations and refresh-stable publication are NOT proven by this run.

Both experiment feeds were paused through the admin API, preserving diagnostic state. Restored normal staging entry point, cron and queue bindings. Removed only the temporary WEB_OPERATOR_RUNTIME_TOKEN. Final /health returns 200.

## Verification

Workspace typecheck passed using corepack pnpm -r typecheck; direct root script could not resolve bare pnpm on this Windows environment. Worker staging deployment build passed. git diff --check passed. Quality-focused suites: 37 tests passed across editorial, semantic relations, comparative selection, self-contained facts, freshness and scheduled writer. Initial combined run had two setup timeouts; unchanged freshness/scheduled-writer suites passed in isolation. No test timeout/assertion was weakened. Tests do not establish provider response compatibility or live full-path success.

## Required next work

Capture precise sanitized model/parser failures; reconcile unknown provider outcomes before retrying their budget keys. Correct real JEV effect-response compatibility and strong construction failures without weakening evidence/ID validation. Re-run a bounded proof through a genuinely semantic Event/Storyline state and GPT comparative plan, then inspect writer/verifier provider provenance and immutable publication. Verify dedup support unions, continued-feed freshness, original source links and reload idempotency. Until then, the complete new path is unproven.

Protected raw baseline, receipts, read-model snapshots and browser screenshot remain in the ignored .review-tmp directory. No credentials are included in this report.
