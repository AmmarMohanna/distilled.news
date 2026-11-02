# V3 editorial distillation evaluation

## Scope and current result

Branch `ghada/v3-editorial-distillation` starts at `working-version`, commit `5e32a483d65d9f8f94069709c30dc3a21af698c7`. This is an offline evaluation track. No deployed prompt, routing, source, frontend or campaign resource changed. No paid calls were made. No editorial candidate is qualified or selected.

## CI investigation

The latest baseline workflow passed all jobs: https://github.com/AmmarMohanna/distilled.news/actions/runs/41422926484.

The historical failure is retained in https://github.com/AmmarMohanna/distilled.news/actions/runs/41420623392: `browser-use-lifecycle.test.ts:18`, while loading migrations, raised Miniflare's synchronous proxy assertion `message?.id === id`. This occurs in host/worker IPC before Browser Use decisions or workflow activation. The installed Miniflare implementation posts an incrementing request ID, waits on a shared atomic notification and asserts that the received response has the same ID. The log does not establish whether the response was missing or mismatched, or the exact environmental cause.

Five fresh isolated runs passed unchanged. The current complete CI also passed. The failure was not reproduced in isolation; therefore no application regression or exact root cause is established. Do not claim a fix, patch dependencies speculatively, add retries or weaken security assertions. Existing truthful-capture, validation and activation checks remain intact. Private logs are in `.local-reports/v3-editorial-distillation/`.

## Frozen benchmark

`benchmarks/editorial-distillation/corpus.json` preserves 22 exact retained sources (54,239 text characters), their titles, URLs, publication timestamps, source identities and SHA-256 hashes. Twelve cases pair English and Arabic requirements across six families:

- Lebanon roundup: four consequential developments, duplicate explosion reports, separate observed and prospective strikes, prior coverage and optional regional commentary.
- AI strategy: primary/secondary coverage of one fund announcement, separate Replit default-model and METR-access developments.
- Casualty update: previously communicated attack video followed by conflicting attributed casualty reports. Do not declare a conclusively resolved correction.
- Security roundup: active exploitation versus disclosure/patching and correct actor/action ownership; not every entry is mandatory.
- Same company: separate safeguards and customer-adoption announcements, with future availability and adoption targets preserved.
- Quiet repeat: an already-communicated oil-price claim; an empty result is valid.

Original reader-memory prose is preserved, including historical filler. Sources and timestamps are not repaired or reclassified as fresh news. Historical article replays do not establish scheduling performance. Same-channel reports and primary/secondary coverage are not independent corroboration.

Labels are provisional AI-assisted engineering judgments, not independent human gold. Development and reserved-transfer families are separate, but all sources have been inspected or used previously: reserved-transfer is **not** an unseen-source holdout. Broad publisher diversity and a genuinely consecutive multi-source track remain missing.

## Controlled candidates

The exact current V4 editor, verifier, consolidation and repair systems are frozen in `baseline-v4.json`. The engine default remains version 4. Two candidates separately append one instruction:

1. `main-change`: main change plus only necessary supporting details; preserve conditions and attribution.
2. `complementary-evidence`: combine complementary evidence only for the same development, preserving disagreements; citation count alone is not synthesis.

Every comparison keeps the exact same user input, model, temperature, JSON mode, output cap and retry setting. Neither candidate changes the verifier, repair or consolidation. Consequently these editor-only comparisons do not qualify chunked/consolidated workloads. These cases fit one editor chunk under existing preparation; no source is dropped by preparation.

Run offline preparation with `corepack pnpm exec vitest run --config benchmarks/editorial-distillation.vitest.config.ts`. It writes exact requests and preparation measurements locally, never contacts a provider, and rejects baseline drift. Ordinary briefing tests verify hashes, preserved history, bilingual requirements and pair equivalence.

## Review rubric

Review each output blind to candidate name against full source passages and prior briefing text. Record source ID and supporting quotation for each material finding. Review headline and body together. Do not require optional background or punish valid concise paraphrases.

| Dimension | Required evidence |
|---|---|
| Factuality/citations | Material unsupported claims, altered attribution/modality/dates/numbers; each cited source actually supports its associated statement |
| Distillation value | Clear main change; necessary context retained; redundant detail removed; no invented analysis or consequences |
| Synthesis | Same occurrence expressed once using complementary supported evidence; false merges and unnecessary splits counted separately |
| Continuity | Explicit meaningful delta versus prior coverage; confirmations without new facts omitted; genuine corrections remain eligible |
| Selection | Important-development recall and consequential omissions; optional details never inflate the denominator; irrelevant repetition counted |
| Language | Natural concise Arabic/English, correct named actors and uncertainty; no literal-translation filler |
| Efficiency | Actual editor/verifier/repair calls, usage and cost separately; stage latency versus complete pipeline latency distinguished |

Information gained means supported integration, clarification or change relative to the reader's memory, **not facts invented beyond the sources**. A single-post main idea may be the right outcome; multi-source prose is not mandatory. Record synthesis as not applicable when evidence offers no useful complement. Length, reference count and JSON validity are descriptive aids, never semantic scores.

Use a review record with `caseId`, blinded `outputId`, `importantIncluded`, `importantMissing`, `optionalOmitted`, `unsupportedClaims`, `citationErrors`, `falseMerges`, `falseSplits`, `repeatedDevelopments`, `meaningfulUpdates`, `synthesisEvidence`, `unnecessaryDetail`, `languageIssues`, `reviewerAuthority`, and source-linked notes. Unreviewed quantities stay null, not zero.

