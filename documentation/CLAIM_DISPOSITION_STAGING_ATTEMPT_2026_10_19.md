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

## Executed outcome: NOT PUBLISHED

Pushed `dd5fb9c` and scope setup `7c6f2ec` to `backend-validation-contract`. Deployed `7c6f2ec` only to staging as Worker **79b9188b-26e5-41f6-a4e4-f478390ec7e6**. The live trace confirms this exact version handled the request. No migration, account grant, production resource or source permission was changed.

The single fresh review began at 2026-10-19T14:45:52.505Z. Construction and its one repair were rejected. The client stopped and did not invoke publication. There is **no briefing draft or edition**, and no final factual-verification result to present. The retained source remains:

https://techcrunch.com/2026/10/18/anthropic-says-its-committing-5-of-its-shares-to-a-public-benefit-fund/

### Exact model behavior and blockers

Both responses provided a complete nine-key disposition object, each unit assigned exactly once, with no background/group contradiction. The representational correction worked for this sample. Neither complete construction passed all integrity checks:

1. Initial response assigned C8 to G3 but referenced it from G0's `storylineState.openQuestionMentionIds[0]`. New diagnostics reported `FOREIGN_GROUP_REFERENCE`, pointer `/groups/0/storylineState/openQuestionMentionIds/0`, allowed C0–C4.
2. Repair removed that reference and added C4 to G0's entity support. Canonical validation then rejected **SLOT_ENTITY_OWNERSHIP** at `groups[0].slots[0].entityLabel`. The slots named `Anthropic shares` and `Anthropic commitment`, while the group's declared entity label was only `Anthropic`. We did not rewrite these labels, drop the slots or treat the response as accepted.

This also exposes an implementation limitation: transport mechanical diagnostics did not include the downstream slot-to-entity mismatch in the first repair packet. Canonical validation stopped at its first violation, so further validity is not established. This is a concrete offline follow-up, not authorization for another paid repair.

The model proposed four groups: fund terms/uses plus historical study context; remarks about bolder approaches; public trust context; promised governance details. Context still appears fragmented into purported developments. That is an investigator concern, not a measured false-split rate: independently reviewed boundary labels remain unavailable. Group count alone does not certify quality. No new graph construction was accepted and no source unit was silently reassigned.

### Actual spending and latency

| Stage | New calls | Reported cost | Model callback duration |
| --- | ---: | ---: | ---: |
| Construction | 1 GPT | $0.0026536 | 7.641 s |
| Single construction repair | 1 GPT | $0.0031432 | 7.010 s |
| Jev, editorial planning, writing, final verification, publication | 0 | $0 | Not reached |
| New failed-attempt total | 2 | **$0.0057968** | 14.651 s combined |
| All prior failed spending | 4 | $0.0090332 | Recorded in prior reports |
| Cumulative provider total | 6 | **$0.0148300** | No successful editions |

All six calls have authoritative reported settlements; **zero unknown outcomes for this feed**. Input/output tokens for the two new calls: 9,452 / 1,260. Initial/repair reservations were $0.0197884 / $0.0218908, below their admitted bounds. No new acquisition or other paid provider operation occurred. Infrastructure invoice allocation is unavailable; provider total must not be represented as a complete hosting invoice or cost per successful edition.

Whole failed client invocation: **21.485 s**; HTTP stage 21.484 s; Worker runner 20.882 s; tail wall time 20.914 s; Worker CPU **279 ms**. Rematch trace 20.186 s; preparation 19.204 s; context loading 705 ms; semantic lease admission 355 ms. Model-operation wall times including bookkeeping were 9.645 s and 8.594 s. Across those calls, spending reservations took 1.974 s, settlements 650 ms, and result commits 758 ms. These measurements overlap aggregate timers and must not be summed as disjoint stages.

DB wrapper: **130 statements**, **94,704 rows read**, **102 rows written**, **210.2378 ms SQL CPU**, **6.934 s DB wall time**, **226,902 response bytes**. Four model-operation CAS attempts and two rematch CAS attempts were observed; no CAS conflict/rejection was recorded. The publication exclusive turn was never entered. No exception or memory-limit failure occurred in the captured request.

The complete persisted-edition latency target is **not demonstrated**, even though the stopped invocation lasted less than 60 seconds. No p95 is claimed. Final factual support and mandatory reader coverage were not evaluated because writing was never reached. No speedup is claimed from this failed attempt.

### Final state and preserved evidence

Read-only verification at 2026-10-19T14:47:03.543Z confirmed private visibility, active original revision, zero editions, zero delivery jobs and zero push receipts. Unauthenticated operator status returned 404. Global V2 remains off; the private runner's scoped V2 policy remains deployed but its fresh immutable review marker is consumed. Publication lacks a successful review marker and cannot start. Production is unchanged.

Original inputs, exact raw model responses, diagnostics, provider receipts, client timing and credential-scrubbed logs remain in ignored local reports. Machine-readable summary: `benchmarks/claim-disposition-staging-attempt-results.json`, including evidence/raw-response hashes. No historical receipt was edited or uncertain hold released. Further paid operations stopped as requested.
