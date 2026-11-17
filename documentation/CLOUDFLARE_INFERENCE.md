# Cloudflare-first inference configuration

The current feature default is the Cloudflare unified API with GPT-4.1 as the strong-model candidate. See [configuration, mappings, verified metadata, actual measurements and blockers](CLOUDFLARE_GPT41_COMPARISON.md). This supersedes the earlier native-Qwen default, following the user's newer instruction.

## Selecting routes

Set DISTILLED_LLM_API_GATEWAY=cloudflare with CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AI_GATEWAY_ID and server-side CLOUDFLARE_AI_GATEWAY_TOKEN. Construction/reconciliation/editorial/verification/construction repair default to openai/gpt-4.1, and writer/writer repair to openai/gpt-4.1-mini. Native Jev probabilities remain an explicit OpenRouter-only capability; exact-span claim extraction stays deterministic. Cloudflare relation/novelty judgments use construction's existing typed semantic decisions without introducing a new probability API.

Set DISTILLED_LLM_API_GATEWAY=openrouter to retain the established transport and OPENROUTER_API_KEY. Existing V1_SEMANTIC_STRONG_MODEL, V1_JEV_SALIENCE_MODEL and DISTILLED_LIVE_OPENROUTER_MODEL settings keep their OpenRouter behavior. Historical staging/source-QA configuration is unchanged.

Optional native Qwen: set DISTILLED_LLM_API_GATEWAY=workers_ai with binding AI, or select it for a particular task through V1_LLM_ROUTES_JSON. Example: {"construction":{"provider":"workers_ai","model":"@cf/qwen/qwen3-30b-a3b-fp8"},"verification":{"provider":"cloudflare","model":"openai/gpt-4.1"}}. Model/provider changes are explicit configuration, never automatic fallback. A qualified=true setting cannot promote a model.

Task keys are relation, novelty, construction, reconciliation, editorial, writer, verification and repair. Unknown mappings fail closed. New Cloudflare unified and native task qualifications remain empty; MODEL_UNQUALIFIED prevents unattended spending/publication until real evidence supports each task. OpenRouter stays explicitly selectable as the known regression baseline. New provider identities cannot reuse historical verdicts from another route.

## Capacity, accounting and recovery

V1_INFERENCE_CONCURRENCY=2 controls bounded packet work (range 1-3). V1_PROVIDER_MAX_CONCURRENCY=3 and V1_PROVIDER_REQUESTS_PER_MINUTE=20 default conservatively; native/unified Cloudflare routes share API capacity, separately from OpenRouter. Per-account grants, reservations and scope guards still apply. Raise no account or provider limits without the relevant authorization and measurements.

Migration 0064 adds atomic provider admission. Migration 0065 adds frozen evaluation scopes, including exact request identities, one evaluation slot, cumulative reservations and the unchanged $73 lifetime ceiling. Neither is permission to deploy or buy inference. Migration 0065 was installed only as the previously approved evaluation-authorization guard; this extension applies no remote migration.

Durable identities: cloudflare:openai/gpt-4.1 for the unified route, workers_ai:@cf/... for native inference, and unchanged OpenRouter model names. Receipts, publication manifests and request hashes bind the selected phase route. Uncertain operations fence switching providers/models. Native reported Neurons persist as billing-unit evidence; tariff-based gross usage is not a confirmed account charge and cannot release a hold. Cloudflare receipt handles are never sent to OpenRouter recovery.

The unified adapter requests one attempt and no cache, validates the resolved model and completed output, and checks Unified billing-source metadata. Native schema translation and all application-level validation remain in force. Gateway price estimates, token-derived costs, credit fees and confirmed provider charges must not be conflated. Account-specific billing/recovery and real quality remain qualification blockers.

Acquisition audit: deterministic ingestion/verification is unchanged. Generative browser/X discovery, native Jev acquisition choices and source recommendations remain OpenRouter-specific and require explicit selection. Legacy summary/review factories cannot silently use an old OpenAI Gateway path when the new Cloudflare route is selected. These limitations remain explicit instead of weakening source or factual validation.

Historical results: [initial native comparison](CLOUDFLARE_REAL_EVALUATION.md), [offline architecture benchmark](PARALLEL_INTELLIGENCE_RESULTS.md), and [original bounded evaluation boundary](PARALLEL_INTELLIGENCE_EVALUATION.md).

## Real unified GPT-4.1 evaluation

The October 20 comparison is recorded in [the real results](CLOUDFLARE_GPT41_COMPARISON.md). Runtime credentials need Workers AI Read and AI Gateway Read; AI Gateway Write was separately authorized only to create the evaluation gateway. Responses without inline keySource require exact authenticated gateway-log proof. Log costs are estimates; evaluation-only actual hourly billing reconciliation requires complete isolated inventory and is not general live settlement. All new Cloudflare task qualifications remain blocked.
