# V3 repair recheck context and history presentation — 24 October 2026

## Decision

Retain two small changes on `integrate-aya-v3-post-integration`: render duplicated prior-publication prose once; include the immediately preceding draft and review in existing post-repair verification calls. No new stage, mandatory call, model change or automatic acceptance. Initial verification is unchanged apart from nonduplicated history presentation.

This is a targeted improvement supported by one retained real failure and four newly frozen synthetic controls. It does not qualify the verifier generally or establish better overall editorial relevance. No deployment or live publication was performed for this experiment.

## Evidence and causes

The real Arabic Iran item entered an oscillation over the supported word “finally”: verification requested adding it, repair added it, the next verifier requested removing it, and subsequent review requested it again. The source itself includes the word. A fresh, stateless recheck repeated the unnecessary rejection. This is a semantic false rejection, not an item-indexing defect. Context gives the verifier the previous edit, explicitly labels previous advice fallible, and still requires checking the current item against original sources.

The product history adapter stores the first full reader claim in both legacy headline and body fields. Rendering both duplicated the prose. The fix removes only an exact repeated prefix during presentation. It does not alter stored reader history, relevance ranking, identifiers, evidence or publication memory.

Exact source text, draft text, requests, provider outputs, usage and settlements: [summary.json](../benchmarks/results/v3-repair-context/summary.json). Human-readable verdicts and editor outputs: [outputs.md](../benchmarks/results/v3-repair-context/outputs.md). Labels are assistant-reviewed, not independent human gold. Four synthetic controls were frozen before the paid run; no iterative prompt search followed.

## Frozen comparison

User authorization: at most eight calls / $0.12 exposure for two hours. Six GPT-4.1-mini verifier requests compared baseline/context on identical current items and sources. Two GPT-4.1 editor requests compared only prior-history formatting on identical real Arabic input. No retries, repairs, publication or notifications in the paid comparison.

| Case | Baseline | Candidate |
|---|---|---|
| Real source-supported Arabic repair | False rejection: remove “finally” | Accept |
| Planned license falsely stated as completed | Reject | Reject, despite incorrect earlier advice |
| Both approvals changed to either approval | Reject | Reject, despite incorrect earlier advice |
| Correct future ferry closure | Accept | Accept |
| Correct concise reservoir level | Accept | Accept |

Among these five items: baseline one false rejection; candidate zero; both zero false approvals and no observed wrong-item assignments. This small result cannot establish general error rates, and the control set is synthetic.

## Actual cost and time

All eight operations settled in the existing evaluation ledger; total actual charge **$0.0195164**, aggregate conservative reservations **$0.118680**, no outstanding charges in this scope. Existing historical records and holds were not changed. Scope: `evaluation:v3-repair-context-20261024`.

| Pair | Baseline input tokens / cost / time | Candidate input tokens / cost / time |
|---|---|---|
| Real repair verification | 2328 / $0.001008 / 2.731s | 2481 / $0.0003684 / 2.600s |
| Two invalid repairs | 1018 / $0.0005256 / 2.705s | 1157 / $0.0005812 / 1.680s |
| Two valid repairs | 1033 / $0.0004612 / 1.475s | 1175 / $0.000518 / 1.602s |
| Real editor history | 4040 / $0.008776 / 1.970s | 3291 / $0.007278 / 3.119s |

Times are request-through-settlement replay times, not acquisition-to-publication latency. The real contextual verifier received 2176 cached input tokens; its lower actual cost is not evidence that adding context reduces token cost. Context adds 139–153 input tokens in these cases. The two uncached control pairs cost $0.0000556 and $0.0000568 more respectively. Context is supplied only after a repair.

History deduplication saved 749 input tokens (18.54%) and $0.001498 (17.07%) for this editor call, with identical parsed output. The candidate was slower in this single observation; no latency improvement is claimed. There was no paid full-pipeline trial, so avoided repair costs and recurring whole-briefing savings remain unmeasured.

## Implementation and recovery

- Existing editor/consolidator/verifier prompt builders render exact duplicated history once.
- Existing repair loop retains immediately previous headline, body and issues; verification batches map these to local item indices. Source ownership and original source text remain unchanged.
- Prior advice is context, not evidence or instructions. A bad repair still requires rejection.
- New window snapshots freeze prompt version 2 in their fingerprint. Existing snapshots without a version use version 1, retaining original request bytes and settled-call recovery. No migration or reinterpretation of historical receipts.
- Integration branch's independent semantic-lease regression remains intact.

## Validation

Focused tests cover presentation without mutation, sparse repair/recheck numbering, repeated repair context, exact paid formatter reproduction, first-pass behavior, and legacy/new frozen-window interruption/recovery without extra inference. Final command results are recorded below after verification.

## Remaining limitations

This does not solve all relevance mistakes, filler, false acceptances or model inconsistency. It adds no special company/keyword rules and does not relax factual checks. Broader held-out real cases and unattended fresh-window timing remain unproven. Deployment requires separate instruction.

Verified on integration base `e77e0d9`: all 17 Worker V3-window tests passed, including interruption/replay for both legacy and new prompt versions and the existing semantic-lease test. Worker and briefing TypeScript checks passed. The complete briefing suite passed (final count below). Broader historical V2 push-integration fixture failures were not part of this focused run and are not claimed fixed.
Final briefing-suite result: **88 tests passed across 18 files**, including an explicit legacy post-repair recheck with no new context.
