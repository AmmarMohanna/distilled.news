# Original 16 rematches: controlled recovery preflight ? 19 October 2026

## Decision

**No grant change, settlement, deployment, paid inference or rematch execution was performed in this preflight. New inference cost: $0.** Approval is pending. A plain renewal is unsafe and insufficient: the existing authorization is account-wide and all25 admission-counted slots are occupied.

At19:29:17 UTC, all16 original requests have latest WAITING_BUDGET / ACCOUNT_AUTHORIZATION_REQUIRED outcomes. This supersedes the earlier nine/seven split. There are19 total rematches; the three newer requests are excluded from this proposal. Zero original semantic completions. A completed handler or queued retry is not semantic completion. Briefing readiness is still blocked by unresolved intelligence.

## Account and existing exposure

- Only grant: staging-openrouter-06827fb0-4c18-4973-acd0-34bb28777c3b; expired2026-10-19T19:15:55.700Z. Original immutable base $50/concurrency21; append-only effective ceiling **$73**, concurrency **25**. No currently valid replacement.
- Account reservations4478; reported settled4428, **$59.459620206**. Unsettled50, **$5.405912694** exposure:25 execution-quarantined (still financially held),25 admission-counted. Active admission occupancy25/25. No new grant can fix that occupancy by itself.
- Historical settled plus held exposure **$64.865532900**, unused original $73 ceiling **$8.134467100**. These are account-wide figures, not the cost of this feed or one edition. The target feed remains23 confirmed settlements totaling$0.072671432 plus one unknown hold.

## Uncertain editorial hold

Reservation semantic_intents:4b1341dc9531cb842a9a99274394c36e0dedafe88d1408e05db15511604e2b6d remains held at **$0.142206**. Metadata-only GET at19:29:33 returned its exact generation gen-1792436007-Ks6hvCkQAy1Fpje6Lvo4, total_cost$0.0419284, both terminal reasons null. The amount is provider metadata, not proof of completion or a ledger-confirmed settlement. **Cannot conclusively settle; preserve the hold and UNKNOWN fence.**

Further metadata-only inspection of23 retained handles among the25 capacity-counted operations returned22 without terminal proof and one terminal result; two operations have no retained handle. No inference call was sent. One different staging operation is an evidence-bound reconciliation candidate:

