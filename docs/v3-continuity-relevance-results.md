# V3 continuity and relevance — controlled paid results

## Decision

**Keep the frozen baseline. Neither candidate demonstrated a meaningful improvement.** All ten approved calls completed, costing **$0.058956**, with zero outstanding charges from this run. No runtime prompt, model, verifier, repair, source, scheduling, publication or deployment behavior changed.

The candidates made the same substantive selections as their matched baselines in all five cases. Additional instruction text was not justified. This is not a claim that the recurring live problems are solved.

## Fair comparison and execution

Each of five cases received a new baseline and candidate call. All ten request hashes match the frozen plan. Within every pair, the full source/history/user message and every model configuration field are identical. Only one paragraph differs: continuity or relevance, never both. Output references were checked against prepared evidence and prior-item identities. These offline structural checks are not a semantic guarantee.

Model: OpenRouter `openai/gpt-4.1`, temperature 0.1, JSON mode, 4,000-token output cap. Every response reported OpenAI as provider and returned strict JSON. No retries, repairs, verifier calls or judge calls were made. An expired Cloudflare login blocked the first ledger read before any reservation or inference; refreshing the existing login restored access without new permissions.

Every actual inference operation reserved spending atomically through existing accounting and settled its provider-reported charge. Historical grants, holds, receipts and the account ceiling stayed unchanged. The new approval was for ten calls and $0.56 over two hours; no old authorization was reused.

Exact request pairs, complete source text, provider payloads, reservations and authorization are preserved privately in `.local-reports/v3-continuity-relevance-preflight/`. Safe source/input/request hashes, full returned drafts, costs and timings are committed. Recovered licensed/private source text is not published in Git.

## Findings

| Frozen case | Baseline | Candidate | Conclusion |
|---|---|---|---|
| Real unchanged oil report | No item; repeat | No item; repeat | Both correct; no gain |
| Explicit occurrence/update/correction fixture | New occurrence, update and correction; repost omitted | Same decisions and correct prior links | Both correct; synthetic evidence only |
| Actual ambiguous Lebanon strikes | No item; says already communicated | Same omission and reason | Ambiguity not resolved; no demonstrated recall gain |
| Real-post relevance composite, English | Haret Saida only | Haret Saida only | Same selection; source/date narration remains |
| Same composite, Arabic | Haret Saida only | Haret Saida only | Same selection; missing-detail filler remains |

### Genuine repetition

The oil control uses two real recovered article versions. The substantive text after the news lead is identical; the revision changes a timestamp and removes a live-blog link. Both models correctly skip the unchanged price development.

Its interest was deliberately price-focused, with a constructed source-supported prior summary. It is not an actual previously published edition or a test of every fact the broader World News reader might consider relevant. Source text/timestamps are unchanged. The prior precedes the current interval.

### New occurrence, meaningful update and correction

Both versions correctly distinguish a separate next-day explosion at the same fictional location from the earlier incident. Both identify restored rail service as an update linked to `prior-service`, and the corrected evacuation count as a correction linked to `prior-evacuation`. Neither republishes the explicit repost.

The candidate's shorter correction omits the sentence "This is not fifty additional evacuations." Saying the earlier figure was **corrected from five to fifty** already preserves that meaning; the omission is acceptable compression, not an error. Do not make verification demand unnecessary repetition.

These are explicit synthetic controls. They establish correct behavior on those instructions, not reliable interpretation of ambiguous real reporting.

### Ambiguous actual strike report

The retained Arabic input contains today's short strike report and yesterday's reports about the same locations. Neither source publication time nor matching locations establishes occurrence identity. Both baseline and candidate omit the report, with essentially the same confident repetition reason.

The extra continuity instructions therefore did not resolve the observed uncertainty. Forced publication or forced omission was not labelled as ground truth. No new unsupported attack time was generated, but no recovery of genuinely new real developments was demonstrated either.

### Relevance and source support

