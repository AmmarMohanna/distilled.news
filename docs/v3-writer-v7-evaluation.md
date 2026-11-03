# V7 coherent briefing writer: measured evaluation

## Recommendation: REVISE — preserve V4

V7 is implemented as an opt-in complete editor/consolidator/verifier/repair prompt version. It is **not ready to replace V4**. Real paired replay shows useful gains in Arabic event separation and English filler removal, lower measured cost, and fewer verifier false rejections. But material Arabic conditions and publication-rights errors pass verification, and the retained quantity/timing errors still pass. These outweigh efficiency gains. No deployment, routing change or publication occurred.

## What was implemented

Final tested stage prompts are in [prompts-v7.ts](../packages/briefing/src/prompts-v7.ts). Select `generateBriefing(..., {promptVersion:7})` only in an experiment. `DEFAULT_ENGINE.promptVersion` remains 4. V1–V6 system text and prepared user-message bytes are preserved. Changes to existing runtime files are version types and explicit V7 dispatch only.

The editor reads the whole prepared source, identifies developments rather than one item per post, compares with the union of reader history, ranks consequential changes, combines complementary evidence only for the same occurrence, and writes main change plus necessary supporting detail. It accounts for every reference in selected items or grouped exclusions. The existing diagnostic reports unaccounted references without manufacturing an importance label or blocking publication. A reference may support several developments: accounting is not coverage certification.

The verifier checks material meaning, not stylistic preferences, with explicit acceptance of sufficient headline-only items and optional-detail omissions. It asks for source-specific explanations. Repair remains a minimal correction and independent recheck through the existing engine. No extra normal calls, heuristic semantic classifications, new schema, agent, provider adapter, scheduling or persistence change was added. Existing chunk consolidation still runs only at its size threshold; existing source ownership and local repair numbering remain.

## Supported diagnosis before changes

- Retained V6 S13/107635 was absent from both arrays in the raw editor response. It was not lost through parsing. Why the model omitted it internally is unknown.
- Retained V4/V6 fund errors were approved by their verifiers. Stronger instructions in the previous four-call test also failed: there is no demonstrated general prompt-only solution.
- Previous verifier requests for optional background/body repetition were real false-positive examples. They do not justify weakening checks on conditions essential to a claim.
- Exact index coverage is mechanically valid in the retained control batches. Semantic contamination across differently cited controls exists, but no parser mapping defect is demonstrated.
- No current evidence proves that more citations, fewer words or a generic judge score measures distillation.

## Real experiment and bounds

Fresh explicit approval: at most 28 calls / $1.60 exposure / four hours; eight full pipelines, four verifier-control calls, up to four repair/recheck pairs. Live provider catalogue confirmed GPT-4.1 $2/$8 and mini $0.40/$1.60 per million input/output tokens. Every request passed native admission/reservation and settlement in isolated evaluation D1. Each request was bounded to 32,000 serialized bytes, admission input bound 34,048, output at most 4,000 editor/repair or 3,000 verifier tokens. No retries, paid judge, notifications or hold changes.

Executed **20 calls; $0.1099484 actual; $0 held; zero uncertain outcomes**. Eight pipelines used editor GPT-4.1 and verifier GPT-4.1 mini, temperature 0.1, same inputs/history/settings, alternating order across cases. Each needed exactly two calls. No repair was requested; this is not proof repairs were unnecessary. Four additional calls evaluated identical retained verifier-control batches.

The complete engine ran, but there was **no database publication/persistence test**. Engine status `published` means it produced accepted items, not that a reader edition was persisted. Historical source replay timing excludes acquisition and live scheduling. Wall times include the evaluation admission/settlement adapter, not just provider latency.

## Paired pipeline measurements

| Frozen case | V4 → V7 items | V4 → V7 words | Actual USD V4 → V7 | Model seconds V4 → V7 | Whole replay seconds V4 → V7 |
|---|---:|---:|---:|---:|---:|
| Lebanon English | 4 → 4 | 140 → 104 | .0129088 → .0107736 | 5.748 → 6.174 | 11.461 → 11.967 |
| Lebanon Arabic | 3 → 4 | 105 → 129 | .0126944 → .0116832 | 8.463 → 8.071 | 14.951 → 14.985 |
| AI English | 3 → 3 | 307 → 288 | .0155352 → .0136240 | 6.957 → 5.353 | 12.614 → 11.331 |
| AI Arabic | 3 → 3 | 218 → 231 | .0148984 → .0139884 | 9.728 → 7.338 | 15.238 → 12.836 |
| Total | 13 → 14 | 770 → 752 | **.0560368 → .0500692** | **30.896 → 26.936** | **54.264 → 51.119** |

Candidate pipeline cost was 10.65% lower, provider wall time 12.82% lower, and replay wall time 5.80% lower in these four single observations. English Lebanon provider time increased 7.4%. These are not p95 estimates, significance tests, acquisition-to-delivery times or a production capacity/cost forecast. Word counts are whitespace counts within matched languages, not comparable measures of Arabic versus English quality. Prompts being shorter can reduce input cost without improving selected information.

## Editorial findings: wins and losses

Full verbatim V4/V7 output and original evidence: [side-by-side examples](../benchmarks/editorial-distillation/v7-outputs-2026-11-03.md). Exact requests/responses, usage and timings: [results](../benchmarks/editorial-distillation/v7-results-2026-11-03.json). Reviewable source-linked issues: [findings](../benchmarks/editorial-distillation/v7-findings-2026-11-03.json). All semantic judgments are AI-assisted engineering assessment, **not human ground truth**. Exact quote checking proves linkage, not interpretation.

### Wins

