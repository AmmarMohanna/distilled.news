# Staging publication and evaluator recovery

The Lebanon feed last published its 14:00 Beirut window at 14:16. Later windows were not confirmed quiet: some retained unknown model outcomes or superseded frozen inputs; others waited for intake. D1 also repeatedly returned CPU reset error 7429.

## Implemented and deployed

- `40769c8c`: evidence promotion reads one indexed revision-number aggregate rather than loading retained revision bodies; migration 0089. A real-D1 regression changed 4,002 rows/~2 MB returned to one row/16 bytes. Added automatic terminal disposition for superseded frozen inputs and isolated unknown operations, preserving financial records and carrying evidence forward.
- Evaluator version `954ded0c-d413-442e-81cd-db7875bd67eb`: typed transient source-read recovery, exact paid-stage reuse, and audited recovery of generic failures that made no paid calls. All 84 evaluator tests passed. The 14:00 Berri evaluation completed at 19:45 Beirut after automatic recovery.
- `e0e8a05b`, Worker version `572da9b2-4094-4f99-969a-1dbc71cb4677`: reassessment uses a legacy-only intent index, migration 0090. Regression changed 300 large V3 intent rows examined to zero while preserving missing-kind legacy intent recovery and feed isolation. The index is confirmed live despite Wrangler returning an import-status error after committing it.
- `ffd17125`: additional recovery for a financially settled charge whose immutable semantic response failed; exact input, owner token and settled receipt checks. Staging enables existing isolated publication preparation so provider work does not hold the canonical feed write turn. Three recovery tests and two publication concurrency tests passed; Worker TypeScript passed.
- `9b3490d6`, Worker version `6fa73792-9a5c-4cb8-9d43-e9629b3c72a9`: pending Telegram authoritative rechecks use a covering ID-order index (migration 0091). Live analytics identified the previous query at 224.9 ms average and 6,703 rows examined. The real-D1 backlog regression improved 14,001 rows to three with identical first-distinct-key selection. Both targeted tests passed; Worker TypeScript passed. Migration 0091 completed live in 268 ms.

The broad publication run initially passed 71/76 checks; all five failed cases passed in a separate clean run. Two original failures were explicit test timeouts. Evidence promotion's existing suite passed 16/16. A further coverage regression confirmed 4,000 terminal jobs and 2,000 foreign pending jobs do not inflate readiness reads (12 rows) or full coverage reads (14 rows); no coverage bypass was introduced.

## Quality evidence and limits

The recovered Berri report and the completed cable and Iraqi-delegation reports each supported their two extracted claims and citations, with no explicit factual findings. They have partial retained evidence and unestablished extraction completeness. Coverage flags reflect an importance inventory, not an objective percentage quality score or proof that every suggested omission deserved publication.

No spending quota was added. Staging source collection and evaluation retain unlimited monetary modes, and automatic X recovery remains configured for all feeds. Unknown financial records, paid identities, retained articles and private-feed authorization remain protected.

## Verification still required

Deployment is not proof of service recovery. Confirm a new verified public edition, its evaluator result, and declining intake backlog. Repeated D1 resets remained visible after the first deployments; they must not be reported as resolved without new live evidence.

At 20:17 Beirut the scheduler automatically retired the 14:30, 16:00 and 16:30 requests as `V3_SETTLED_CALL_FAILED`. It subsequently retired the 18:00 request as `V3_UNCERTAIN_CALL_ISOLATED`. No financial records were cleared. Acquisition backlog declined from 175 pending jobs to 83; 85 reassessments remained at the later check. Unrelated acquisition/review failures still clustered at identical timestamps, consistent with shared database reset bursts. The 14:00 edition remained the latest public edition at that check.

## Failure tracing found the remaining repeated scan

`6cbb8826`, Worker version `3e9f1362-6ac1-4198-a764-c41841b226a2`, added failure-only D1 CPU reset diagnostics and recovery for settled charges whose immutable semantic result says `SEMANTIC_OUTCOME_UNKNOWN`. Four diagnostics tests passed, including actual Miniflare D1 prepared/batch compatibility and exclusion of bound values, SQL literals and raw errors; TypeScript and an independent review passed.

Three traced reset bursts repeatedly included `pendingV1Jobs` running for roughly 35 seconds. Point lookups and updates begun later failed at the same reset timestamp. Live EXPLAIN showed the outer job lookup already uses the runnable-job index, but its correlated briefing-window priority check chose the general feed/kind document index. It therefore reparses completed request history for each pending job instead of using the existing `v1_briefing_pending_window` partial index. A local real-D1 regression reproduced 80,163 rows read for 40 pending jobs and 2,000 completed briefing requests. This is a demonstrated repeated scan; successful-query analytics alone had not exposed its failed executions.

`92d4380f` forces that existing pending-window index, with a narrow missing-index fallback for older installations. The regression dropped to 163 reads; eleven dispatch/admission tests passed. A read-only live check returned five jobs in 3.66 ms with 658 reads. `39df93f7` skips sources without potentially runnable work during review continuation, reducing 84 round trips to four in an 80-empty-source fixture; all six continuation tests passed. Both fixes deployed as Worker version `8ee974fa-38b7-4f23-b288-c3de3e0586b9`; TypeScript and independent review passed.

On resuming at 21:10 Beirut, the delayed window had 40 pending reviews, declining to 24 by 21:20; acquisition for that window had completed with one separately recorded extraction failure. Publication had not yet resumed. A new failure-only trace started at 21:15 had recorded no CPU reset messages by 21:20. This short clean observation is not a reliability guarantee.

Current analytics' large coverage-query averages were investigated separately. The target feed's exact readiness query took 5.61 ms and 536 reads with the correct indexes. Another feed had 31,278 genuinely pending acquisitions and 2,294 failed jobs, explaining the high global coverage work. No readiness predicate was bypassed and no arbitrary intake limit was added.

Evaluator commit `e7bb421c`, version `02699945-19df-4d5c-9ef1-5046ab3c8165`, recognizes the explicit source-D1 CPU-reset message even when it omits numeric code 7429. Two red direct/nested fixtures passed after the fix; all four classifier tests and evaluator TypeScript passed. This does not retroactively prove the cause of old generic failures. There were 31 generic failures with no paid calls that had already consumed their once-only recovery audit, plus 42 with paid calls. A sampled paid response failed evidence validation and had a different historical request identity; these must not be bulk replayed or called successful evaluations.