Both languages and both prompt versions include the local Haret Saida drone report and omit the election commentary and optional regional posts. Necessary local information survives. No drone operator/nationality, Saudi missile strike in Lebanon, or unsupported Lebanon consequence was introduced in these outputs.

Both versions retain unwanted prose. The English baseline appends "No further details were provided"; the candidate changes this to routine "local sources" and October 25 narration. Arabic retains commentary about unavailable operator/damage/target details. These are not an improvement in distillation. The generic local-source wording should not be treated as independently established provenance.

The relevance cases had empty prior history, yet both languages still generated unwanted missing-information commentary. Bad historical briefing style is therefore not necessary for this failure to occur; this does not rule out history contributing in other contexts.

Source review found no material newly unsupported event claim in this small set, but **no factual verifier ran**. These are editor drafts, not approved or persisted briefings. No false-approval or false-rejection rate is claimed.

### Important limitation: the live relevance failure was not reproduced

The controlled relevance case has four posts, a two-hour reading guide and an explicit cold start. The actual Arabic production window that published marginal election commentary had one post, a 30-minute guide and retained history. The controlled case shows both languages can make the same reasonable selection under matched context; it does **not** explain the differing live decisions.

The context differences are multiple, so this does not prove history, article count or language alone caused the live behavior. A future causal test should start from the exact sparse production input rather than infer an explanation from this composite.

## Actual cost and latency

| Case | Baseline cost / inference latency | Candidate cost / inference latency |
|---|---|---|
| Oil repeat | $0.005098 / 1.462 s | $0.005330 / 0.961 s |
| Synthetic controls | $0.006082 / 1.780 s | $0.006066 / 2.299 s |
| Ambiguous Lebanon report | $0.006464 / 1.143 s | $0.006520 / 1.275 s |
| Relevance EN | $0.005644 / 1.885 s | $0.005806 / 1.677 s |
| Relevance AR | $0.005924 / 1.746 s | $0.006022 / 2.077 s |

Baseline calls total **$0.029212**; candidate calls total **$0.029744**. Candidates add 242 input tokens and six output tokens across the five cases, increasing actual cost by $0.000532, approximately 1.8%, without a demonstrated selection/continuity benefit. This small sample is not a recurring-cost forecast.

All calls: **23,022 input tokens, 1,614 output tokens, $0.058956**. Conservative reservations sum to **$0.553114**, not the actual charge or current held amount. All ten settled; outstanding for this scope is **$0**. Unused authorization is not used for further experiments.

Provider latency sums to 8.016 seconds for baseline and 8.289 seconds for candidates. These are single-response measurements, not statistically reliable speed comparisons, end-to-end article processing, acquisition-to-publication timing or a complete briefing cost. No publication or full-pipeline recurring-cost superiority is claimed.

## Retained work and remaining limitations

Retain only the frozen experiment, source identities, exact returned outputs, accounting summary, source review and offline regression checks. **Neither prompt change is activated.** No deterministic copy cleaner or extra AI stage was introduced.

Artifacts:

- `benchmarks/results/v3-continuity-relevance/preflight.json`: immutable pre-authorization snapshot, candidate paragraphs and case labels.
- `results.json`: all five paired results, exact request/user hashes, configuration, token usage, charges and timing.
- `review.json`: source-support assessment, ambiguity and production-context limitations.
- `outputs.md`: complete generated headlines/bodies, relations, prior links and omissions.
- `ledger-summary.json`: final accounting read-back summary.
- `.local-reports/v3-continuity-relevance-preflight/`: private exact inputs/requests, provider responses and append-only progress.

Labels are engineering judgments, not independent human gold. Optional regional decisions were not counted as errors merely for differing from a preferred item list. Same-actor/location repetition remained ambiguous. The original 95-window archive is still missing; the real repeat control comes from the separately recovered corpus.

Checks: **8 Node preflight/recorded-output tests passed; all 100 briefing tests passed; briefing TypeScript check passed.** Production code is unchanged.
