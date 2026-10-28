# V3 capacity and delivery follow-up � October 28, 2026

## Outcome

Two additional corrections are pushed on ghada/v3-selective-database-reads and deployed only to the existing isolated staging Worker:

- e6f59b2: publication ordering and dispatch read pending requests through the existing unresolved-work index, rather than retrieving completed history.
- 6219255: a conclusively settled, unusable V3 call ends its window as FAILED instead of holding subsequent windows behind an immutable temporary wait.

Final staging version: 11774ace-9208-45ae-bf4a-221f8187aea1. Frontend assets, models, secrets and queues matched the preserved baseline. No new migration, model, inference stage, paid evaluation, notification request, production deployment or financial-record adjustment was made. Ordinary staging automation continued under its existing controls.

This improves demonstrated database access and fixes a real delivery blocker. It does not qualify 1,000 active feeds or establish reliable publication on every current feed.

## Pending-history diagnosis and correction

A new quiet-window regression first failed because the runner retrieved 1,000 completed request payloads before filtering for PENDING. Narrowing the predicate removed those payloads, but a scaling regression showed SQLite still choosing the broader 0079 feed/kind/order index and reading completed rows.

The store now explicitly uses the existing 0074 partial unresolved index. Only the exact missing-index error triggers an equivalent unhinted fallback for unmigrated installations; unrelated database failures propagate. Application-side time parsing, backoff, unknown-outcome handling and stable ID ordering remain unchanged. Carry eligibility still includes failed and deferred unresolved windows, rather than only pending requests.

At 5,000 completed synthetic requests, the ordering read fell from 5,009 rows / 21,475,213 bytes to nine rows / 887 bytes. Pending and runnable decisions were identical across mixed states, invalid and future retry times, tied closes and foreign feeds. The whole quiet-window path retrieves no terminal request payloads and makes no inference calls.

Read-only comparisons on three real Lebanon feeds had stable feed epochs and identical complete pending-request results:

| Feed sample | Prior rows / returned bytes | Selective rows / returned bytes |
|---|---:|---:|
| English Lebanon | 255 / 185,108 | 25 / 8,769 |
| Arabic Lebanon | 255 / 182,697 | 49 / 18,042 |
| Clean Lebanon | 199 / 146,426 | 16 / 755 |

EXPLAIN confirms v1_unresolved_publication_windows. This does not remove the separate creation-relative schedule watermark scan, which still reads retained requests to preserve schedule-edit and outage behavior. No speculative cursor or scheduling redesign was introduced.

## Retained Arabic delivery failure

The oldest runnable Arabic window ending 06:14:53.352Z had a retained V3 GPT-4.1 operation with DEFERRED / SEMANTIC_PROVIDER_FAILURE, one call, confirmed usage and USD 0.010036 settled cost. Its immutable result was reused on subsequent deliveries. The generic resource-wait handler left the request PENDING indefinitely, making later windows wait behind work that could not progress by replaying the same call.

The new exception is raised only for a V3 durable result with that exact failure, one sent call and reported usage. The existing request becomes FAILED; no semantic result, settlement, reservation or evidence is rewritten. Unknown/unreported outcomes, admission waits and V2 behavior keep their existing handling. There is no automatic resend, new repair call or false quiet/publication outcome.

The reproduction first failed because the subsequent window returned no edition. After correction it verifies subsequent persistence, preservation of the failed window's evidence in the next prepared input, unchanged retained failure records, no duplicate failed call, and rejection of an ordinary retry of the terminal request. The independent unknown-charge control retains its reservation and retry fence.

Live read-back at 20:20Z confirmed that the exact old request became FAILED automatically after deployment. Retained result and settlement metadata still compare equal. The subsequent 06:44:53.352Z window then persisted automatically at 20:20:22.994Z, with PUBLISHED status and successful public-feed API read-back. Its recorded six calls cost USD 0.0184272 and generation took 35.213 seconds, including verification and repair. This proves actual recovery progress, not completion of the Arabic backlog or timely fresh delivery. Further failed or unknown work and queue contention remain possible; none was deleted or relabeled as delivered.

## Thousand-feed replay

A fresh local opt-in run completed all 1,000 preparations and dispatcher assertions on the same 5,800 synthetic current articles and 191,808 historical editions. Its 24-feed full-path subset again yielded ten persisted/read-back editions, five terminal quiet windows and nine provider waits at the unchanged 20-RPM ceiling. All 20 ordered operation IDs match the earlier baseline. No real inference occurred.

Compared with the earlier feed-scoped-index run:

| Preparation measurement | Earlier scoped reads | Bounded history |
|---|---:|---:|
| Rows read | 985,803 | 650,085 |
| Returned bytes | 114,998,772 | 89,688,674 |
| Query count | 6,133 | 6,133 |
| Total local wall time | 205.19 s | 272.68 s |
| Per-feed local p95 | 317.17 ms | 552.69 ms |