Promote only a candidate with meaningful paired improvement, no material factual/grouping/recall regression, and acceptable full-pipeline cost. Evaluate reserved-transfer cases only after development review; obtain genuinely unseen cases before claiming generalization. Run the unchanged verifier and targeted repair for a promising finalist through native accounting; do not add product stages.

## Existing evidence, not new candidate results

Earlier main-idea rewrites did not improve recall and introduced filler or grouping errors. Stronger separation wording also failed to demonstrate gain and regressed consolidation. Current retained V4 update evidence still missed a meaningful delta and qualifier; a brevity pair was promising but unqualified. These are diagnostic development evidence, not results for the newly frozen pairs. Historical systems/inputs differ, so their scores must not be relabelled as this benchmark's baseline.

The four recently published pilot editions establish operational delivery on two short posts, not multi-source synthesis or broad editorial quality. Keep infrastructure results separate from editorial conclusions.

## Cost, latency and next gate

Offline preparation constructed 36 requests (baseline plus two candidates for 12 cases); 24 candidate comparisons. The initial development stage is 12 editor calls with a conservative planning upper bound of $0.872436 at the repository's configured $2/$8 per million input/output rates. This is not current-price verification, native admission, a grant or actual cost; refresh provider pricing and obtain explicit fresh approval before execution. Verifier/repair finalists need their own bounded exposure calculation. No request runner is connected to a provider by this preparation test.

Actual new inference cost: $0. Model latency and semantic candidate outcomes: **unmeasured**. Offline preparation took approximately 108 ms on one run; this is not publication latency.

The existing isolated performance campaign, k6 tests and archived financial/publication history are untouched. A later separately approved run must overlap bounded HTTP traffic with nonempty publication and complete the full observation period. Do not rerun that pilot to establish editorial quality.

## Completed local checks

- Lifecycle test: five isolated passes; no synchronous proxy assertion reproduced.
- Related lifecycle, fixture and public-source-discovery tests at three-worker file concurrency: 11 passed across three files, preserving security assertions.
- Complete briefing suite: 129 passed across 26 files, including six new corpus/pairing regressions.
- Briefing TypeScript check: passed.
- Offline comparison preparation: passed with the frozen V4 snapshot, 36 requests prepared and zero provider calls.
- `git diff --check`: passed. No application runtime or deployment files changed.

## Independent automated evaluation: prepared, not executed

The follow-up adds `evaluator.mjs`, an offline-only request builder. A separate Claude Sonnet 4.5 evaluator receives all original source bodies, exact prior reader text, feed/language/window context, provisional expectations and all three anonymously labelled drafts. It does not see candidate prompt names or systems. Labels/order are deterministic and reversible for later order-bias controls. Expected labels are explicitly fallible. Semantic evaluations must explain issues with exact source quotations, preserve ambiguous findings as unresolved and distinguish optional omissions from important missing developments. Mechanical auditing checks quotation/reference existence and complete output/development coverage; it does **not** certify the judgment as true.

Current prices were read from the public OpenRouter model catalogue and saved in `pricing-2026-11-02.json`. The first-stage plan in `experiment-plan.json` proposes **16 calls / $3 maximum exposure / two hours**: 12 matched editor calls and four independent evaluator calls on the four development cases. Conservative exposure is $2.552436, including capped evaluator input/output and no cache discounts. No retries, repairs, publication or deployment are included. Evaluator full-evidence requests must fit 120,000 conservative input tokens and 4,000 output tokens; oversized inputs stop rather than lose source text. Context/rate/account admission must be checked before execution. Actual requests depend on generated drafts and will be hashed and durably retained before each admission.

This is a fresh approval gate, not permission to reuse an old grant. Both editor and evaluator require native atomic reservations and durable settlement through the existing isolated evaluation mechanism. All uncertain outcomes retain their exposure and stop the experiment. No provider execution was initiated while preparing the plan.

Transfer and full-pipeline testing are deliberately not authorized by this proposed first-stage scope. If a candidate is promising, calculate a second bounded stage using reserved cases and paired baseline/finalist V3 runs. Keep the existing verifier and targeted repair, report their actual extra calls, and compare complete generation time/cost, not editor latency alone. The common path must remain the existing V3 call sequence. Retain a candidate only with meaningful quality improvement, no material factual/grouping/important-recall regression and measured total inference cost and generation latency no more than 10% above baseline. Evaluation-only judge calls are reported separately. More words, citations or interpretive analysis do not count as improvement.

No candidate has been model-evaluated under this frozen design. Quality findings, transfer performance, actual inference cost and latency remain unmeasured. Existing V4 remains selected.

## Authorized execution attempt — provider quota blocked

Fresh approval authorized 16 calls and $3 exposure for two hours, recorded at 2026-11-02T16:40:23Z with conservative expiry 18:40:00Z. The execution preflight stopped on `PROVIDER_HEADROOM` before native authorization creation, reservation or provider inference. A separate read-only quota check at 16:42:47Z reported `limit_remaining: 0`, `limit: 250`, `usage: 250.01663786` for the existing staging OpenRouter key. This is a provider-key quota result, not a claim that the underlying OpenRouter account has no credits.

Actual new model calls: **0**. Actual new inference charges: **$0**. No new grants, reservations or settlements were written by this attempt. Existing holds, key limits and deployment configuration were unchanged. Exact prepared execution and logs are private under `.local-reports/v3-editorial-distillation/`.

Required external action: securely restore sufficient authorized headroom on the existing evaluation key, or explicitly authorize a securely supplied evaluation key. Do not paste secrets into chat. No quota increase, substitute credential or untracked call was attempted. If access is restored after expiry, fresh spending approval is required. Candidate quality, factuality, comparative cost and latency remain unmeasured; V4 remains unchanged.
