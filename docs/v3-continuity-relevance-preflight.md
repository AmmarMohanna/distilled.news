# Continuity and Lebanon relevance — frozen test plan

## Scope and status

The user requested testing and permitted paid API use. Their standing restriction also requires approval of the exact maximum budget before paid requests. This plan is **not yet authorized for execution**: the proposed bound is **10 GPT-4.1 calls / $0.56 total exposure / two hours**. Calculated conservative reservations sum to **$0.553114**. No paid requests, reservations, deployments, publication, notifications or live-feed changes have occurred for this plan.

Test two changes separately against the frozen V3 v1 baseline:

1. Continuity: shared actors, locations or wording do not establish the same occurrence; compare event details and explicit timing. A later publication timestamp alone does not establish a new event either. Do not invent confident identity when evidence is ambiguous.
2. Relevance: prioritize concrete developments affecting the named geography/interests; regional news may matter through its reported substance, without inventing a local consequence.

Each replaces part of one existing paragraph. They are not combined. Verifier, repair, grouping rules, history presentation, source preparation, reading budget, output contract and model routing remain unchanged. No broader rewrite is proposed.

## Five frozen cases

| Case | Evidence | What it can establish |
|---|---|---|
| Real unchanged oil report | Two versions from recovered World News track; core article body identical after the lead, with a timestamp/link change | Avoid publishing unchanged price news as an update |
| Explicit occurrence/update/correction controls | Four clearly labelled synthetic articles and source-supported fixture history | Preserve a distinct next-day occurrence; recognize restored service; correct five to fifty; skip a repost |
| Current Lebanon strikes | Exact retained Arabic input and reader history | Diagnose ambiguity without forcing an unproven "new strike" or "same strike" label |
| Lebanon relevance, English | Frozen four-post saved-source composite | Include the concrete Haret Saida report; avoid invented Lebanon consequences; assess marginal commentary |
| Lebanon relevance, Arabic | Same composite and cold-start context, Arabic output | Same criteria, without demanding identical language output counts |

Each case gets one baseline and one candidate request, with identical full user input and model configuration. Baseline system is exactly `v3-prompts-v1`. Candidate systems change exactly one paragraph. Frozen request/input/source hashes preserve identity. The actual requests and source text remain in private local storage.

The oil case uses a controlled price-focused interest and constructed, source-supported prior summary, **not an actual published edition**. This prevents other unchanged but previously uncommunicated article background from falsely counting as a new oil-price development. The prior precedes the replay window. Full source text is unmodified; the offline body comparison is evidence checking, not a product cleanup step.

The synthetic case is not real-world quality evidence. It explicitly identifies event timing and a separate occurrence, a material update and a correction, so those relationships have clear expected answers.

The Lebanon strike post does not establish whether it describes new strikes or a repost. Neither forced inclusion nor forced omission is scored as ground truth. Review whether the model invents event timing/identity, loses attribution or makes unsupported assertions. This case cannot independently prove improved recall.

The relevance composite preserves source text and publication timestamps, includes the existing generated style preference, and records an explicit empty reader history. It is a controlled saved-source batch, **not an actual source-acquisition window or deadline test**. The Iran drone claim and Araghchi statement are optional source-supported regional selections. Their inclusion/exclusion alone is not an error, and unequal Arabic/English item counts alone are not a failure. The local drone report is the required main development; generic election commentary without a concrete Lebanon development is a relevance negative under this frozen engineering rubric.

All labels are engineering judgments except the explicit synthetic controls. No independent human gold or unseen large-scale quality qualification is claimed. The original 95-window archive remains missing; the real oil control comes from the separately labelled recovered corpus.

## Cost and execution boundaries

- Ten editor calls, GPT-4.1, temperature 0.1, JSON mode, 4,000 output-token cap.
- Provider price ceilings: $2/M input and $8/M output; request-byte input upper bound plus 1,024 tokens.
- No retries, repairs or additional verifier calls.
- Reserve each operation through existing accounting; unsettled charges count against exposure; stop on uncertainty or admission denial.
- Preserve all historical grants, reservations, settlements, holds and account limits. Prior authorizations are not reused.
- No product prompt activation or deployment from a single successful case. A candidate must improve its intended outcome without worsening source support, important-news recall, continuity or cost. If baseline already performs as well, retain no change.
- Any later full-pipeline qualification is outside these ten calls and requires its own explicit bounded approval.

## Reproducibility and offline checks

Private exact plan: `.local-reports/v3-continuity-relevance-preflight/plan-NOT-AUTHORIZED.json`.

Safe public manifest: `benchmarks/results/v3-continuity-relevance/preflight.json`. Recovered article text remains ignored/private. Synthetic fixtures are included and labelled separately.

Offline checks confirm all five pairs match in evidence/history/model settings; each changes exactly one paragraph; no source is removed by existing preparation; the old oil report predates the current window; and its substantive body is identical. The plan's exposure is below $0.56.

`node --test scripts/v3-continuity-relevance-preflight.test.mjs`: **4 tests passed**. These tests validate experiment isolation and accounting bounds, not semantic model reliability.
