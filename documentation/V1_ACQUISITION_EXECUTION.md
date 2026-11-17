# V1 acquisition execution

Migration 0036 adds immutable fetched results; migration 0035 remains the intake baseline.
`claimAcquisition` binds a 90-second fenced lease to one exact observation and candidate.
Provider attempts are bounded at five; only typed transient failures back off. Persisted
results survive worker restarts and are resumed without refetching. Five failed recovery
leases retire the job with `RECOVERY_EXHAUSTED`, retaining the result for explicit repair.
Revoked query approval retires the job as `APPROVAL_REVOKED` and cannot promote evidence.

The adapter reuses `SourceAcquisitionOrchestrator` and the existing deterministic HTML
extractor, preserving supplied → structured → HTTP → known workflow → Web Operator
ordering. It deliberately does not call the source collection/high-water service.
No connector cursor is modified by an acquisition job. Returned items must match the
exact candidate URL; siblings and empty/invalid extractions cannot become evidence.

## Bounded integration switch

The existing processing queue and cron relay handle `v1_acquisition` messages.
Both `V1_DOWNSTREAM_ENABLED=true` and an explicit comma-separated
`V1_DOWNSTREAM_FEED_SOURCE_IDS` allowlist are required. Maximum ten distinct canary
FeedSources; an oversized configuration fails closed for both intake and dispatch.
No flags are enabled by this commit. No new Cloudflare resources are required.

`POST /v1/downstream/handoff` requires the existing runtime Bearer credential and an
already registered approved scope. A durable receipt precedes queue dispatch; failed
sends are recovered by cron. Scope registration from product configuration and source
lifecycle synchronization are subsequent integration work, not an authorization API
exposed to the connector caller.

Supplied payloads use scoped R2 keys `v1/payloads/{encodedFeedSourceId}/...` and immutable
JSON `{sourceObservationId,title?,body,language?,publishedAt?}`. Observation binding and
the declared content hash are verified. Missing supplied content falls through to the
ordinary routes. Invalid supplied content is a permanent typed failure.

Runtime comparators register `provider_integer` and `telegram_edit_date`; unknown
schemes remain unresolved. Explicit origin HTTP 410 independently verifies a DELETE.
Provider-specific deletion checks, account validation facts, authoritative conflict
recheck execution, and native/browser runtime adapters still require integration. The
runtime currently composes supplied payload and direct HTTP routes; the reusable adapter
accepts trusted existing native/workflow/operator capabilities without changing wire
contracts. It does not claim all connectors are production-integrated.

Local tests use real Miniflare D1 with synthetic transport. They cover concurrent claims,
expired leases, crashes before fetch persistence, restart after result persistence,
lost acknowledgements, stale observation acceptance, query approval revocation,
HTTP-200 extraction failure, supplied-payload precedence, protected handoff and queue relay.
These are local persisted proofs, not a deployed connector-to-edition proof.
