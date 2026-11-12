# Unlimited staging spending and automatic source recovery

The user's instruction “no more monetary limits” was applied to the staging collector and continuous evaluator. Branch commit: `fa0aa839`, pushed to `ghada/v4-reliability`.

## Deployed policy

- Collector: existing `SOURCE_COLLECTION_BUDGET_MODE=unlimited` retained. Feed `briefing_68867e36-7d4f-42ac-af76-fa29dd9cbbad` opted into the existing `SOURCE_FRESH_X_POLL_RECOVERY_FEED_IDS` policy. Other feeds and providers are unchanged.
- Evaluator: `SPENDING_MODE=unlimited`. Daily dollar and daily call allowances no longer gate admission or scheduling. Provider price ceilings are omitted in this mode. New known costs above an estimate settle with their actual cost instead of becoming a global monetary fence. Historical known overages remain unchanged but cannot block unrelated work in unlimited mode.
- Accounting: reservations, settled costs and unknown outcomes remain recorded. Financial acceptance never fabricates a successful request or permits replay of its old paid identity. Active and unisolated unknown requests retain their execution fences.
- Technical execution: model selection, source authorization, concurrency, request/output sizing and transport deadlines are unchanged. No new workload limit was introduced.
- Other deployments: omitted mode or `bounded` retains existing self-hosting budget behavior. The staging dashboard/API explicitly report unlimited mode; metrics add `distilled_eval_spending_unlimited` instead of reporting an inactive dollar allowance as an active cap.

## Deployments and verification

Evaluator version: `bc5712f3-1ac3-4fd7-83f7-2ea5eacf6d14`.

Application version: `abe349e5-a732-45b5-8d71-8a79123f8407`.

Both deployments preserve existing remote variables/secrets. The app deployment uploaded no changed frontend assets. The previous app version matched the expected reliability deployment, avoiding an unrelated rollback.

Validation: **79 evaluator tests passed**, evaluator TypeScript passed, **6 focused source recovery/fence tests passed**, and both deployment packages built. Fresh-context review found two additional quota paths (scheduler admission and historical known-overage fencing); both received failing regression tests before correction, then passed in the full suite. No remaining concrete review defects were reported.

Live read-only verification after deployment recorded a newly completed current-protocol evaluation at **15:41:42 UTC**, raising current-protocol completed reports from 26 to 27. The old November 3 UNKNOWN operation remained UNKNOWN, with its original $0.552510 reservation and no invented actual cost. Existing generic failed evaluations are not claimed fixed by removing spending quotas.

At **15:46 UTC**, the public feed returned **AVAILABLE for all eight affected X sources**, with no reconciliation warning. The scheduled pass added acknowledgements to all eight original records, preserving their unknown status, missing payloads and **$0.08 total uncertain exposure**. The previously budget-deferred cable briefing also entered `reviewing` at 15:45:40 UTC. Continued upstream interruptions remain possible; automatic recovery prevents them requiring repeated manual acceptance for this opted-in feed. This confirms admission recovery, not that every fresh collection or every historical failed evaluation has completed.
