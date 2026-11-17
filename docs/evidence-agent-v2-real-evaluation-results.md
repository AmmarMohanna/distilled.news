# Evidence-first v2: real paired evaluation, stopped on first case

**Decision: DO NOT PROMOTE. Keep V4 selected.** The quote/reference fixes passed their first real model contract test, but the accepted Arabic briefing contained two source-faithfulness errors. The predeclared critical-error stop gate fired after the first pair. This is not a completed six-case evaluation or evidence that v2 reliably outperforms V4.

## Execution and spending

- Authorized ceiling: 48 calls / $4.50 over four hours; native admission bound 64,000 bytes. Existing isolated QA accounting was used without changing historical holds, grants or limits.
- Actual: **4 distinct paid generations, $0.0430896 settled**, $0.1872848 cumulative conservative reservations, **zero outstanding/uncertain operations for this run**. No remaining scope was used for additional experiments.
- These are inference charges. Incremental D1 API costs were not separately metered and are not claimed as zero.
- Application revision `c2fca2c`; protocol implementation `54b0572`. Original articles, reader history, cutoff, model settings and the frozen paired requests were unchanged.
- GPT-4.1 editor and GPT-4.1 mini verifier, unchanged routing. No repair occurred: both verifiers returned `ok` for every item. This is not evidence that repair was unnecessary.
- **2 of 12 planned pipelines completed**, both on `ai-multisource-ar`. Ten pipelines across five cases were not run; they are unobserved, not failed or quiet.
- No deployment, live publication, reader edition persistence, notification or product prompt change occurred. Engine `published` status means accepted text, not a published reader edition.

Full private requests, provider bodies, ledger reconciliation and send/pipeline journal are in `.local-reports/evidence-agent-v2/trial20261104/`. The stopped runner refuses further calls under this campaign. Sanitized exact responses, hashes, receipts, usage and text are saved in:

- `benchmarks/evidence-agent/v2-real-results-2026-11-04.json`
- `benchmarks/evidence-agent/v2-real-review-2026-11-04.json`
- `benchmarks/evidence-agent/v2-real-outputs-2026-11-04.md`

## Matched real measurements

| Measurement | V4 | Evidence-first v2 |
|---|---:|---:|
| Editor/verifier calls | 2 | 2 |
| Engine-accepted items | 3 | 3 |
| Settled inference USD | 0.0160228 | 0.0270668 |
| Measured pipeline wall time | 11.587 s | 18.877 s |
| Provider HTTP wall time | 6.252 s | 13.623 s |
| Input tokens | 9,033 | 10,747 |
| Output tokens | 671 | 2,064 |
| Cached input tokens | 0 | 0 |
| Reader words, whitespace-delimited | 240 | 236 |

V2 cost about **69% more** and took **63% longer** in this observation, missing the 10% efficiency target. Its editor alone produced 1,963 tokens versus V4's 629, while reader text stayed almost the same length. Structured output remains a substantial expense without demonstrated added reader value here.

Times include the existing native accounting round trips, not fresh source acquisition or scheduled delivery. One paired observation is not a latency percentile, a general recurring-cost forecast or a statistical quality rate. Cache differences do not explain this pair: both report zero cached tokens.

## Source-linked findings

All findings below are **AI-assisted engineering assessments**, not human-validated labels or an independent paid judge's scores. Exact offending wording and original passages are preserved in the review JSON; no generic score substitutes for that evidence.

### 1. Source-relative today became current briefing news

The fund source is published **October 18** and begins with its own relative "Today". The frozen briefing cutoff is **October 20**. V2's reader-facing body says Anthropic announced its commitment **today**. There is no separate October 20 announcement in the supplied evidence supporting that assertion.

The editor's structured claim repeats the relative date, and the verifier approves it. The original source timestamp and reporting cutoff reached the verifier. This is the retained temporal failure returning after transport/format problems were fixed.

The minimal supported correction would omit the unsupported relative date, keeping the conditional 5% commitment. It would not add a routine publication-date sentence or extra background. No correction or paid repair was executed in this frozen comparison.

### 2. Potential financial effect became actual model-usage reduction

V2's Replit headline says the company reduces Anthropic-model usage. The source establishes the changed default, continued availability of Anthropic models, and that the shift **could significantly reduce spending**. It does not establish an observed reduction in model usage. The body retains a possible spending effect, but the headline strengthens the modality and changes its scope.

This headline is also approved by the verifier. A minimal faithful headline would report the default-model change without claiming measured usage reduction. No specific numerical reduction or extra optional detail is required.

### 3. Correct qualifications did survive, but V4 also preserved them

V2's Arabic body retains shareholder approval and describes defined redactions rather than a publication veto. Those are positive facts about this response. Matched V4 also preserves both distinctions, so this is not a demonstrated incremental win over V4.

Both outputs keep the fund, METR access and Replit default-model developments separate. There was no observed false event merge in this pair. V2 returned valid reference-only records and accounted for the source set; source acknowledgment does not establish important-development coverage or factual truth.

## What remains unproved

- Real compact-prior-ID behavior, meaningful updates, corrections, quiet outcomes and English writing: not exercised after the stop.
- General important-news retention, synthesis quality and reliability: not established by one inspected case. All three expected developments appearing is insufficient when two contain misleading wording.
- Repair quality: not exercised because false approvals bypassed repair.
- Useful information density: four fewer reader words do not establish better distillation. The outputs remain comparably lengthy.
- Durable real-reader delivery: not performed in this evaluation. Existing mocked persistence tests remain separate evidence.

## Diagnosis and next action

The demonstrated failures originate in the editor's wording and the verifier's acceptance. Original evidence, timestamps and cutoff were available; this run did not fail source transport, citation identity, quotation syntax or schema admission. It does not prove that another prompt or model would succeed, nor that all failures share one universal cause. Structured records are useful bookkeeping, not an independent source of truth.

**Do not create V8, add a stage, deploy v2 or rerun the full matrix merely because money remains.** Preserve the technical protocol fixes as opt-in and V4 as selected.

If further evaluation is authorized, first test factual discrimination on these exact failed outputs and supported controls, using full evidence. A stronger verifier should replace, not supplement, the current verifier, and must identify the actual date/modality error with source-linked reasons while accepting concise correct prose. No replacement is assumed better or cheaper without measurement. Earlier unsuccessful layout/longer-prompt experiments are not evidence of a solution.

## Reproduction and checks

Offline replay reproduces all four exact request hashes, final reader text and usage with zero network calls. Receipt tests reconcile four unique generations and the native ledger, preserve the critical source passages, and explicitly mark ten pipelines unobserved. **228/228 briefing tests passed** (47 files), and the briefing package TypeScript check passed. No Worker/product implementation was modified by this evaluation.
