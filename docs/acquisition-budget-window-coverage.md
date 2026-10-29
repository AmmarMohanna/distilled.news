# Recoverable acquisition-budget waits and briefing coverage

## Change

A confirmed `ACQUIRE / PENDING / BUDGET_EXHAUSTED` job now represents unavailable intake coverage rather than actively progressing work that holds every reporting window open. Both automatic dispatch (`jobsHoldingWindow`) and execution/publication (`windowIntakeCoverage`) use that distinction.

The existing `failedJobs` coverage field includes this unavailable coverage; it does **not** change the acquisition job to `FAILED`. Requests retain `INCOMPLETE` coverage with an explicit `ACQUIRE / BUDGET_EXHAUSTED` diagnostic. No new schema or orchestration layer is added.

- Complete, source-grounded evidence can proceed through the unchanged V3 editor/verifier and publication checks.
- An empty window with unavailable evidence remains `DEFERRED / INCOMPLETE_INTAKE_COVERAGE`, never confirmed quiet. It makes no model call.
- Acquisition jobs, identities, counters, retry times and financial records are untouched. When acquisition resumes through the existing path, the evidence remains eligible for late discovery with its original publication date.
- Running jobs, backpressure, rate limits, reassessment waits and uncertain paid outcomes retain their existing protection. This is not a timeout bypass or an authorization override.

Only two runtime checks change, in `runtime.ts` and `window-coverage.ts`. The readiness code is shared by V2 and V3; neither intelligence pipeline, prompts, models nor publication contracts are redesigned. No deployment or paid inference was performed.

## Evidence from the retained Bitcoin snapshot

The comparison uses the exact unchanged read-only snapshot from October 29, 2026 at 16:13:41.806 UTC. Candidate SQL was extracted from the working implementation, not independently approximated.

| Check | Baseline holding jobs | Candidate holding jobs |
|---|---:|---:|
| Oldest pending close, October 28 at 12:00 UTC | 2 | 0 |
| Newest pending close, October 29 at 16:00 UTC | 31 | 19 |

Of 29 pending windows, two have no remaining acquisition hold under the candidate; other windows still have backpressure or other genuinely pending work. For every window, the difference was asserted to equal only confirmed pending acquisition-budget waits. **This does not establish that the Bitcoin feed is fully unblocked or healthy.** No live job was retried or edited to obtain this result.

## Validation

**141 tests passed across six files**, plus Worker TypeScript checking:

| Suite | Passed |
|---|---:|
| New acquisition-budget coverage matrix / retained failure shape | 2 |
| V3 source integration | 8 |
| Scheduling/runtime, including automatic dispatch deduplication | 27 |
| V3 window/recovery | 30 |
| Shared briefing coverage | 12 |
| Acquisition/retry/recovery | 62 |

The new matrix checks nine combinations, including an absent failure code, stale budget codes on running/completed work, a reassessment budget code, transient backpressure, rate limits and uncertain paid submission. It compares dispatch and execution coverage, checks cutoff filtering and confirms job JSON remains unchanged.

V3 integration verifies full evidence/citations, successful publication with explicit budget-incomplete coverage, exactly two mocked model operations, replay without further operations, no inference or edition for an unavailable empty window, and subsequent acquisition/reassessment of the same job with the original publication date retained in the next window's input. Automatic scheduling dispatches exactly once without changing the waiting job or creating a paid reservation. Existing timed delivery, ordering, crash recovery and uncertain-outcome tests pass.

The initial new-fixture run failed because inserts omitted explicit column lists and one assertion used a non-normalized timestamp. Those fixture errors were corrected; no product behavior was changed to satisfy them. Corrected focused tests passed 10/10; the broader four-file run passed 131/131. Provider transports are mocked. Actual paid inference cost: **$0**. No speed or model-quality improvement is claimed.

Local evidence: `.local-reports/acquisition-budget-coverage/` contains the original and corrected test logs, typecheck logs and unchanged-snapshot replay. The unrelated favicon edit was not included. Staging remains on its previous runtime until a separately authorized deployment; live performance of this change is unproven.
