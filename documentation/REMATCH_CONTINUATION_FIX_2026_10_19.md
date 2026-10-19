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

To be appended after verified staging-only deployment. No paid continuation is authorized by this document.
