# Real GPT-4.1 route comparison ? 2026-10-20

In this six-case run OpenRouter achieved six expected outcomes versus Cloudflare five; the operational preference was provisional. The subsequent [real-news evaluation](REAL_NEWS_END_TO_END_EVALUATION.md) found blocking grouping/editorial failures and writer/verifier quality concerns, so these small tests do not establish a qualified new publication configuration. Cloudflare remains the feature branch's configured candidate default, gated from unattended publication. The last known-good OpenRouter configuration remains available; no production configuration or qualification changed.

| Case | Route | Client response + validation seconds | Confirmed inference USD | Outcome |
|---|---|---:|---:|---|
| SHORT_T01 | openrouter | 1.414 | $0.003460 | PASS |
| SHORT_T01 | cloudflare | 4.398 | $0.003422 | PASS |
| MULTI_DEVELOPMENT | cloudflare | 3.538 | $0.006100 | PASS |
| VERIFY_T01 | cloudflare | 3.880 | $0.004608 | ACCEPT |
| VERIFY_T04 | cloudflare | 3.860 | $0.004198 | REJECT |
| VERIFY_T06 | cloudflare | 5.343 | $0.004382 | UNRESOLVED |
| VERIFY_T08 | cloudflare | 10.323 | $0.005390 | REJECT |
| MULTI_DEVELOPMENT | openrouter | 4.327 | $0.006098 | PASS |
| VERIFY_T01 | openrouter | 3.659 | $0.004942 | ACCEPT |
| VERIFY_T04 | openrouter | 4.082 | $0.004692 | REJECT |
| VERIFY_T06 | openrouter | 4.458 | $0.004884 | REJECT |
| VERIFY_T08 | openrouter | 3.496 | $0.006148 | REJECT |

Cloudflare cost $0.028100; OpenRouter $0.030224 (Cloudflare 7.0% lower before funding fees). Conventional medians: cloudflare 4.139s; openrouter 3.871s. The machine comparator uses upper-middle observations instead: 4.398s versus 4.082s. One sample per case cannot establish latency or accuracy equivalence. The routes used identical saved evidence and application schemas with provider-specific transport.

Both routes constructed the two controlled occurrence groups with complete membership and no observed false merge/split. Both rejected negation and missing mandatory coverage. Cloudflare's T06 response recognized unsupported causation but fabricated an exact reader quotation; the unchanged validator returned UNRESOLVED (INVALID_READER_WITNESS), rather than the expected REJECT. OpenRouter returned REJECT. Neither route produced an invalid ACCEPT. Structured JSON transport succeeded on all six cases per route; application-level quality did not. Labels are fixture expectations, not independent human certification; all reviews remain PENDING. No paid repairs were attempted.

Eleven new paid calls cost $0.054864, plus $0.003460 for the reused historical OpenRouter call: $0.058324 matched total. All new operations settled, with no duplicate execution. The earlier Qwen dollar hold remains unresolved. All 50 original holds retain $5.3441524893; lifetime actual charges plus unresolved liabilities are $64.8928330953 under the unchanged $73 ceiling. The expired grant was not extended: the user separately authorized six remaining frozen calls, reservation cap $0.289629, in a two-hour successor. Old grants remain unchanged.

Cloudflare permissions and funding now work. The explicitly authorized default gateway was created with authentication, cache disabled and one attempt. Actual chat responses omit inline keySource; the adapter binds the TLS cf-aig-log-id to authenticated gateway metadata proving unified (not BYOK) inference and matching model/tokens. Gateway log cost is an estimate. Evaluation settlement additionally matches actual hourly USD billing deltas against complete isolated gateway inventory, including across hour boundaries. Billing confirmation took about 138?147 seconds on observed delayed cases, separate from response latency. This isolation-based evaluation proof does not qualify generic live billing recovery.

Remaining qualification blockers: real extraction, relation/novelty, packet construction/reconciliation, editorial selection, writing and repairs; larger repeated quality trials, long saved articles, corrections and cross-packet context; independent review; production-safe per-operation dollar reconciliation. GPT-4.1-mini writing was not tested here. Qwen stays optional and unqualified. OpenRouter remains selectable with DISTILLED_LLM_API_GATEWAY=openrouter; Cloudflare uses cloudflare. No automatic fallback is enabled.

See [machine-readable results](../benchmarks/strong-route-comparison-results.json). Provider charges exclude the Cloudflare credit-purchase fee and local execution overhead. No deployment, merge, account-cap change, notification or uncertain-hold release occurred.

---

## Historical preparation and access notes (superseded by real results above)

# Strong-model routing: Cloudflare GPT-4.1 comparison

The earlier implementation interpreted Cloudflare-first as native Workers AI inference, as the original specification requested. Qwen3 was a hosted candidate chosen from availability, context and cost metadata, without comparative quality evidence. The newer instruction explicitly adds GPT-4.1 through Cloudflare's unified API. The implementation now separates route selection from model choice.

