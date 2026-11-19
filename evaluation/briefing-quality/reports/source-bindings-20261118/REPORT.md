# Source-bound verifier qualification — NO-GO

2026-11-18. Authorization: a **new $2 total maximum**, including unresolved reservations. No deployment, resource mutation, published-news changes, editor changes or historical request replays. Candidate baseline: `53cfb6eb` on `fix/briefing-identity-and-evaluation`.

**Keep `BRIEFING_SOURCE_BINDINGS_ENABLED` disabled.** Its first real-model qualification failed at the inventory contract, before source-grounded assessment. Safe withholding is not successful factual detection. The existing model verifier also repeated a known role error; this report does not endorse its accuracy.

## Frozen cases and comparison

Ten cases, labelled from source evidence before candidate responses: two retained production batches with one known erroneous target each, their two identity-corrected source-derived controls, and six constructed cases. The latter cover valid Arabic compound names, a changed final surname, English conditional paraphrase, an altered grant amount, English-to-French translation and provisional French casualty attribution. Four targets require rejection; six require approval. Other stories in retained batches are explicitly unlabelled.

Cases hash: `bac61b27f256a3c822f3d5428ee4bbf0cbbdde9be6d9e8f7b9c5fa7694a317b5` (SHA-256 of JSON.stringify(parsed cases)). Preparation drafts were corrected offline before any inference; none of their operations ran. The executed manifests are separately preserved.

Both arms use the existing `openai/gpt-4.1-mini` routing, temperature 0.1 and the same current source content and reader text. Retained baseline requests use their original verifier prompt and original complete prior context. Candidate receives corresponding complete items, citations, source passages/titles and prior context. Controls use the existing verifier prompt with structured inputs. Source publication headers are retained in candidate context; they are not treated as event dates. Source-derived corrected controls retain identical textual reporting/prior context in both arms, with empty structured prior lists. Constructed controls have no prior history.

This is a **verifier-level development qualification**, not full engine generation, independent held-out research or evaluation of the deployed deterministic Arabic guard. There are only two natural production errors; constructed faults and their valid counterparts are dependent pairs. No language-level population inference or superiority claim is warranted.

Predetermined rollout gate: no known-error approval, no false withholding on valid controls, no unusable final assessments. Any failure blocks rollout. No threshold was changed after outputs.

## Full first pass

| Measure | Existing model verifier | General candidate |
|---|---:|---:|
| Cases attempted | 10 | 10 |
| Usable factual assessments | 10/10 | **0/10** |
| Labelled faults rejected with a usable assessment | 3/4 | 0/4 assessed; 4 withheld unresolved |
| Labelled faults wrongly approved | 1/4 | 0 approvals; not evidence of detection |
| Valid controls approved | 6/6 | **0/6** |
| Valid controls withheld unresolved | 0/6 | **6/6** |
| Provider requests / settled receipts | 10/10 | 20/20 |
| Input / output tokens | 23,565 / 307 | 7,273 / 5,929 |
| Settled cost | $0.0099172 | $0.0123956 |
| Median wall time per case | 1.186 s | 4.540 s |

The existing verifier's target-level confusion matrix is TP=3, FP=0, TN=6, FN=1; precision=100%, recall=75%, F1=85.7% on these ten exposed/constructed cases only. It flagged the unsupported `نجيب سلام`, the altered final surname and $15m/$5m substitution, but approved `قائد الجيش جوزيف عون` despite a source identifying him as president.

The candidate's semantic confusion matrix is **undefined**, because none reached a usable factual assessment. All ten are unresolved, not excluded. An operational withholding matrix would be 4 unsafe targets withheld, 6 valid targets withheld, 0 approved; that must not be advertised as 100% error recall. Completion-conditioned factual accuracy has denominator zero.

Every candidate case exhausted two inventory responses. Final failures: nine `UNINVENTORIED_READER_TEXT`, one `INVALID_FACET_KIND`. Exact reader-span coverage rejected missing punctuation, connectors and sometimes substantive text. For example the corrected cabinet headline lost its colon and Arabic connecting preposition. The role batch lost connective/attribution wording and an entire reform/trust assertion in one response. Relaxing the validator would conceal rather than resolve this problem.

All candidate cost/latency figures above describe **failed inventory attempts only**. They omit the unexecuted source-bound assessment, repairs and publication work, and cannot estimate a successful edition's cost premium.

## Targeted correction follow-up — also failed

