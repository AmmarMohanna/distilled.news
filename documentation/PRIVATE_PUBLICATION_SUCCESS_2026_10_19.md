# Real private staging publication ? 19 October 2026

**Published: YES.** Edition `3e39977bb370f406507aee95ab9451fe3c5bc75b51e7b4dcab7aaa20141657ff` persisted at **2026-10-19T17:52:09.458Z** after actual GPT writer and complementary whole-claim/fact-level V2 verification. All paid experiments stopped after this result. No production deployment, grant/cap change or provider switch.

## Actual briefing

> Anthropic announced on October 18, 2026, that it is creating a 'public benefit fund' designed to provide the company with increased flexibility and scale to support projects aimed at societal good. The company is committing 5% of its shares to this fund, which will be structured as a wholly-owned entity within Anthropic. Additionally, Anthropic has the option to contribute an extra 2% of its shares to the fund for every 50% increase in the company's value.

Source: [TechCrunch retained article](https://techcrunch.com/2026/10/18/anthropic-says-its-committing-5-of-its-shares-to-a-public-benefit-fund/). Immutable evidence revision `478b532d-62cc-41d0-bf16-3010a8fd98f2`. The approved announcement source explicitly says ?announced today?; its retained report timestamp is October 18. The date is not inferred solely from observation time. This is retained real news, not a fresh acquisition in the successful invocation.

## Correctness and coverage

The real planner returned both required candidate decisions: SELECT the fund announcement and DEFER supporting/contextual material, with explicit justifications. Main announcement, 5% commitment, wholly-owned structure, optional extra 2% per 50% increase and societal-good purpose remain together. No automatic merge or override was used. Three mandatory propositions received verified same-story reader spans. Whole-claim and proposition checks yielded ACCEPT, with no conflicts, zero repairs and one batched verification request. No known unsupported assertion was found in the retained-source comparison. This source comparison is AI-assisted, not independent human gold or broad reliability certification.

The six context/history/governance propositions remain represented by the deferred candidate; they were not marked delivered. Optional context omission is distinct from missing mandatory development. This successful single-source case does not demonstrate multi-article consolidation or perfect event boundaries: graph context is still split into a second candidate. Historical acquisition covered one retained article, not exhaustive checks of all source news. No quiet-period claim is made.

## Exact timing and cost

| Stage | Measured wall time | New provider cost |
| --- | ---: | ---: |
| Verified intelligence reuse | 1.389s client | $0 |
| Semantic shortlist | 5.349s | $0 (ranking receipt reused) |
| Editorial planning | 40.124s, provider callback 37.122s | $0.0075072 |
| Ranking/selection | 3.023s | $0 |
| Writer | provider request 2.540s, callback including revalidation 3.751s | $0.0009964 |
| V2 verification | 12.257s stage; provider request 6.891s | $0.0022224 |
| Edition persistence | 2.030s | $0 |

Stage measurements overlap and are not additive. Writer/verification/persistence stage totaled 29.012s. Evidence-ready window cutoff to edition createdAt: **79.663s**; publication client request through response: **82.782s**; total including reuse request: **84.174s**. The **60-second target was missed**. One success cannot establish p95 <120s. Source-first-observation to persistence was 19,106.239s (~5h18m), including historical blocked attempts; this is not collection execution latency.

Successful attempt: **$0.010726** across three new GPT calls, no repair. Previously successful reused relation/construction/ranking cost $0.002734306; direct successful path including that intelligence is **$0.013460306**. The complete cumulative experiment, including every prior failed attempt, is **$0.063529734** for one success, below $0.20. Twenty-five feed operations settled, zero unknown feed outcomes. Infrastructure per-request cost is unavailable on shared staging and is not claimed zero.

Publication wrapper: 695 D1 statements, 37.264s accumulated DB wall, 2.301942s SQL CPU, 2,103,480 response bytes, 962,696 rows read, 381 written. These include final diagnostics and overlap runtime work. Publication input loaded seven times (~7.903s), repeated catalog reads remain. Feed turn admission 65ms, held **81.475s**. Twenty-three CAS admissions/commits are not 23 conflicts; no same-feed CAS conflict/retry was observed. The largest measured single stage is editorial planning, followed by serialized persistence/revalidation work. No new optimization/concurrency change was added during these attempts.

## Isolation and deployment

Deployed code **036d782** (includes editorial fixes f4d0c65/a8a837c), Worker **e6d88d8c-10b1-46b0-9f0a-8ec08b976b43**, `distilled-news-staging`, explicit `wrangler.staging.toml`. Rollback: **45bc741c-d8fc-4424-860c-d61e4249209c**. No migrations; frontend immutable prefix unchanged. Global V2 remains disabled; only authenticated isolated operator requests enable it.

Postflight confirms private feed `public_feed_enabled=0`, public feed/development/operator unauthenticated reads 404, zero push receipts. One normal delivery outbox record exists PENDING/attempts=0; notification eligibility SQL requires public_feed_enabled=1, so it cannot dispatch this private feed. Operator queue sends are forbidden. No external notifications sent. All old attempt/paid identities preserved; scopes 6 and 7 consumed, so no additional attempt is authorized or scheduled by the operator.

## Attempts and fixes

Scope 5 tested the cardinality correction successfully but rejected invalid non-null optional/deferred reason codes. Schema now expresses two disposition branches enforcing the unchanged validator rule; raw response is preserved. Controlled offline null-reason replay passes without changing decisions or discarding propositions. Scope 6 then stopped before inference with ACCOUNT_RESOURCE_WAIT ($0 new); later account reads showed a slot available (24/25), so scope 7 was a justified freshly authorized continuation, not a reissued uncertain paid operation. Account limits/holds unchanged.

28 focused tests, three exact saved-response replays, Worker typecheck and explicit staging dry-run passed before the real run. Earlier seven V2 publication/accounting integration tests passed; the full Worker suite was not repeated. Machine artifact: `benchmarks/private-publication-success-results.json`, including hashes of complete ignored local raw evidence/traces/receipts. Historical four-attempt report remains intact as history; this success supersedes its current-outcome status.

Remaining production-readiness gates: independent representative accuracy/holdout review, larger reliability sample, event-boundary/context quality, source completeness and freshness, lower planning latency, shorter exclusive turns and fewer repeat reads, complete infrastructure cost attribution. This proves one real verified private publication, not production reliability or the latency target.
