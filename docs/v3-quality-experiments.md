# V3 quality experiments ? 2026-10-27

## Outcome

No product prompt, model route, verifier rule or repair policy was changed. None of the tested configurations met the combined factual accuracy, false-rejection, complete-delivery, cost and latency criteria. Preserve GPT-4.1 editing / GPT-4.1 mini verification for now. This is a supported negative result, not a claim that current factual errors are acceptable or fixed.

49 real paid calls cost $0.19962245 against the user-authorized $5 task ceiling. All 49 are settled in the isolated existing V3SpendGuard ledger; zero uncertain/outstanding trial reservations. Historical remote holds, grants and financial records are untouched. No deployment, reader publication or notifications.

## Frozen evidence and method

Use exact retained public-feed sources, reader history, published drafts and model responses from the twelve-edition audit. Eight source-grounded verifier cases include real errors, supported corrections, Arabic equivalent wording and a deliberate Arabic actor/action reversal. Development and held-out batches were frozen before model comparison. The labels are AI-assisted, not independently reviewed human gold. One proposed correct Bitcoin causal control is debatable (the source does not precisely attribute the full 24-hour liquidation total to one price movement); exclude it from clean accuracy counts.

Three initial batches had harness-corrupted Arabic drafts and were excluded, retaining their $0.0047416 cost. Corrected batches use original retained Unicode text. A mixed batch containing bad/corrected accounts of the same occurrence led to redundant verdicts; those prompt batches are exploratory, not comparable to the later separated error/valid batches. Do not use either defect as evidence of production wrong-item mapping.

## Experiment matrix

| Candidate | Controlled comparison | Result | Retain? |
|---|---|---|---|
| Mini + appended causal instruction | Same prompt/input/model except one paragraph | Still approved both development errors | No |
| Mini + concise-paraphrase paragraph | Same input/model; paragraph only | No material detection gain | No |
| Mini + same causal paragraph moved to front | Same separated batches, same model | Still approved both development errors; disputed the causal control | No |
| GPT-4.1 verifier, unchanged prompt | Model only; same four separated batches | Caught PHP outage uncertainty, SEC causality and Arabic reversal; missed Bitcoin ETF causality; accepted clear valid controls | No universal switch: recurring verifier cost rises materially and full-pipeline quality not consistently improved |
| Luna default verifier | Model only, same batches | Caught PHP/SEC/reversal, missed Bitcoin causal target; false objections to valid PHP and attribution wording; average about 9.5 seconds | No |
| Luna reasoning disabled | Only reasoning setting versus default Luna | Faster, roughly 2.5 seconds mean; all error drafts flagged but Bitcoin flag disputed a different relationship, not intended ETF causal error | No: subsequent full repair rejected a supported final item |
| Editor relationship instruction + existing mini verifier | One short prefix; existing model routing | PHP draft avoided the explicit unconfirmed-outage assertion; SEC story omitted; Bitcoin price/liquidation development omitted; Arabic routine turnout promoted | No: material coverage/relevance risk; no robust joint win |

## What the fixed verifier tests actually show

Mini approved both retained Bitcoin and PHP errors in the development-error batch. GPT-4.1 and Luna rejected the PHP item, but their issue lists also included unnecessary wording objections. All three caught the held-out SEC causal link and Arabic reversal. GPT-4.1 accepted the three unambiguous supported controls. Default Luna rejected two of those controls. Nonreasoning Luna passed them, but verdict-level success did not predict reliable repair. Counting any fix verdict as a semantic true positive overstates performance when its issues fail to identify the intended error.

No wrong-item indices were returned in the corrected matched test batches. This small result does not establish production mapping is universally correct. The offline replay test explicitly refuses clean scores for missing, duplicate or unknown indices.

## Full-pipeline replays

These run generateBriefing on exact saved input/history through editing, verification and bounded repair. Published below is an engine result, NOT a persisted or delivered live reader edition. No application-publication success is claimed.

| Replay | Model calls represented | Actual result | Recorded cost USD | Model-path seconds |
|---|---:|---|---:|---:|
| PHP baseline mini | 2 | published | 0.0084648 | 5.035 |
| PHP GPT-4.1 verifier | 2 | published, no demonstrated factual advantage in regenerated draft | 0.032930 | 5.166 |
| Arabic baseline mini | 2 | published | 0.013538 | 7.553 |
| Arabic GPT-4.1 verifier | 2 | published | 0.012586 | 5.855 |
| PHP nonreasoning Luna | 6 incl. reused editor | rejected after repairs over essentially equivalent source-supported wording | 0.0112859 new + 0.007836 reused editor | 10.835 excluding paid editor replay |
| Arabic nonreasoning Luna | 4 incl. reused editor | published after repair | 0.00287235 new + 0.012098 reused editor | 5.291 excluding paid editor replay |
| PHP editor candidate | 2 | published, observed relational improvement | 0.0222488 | 5.222 |
| Bitcoin SEC editor candidate | 1 | empty; relevance judgment disputed | 0.015994 | 1.611 |
| Bitcoin flows editor candidate | 2 | published two items; omitted price/liquidation development | 0.025168 | 8.363 |
| Arabic election editor candidate | 2 | published two items; promoted army turnout, mixed relevance | 0.013306 | 5.208 |

Caching and provider variation affected actual costs. Full editor reruns can produce different drafts despite equal evidence/configuration, so those runs do not isolate verifier effects as tightly as frozen-draft comparisons. Luna explicitly reused identical baseline editor requests/results, charging no second editor call; report original editor cost separately. Neither replay latency nor model-token costs are acquisition-to-reader latency or representative monthly feed economics.

GPT-4.1 roughly doubled total paid cost across the two regenerated mini/strong full-pipeline comparisons, without consistently better final text. Default Luna was slow; nonreasoning Luna's single-call savings were partly consumed by repairs and failed delivery. No lower recurring-cost claim is justified. A normal quiet window was not newly evaluated; do not extrapolate these deliberately difficult cases to all windows.

## Retained engineering work

Added an offline retained-verdict fixture and replay tests under packages/briefing/test/. They document false approvals, exclude disputed labels and validate result-to-item mapping. They do not call models, determine semantic truth mechanically, or make the existing bad verdicts acceptable. No production pipeline abstractions or extra stages were added.

## Follow-up priority

Obtain independent human adjudication for the causal/attribution cases before further prompt tuning. Expand with newly labeled windows not inspected during development. The evidence supports focusing on meaningful relation/attribution preservation and semantically equivalent repairs, not increasing briefing length or merely upgrading model size. Replaying more of the same cases now would risk overfitting. A successful future candidate must pass complete repair and delivery, not just fixed-verifier scores.

## Reproducibility and accounting

Exact requests, source snapshots, prior-reader context, outputs, generation receipts, per-call timings, failed harness notes and ledger read-back are local in .local-reports/v3-quality-improvement/. The preceding corpus is .local-reports/v3-quality-audit/. Sanitized offline records contain immutable source/request hashes and public source URLs. Secrets and raw provider reasoning payloads are not committed. No original sources were altered.
