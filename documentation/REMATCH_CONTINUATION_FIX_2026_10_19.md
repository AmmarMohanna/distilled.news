# Rematch continuation and dispatch correction ? 19 October 2026

## Confirmed defects and narrow fixes

1. Runtime selected only the first two due rematches before transport admission. If their transport generations were reserved, no later eligible request was tried. Regression seeds two live reservations and two later eligible requests: before fix sends none; after fix sends c,d. Count at most two accepted sends rather than two inspected candidates. Canonical eligibility, protected-first/fair ordering, transport fences, the single intelligence lane and financial admission remain unchanged. A bounded per-pass dispatch aggregate reports eligible/considered/enqueued, not completion.
2. Ready closed briefing priority was documented as one initial turn but repeated until a synthesis job existed. A planner timeout occurs before synthesis, so it could reclaim the lane every relay. Priority now excludes a request with an existing v1_briefing dispatch. The normal publication dispatcher and durable request are unchanged; lost sends still recover through ordinary dispatch. This removes repeated priority, not publication eligibility or correction obligations.
3. Completion released the rematch slot but only messages carrying jobId durably woke the feed/relay. v1_rematch carries feedId/requestId. The new branch resolves the saved request to its owning feed after matching-generation completion, persists the feed wake and sends one coalesced relay. Stale/duplicate completions cannot wake another generation; nextRematch still blocks the resource-wait request until its persisted due time. Lost relay sends retain the database wake for Cron recovery.

These are proven code defects with failing-before/passing-after local regressions. They are not a claim that every historical never-started request had the same cause: the old transport decline/ack history is incomplete. No queue reset, paid operation rewrite, lock removal, concurrency increase, extra inference or grant change is part of this correction.

## Read-only staging findings

Frozen original 16-request cohort: 0 completed at 18:55 and 18:57 UTC, 0 live semantic leases, four latest ACCOUNT_RESOURCE_WAIT records, twelve without completed attempts. Five attempt rows and twelve construction progress rows unchanged during that interval. Ten original requests had no dispatch row; six had canonical transport history, which does not prove a physical enqueue. Later snapshots show new requests and some additional attempts entering naturally, so aggregate backlog populations must not be conflated.

At 19:01:24Z the feed slot, graph turn and relay leases were released; expired leases alone did not explain the entire stalled interval. Live tail subsequently records repeated publication callbacks ~28s, reusing the same unknown planner receipt and existing rank receipts, plus a newer rematch's repeated TEMPORARY_UNAVAILABLE deliveries. This shows consumer traffic/coordination contention, not a globally dead queue. The source/feed scheduler continues running. Per-request final results are appended after no-purchase staging verification.

The $0.142206 reservation belongs to COMPARATIVE_EDITORIAL_PLAN, not review. One metadata-only OpenRouter GET at 19:15:39Z returned generation gen-1792436007-Ks6hvCkQAy1Fpje6Lvo4, dated model openai/gpt-4.1-mini-2025-04-14, total_cost $0.0419284, 50,537 prompt/13,571 completion tokens, and null finish_reason/native_finish_reason. The current recovery contract requires exact model binding and terminal completion; existing scheduled recovery reported PROVIDER_COMPLETION_UNPROVEN. No speculative settlement, hold release or retry was performed. The full reservation therefore still contributes to account exposure and an unsettled concurrency slot; it must not be called a confirmed $0.142206 charge.

The previously approved +$10 amendment remains historical and unchanged. Its original grant expired 2026-10-19T19:15:55.700Z. At 19:16:36Z a read-only account query confirmed no active grant. No replacement, expiry extension or cap/concurrency modification is authorized or performed. Staging validation may now observe dispatch/lease/admission without new purchases. Any actual new paid review requires separate authorization and valid account grant; successful semantic completion is not claimed from queue delivery alone.

## Offline verification

Three new reproduction regressions failed for the expected liveness assertions before implementation, then 15 focused scheduler/delivery/rematch tests passed. Twenty-six further transport, continuation, paid-reuse and provider-recovery tests passed. Repository typechecks and explicit staging dry-run passed. Existing restart tests preserve completed packet reuse and UNKNOWN fencing. The account-wait test proves durable WAITING_BUDGET/nextAttemptAt, other-work eligibility and no reservation/provider call. No timeout assertions increased. No full Worker suite repeated.

## Deployment and live outcomes

Implementation **33c5a7d** pushed to backend-validation-contract and deployed only with wrangler.staging.toml --keep-vars. Worker version **4f9491e7-06e8-43d5-898b-3f1176be92a6**; rollback **c557a6c7-307b-4a28-9b7e-32a838159649**. No migrations, asset deployment, production changes, grants or queue resets. Verified staging D1 binding remains ab259bfe-6029-4e20-8cb6-eea6b7a67459.

At 2026-10-19T19:23:58.027Z, original cohort: **0 semantic completions**. Every request has an explicit WAITING_BUDGET record; no terminal semantic failure. Nine latest records identify expired authorization, seven retain older resource waits; one original request held a live semantic lease at the snapshot. Historical ACCOUNT_RESOURCE_WAIT records are not proof of current capacity denial. New consumer executions record ACCOUNT_AUTHORIZATION_REQUIRED after natural grant expiry. Future retry vs overdue transport recovery is recorded individually below. A due retry is not proof of delivery.

