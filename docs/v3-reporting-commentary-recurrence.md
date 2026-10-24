# V3 reporting-commentary recurrence — 2026-10-24

## Outcome
The proposed verifier/repair instruction change failed real comparison and was reverted. Product prompts, model routing and deployed staging remain unchanged. Four OpenRouter calls cost **$0.0041288**, with all four reservations settled and independently read back from the existing evaluation ledger. No repairs, publications or deployments occurred. No further calls are planned under this scope.

## Confirmed cause
Read-only staging tracing recovered exact requests and replies for English Lebanon editions `8085c0aaeca8d8ca1123fd84aa5197adef7e8a9ad1b5ef4c046ad7cad4ff2e65` (14:15:28 UTC) and `3ae2a68e634f44a82ec5991647c35e0faad8639a1bdddc25156872ea2e635767` (12:45:48 UTC).

The GPT-4.1 editor received the existing instruction to omit routine sourcing and unavailable-detail lists, but generated those sentences anyway. GPT-4.1 mini approved every affected item; no repair ran. The deployed fix had not disappeared. Earlier filler was present in publication history; imitation is plausible, not established causally. The baseline verifier explicitly excludes style findings; its approval is not evidence that the prose meets the desired distillation standard.

## Frozen paid comparison
User approved up to eight calls and $0.16 over two hours. Four calls compared unchanged versus candidate GPT-4.1 mini verification on identical original and corrected nine-item batches. Three original failures use exact retained public source evidence; other cases are explicitly synthetic. Five original cases contain unwanted commentary; four controls preserve important unknowns, attributed responsibility or an explicit date correction. Corrected batches contain nine accurate items. English and Arabic cases share each batch; this is not a separate per-language publication trial.

The candidate added a narrow verifier cleanup exception and asked existing targeted repair to delete only commentary. Local editor-history wording was also prepared, but not tested by these verifier-only calls. All candidate product prompt changes, including that untested wording, were reverted.

| Request | Missed cleanup / 5 | False rejections | Cost USD | Measured request + settlement time |
|---|---:|---:|---:|---:|
| Baseline original | 5 | 0 / 4 | 0.0009024 | 13.631 s |
| Candidate original | 2 | 4 / 4 | 0.0014204 | 11.662 s |
| Baseline corrected | n/a | 0 / 9 | 0.0008744 | 11.111 s |
| Candidate corrected | n/a | 0 / 9 | 0.0009316 | 7.916 s |

Candidate caught the Lebanon-absence disclaimer, source-date narration and synthetic Arabic missing-detail sentence. It missed both retained airstrike missing-detail sentences. It also requested deleting consequential evacuation uncertainty in English and Arabic, disputed-responsibility attribution and correction wording. These are unacceptable cleanup findings, not proven downstream errors: repairs were deliberately not run.

Identical accurate controls passed in the corrected batch but failed in the mixed original batch. This demonstrates sensitivity to batch context in these responses, not a proven index-mapping bug. No wrong-item mapping was established.

Combined measured request-plus-settlement time: 44.320 seconds. This excludes admission/setup between calls and is **not** acquisition-to-publication latency. No full-pipeline latency/cost improvement is claimed. A single run on development examples does not establish general rates or held-out quality. The baseline is not rated as factually accurate merely because it approved these examples.

## Accounting and artifacts
- Four durable reservations total $0.0384; actual charges $0.0041288; all four reported/settled, zero unsettled task operations.
- Existing account protections and historical records/holds unchanged.
- No retries, repairs, provider fallbacks, new editions or notifications.
- Exact requests, outputs, authorization, hashes, candidate snapshot and ledger readback: ignored `.local-reports/v3-commentary-paid/`.
- Exact retained source/body relationships: `packages/briefing/test/fixtures/reporting-commentary-recurrence.json`.
- Sanitized paid verdicts, usage, timing and predeclared labels: `packages/briefing/test/fixtures/reporting-commentary-paid-results.json`.
- Regression tests assert the recorded failure and rejection decision, not invented successful semantic judgments.

## Next step
Do not deploy this candidate or replace semantic judgment with blanket deletion rules. The current factual verifier should remain focused until an editorial cleanup approach demonstrates that it preserves important uncertainty. A future separately specified experiment could test the editor's final concise-writing instructions independently, using these failures and untouched controls; no additional trial was initiated here.