The database-work reduction is measured; this run does not demonstrate a latency improvement. Runs were separated in time on a shared Windows host, and other local tests ran during portions of this follow-up. SQL duration also rose, so the elapsed-time difference cannot simply be dismissed as noise or presented as a speed win. The separate same-run aged-result benchmark remains the evidence for avoiding large carry payloads. This replay still underrepresents recent reader prose, distinct old evidence and financial history, and it is not 1,000 concurrent live publications.

An earlier rerun stopped after at least 900 preparations with a Miniflare SynchronousFetcher message-ID assertion. The clean rerun passed. The failed log remains retained; no application assertion or dependency was weakened to obtain a pass.

## Live reads, archival and delivery

Before the final deployment, 90 paced ordinary page/session/feed GETs passed. After deployment, all 120 GETs in twenty fixed batches of six concurrent readers passed. Sample p95 was 133 ms for signed-out session, 198 ms for Explore and 1,591 / 1,584 ms for the two feed APIs. These are modest staging smoke samples, not production latency distributions or a 1,000-user load qualification.

Archival continued unattended: 52 records / 46,263,330 logical bytes offloaded at 19:36Z; 84 / 72,260,317 at 19:50Z; 149 / 128,520,050 at 20:18Z. Later checkpoint values are in the numerical artifact. At the first two checkpoints unpaid diagnostic count remained 3,359 while three new V3 results and two editions appeared. This demonstrates compaction progress, not a sustainable long-term retention forecast. Original source bodies and paid records remain in D1. Allocated database bytes are not live-content bytes.

Two English scheduled windows were read back as PUBLISHED:

| Deadline UTC | Persisted UTC | Deadline delay | Recorded calls | Reported USD | Recorded V3 generation |
|---|---|---:|---:|---:|---:|
| 19:14:53.352 | 19:17:31.498 | 158.146 s | 2 | 0.0086416 | 15.588 s |
| 19:44:53.352 | 19:46:33.185 | 99.833 s | 2 | 0.0095880 | 12.901 s |

These are normal newly scheduled windows, not historical request recovery. The cited articles were published just before the respective starts and acquired during the windows: meaningful late discoveries. They do not prove strict in-window article-publication timing or steady-state deadline performance.

The next English window, ending 20:14:53.352Z, finished DEFERRED / V3_VERIFICATION_REJECTED at 20:17:22.337Z: six input articles, six recorded calls, USD 0.0135872, no edition. That factual rejection was preserved; this capacity task did not change prompts or force publication. The clean feed's 20:02:09.437Z window completed empty at 20:12:37.112Z with zero model calls. The ten-minute empty-window delay still needs separate dispatch/intake timing analysis; low model latency cannot explain or solve it. The latest Arabic window remained pending at the observed checkpoint.

Generation timing excludes orchestration and window waiting; do not substitute it for deadline-to-publication latency. Observed background inference charges are not manually initiated evaluation spending.

## Tests and review

- Final release: 37 tests passed across V3 windows, acquired-source integration, provider limits and pending-read regressions; TypeScript passed.
- Broader initial regression: 84 passed, one Miniflare message-ID assertion; the affected carry file and pending regressions passed a clean 11-test recheck. Schedule, storage and other initially passing checks were not weakened.
- Explicit thousand-feed opt-in: passed, plus its negative outcome-validation control.
- Independent read-only review found no important correctness issue in either correction.
- Protected snapshot: all captured account authorizations and the six targeted uncertain reservation/settlement records remained equal. No financial records were modified by this work.

## Remaining qualification

The internal global provider admission rate is still 20 requests/minute, concurrency six. One thousand nonempty half-hour editions require at least about 67 requests/minute before repairs or other work. These settings are preserved, not confused with an independently verified OpenRouter limit. A new explicit bounded spending authorization is required before paid throughput or quality experiments. Unused historical evaluation budgets are not reused.

Before a production-scale claim, qualify actual provider throughput/cost, follow multiple genuinely fresh nonempty windows, diagnose the observed empty-window and remaining Arabic delays, and measure sustained database growth with production-shaped retained evidence. No broad prompt tuning or concurrency increase was attempted.

Numerical evidence is under benchmarks/results/v3-selective-database-reads/: pending-request-scaling.json, pending-request-staging.json, thousand-feed-bounded-history.json, thousand-feed-bounded-identities.json and capacity-delivery-followup.json. Exact read-only source/result links, before/after failure metadata, deployment logs and all failed/clean test logs remain local in .local-reports/v3-capacity-followup/. Unrelated favicon edits are untouched.
