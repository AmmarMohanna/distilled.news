# V3 focused quality comparison — 2026-11-01

## Decision

Eight authorized real GPT-4.1 requests settled for **$0.107676**, below the approved $0.65 maximum exposure. No outstanding trial holds remain. No runtime prompt, model routing, feed data or deployment changed. No candidate is promoted.

- **Selection: reject.** The candidate still cut the concrete reported cabinet boycott in the development case. A transfer case gained a diplomatic warning, but that is not evidence that the demonstrated ranking defect was fixed.
- **Brevity: promising, not qualified.** One matched real case shrank from 55 to 38 whitespace-delimited words by removing the redundant flare body, while retaining the crash location and traffic consequence. One pair is insufficient for general acceptance.
- **Update wording: reject.** The candidate marked the seizure as an update but still omitted the source's weight-basis qualifier and did not explain the changed figure. It also supplied a prior-item reference that does not exist; the application would discard that link. This is not a successful continuity repair.

## Method and exact scope

Baseline is the current prompt-4 implementation at `0b443e2`, not an older experiment. Four paired requests reused exact retained user inputs, GPT-4.1, temperature 0.1, JSON mode and 4,000 output-token limit. Only one appended system instruction changed within each pair. User/model configuration hashes are recorded in the sanitized summary.

Selection used the retained 22:00 consolidation input; brevity used the retained 20:00 consolidation input. Update wording used the exact 22:00 editor chunk containing both the original weight qualifier and prior seizure reporting. Selection transfer used the separate 21:00 consolidation input. This is not a genuinely unseen-source holdout: these windows had already been inspected. No repeated prompt search or extra calls followed the results.

The selection instruction treated concrete political actions as substantive rather than routine merely because they came from a political actor. The brevity instruction reserved body text for essential information absent from the headline. The update instruction required continuity and measurement qualifiers without assuming different measures were comparable. Exact candidate instructions are in `benchmarks/quality-focus/prepare.ts`.

All decisions are AI-assisted engineering reviews against retained source passages/drafts, not independent human gold labels. Consolidation sees drafts, not original articles; it cannot restore source details that were never supplied. No verifier, repair or end-to-end publication trial was included, so this comparison does not qualify factual-verifier quality or complete delivery reliability.

## Measured results

Words include headline and body; Arabic whitespace counts are descriptive. Times are individual provider-request wall times, not acquisition-to-publication latency. All cost values are provider-reported and independently read back from settled application ledger rows.

| Pair | Baseline → candidate items | Words | Provider latency | Actual USD |
|---|---:|---:|---:|---:|
| Selection development | 2 → 2 | 80 → 80 | 1.978 → 1.810 s | 0.008182 → 0.008250 |
| Brevity development | 2 → 2 | 55 → 38 | 1.538 → 1.304 s | 0.006878 → 0.006700 |
| Update development | 2 → 2 | 83 → 81 | 3.180 → 3.614 s | 0.030490 → 0.030560 |
| Selection transfer | 2 → 3 | 75 → 120 | 1.921 → 2.303 s | 0.007978 → 0.008638 |

Provider latencies sum to 17.648 seconds. These are single samples; no recurring latency/cost improvement is established. The brevity pair preserved both distinct developments; no false merge was observed in these outputs. The transfer selection retained the electricity risk and timed official food-safety meeting. None of this establishes exhaustive important-news recall.

## Accounting and privacy

The legacy shared evaluation account was found in tracking-only mode with historical unsettled operations. It was inspected read-only and not used to fund this scope. Its grants, holds, settlements and limits were not modified.

The already-authorized dedicated campaign D1 database hosted a new isolated exact-request evaluation scope using the existing application `authorizeModelSpending`, `reserveModelSpending` and `settleModelSpending` primitives and triggers. Task exposure was capped at $0.65, eight frozen operations and one concurrent operation; no tracking-only mode was enabled. The existing scope contract's lifetime guard remained unchanged. Every call reserved first and settled with actual provider cost and generation evidence. There were no model retries, repairs, notifications or publication requests. This reused an existing QA database; it did not provision new infrastructure or alter shared staging.

Conservative sum of reservations: **$0.628684**, distinct from actual charge **$0.107676**. Cloudflare query work is not represented as provider inference charges. No final attributable Cloudflare invoice amount was obtained.

Exact requests, raw responses, generated prose, source relationships, tokens, timings, approval, request-bound grant, journal and ledger read-back remain in `.local-reports/leb-quality-latest/`. Only sanitized metrics/hashes are committed at `benchmarks/results/v3-quality-focus/summary.json`; no credentials, private account data or raw retained response text are exported in this follow-up.

## Checks and next step

Offline preparation verified all four identical-input pairs and current public provider pricing. Ledger adapter tests verify the fixed isolated endpoint, atomic guard/reservation batches and no accounting retry. The runner requires an explicit matching approval file; preparing inputs cannot authorize execution. Existing production prompts and lead-protection logic remain unchanged.

The useful next investigation is the interaction of partial-draft importance labels, consolidation's protected leads and the reading guide. Repeating the rejected generic ranking instruction is not justified. Brevity deserves a small independent-control comparison before adoption; no additional calls are authorized by unused dollars from this exhausted eight-call scope.
