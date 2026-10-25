# GPT-4.1 / mini versus GLM-5.3-Flash — partial result

The user approved 12 calls capped at $0.47 within the existing $2 allowance, ending no later than October 24, 2026 at 22:11 Beirut. The comparison was frozen before execution: identical V3 prompts/evidence for each model, English/Arabic editing and fixed incorrect/supported verification batches. GLM's mandatory reasoning was explicitly set to low, with 4,000 output tokens including reasoning. No retries, repairs or model-routing changes were authorized.

**The run stopped after its third request.** OpenRouter returned HTTP 522 with `provider_name: Darkbloom` for GLM. It returned no model text, generation ID or usage. The reserved $0.005 remains unreported; no automatic retry or replacement-provider call was made.

| Model | English editor outcome | Response time | Settled cost |
|---|---|---:|---:|
| GPT-4.1 | Three separate developments retained; missing-detail filler in both strike items | 2.798 s | $0.006412 |
| GPT-4.1 mini | All three developments bundled into one item; adds “indicating ongoing violence” | 2.973 s | $0.001044 |
| GLM-5.3-Flash, low reasoning | Upstream HTTP 522; no model output | Approximately 20.6 s to saved error | Unknown; $0.005 reservation preserved |

The first two timings are measured provider response times excluding spending admission and settlement. The error time is derived from filesystem timestamps between the durable pre-send attempt and saved error, not a completed inference timer. It must not be presented as successful GLM latency.

Two calls settled at **$0.007456** combined. One charge is unresolved, bounded by its **$0.005** reservation. Nine planned calls were not executed: there are no Arabic or factual-verifier comparison results. The larger $2 task has $0.14072915 in settled charges plus this unresolved reservation. Historical records and holds were not modified.

No winner can be selected. The GLM failure concerns its selected upstream route, not established model quality. The GPT outputs are a limited English editing observation, not independently verified publications. Mini's bundled item is an editorial issue, not proof of a false canonical event merge. GPT-4.1's filler occurred with no prior briefing history, showing that history alone cannot explain every recurrence.

No application code, prompts, configuration, live feed data or deployment changed. Resume paid testing only after the uncertain charge is conclusively resolved or a separately authorized recovery decision changes the stop condition. Do not release the reservation based on an aggregate account balance.

Sanitized results: [summary.json](../benchmarks/results/v3-glm-comparison/summary.json). Exact returned English text: [english-editor-outputs.md](../benchmarks/results/v3-glm-comparison/english-editor-outputs.md). Frozen requests, catalog metadata, provider receipts, authorization and ledger read-back remain locally under `.local-reports/v3-glm-comparison/`; the raw provider error's user identifier is excluded from committed evidence.