New-version live logs show eligible=17, considered=11, enqueued=2 and eligible=15, considered=14, enqueued=2, demonstrating that reserved early candidates no longer prevent later sends. Original Meta and India requests acquired leases and durably recorded authorization waits. Handler SUCCEEDED telemetry means the callback persisted its wait, **not** semantic completion. Feed write turns for observed wait callbacks were 0.8-1.0s; full callbacks 8.4-11.2s, with no new paid reservations. Previous publication retries held the feed turn roughly28s; no full-path latency improvement is claimed.

Paid reservations remain24, reported settlements remain23 totaling **$0.072671432**, provider receipts remain47, saved construction-progress rows remain12. Before/after reservation/settlement records are identical. No completed paid operation was repeated; no new inference was purchased. The unknown editorial reservation remains **$0.142206**, separate from confirmed charges. Actual completed review drain rate remains zero during this no-purchase observation.

The scheduler is making transport/consumer/admission progress, but semantic recovery remains **BLOCKED** by expired authorization. Some older resource waits are still overdue at this bounded snapshot: they have canonical dispatch history but no new persisted admission outcome. Their exact past queue decline cannot be reconstructed from retained exception-only telemetry; they must not all be declared newly budget-blocked. Durable Cron/transport recovery remains active, but successful completion is unverified. Renewed scoped financial authorization and a separately bounded continuation are required before proving real review completion; no hold release is implied.

Machine-readable per-request results: benchmarks/rematch-continuation-results.json. Times UTC. Source text/provider payloads excluded.

| Request prefix | Latest recorded blocker | Next retry | Continuation |
|---|---|---|---|
| fc45e8c475 | ACCOUNT_AUTHORIZATION_REQUIRED | 2026-10-19T19:34:09.908Z | FUTURE_DURABLE_RETRY |
| 1ec2455b9c | ACCOUNT_AUTHORIZATION_REQUIRED | 2026-10-19T19:33:46.181Z | FUTURE_DURABLE_RETRY |
| 71583ce157 | ACCOUNT_RESOURCE_WAIT | 2026-10-19T18:56:39.467Z | OVERDUE_DISPATCH_RECOVERY |
| d6e064f804 | ACCOUNT_RESOURCE_WAIT | 2026-10-19T18:57:24.827Z | OVERDUE_DISPATCH_RECOVERY |
| 23573cdd7a | ACCOUNT_RESOURCE_WAIT | 2026-10-19T19:11:59.471Z | OVERDUE_DISPATCH_RECOVERY |
| 79a56c4379 | ACCOUNT_RESOURCE_WAIT | 2026-10-19T19:08:38.896Z | OVERDUE_DISPATCH_RECOVERY |
| dd6a0a896e | ACCOUNT_RESOURCE_WAIT | 2026-10-19T19:14:03.757Z | OVERDUE_DISPATCH_RECOVERY |
| 8769de3cde | ACCOUNT_RESOURCE_WAIT | 2026-10-19T19:15:07.537Z | OVERDUE_DISPATCH_RECOVERY |
| 212de3a507 | ACCOUNT_RESOURCE_WAIT | 2026-10-19T19:15:21.889Z | OVERDUE_DISPATCH_RECOVERY |
| 6b0f7d2ce2 | ACCOUNT_AUTHORIZATION_REQUIRED | 2026-10-19T19:33:43.713Z | FUTURE_DURABLE_RETRY |
| eb55f66d0b | ACCOUNT_AUTHORIZATION_REQUIRED | 2026-10-19T19:34:25.186Z | FUTURE_DURABLE_RETRY |
| e7c7d008b9 | ACCOUNT_AUTHORIZATION_REQUIRED | 2026-10-19T19:22:19.662Z | OVERDUE_DISPATCH_RECOVERY |
| f2ef52d2b1 | ACCOUNT_AUTHORIZATION_REQUIRED | 2026-10-19T19:23:22.600Z | OVERDUE_DISPATCH_RECOVERY |
| f2061096db | ACCOUNT_AUTHORIZATION_REQUIRED | 2026-10-19T19:27:35.613Z | FUTURE_DURABLE_RETRY |
| d4ca036b39 | ACCOUNT_AUTHORIZATION_REQUIRED | 2026-10-19T19:28:05.911Z | FUTURE_DURABLE_RETRY |
| af6ac64712 | ACCOUNT_AUTHORIZATION_REQUIRED | 2026-10-19T19:27:47.719Z | FUTURE_DURABLE_RETRY |


A further bounded observation at 19:25:49Z shows rematch-attempt rows increasing19?24 and semantic leases154?169 since19:22:36Z, while reservations24/provider receipts47/construction progress12 remain unchanged. This corroborates ongoing admission work, not completed inference. The per-request table deliberately remains pinned to its declared19:23:58Z snapshot.