One small implementation change supplies exact missing spans and nearby context in the existing bounded output-validation correction. It retains full-text coverage, atomic-facet requirements and the one-correction bound. No first-request prompt or expected label changed. A regression covers missing connectors and punctuation across multiple reader units. Original outputs remain unchanged.

Same frozen cases; candidate-only follow-up; original baseline is not rerun. Two attempted cases still exhausted inventory validation: retained name batch (`UNBOUND_READER_QUOTE`) and its corrected control (`UNINVENTORIED_READER_TEXT`). The third case, retained role, completed one inventory response; its correction received HTTP 200 but the response body terminated. No source-bound factual assessment was completed. Seven cases were **not attempted** after that failure. They are not counted as passes or failures.

Six additional provider requests: five settled, one unknown. Settled additional cost **$0.0061064**, 2,366 input and 3,225 output tokens on settled receipts. Median of the two completed-but-unresolved case durations: 12.794 s. Interrupted third-case wall time was 1,131.371 s during tool/runtime interruption; it is preserved separately, not treated as normal model latency. Root cause of that interruption is not established.

## Financial reconciliation

**36 total requests: 35 settled, one UNKNOWN.** Known settled campaign cost **$0.0284192**; unresolved conservative reservation **$0.012416**; total accounted exposure **$0.0408352**, below $2. Unused authorization is not a reason to continue a failed qualification.

Unknown operation: `64fbf32c-6916-4496-bb43-75f39f8d74d9`, request hash `bc6f0ce8d2714fb6b074b4176850f9565b6abc4bde7abab6ac0b987d041b5971`. HTTP 200 headers were observed; no complete body or generation ID was captured. It was not retried, released or called a confirmed charge. The ledger preserves its reservation. The runner stopped before additional cases.

Each paid request was reserved before dispatch with a UTF-8-byte conservative input estimate, actual model pricing verified through OpenRouter's model listing, and output bound. The runner used the existing OpenAI-compatible adapter with network retries disabled. Full request and response checkpoints precede parsing; every settled receipt's generation ID, actual usage cost and tokens are retained. The separate follow-up includes first-pass costs in the same $2 admission ceiling. `measurements.json` validates every saved request hash and settled response against its ledger and independently reconciles totals.

Read-only credit check before: $397.252214 account remaining. Afterwards: $397.007592 account remaining. This account is shared with staging; its aggregate usage delta is **not this experiment's cost**. Configured-key usage increased $0.0296928; this aggregate also does not bind a receipt to the interrupted operation and cannot release its hold. Historical holds and paid records remain unchanged; no old operation identity was reused.

## Reproduction and evidence

`qualify-source-bindings.ts` implements only this small qualification using the existing adapter, UsageMeter and bounded `callJson`. It does not replace the production ledger or evaluator. `measurements.json` contains both frozen plans, expected labels, constructed sources, complete case decisions/failures, token/cost/latency records, request hashes, generation IDs and response hashes. Full retained-source requests/responses and append-only journals remain in the ignored private artifact directories, avoiding publication of unrelated long article bodies or operational secrets.

Commands, from the linked worktree root:

```sh
# Offline; a new directory is mandatory. Never run an old campaign again.
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/qualify-source-bindings.ts prepare NEW_PRIVATE_DIRECTORY
# Paid execution requires its own explicit authorization; the completed run is locked.
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/qualify-source-bindings.ts run NEW_PRIVATE_DIRECTORY
# Offline validation / public summary. Output must not already exist.
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/qualify-source-bindings.ts summarize NEW_REPORT_DIRECTORY .local-reports/integration/source-bindings-final-q1 .local-reports/integration/source-bindings-final-q2
```

Executed private directories: `.local-reports/integration/source-bindings-final-q1` and `source-bindings-final-q2`. The locked runner refuses replay. Do not reuse the approval automatically for a future campaign. No provider call is made by preparation or summarization.

Software verification after correction: **467/467 briefing tests**, including 23 source-bound contract tests; briefing package and qualification-script strict typechecks pass. Prior evaluator results and tests are unchanged. GitHub CI is separate from these local results.

## Decision

**NO-GO for flag activation.** Neither a semantic accuracy gain nor acceptable operational completion has been demonstrated. The qualification successfully falsified the assumption that mocked exact-span contracts would work reliably with the real configured model. Better error feedback alone was insufficient. The inventory interface needs development work and another separately qualified version before rollout; further Arabic name exceptions would not resolve this cross-language failure. Production and staging remain untouched.