## Current live readiness: October 20 follow-up

The permission issue is resolved using the official Cloudflare CLI OAuth client with only Workers AI Read (`ai:read`) and AI Gateway Read (`aig:read`), plus account/user metadata. The previous Wrangler credential is retained separately for the evaluation ledger; no additional AI Write or D1 Write grant was necessary. The documented billing endpoint is `/ai-gateway/billing/credit-balance`, not `/ai-gateway/billing`.

Authenticated inventory and billing GETs returned HTTP 200: zero gateways and zero prepaid credits. The user subsequently reported adding credits; the repeat API read still returned zero, so a completed purchase or a different account must be checked rather than assuming funding succeeded. Auto-top-up amount and threshold remain zero. The requested `default` gateway does not exist. Adding AI Gateway Write solely to create it was rejected by automatic approval review pending explicit user authorization. No gateway, payment setting, stored provider key or deployment was changed.

The user explicitly requested arranging the comparison within the existing $3 approval while retaining the unresolved Qwen hold. A new exact GPT-4.1-only scope was installed as `gpt41-comparison:2b495b561f83fd3c4b90`. It admits 11 new calls across Cloudflare and OpenRouter, reusing the prior exact OpenRouter short-construction result. Further Qwen calls are omitted. Maximum new cumulative reservations are $0.542196; adding the earlier $0.0583901953 gives a combined conservative reservation bound of $0.6005861953, below $3, with 14 total calls below 24.

The immutable prior grant ends at 2026-10-20T08:49:53.079Z. The successor starts exactly then and ends at 12:49:53.079Z; it does not overlap, renew or modify the old grant. Its account concurrency limit is 51: all 50 unresolved liabilities remain counted, plus one new execution slot. Its own scope permits only one unresolved new operation. The $73 account and lifetime ceilings remain enforced. Installation verified all historical grant JSON and unresolved hold rows unchanged. Preflight lifetime exposure was $64.8379690953, including $5.3441524893 in unresolved holds.

The real executor was invoked with that exact durable scope and read-only Cloudflare credential. Metadata GETs succeeded, but `COMPARISON_AUTHORIZATION_WINDOW` stopped it before paid intent creation, reservation or inference. Zero new paid calls were issued. It also refuses a missing gateway, BYOK-only gateway, failed billing read or nonpositive credit balance before reservation. Raw provider responses are retained locally for receipt recovery; missing dollar confirmation still stops execution and preserves liability.

The remaining requirements are an API-visible positive prepaid balance, the explicitly authorized `default` gateway, and the installed authorization window opening. No real Cloudflare GPT-4.1 quality, latency or cost result exists yet. Scope and readiness tests passed; these are not model-quality evidence.

## Implemented configuration

The feature branch defaults to DISTILLED_LLM_API_GATEWAY=cloudflare. Construction, relation/novelty judgments within construction, reconciliation, editorial review, factual verification and construction repairs map to cloudflare:openai/gpt-4.1. Writing defaults to cloudflare:openai/gpt-4.1-mini; writer repair inherits the writer model but has separate task qualification. V1_LLM_ROUTES_JSON selects explicit task overrides. V1_SEMANTIC_STRONG_MODEL remains the strong-model override.

Set DISTILLED_LLM_API_GATEWAY=openrouter for the existing OpenRouter baseline, or use provider workers_ai with @cf/qwen/qwen3-30b-a3b-fp8 for optional native Qwen tasks. Native Qwen keeps its existing workers_ai: identity. Historical OpenRouter model identities and request bodies remain unchanged. Unified Cloudflare models have a distinct cloudflare: identity and CLOUDFLARE provider receipts; they cannot reuse another provider's verdict or silently replace an uncertain operation.

The Cloudflare transport uses the current account /ai/v1/chat/completions endpoint, with server-side CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AI_GATEWAY_ID and CLOUDFLARE_AI_GATEWAY_TOKEN. It reuses the strict application schema, parsing, span ownership, semantic and V2 publication validators. It requests a single attempt, disables cache use, validates the resolved model and completed finish status, and requires gatewayMetadata.keySource=Unified. An unexpected BYOK billing source is rejected, never silently accepted as Cloudflare-managed billing. Native and unified routes share the conservative Cloudflare API admission pool; OpenRouter has a separate pool. Existing account-level limits remain authoritative.

All new Cloudflare tasks remain unqualified for unattended publication. A configured default is a candidate, not a claim of measured superiority. No deployed configuration was changed.

## Verified service metadata

Cloudflare's [GPT-4.1 catalog entry](https://developers.cloudflare.com/ai/models/openai/gpt-4.1/) lists a third-party OpenAI model with a 1,047,576-token context, chat-completions support and $2/$8 per million input/output tokens. Its [mini entry](https://developers.cloudflare.com/ai/models/openai/gpt-4.1-mini/) lists $0.40/$1.60. The branch uses a conservative configured 4,096-output-token cap, not a verified service maximum. Structured-output compatibility and account-specific limits still need real checks.

