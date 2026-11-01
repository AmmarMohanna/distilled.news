# Scheduled V3 delivery and delayed collection

## Retained incident

The `leb arab` edition scheduled for 23:00 Beirut on 2026-10-31 was persisted at 23:43:36.562. Its evidence cutoff remained 22:55. The request was created at 22:56:41.711; the first model operation was not created until 23:43:06.765. Editing, verification, repair and re-verification took 28.140 seconds across four settled calls costing $0.0418644.

An almodon.com collection poll scheduled at 22:35:41 retained `BACKPRESSURE / HELPER_GLOBAL_CAPACITY_BUSY / HTTP 503`, with an empty, durable unchanged handoff observed at 22:41:33. Its later retry timestamp reached 23:42:43. The unfinished collection barrier prevented preparation even though other source evidence was already available. The current row does not retain every intermediate retry or prove a continuous execution timeline; its due timestamp is not itself an execution-completion timestamp.

## Focused change

A **scheduled V3 window** can begin preparation from available acquired evidence at its existing reporting cutoff, five minutes before `scheduledFor`, even while upstream source polls remain pending. The same rule is used by priority dispatch, the coalesced transport, final publication and reader progress. No grace period is added after intended delivery.

This applies only with explicit valid clock-delivery context: `scheduledFor - window.end` must equal the existing five-minute lead and the supplied clock must have reached `window.end`. V2 and unscheduled replay gates remain unchanged. Window identities, source timestamps and schedule policies are unchanged.

Pending collection is not cancelled, marked successful or deleted. The gate returns `deadlineReleased` and source names separately. A completed V3 request retains `coverage.state=INCOMPLETE` and the distinguishable `COLLECTION_DEFERRED_AT_REPORTING_CUTOFF` failure code/count. An empty window with unfinished collection is DEFERRED, not an invented edition or a false fully collected QUIET result. Existing late-discovery admission can offer subsequently acquired evidence in the next reporting interval with original temporal context and reader memory.

The rule releases only the upstream polling barrier. Existing acquired-evidence readiness, semantic/source ownership, correction checks, model authorization/uncertain outcomes, verification, leases, fencing, atomic publication and duplicate prevention remain authoritative. It does not permit publishing an unverified draft or guarantee delivery under every runtime/provider outage.

The runtime still waits until `scheduledFor` to persist reader-visible output, reusing verified results prepared beforehand. Five minutes is preparation time, not proof that every larger model workload will finish within it. Live deadline reliability must be measured after a separately approved deployment.

## Validation

- Red/green regression reproduced the busy-source blocker: two new release assertions failed before implementation; the previous coverage controls passed.
- Coverage controls verify release at cutoff, no early release, invalid/missing schedule context, unchanged V2 behavior, and unchanged pending source job/results.
- Actual local D1 integration verifies priority dispatch plus transport admission and no duplicate live delivery while the source stays pending.
- V3 integration prepares at cutoff, has no edition before intended delivery, publishes at that intended timestamp, retains incomplete coverage, reuses the two fixture model operations on duplicate delivery, and offers a late-acquired article in the next window.
- A separate empty-window integration performs zero model calls and persists an incomplete DEFERRED result without an edition.
- Workspace TypeScript checks passed. The six-file regression run passed 96 tests. After the final compatibility check, the four dispatch/coverage files passed 54 tests (including the added retained-V2 case); the added empty-window case passed separately. Worker typechecking was rerun after the last implementation change and passed. No test failure was hidden by disabling a product guard.

Tests use deterministic model fixtures and local D1; they are not claims of live inference quality or production punctuality. No paid model call, financial-record change, source mutation, deployment or notification is part of this implementation.