- Reservation semantic_intents:ab8a92551d04b16dcca7ac60d464f187681823daf3b02e42cf70828bac1319a3; feed briefing_06b310b2-6d8d-4d24-822b-acf757f79436.
- Retained HEADERS receipt binds gen-1792082101-2yxlsakTpbphPQc9cDb9 to that reservation/model/owner. Provider returned exact generation, finish_reason=stop, native_finish_reason=completed, charge **$0.004462**, replacing its$0.0635048 reservation if an approved reconciliation succeeds.
- Requested model openai/gpt-4.1-mini; returned openai/gpt-4.1-mini-2025-04-14. Official GET /api/v1/model/openai/gpt-4.1-mini at19:35:53 explicitly returned that canonical_slug. [OpenRouter documents alias-resolving model metadata](https://openrouter.ai/docs/api/api-reference/models/get-model).
- Current recoverProviderGeneration requires literal model equality, so it cannot consume this proof without a reviewed evidence-bound reconciliation. Do not change the reservation identity or use generic string-prefix matching. Preserve token/receipt/generation/model-canonical-binding/cost/terminal checks atomically. Financial settlement does not recover a missing semantic answer, authorize a retry or make its article processed.
- **No settlement made.** This is another staging feed; explicit approval of this exact accounting-only reconciliation is required. If approved and revalidated, occupancy becomes24/25, retaining the limit25. All other unknown holds remain intact.

## Saved work and conservative cost

Offline replay re-extracted the actual immutable article revisions and checked that the current offered ClaimMention identities equal each saved blocked input. It generated the actual final compacted provider schema with current model configuration for each article; all16 fit. The preflight passed with network/inference disabled.

Ten successful semantic result records remain across four original articles, including five successful construction packet-progress rows across two articles. None is an exact semantic-question match for the current16 blocked root requests: current canonical context and/or continuation question differs. Preserve those results and packet manifests, re-run the existing exact compatibility lookup before admission, and never equate source identity alone with reusable semantic context. No saved success was overwritten. A changed question is not permission to retry an UNKNOWN matching question.

Current16 root reservation sum: **$2.1250108**. This is a UTF-8 byte/input-token upper bound plus configured maximum output, not predicted billing. One hypothetical maximum-sized repair can reserve$0.458352; current roots plus16 such repairs give **$9.4586428**, which exceeds current unused original account exposure by$1.3241757. We therefore do not propose funding that worst-case full-completion envelope or increasing the original ceiling.

Proposed bounded continuation: **maximum$2.1250108 new total exposure/charges**, shared by construction and the existing single repair where admitted, at most32 new calls, one recovery-owned call in flight. Settled actual charges release the unused portion of reservations within that cap. The aggregate ceiling can stop work before all16 finish. This proposal is not a guarantee that every root and repair fits simultaneously or will be semantically accepted. Every actual new request must be re-preflighted; changed graph context can change its size/identity. No editorial planning, writing, verification, acquisition, other feeds or newer rematches are authorized by this scope.

## Fresh authorization proposal ? NOT ACTIVATED

- Scope exactly the16 request/source-revision pairs below, same staging provider account, existing GPT4.1-mini route. No new provider/model or account to evade shared liabilities.
- Fresh immutable authorization ID/timestamps fixed only after approval. Admission window **7200 seconds from activation**, then fail closed; do not extend automatically. The window accommodates up to32 existing180s provider timeout allowances (96min) plus the currently recorded retry eligibility and bounded orchestration margin. It is an operational deadline, not a promise to complete all32 calls. Start no new call without enough remaining operational time; retain any uncertain outcome.
- Original $73 ceiling and effective concurrency25 unchanged. If the exact terminal reconciliation above is approved and completed first, existing held exposure becomes$5.342407894; a fresh period exposure cap **$7.467418694** covers that plus the proposed$2.1250108 new budget. Historical charges must remain accounted in a cumulative guard: combined historical charges/remaining holds/proposed new maximum **$66.931500900**, below$73. Do not treat the new period as erasing old liabilities or losses.
- **Required enforcement gap:** ModelSpendingAuthorization currently supports account/model/time/exposure/concurrency only. The existing stagingMissionDb scope applies only to staging-fresh-* feeds, not this real feed. Merely adding feed/request fields to JSON would have no effect. Before activation, a narrow tested reservation-admission scope must enforce the exact original request/source set, allowed construction/one-repair stages, call count and aggregate new exposure in the existing atomic transaction. Unrelated background consumers must remain unable to spend. This is a prerequisite, not an implemented feature or authorized deployment.
- Stop if terminal proof/model binding changes, no real slot is free, a matching paid outcome is unknown, source authorization/version fences change, or money/time/call admission fails. Do not quarantine another unknown operation, raise concurrency, remint request IDs, bulk replay queues, or purchase duplicate packets.

Approval requested covers this bounded envelope, the exact accounting-only reconciliation and the necessary narrow scope enforcement. **No grant should be inserted and no inference should run until those gates are implemented/tested and approved.** No production changes or publication/notification authorization is included.

## Per-request snapshot

All rows below are WAITING_BUDGET / ACCOUNT_AUTHORIZATION_REQUIRED. Times UTC; nextAt is durable eligibility, not proof of enqueue. Root estimates are maximum reservations, not actual charges.

| Request | Article | Next retry | Root reservation USD |
|---|---|---|---:|
| fc45e8c475 | Laplace Intelligence red-teams robots and self-driving cars before they hit the real world | 2026-10-19T19:34:09.908Z | 0.1369680 |
| 1ec2455b9c | Replit makes OpenAI its default over Anthropic, CEO says | 2026-10-19T19:33:46.181Z | 0.1395860 |
| 71583ce157 | People are using AI to make their smart TVs dumb again | 2026-10-19T19:34:02.168Z | 0.1363312 |
| d6e064f804 | Physical AI is more than robots, says the Nvidia veteran now investing in it | 2026-10-19T19:35:36.524Z | 0.1295128 |
| 23573cdd7a | Anthropic is letting METR researchers look under the hood with employee-level access | 2026-10-19T19:37:25.843Z | 0.1319008 |
| 79a56c4379 | Elorian’s first AI model wants to reason with images, not just about them | 2026-10-19T19:36:06.739Z | 0.1330280 |
| dd6a0a896e | When it came to Cal AI’s viral success, a small army of influencers paid off | 2026-10-19T19:38:57.053Z | 0.1331344 |
| 8769de3cde | Jev is Vercel’s fastest-adopted AI model ever | 2026-10-19T19:39:21.166Z | 0.1308240 |
| 212de3a507 | An Nvidia insider-turned-VC on why robotics hasn’t hit its ChatGPT moment, yet / TechCrunch | 2026-10-19T19:39:23.034Z | 0.1283120 |
| 6b0f7d2ce2 | Veritas expands its anti-counterfeit chip to jewelry, trophies, and fragrance bottles | 2026-10-19T19:33:43.713Z | 0.1333444 |
| eb55f66d0b | Amazon devices chief Panos Panay sees a future where AI devices replace the need to use apps | 2026-10-19T19:34:25.186Z | 0.1347340 |
| e7c7d008b9 | Mark Wahlberg on using AI in film ‘the right way’ and being open to an AI clone carrying on his legacy | 2026-10-19T19:39:13.584Z | 0.1320692 |
| f2ef52d2b1 | Replit’s CEO says the future of work is the ‘self-driving company’ | 2026-10-19T19:40:19.293Z | 0.1329012 |
| f2061096db | Meta launches an open-weight AI model that runs on Macs | 2026-10-19T19:27:35.613Z | 0.1308312 |
| d4ca036b39 | India becomes the latest country to report rogue AI agent activity | 2026-10-19T19:28:05.911Z | 0.1313964 |
| af6ac64712 | Tenstorrent hits $6.2B valuation to scale open-weight AI chips | 2026-10-19T19:27:47.719Z | 0.1301372 |

## Reproducibility and status

Machine artifacts: benchmarks/rematch-recovery-preflight-results.json and benchmarks/rematch-recovery-approval-proposal.json. Original immutable evidence, full private operation snapshots and metadata GET receipts remain in ignored .local-reports/single-feed-preflight, pinned by hashes. Offline check: .local-reports/recovery-approval-preflight.test.ts with its dedicated Vitest config:1 test passed. It verifies all16 schemas/ClaimMention identities and exports admissions; this is not real-model accuracy or completion testing. No full suite repeated for this read-only preflight.

No application code or remote authorization changed. Current deployed scheduling implementation remains33c5a7d, Worker4f9491e7-06e8-43d5-898b-3f1176be92a6. Production unchanged. After approval, report per-original-request actual semantic SUCCEEDED/remaining reasons, new calls and reuse IDs, receipt-backed cost, wall time, and briefing readiness. Stop rather than claim recovery from ACKs or handler SUCCEEDED telemetry.