The [current REST API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/) accepts openai/gpt-4.1 directly. This is third-party inference through Cloudflare, not a claim that GPT-4.1 weights are hosted on native Workers AI. [Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/) passes through inference prices and applies a 5% fee when purchasing credits. Reservations include that fee conservatively; inference charges, gross estimates and credit-acquisition fees must remain distinguishable. Existing stored provider keys can take precedence, which is why actual billing-source identity is checked. No credits were purchased or billing settings changed.

## Actual evidence so far

| Route | Exact short construction | Latency | Confirmed inference charge |
| --- | --- | ---: | ---: |
| OpenRouter GPT-4.1 | Passed exact coverage and one occurrence | 1.414 s | $0.003460 |
| Native Workers AI Qwen3 | Passed exact coverage and one occurrence | 4.510 s | Unknown; reported 21.9727897644 Neurons |
| Cloudflare unified GPT-4.1 | Not executed | Unmeasured | Unmeasured |

These are prior single real samples, not representative quality or latency estimates. OpenRouter GPT-4.1-mini also correctly rejected the frozen T04 unsupported reader claim in 2.644 seconds at $0.0008456, but it is not counted as a GPT-4.1 strong-model result. No cross-provider quality equivalence is assumed from matching model names.

## Matched comparison prepared

The frozen comparison contains two construction cases (the exact prior T01 source and a controlled two-occurrence bridge/hospital article) and four V2 verification cases: supported reader meaning, negation reversal, unsupported causation and missing mandatory coverage. All routes receive identical evidence, source identities and output validators. Strong GPT-4.1 is used for both OpenRouter and Cloudflare verification; Qwen remains the optional third arm. Existing controlled and hand-authored labels are identified honestly; they are not independent human gold. Saved long-article and editorial/writer qualification remain separate requirements.

The matrix has 18 measurements. Exact provider/model/request hashes reuse two prior real results, so only 16 new calls are planned, bounded by $0.551012787 in reservations. Earlier cumulative reservations were $0.058390195; the combined bound stays below $3, and total calls stay below 24. No new paid call was made for this extension. The local frozen scope is .local-reports/cloudflare-gpt41/proposed-scope.json; its status is PROPOSED_NOT_AUTHORIZED_OR_INSTALLED. Manifest hash: 2b495b561f83fd3c4b90fe1914f45731e0997279a3f2bf6ba20a958d073f0e19.

The runner requires a matching durable authorization and cannot create grants, buy credits or deploy anything. It prevents paid reissuance even when local artifacts are missing by checking saved model/request identities in the ledger. Failures and unconfirmed accounting stop new work. The report selector requires complete matched cases, validated quality, successful reviewed outcomes and confirmed costs, then compares latency before cost. It only recommends a route; it never edits production qualification or silently fails over. Current bestRoute is null because the required evidence does not exist.

Run offline preparation/tests with node_modules/.bin/vitest run --config benchmarks/strong-route-comparison.vitest.config.ts. The paid executor additionally requires DISTILLED_RUN_STRONG_COMPARISON=AUTHORIZED_MATCHED_EXISTING_3_USD_CAP, DISTILLED_STRONG_COMPARISON_GRANT_FILE and server-side credentials. Setting these variables does not bypass the durable grant or financial guards. Never delete intent files to retry.

## Historical initial blockers before the October 20 follow-up

- After session refresh, gateway and billing metadata reads returned HTTP 403 / code 10000. Workers AI execution permission alone does not provide this metadata access; verified gateway credential precedence, billing readiness, credits and recovery access remain unavailable. A server-side token with appropriate Workers AI and AI Gateway/billing read permissions is needed. No credit balance is inferred from the denial.
- The existing immutable grant pins four earlier operation/model/request hashes; it does not authorize these matched requests or cloudflare:openai/gpt-4.1.
- The prior Qwen charge remains unconfirmed and its $0.0017445953 reservation still consumes the approved evaluation slot. It has not been released, converted to a confirmed charge, retried or replaced. A successor frozen scope needs explicit admission/capacity authorization while retaining that liability, or authoritative reconciliation of it. The current grant also remains subject to its existing nonoverlap/expiry rules.

A larger spending allowance was not needed: the prepared work fit inside $3. No existing hold, historical receipt, account ceiling, historical grant or deployment was altered. The original 16 rematches remain untouched. The current state and newly installed successor evaluation scope are recorded above.

## Engineering verification

The routing/accounting/V2/recovery regression batch passed 42 tests. A final overlapping 23-test focused rerun passed after preserving Cloudflare-specific failure codes. The matched-comparison suite passed five offline tests and skipped its explicitly gated live executor. Worker and benchmark TypeScript checks passed. Review identified and fixed premature winner selection when competing routes lacked complete measurements; a regression test covers it. These checks establish implementation behavior, not real Cloudflare GPT-4.1 compatibility or quality. Machine-readable results are in benchmarks/cloudflare-gpt41-verification-results.json.
