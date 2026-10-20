# Cloudflare-first inference on the feature branch

Base: c813a27. No application deployment has occurred. A bounded real-provider Phase A ran on 2026-10-20; see CLOUDFLARE_REAL_EVALUATION.md.

## Configuration

The default is native Cloudflare Workers AI. Set DISTILLED_LLM_API_GATEWAY=workers_ai and bind AI through [ai] in Wrangler. Native AI.run executes the Cloudflare-hosted model; AI Gateway is not an inference provider and is not added to this path. Gateway would currently add another routing/billing boundary without resolving model qualification or per-request dollar settlement.

Set DISTILLED_LLM_API_GATEWAY=openrouter to select the existing transport explicitly. OPENROUTER_API_KEY stays a server-side secret. Existing V1_SEMANTIC_STRONG_MODEL, V1_JEV_SALIENCE_MODEL and DISTILLED_LIVE_OPENROUTER_MODEL settings remain effective. wrangler.staging.toml and wrangler.sources-qa.toml remain unchanged, explicit historical OpenRouter baselines; they are not the feature default and must not be deployed without permission.

Optional V1_LLM_ROUTES_JSON maps construction, reconciliation, editorial, writer, verification, relation, novelty and repair to {provider,model}. Unknown task/provider values fail closed. Example: {"verification":{"provider":"openrouter","model":"openai/gpt-4.1"}}. Writer and verifier may use different routes: durable operations, exact verification request hashes, manifests and model-execution receipts bind the actual phase route. A configured route is never an automatic fallback.

## Task mappings

| Task | Workers AI candidate | OpenRouter baseline | Qualification |
| --- | --- | --- | --- |
| Claim extraction | deterministic exact-span extractor, no model | same | existing extraction contracts |
| Relation / novelty | @cf/qwen/qwen3-30b-a3b-fp8 | typesafe/jev-1.13 native Decisions | Workers AI unqualified; no claimed equivalence to Jev probabilities. Authoritative structural relations also remain part of construction. Native Jev preliminary calls run only on explicitly selected Decisions-capable OpenRouter routes. |
| Semantic construction | @cf/qwen/qwen3-30b-a3b-fp8 | openai/gpt-4.1, or V1_SEMANTIC_STRONG_MODEL | Workers AI unqualified |
| Development reconciliation | same Cloudflare candidate | same strong-model setting | Workers AI unqualified |
| Editorial selection | same Cloudflare candidate | same strong-model setting | Workers AI unqualified; legacy salience Jev route is disabled on workers_ai |
| Briefing writing | same Cloudflare candidate | openai/gpt-4.1-mini, or DISTILLED_LIVE_OPENROUTER_MODEL | Workers AI unqualified |
| Factual verification | same Cloudflare candidate | same writer default, explicit task override supported | Workers AI unqualified |
| Repairs | same Cloudflare candidate | construction uses strong-model default; writer repair inherits writer route unless repair explicitly configured | Workers AI unqualified |

The production qualification registry is intentionally empty. MODEL_UNQUALIFIED is recorded before any financial reservation/provider call. A configuration boolean cannot qualify a model. Missing bindings, capability metadata and schema/context capacity remain separate admission failures. Unqualified models are resource/setup waits, not exhausted semantic failures.

## Verified metadata and limitations

Cloudflare's [model documentation](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/) lists the candidate as Cloudflare-hosted, with a 32,768-token context window, JSON response_format, and prices of $0.0509 per million input tokens / $0.335 per million output tokens (read 2026-10-19). The branch uses a conservative 4,096-token configured output cap; this is not a verified model maximum. The model parameter reference advertises response_format, but the JSON-mode supported-model list does not explicitly list Qwen. Actual JSON-schema support, account/model access and output limits are qualification blockers; no equivalence to strict GPT output is assumed.

Cloudflare [JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/) does not guarantee schema compliance. Native requests use its schema dialect. Duplicate JSON keys, schema validity, source ownership, complete membership, factual support and V2 publication verification retain application-side validation. Native binding responses must match the requested model when a model identity is returned; incomplete completion indicators are rejected. A native timeout cannot prove remote nonexecution.

Cloudflare [rate limits](https://developers.cloudflare.com/workers-ai/platform/limits/) vary by task/model/account. This branch defaults to at most three unresolved provider operations across accounts and 20 reserved requests per rolling minute, plus two local packet inferences. These are conservative application limits, not a claim of entitlement to a provider quota. Lower them to the actual account limit. Raising the maximum beyond three requires another benchmark/code review.

## Accounting and recovery

Workers AI paid identities are prefixed workers_ai:; OpenRouter identities remain unchanged for historical compatibility. Verdicts cannot reuse a success from another model/provider. An uncertain same-source operation fences a provider/model switch, even with a different compatibility hash. Repair can only follow conclusively reported prior execution. No uncertain operation is retried on another provider.

Apply migration 0064_model_provider_admission.sql to the target D1 only after deployment authorization. Provider guards execute atomically inside the spending reservation batch, alongside existing grant/exposure/concurrency checks. Missing migration blocks new routed paid operations. Existing account authority, the $73 ceiling, historical receipts and uncertain holds are unchanged. Provider controls are V1_PROVIDER_MAX_CONCURRENCY (1?3, default 3) and V1_PROVIDER_REQUESTS_PER_MINUTE (default 20). Historical uncertain reservations count conservatively, even after local lease expiry.

Native token counts can support price estimates; they are not a provider-reported dollar settlement. The adapter does not invent usage.cost, release a hold from lease expiry, or send Workers AI receipt handles to OpenRouter recovery endpoints. Native correlation handles are retained when available, but authoritative per-request Cloudflare dollar settlement and post-timeout recovery remain qualification blockers. No Workers AI task may be promoted until these accounting issues and real quality checks are resolved with evidence.

## Evaluation status

Offline adapter, task routing, request identity and OpenRouter regression tests verify code behavior only. See benchmarks/provider-compatibility-results.json. One real short construction request passed application checks; the negative verification and broad task quality remain untested on Workers AI. Its account dollar charge remains unconfirmed. The controlled evaluation plan is in PARALLEL_INTELLIGENCE_EVALUATION.md and requires separate spending authorization.

Acquisition audit: deterministic connectors, acquisition verification and exact claim extraction add no model calls. Generative browser/X discovery, native Jev acquisition choices and source recommendations remain OpenRouter-specific and require explicit OpenRouter selection; Workers AI reports these as unqualified/unsupported. Legacy summary/review factories cannot silently fall through to OpenAI Gateway when the Cloudflare default is selected. They retain their existing non-model fallback until a task-qualified V1 adapter handles the source. Canonical graph updates stay inside existing write turns. Independent article queue execution already separates inference preparation from the canonical turn; this branch adds packet parallelism rather than increasing queue/account capacity.

Reported Neurons now persist in typed provider receipts. Gross tariff-based usage remains an estimate before allowances and cannot settle an uncertain dollar charge. The evaluator financial guard in migration 0065 is separate from provider admission and does not authorize publication.
