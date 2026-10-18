# Real verifier evaluation — 19 October 2026

The disabled-by-default v2 contract is **not ready for activation**. A predeclared
12-case real-provider sample accepted five valid cases, left one valid case
unresolved, and blocked all six invalid cases through conflicting verdicts.
There were no final unsafe acceptances, but no clean final negative rejections
either. No prompt, writer, repair, concurrency or publication behavior was changed
in response to these outputs. No application deployment or publication occurred.

## Scope and reproducibility

Application revision: `c389419`, branch `backend-validation-contract`. The user
explicitly approved using the existing AI-assisted labels. These controls are
unblinded, previously exposed to the audit, and **not independent human gold**.
They cannot establish population accuracy, saved-edition safety or publication
reliability. No saved ambiguous case or T09 was included.

Six positives (T01, T02, T05, T10, T18, T21) and six negatives (T03, T04, T06, T08,
T16, T24) were frozen before receiving these provider responses. Their complete
synthetic questions, request hashes, decoded real verdicts and source-free usage
are in [the result artifact](../benchmarks/validation-contract-real-model-results.json).
R3 labels hash: `4e097092cae0ce8cf32c68cce4ada96fb44c9e1bf8de5a095aacc933a9c1db78`.
Request-set hash: `a9bca273f1d753c4f642c0f8f6bf9d6521621e4940dba3af26067f111f456d13`.

Calls used the current `createStoredEvidenceModel` and exact v2 verification wire,
`openai/gpt-4.1-mini` through OpenRouter, temperature 0, streamed structured
responses, prompt `approved-propositions-v2`, policy `semantic-publication-v2`.
Each case had empty reader history, all supplied propositions required, exact
synthetic evidence, and no writer/repair. No Jev call, provider fallback, repeated
inference, or output-driven prompt tuning was used. One response contains both
whole-claim and fact-level judgments; these are not independent model votes.

```powershell
corepack pnpm exec vitest run --config scripts/vitest.validation-contract.config.ts
node --test scripts/validation-evaluation-d1.test.mjs
```

Those commands replay saved outputs offline. The separate live harness is skipped
unless its explicit authorization flag is set. Its request hashes must match the
frozen packets; its normal account admission must succeed before any paid call.
Existing uncertain intents cannot be purchased again. Private packet/receipt files
and credentials remain ignored. A fresh run is not authorized by this report.

## Measured results

| Outcome | Count |
|---|---:|
| Correct ACCEPT on valid cases | 5 / 6 |
| Correct REJECT on invalid cases | 0 / 6 |
| False ACCEPT on invalid cases | 0 / 6 |
| False hard REJECT on valid cases | 0 / 6 |
| Valid cases UNRESOLVED | 1 / 6 |
| Invalid cases UNRESOLVED | 6 / 6 |
| Overall UNRESOLVED | 7 / 12 (58.3%) |

The valid-case nonpublication rate is **1/6 (16.7%)**, even though its final state
is UNRESOLVED rather than REJECT. Counting unresolved negatives as correct
rejections, or hiding unresolved positives behind zero false hard rejections,
would overstate performance. Zero observed unsafe acceptances on six negatives is
not a statistical guarantee of safety.

Actual reported provider cost: **$0.0100792**, 12 calls, all 12 settlements verified
independently in staging D1 with matching reservation/settlement tokens. No new
UNKNOWN financial operation was created. Verifier wall-time p50 **2,063.69 ms**,
p95/max **3,140.39 ms** (nearest-rank, n=12); these are actual streamed-call timings,
including decoding/local receipt persistence, excluding financial admission and
settlement. They are neither end-to-end publication timings nor live feed-lock
measurements. This isolated evaluation acquired no canonical graph turn.

## Confirmed failure mechanisms

1. **Incorrect precision judgment on T05.** The whole-claim response treats
   “12 million” as approximate and rejects equal “12000000” as unsupported extra
   precision. The fact-level response accepts it. The conflict reducer correctly
   returns UNRESOLVED, blocking an approved valid control.
2. **Fact-level source/reader confusion on all six negative cases.** T24's actual
   reader says “40 injuries”; its fact-level reason claims the prose says
   “12 injuries” and sets every facet true. T03 similarly describes the original
   source's Alice/Bob roles as reader prose, although the actual draft reverses
   them. T04, T06 and T16 repeat this pattern for negation, causation and event
   timing. These are false positive fact-level judgments, not evidence that the
   final combined gate accepted the errors.
3. **Support/coverage confusion on T08.** The road-reopened sentence is supported,
   while required bridge-closure coverage is absent. The whole-claim verifier
   calls the supported sentence not fully entailed because another requirement
   is missing; the fact-level response falsely says the bridge sentence is in
   the prose. The combined gate remains UNRESOLVED. This directly confirms the
   need to keep claim support and mandatory communication distinct.
4. **Conflict blocking works on this sample.** Every invalid case had adverse
   whole-claim output and favorable fact-level facets; none became ACCEPT. These
   inconsistencies are retained, not silently resolved into approvals.

The source/reader confusion is established by saved reasons versus exact question
bytes. Whether prompt ambiguity, packet layout, output coupling or the model's
attention is the underlying cause remains a hypothesis. No ablation was purchased.

Next review should focus on faithful reader-witness adjudication and the division
of support versus coverage, with the existing conflict gate retained. A proposed
change must replay these unchanged real outputs and obtain separately reviewed
new results; it must not simply reinterpret a conflict as approval. An independent
representative holdout and controlled end-to-end publication remain outstanding.

## Financial and operational record

The initial $51 cap had reported charges $46.524888146 plus held exposure
$4.474866702, leaving **$0.000245152**, below even the smallest sample reservation
($0.054858). Twelve conservative reservation ceilings totaled $0.6588252; these
were admission estimates, not the actual $0.0100792 bill.

After the user explicitly answered “do it 53 fine”, one guarded append added
exposure sequence 2, $51 to **$53**, at **2026-10-18T21:18:51.848Z**. The original
base $50 authorization and its expiry **2026-10-19T19:15:55.700Z** were unchanged.
The pre/post snapshot verified unchanged prior unsettled holds and original grant.
Migration history remained **68 entries**; no migration was applied. Existing
background staging work continued, so global reservation/settlement counts and
charges also changed independently of these twelve evaluations.

The evaluation used `reserveModelSpending`/`settleModelSpending` against only staging
D1 `ab259bfe-6029-4e20-8cb6-eea6b7a67459`. Its isolated `validation-eval:` operation
identities and `validation-evaluation:` feed scope do not create canonical feed
events or publication receipts. Local intent/request hashes were durable before
calls; normal provider receipt sinks retained generation/usage identity; reported
cost was settled only with matching receipts. These control verdicts cannot be
reused as a real edition's paid verification receipt. No old hold was released,
uncertain operation retried, source permission changed, credential rotated, or
production/sources-QA resource accessed. No staging Worker version changed.
