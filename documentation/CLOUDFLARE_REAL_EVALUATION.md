# Real Cloudflare comparison: initial results

On 2026-10-20 the user approved up to $3, 24 calls and one new execution slot, preserving the $73 lifetime ceiling and all existing holds. The evaluation ran on feat/parallel-cloudflare-event-reconciliation after a573320, using the shared structured transport, construction binding validator and V2 publication reducer. It did not deploy an application or mutate canonical intelligence.

## What actually ran

| Provider / model | Task | Result | Wall time | Tokens in/out | Confirmed charge |
| --- | --- | --- | ---: | ---: | ---: |
| OpenRouter / GPT-4.1 | Short construction | Valid, one occurrence, complete exact ClaimMention membership | 1.414 s | 1438 / 73 | $0.0034600 |
| OpenRouter / GPT-4.1-mini | Factual verification | Correct REJECT for unsupported negation reversal; no invalid ACCEPT | 2.644 s | 1174 / 235 | $0.0008456 |
| Workers AI / Qwen3-30B-A3B-FP8 | Same short construction | Valid, one occurrence, complete exact ClaimMention membership | 4.510 s | 1094 / 555 | Unconfirmed |

These are single-request descriptive measurements. Construction used the identical frozen T01 source from the existing controlled regression cohort, with exact spans and IDs. Verification used the frozen T04 negative case. These labels are existing controlled cases, not independent human gold. Cloudflare inference used its native hosted REST interface through the shared native adapter; the deployed Workers binding was not exercised. Cloudflare returned the requested model identity, a completion ID and stop completion status. The short construction schema worked on this exact real request, resolving that narrow compatibility question only.

The two confirmed OpenRouter charges total $0.0043056. Cloudflare reported 21.972789764404297 Neurons, which corresponds to $0.0002417006874 gross usage at the [published tariff](https://developers.cloudflare.com/workers-ai/platform/pricing/) before the daily allowance. That is not a confirmed post-allowance account dollar charge. The $0.0017445953 reservation remains held. Read-back showed $64.8379690953 lifetime exposure, the same 49 original unresolved operations plus this new hold, and unchanged original grants. No old receipt or hold was changed.

## Why Qwen3

It was a candidate because it is [Cloudflare-hosted with a 32,768-token context and a response_format parameter](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/), at low listed token prices. It was not selected from evidence that it is the strongest model for news construction. The [JSON-mode supported-model list](https://developers.cloudflare.com/workers-ai/features/json-mode/) does not explicitly include Qwen3, despite the model parameter documentation. The actual short-schema result is useful compatibility evidence, not proof of broad schema fidelity or factual quality. The current catalog includes other candidates; no other model was purchased or substituted under this scoped run.

## Accounting changes and safe stop

The native adapter previously discarded Neurons and its generic usage telemetry applied legacy OpenAI estimation. The live run exposed that issue. The branch now retains provider-reported Neurons in typed receipts and usage records, and uses their published tariff only for an explicitly estimated gross amount. It never fabricates usage.cost or reportedCostUsd. An offline replay of the saved real response verifies this fix without additional inference or financial settlement. Original live artifacts remain unchanged, and their old generic estimate is excluded from the comparison report. Native JSON-mode object responses are also accepted while existing schema/identity/output checks remain in force.

The evaluator stopped after the third request because the native response did not confirm the account dollar charge. The Workers AI negative factual verification and all 20 Phase B calls, including Laplace/Replit, long reconciliation, writing, editorial selection and repairs, remain unrun. Neither real parallel speed nor model-quality nonregression has been established. No Workers AI task has been promoted into the production qualification registry.

A separately approved financial authorization guard (0065_model_evaluation_scope.sql) was installed only in the existing evaluation ledger to make the new grant fail closed for older clients and background work. It pins the first four operation IDs, model identities, manifest and request hashes; limits each reservation to $0.125, admits one evaluation operation at a time, caps cumulative reservations at $3, and enforces lifetime account exposure at $73. The first-phase grant permits four calls, a subset of the 24-call approval. The 49 historical holds remain counted. The existing ledger account name contains openrouter for historical reasons; native reservation identities and receipts explicitly retain workers_ai and the actual Cloudflare model/account. This is a shared conservative approval ledger, not a claim that OpenRouter bills Workers AI.

No publication, shared application deployment, notifications, rematch execution, historical grant renewal, uncertain-hold release or branch merge occurred. The only remote writes were the explicitly approved evaluation guard/grant, three new reservations and two confirmed settlements.

## Reproduction and remaining blocker

Offline preparation and saved-response replay: node_modules/.bin/vitest run --config benchmarks/cloudflare-real-evaluation.vitest.config.ts. The real executor additionally requires DISTILLED_REAL_CLOUDFLARE_EVALUATION=APPROVED_3_USD_24_CALLS and a server-side DISTILLED_EVALUATION_VARS_FILE, but that switch is not sufficient authority: all durable financial guards still apply. Existing intent files prevent automatic reissuance. Never delete them to retry a request. Private/raw artifacts remain under ignored .local-reports/cloudflare-comparison; only aggregate results and hashes are committed.

The next required work is authoritative Cloudflare dollar-accounting and post-timeout recovery support, or an explicitly reviewed conservative billing-unit settlement contract that correctly represents allowances without rewriting confirmed charges. Until that is resolved, the held operation prevents another evaluation call under the approved single-slot scope. The existing paid approval has not been exhausted, but it does not authorize releasing this hold or bypassing the scope. A further generic spending approval does not resolve this accounting blocker.

Verification: 47 accounting/provider/V2 regression tests passed, Worker no-emit typecheck passed, and saved native-response replay passed with zero new calls. The review found no further concrete blockers. An existing recovery test used a grant that expired at midnight; only its local test dates were made relative to the current time, keeping every financial assertion intact.
