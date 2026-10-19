# Authorized claim-disposition private staging attempt

User authorized one fresh attempt based on `dd5fb9c`, including the small operator-scope setup needed to execute it. Scope: `claim-disposition-20261019-1`; feed: `staging-fresh-20261019-run1`. Previous markers, paid receipts and evidence remain unchanged. No acquisition, grant amendment, provider switch, parallel execution or automatic second attempt.

The fresh operator policy is `claim-disposition-single-attempt-v1`, default off until explicitly supplied to the staging deployment. Only its new review/publication routes and read-only status are enabled under this policy; old paid action routes are blocked. Fresh review and publication markers are immutable and distinct from consumed scopes. The review requires exactly four settled prior reservations, no unknown feed operations and a newly successful rematch. The new construction question includes `claim-disposition-v1`, so older operation identities are incompatible; existing UNKNOWN fences remain intact.

## Preflight and planned paid operations

Retained article revision `478b532d-62cc-41d0-bf16-3010a8fd98f2` was active at 2026-10-19T14:41:33.618Z. The source is enabled with legacy collection ownership; normal shared collection does not own this manual run. Feed public visibility is zero, with zero editions, push receipts and delivery jobs. Public push eligibility explicitly requires public visibility; the runner does not invoke subscriber delivery and forbids queue sends. Global V2 remains off; only the private invocation receives V2.

Account grant remains $63, expires 2026-10-19T19:15:55.700Z, and permits only existing Jev and GPT-4.1-mini models. Observed account headroom was $5.355068976; actual admission rechecks it before each purchase. No existing liability is cleared.

| Planned operation | Maximum new calls |
| --- | ---: |
| GPT construction and its one permitted repair | 2 |
| GPT editorial plan | 1 |
| GPT writing and its one permitted repair | 2 |
| GPT batched verification and re-verification after repair | 2 |
| Existing Jev relation/effect/ranking decisions | 3 |

The cumulative fixed model limits are 11 GPT operations (four old plus seven new) and three Jev. They count settled failures too. Any additional packet/continuation requiring a purchase is denied by the same cap. Reservation admission enforces cumulative reported spending plus unknown exposure plus the next reservation <= $0.20, in addition to account authority.

The existing request envelopes remain 32,768 GPT context tokens / 8,192 output tokens, and 64,000 Jev input tokens. Verified existing route prices give $0.0229376 maximum per GPT call and $0.002688 per Jev call. Thus seven GPT plus three Jev plus all prior failed $0.0090332 yields **$0.1776604** conservative provider upper bound. Initial saved-input admission is $0.0197884; every actual generated request must independently fit before purchase. No fact truncation to fit is permitted. New acquisition/provider collection cost is zero because retained evidence is reused.

Worker/D1/R2 invoice allocation is not available as an actual per-attempt bill. Request CPU/wall time, D1 rows read/written, SQL CPU, DB wall time and payload sizes are recorded where available; do not claim provider spending is a complete infrastructure invoice. The provider envelope leaves $0.0223396 below the target, not permission for extra model calls.

## Rollout checks

Staging-only target: account `e32b564514d4f9b9e383b7dd30dbb026`, Worker `distilled-news-staging`, explicit `wrangler.staging.toml`, D1 `ab259bfe-6029-4e20-8cb6-eea6b7a67459`. Pre-deploy rollback Worker: `521ef96a-cc4a-431e-8f80-a0a7f764e6bf`. Existing frontend asset prefix and all bindings/secrets are preserved. No schema migration is needed or applied.

Six scope/budget tests passed before the final instrumentation change. One five-second budget test timed out when run concurrently with compilation; an isolated rerun passed all six in 11.06 seconds without changing assertions/timeouts. Worker typecheck and explicit staging dry-run passed. Core `dd5fb9c` verification remains recorded separately.

The client records one immutable intent, invokes fresh review once and invokes publication only if review succeeds, with no retry. Both invocation times and the complete client wall clock are retained. Any rejection or uncertain result stops further paid work. Actual outcome is recorded after execution.