- Both versions accounted for every prepared source in this run. V7 retained S13 in English and Arabic, unlike historical V6. This is not a coverage gain over current V4: current V4 also included S13.
- V4 Arabic combined the reported Baraachit strike and the regional council's separate prospective-strike announcement. V7 kept them separate. Both facts existed in V4; this is grouping improvement, not discovery of an absent source.
- V7 English reduced the Qantara account to “Large explosion reported in Qantara, southern Lebanon, attributed to Israeli forces.” V4 added “No further details were given.” V7 also removed the strike's routine missing-casualty/damage sentence. Essential reported location/action survived; no invented local impact was needed.
- V7 English's fund body uses “will be dedicated ... if the plan is approved.” V4 again says shares “are now dedicated,” contrary to the source's future wording. This improvement came from writing, not verifier detection.
- All three expected AI developments remain distinct; observed Lebanon developments remain present. No new paid stage was needed. Citation IDs belong to supplied sources, with no unknown refs or parsing loss observed.

### Losses and remaining factual risks

- **High: V7 Arabic fund item omits stockholder approval entirely**, including its body, while reporting a definite initial 5% allocation. This is necessary qualification, not optional background. Its verifier approves it. V4 Arabic preserves approval in the body.
- **High: V7 Arabic METR item says Anthropic cannot prevent publication except in specified cases.** The source says it cannot veto publication but can require defined redactions. Exceptions to veto and redaction rights are different. V4 Arabic describes redactions; both final verifiers return ok.
- **High: fixed-versus-range and future-versus-completed retained control errors remain approved by V7.** Accepting a final response is not factual certification.
- **Moderate: density remains weak.** English AI falls only 307→288 words; Arabic AI grows 218→231. Both still include optional evaluator partners, fund structures and background. Headline/body repetition persists, especially Arabic electricity coverage. V7's “سيُخصص ... حتى الآن” mixes future and “so far” unnaturally.
- **Unresolved:** the English V7 fund headline says “commits 5%,” with approval only in the body. A commitment need not mean completed transfer; do not automatically count this as a proven completed-allocation error. It still merits clearer conditional presentation.
- **Unresolved:** Arabic escalator wording preserves possibility but omits board identity. Do not reject it solely for not enumerating the board role; separately flag the definite missing stockholder condition.
- The observed common sources often repeat the same originating report. Consolidating them is not proof of valuable independent multi-source synthesis. No artificial analysis is rewarded. Meaningful-update/quiet transfer cases and French remain unmeasured in paid runs.

## Verifier control comparison

Both variants see 14 identical controls: four errors, nine accurate controls, one ambiguous case excluded. Ten use retained evidence and four are clearly synthetic, so these counts are diagnostic rather than production rates.

| Metric | V4 | V7 |
|---|---:|---:|
| Retained real errors accepted | 2 / 2 | 2 / 2 |
| All labelled errors accepted | 2 / 4 | 3 / 4 |
| Accurate controls rejected | 7 / 9 | 1 / 9 |
| Ambiguous label excluded | 1 | 1 |
| Exact index coverage | Valid | Valid |

V7 meaningfully reduces optional-detail/body-repetition false rejections in this sample. It still drops the valid completed synthetic transfer because the source is fictional/unrelated to Anthropic, rather than judging the given source. It also accepts the incorrect fixed-to-up-to synthetic variant that V4 flags. For the future-to-completed synthetic case V7 correctly cites the conditional future evidence but also invokes fictionality. These are semantic decisions, not proven index remapping. No generic accuracy score hides the missed errors behind fewer false positives.

## Offline regressions and limits

Scripted engine tests cover explicit V7 opt-in with V4 default, sufficient headline-only items, valid empty results, diagnostic omission handling, repair numbering plus reverification, and consolidation citation unions. Frozen preparation creates 24 editor requests for 12 paired cases and four verifier requests with identical user evidence. Reserved-transfer sources are historically inspected and are not unseen-source generalization.

Recorded-response regressions preserve failures and valid controls rather than assert that prompt words guarantee semantics. Original quantity, timing, security status, update, quiet and S13 replay tests remain. No deterministic fixer rewrites news or removes a factual qualifier.

## Adoption gate and next action

**REVISE; do not promote or deploy.** Keep this tested prompt version and all negative findings reproducible. No post-result prompt patch was silently substituted for the measured version. The meaningful improvement in Arabic grouping and reduced false rejection does not offset new Arabic factual errors and still-missed retained errors.

The next justified investigation is targeted comparison of claim/source presentation and condition handling using these saved outputs, before another paid run. Do not append more broad rules or launch a new model hunt by default. Additional trials require their own reviewed scope; the remaining allowance is not a spending target. Transfer, factuality and repair behavior must pass before replacement, with no material recall/grouping regressions and no more than 10% cost/latency increase. Live deployment, persistence and notification tests are deliberately out of scope.

## Validation and reproducibility

- Complete briefing suite: **167 tests / 37 files passed**, including the final exact-prompt freeze check.
- Separate offline benchmark preparation: two tests passed.
- Briefing and Worker TypeScript checks passed.
- Reproduce offline preparation: `node node_modules/vitest/vitest.mjs run --config benchmarks/editorial-v7.config.ts`.
- Reproduce briefing regressions: `node node_modules/vitest/vitest.mjs run --project @distilled/briefing`.
- `v7-comparison.ts` invokes the real engine through a supplied, natively admitted `ModelPort`, recording exact intents/responses and evidence hashes; it does not contain credentials or an unaccounted provider fallback. The private paid executor and append-only journal are retained under `.local-reports/editorial-v7/`; do not rerun it as a test or reuse its approval for a different experiment.
- The offline preparation artifact's zero paid calls refers only to request preparation; the separate results artifact records the executed 20-call experiment.
