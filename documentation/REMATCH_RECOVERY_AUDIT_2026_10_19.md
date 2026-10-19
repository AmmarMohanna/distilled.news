# Saved-state rematch recovery audit ? 19 October 2026

Read-only observation 2026-10-19T18:55:00.526Z ? 2026-10-19T18:57:12.201Z. No inference/replay/limit mutation was triggered by this audit. Latest authoritative snapshot: 0 SUCCEEDED, 0 actively leased rematches, 4 WAITING_BUDGET/ACCOUNT_RESOURCE_WAIT, 12 without a completed rematch attempt, 0 terminally failed. Earlier Replit SEMANTIC_CONSTRUCTION_REJECTED remains historical; latest state is account wait.

| Request prefix | Article | Current blocker | Continuation |
| --- | --- | --- | --- |
| fc45e8c475 | Laplace Intelligence red-teams robots and self-driving cars before they hit the real world | ACCOUNT_RESOURCE_WAIT | 2026-10-19T18:52:37.890Z UTC (eligible after this time; actual dispatch not guaranteed) |
| 1ec2455b9c | Replit makes OpenAI its default over Anthropic, CEO says | ACCOUNT_RESOURCE_WAIT | 2026-10-19T18:53:29.419Z UTC (eligible after this time; actual dispatch not guaranteed) |
| 71583ce157 | People are using AI to make their smart TVs dumb again | ACCOUNT_RESOURCE_WAIT | 2026-10-19T18:56:39.467Z UTC (eligible after this time; actual dispatch not guaranteed) |
| d6e064f804 | Physical AI is more than robots, says the Nvidia veteran now investing in it | ACCOUNT_RESOURCE_WAIT | 2026-10-19T18:57:24.827Z UTC (eligible after this time; actual dispatch not guaranteed) |
| 23573cdd7a | Anthropic is letting METR researchers look under the hood with employee-level access | No completed attempt; exact pre-execution cause unrecorded | Durable request; 4 prior sends, no live lease |
| 79a56c4379 | Elorian’s first AI model wants to reason with images, not just about them | No completed attempt; exact pre-execution cause unrecorded | Durable request; 3 prior sends, no live lease |
| dd6a0a896e | When it came to Cal AI’s viral success, a small army of influencers paid off | No completed attempt; exact pre-execution cause unrecorded | Durable request; no dispatch row or exact next time |
| 8769de3cde | Jev is Vercel’s fastest-adopted AI model ever | No completed attempt; exact pre-execution cause unrecorded | Durable request; no dispatch row or exact next time |
| 212de3a507 | An Nvidia insider-turned-VC on why robotics hasn’t hit its ChatGPT moment, yet / TechCrunch | No completed attempt; exact pre-execution cause unrecorded | Durable request; no dispatch row or exact next time |
| 6b0f7d2ce2 | Veritas expands its anti-counterfeit chip to jewelry, trophies, and fragrance bottles | No completed attempt; exact pre-execution cause unrecorded | Durable request; no dispatch row or exact next time |
| eb55f66d0b | Amazon devices chief Panos Panay sees a future where AI devices replace the need to use apps | No completed attempt; exact pre-execution cause unrecorded | Durable request; no dispatch row or exact next time |
| e7c7d008b9 | Mark Wahlberg on using AI in film ‘the right way’ and being open to an AI clone carrying on his legacy | No completed attempt; exact pre-execution cause unrecorded | Durable request; no dispatch row or exact next time |
| f2ef52d2b1 | Replit’s CEO says the future of work is the ‘self-driving company’ | No completed attempt; exact pre-execution cause unrecorded | Durable request; no dispatch row or exact next time |
| f2061096db | Meta launches an open-weight AI model that runs on Macs | No completed attempt; exact pre-execution cause unrecorded | Durable request; no dispatch row or exact next time |
| d4ca036b39 | India becomes the latest country to report rogue AI agent activity | No completed attempt; exact pre-execution cause unrecorded | Durable request; no dispatch row or exact next time |
| af6ac64712 | Tenstorrent hits $6.2B valuation to scale open-weight AI chips | No completed attempt; exact pre-execution cause unrecorded | Durable request; no dispatch row or exact next time |

All four persisted next-attempt times are due by final snapshot. Six requests have dispatch history; ten have none. No live semantic leases at first/second/final snapshots; feed intelligence turn lease_until=0 and waiter list empty at 18:56:57Z. Dispatch send counts include retries/transport churn, not paid-model executions. Scheduler selects at most two eligible rematches per feed pass. The data does not establish a single exact blocker for each of the twelve never-completed attempts; labeling all of them budget waits would fabricate evidence.

No forward semantic progress was observed: rematch attempts stayed 5, construction progress rows stayed 12, successes stayed 0. The backlog is stalled in this bounded interval, not proven permanently deadlocked. Need trace of dispatcher/consumer and due-work admission to distinguish delivery contention, scheduler admission and resource waits. No duplicate inference was triggered to investigate it.

Settled feed provider cost is $0.072671432; separate uncertain reservation $0.142206. The one newly admitted operation is COMPARATIVE_EDITORIAL_PLAN, not a rematch. It timed out after 180s; usage.reported=false. Preserve its hold and do not replay blindly. Any subtotal including that estimate is exposure, not confirmed charge.

Paid reuse verification: all 23 preexisting settled reservation/settlement rows remain identical. No new review/construction reservation appeared during the interval. Twelve construction progress references and their successful operation IDs are unchanged. Local continuation tests prove restart reuse without new calls and UNKNOWN fencing. Actual successful resumption/consumption of the old packets is NOT demonstrated in this stalled interval.

Schema fix 0e069a2 deployed staging Worker c557a6c7-307b-4a28-9b7e-32a838159649. Final schema sharing preserves fully expanded constraints; four saved initial/reconciliation serialized-provider tests pass, unsupported ref siblings rejected. 23 primary tests +19 ownership/repair tests +four-case replay pass; repo typechecks, web build and staging dry-run passed. One test-only assertion was updated to follow refs rather than requiring inline type. No production deployment, queue reset or manual paid-operation replay.

User subsequently authorized +$10; append-only amendment sequence4 changes staging cap63?73, original grant period/expiry2026-10-19T19:15:55.700Z unchanged. Existing holds, charges and concurrency25 retained. This financial change does not fix context-size or queue admission. Latest measured context wait: Jev request119359 byte conservative upper bound >64000 context; not an enum failure.

The originally reported 19 PENDING reassessments drained before this fix deployed, leaving21 DONE receipts,16 semanticDeferred. Do not attribute that queue drain to the new schema fix, or claim all19 achieved semantic completion. By18:52 one further acquired article created a new pending reassessment. These populations differ from the16 canonical rematch requests.

Machine details and full request IDs: benchmarks/rematch-recovery-audit-results.json. Raw read-only snapshots retained ignored locally with pinned hashes.
