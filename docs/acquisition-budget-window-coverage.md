# Recoverable acquisition-budget waits and briefing coverage

## Change

A confirmed `ACQUIRE / PENDING / BUDGET_EXHAUSTED` job now represents unavailable intake coverage rather than actively progressing work that holds every reporting window open. Both automatic dispatch (`jobsHoldingWindow`) and execution/publication (`windowIntakeCoverage`) use that distinction.

The existing `failedJobs` coverage field includes this unavailable coverage; it does **not** change the acquisition job to `FAILED`. Requests retain `INCOMPLETE` coverage with an explicit `ACQUIRE / BUDGET_EXHAUSTED` diagnostic. No new schema or orchestration layer is added.

- Complete, source-grounded evidence can proceed through the unchanged V3 editor/verifier and publication checks.
- An empty window with unavailable evidence remains `DEFERRED / INCOMPLETE_INTAKE_COVERAGE`, never confirmed quiet. It makes no model call.
- Acquisition jobs, identities, counters, retry times and financial records are untouched. When acquisition resumes through the existing path, the evidence remains eligible for late discovery with its original publication date.
- Running jobs, backpressure, rate limits, reassessment waits and uncertain paid outcomes retain their existing protection. This is not a timeout bypass or an authorization override.

Only two runtime checks change, in `runtime.ts` and `window-coverage.ts`. The readiness code is shared by V2 and V3; neither intelligence pipeline, prompts, models nor publication contracts are redesigned. No deployment or paid inference was performed during local implementation.

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

Local evidence: `.local-reports/acquisition-budget-coverage/` contains the original and corrected test logs, typecheck logs and unchanged-snapshot replay. The unrelated favicon edit was not included. Staging remained on its previous runtime during local validation; the subsequent authorized activation is recorded below.

## Staging activation and read-only verification

On the user's instruction to proceed, runtime commit `8699aec` was deployed only to **https://distilled-news-staging.distillednews-platform.workers.dev/**. Active version **`b55cdaa5-3376-4daa-801a-13790e92ced9`**, 100% traffic. Production was not changed. No migrations, new feeds, manual job retries or new paid QA experiment were initiated.

Before rollout, the existing staging version matched `9fafd946-697d-44f1-b9c2-624e00d386bd`, with no intervening deployment. The runtime diff from that version consisted of the two intended source files. Wrangler 4.100.0 dry-run/build passed. The upload took 521.21 seconds and trigger deployment 21.29 seconds. Command authorization and network/observer delays also affected the operator timeline; these are not briefing processing latency.

After activation, all **70 bindings**, compatibility settings and queue consumer definitions matched the predeployment snapshot. Six live assets byte-matched the existing staging snapshot (HTML, application JavaScript/CSS, service worker, logo and favicon). The dirty local favicon was excluded. The preserved frontend was not rebuilt or replaced by unrelated work.

The read-only probe at October 29, 18:32:39 UTC found eight of the 29 retained Bitcoin requests automatically advanced from pending to `DONE / DEFERRED / INCOMPLETE_INTAKE_COVERAGE`, with zero briefing retry attempts and explicit budget-wait coverage diagnostics. The oldest completed at 18:07:55.516 UTC, with two acquisition-budget waits still present as unavailable coverage. Other jobs also changed state during normal collection, so eight live transitions must not be presented as a fixed-snapshot effect size; that remains the two-window offline comparison above.

The retained job identities were still present: 19 pending budget waits, 12 pending backpressure jobs and one failed uncertain paid submission. Nothing was manually deleted, reset, funded or retried. Bitcoin's public API returned 200, but still reported `checking`; its latest actual edition remained October 28 at 11:33:20.715 UTC. **The feed is not fully recovered, and no new Bitcoin publication is claimed.** Older-window progress is not a fresh deadline-to-publication benchmark.

Both Lebanon APIs returned 200 and `published`. Their latest observed 18:14:53.352 UTC windows published at 18:17:10.937 (English) and 18:17:03.153 (Arabic), approximately 2m18s and 2m10s after cutoff. These are isolated samples, not latency percentiles or evidence of a latency improvement caused by this fix.

An extra read of model usage for the eight completed windows did not execute: automatic permission review failed because its stream disconnected. Consequently, their inference cost/call totals were not independently audited here and are not reported as zero. No direct inference call was made by the deployment checks; normal existing feed automation continued under its existing accounting. There was no spending-limit or hold modification.

Raw deployment logs, settings/queue snapshots, asset hashes and request/job/API probes are retained locally under `.local-reports/acquisition-budget-coverage/deployment/`. Remaining work is the separate source backpressure/budget availability issue and any applicable accounting read-back, without weakening uncertain-operation protection or rerunning paid requests.
