# V7 qualification instruction — controlled writer-only result

## Decision: not accepted for runtime use

The eight-call comparison does **not demonstrate a factual reliability improvement over frozen V7**. Both fresh Arabic baselines already preserve the two qualifications that older V7 responses had lost. The instruction produced a useful shorter Arabic Lebanon briefing, but retained ambiguity and did not consistently improve information density. Editor request time increased substantially in aggregate, dominated by one slow English AI generation.

Do not promote V7 or advance automatically to a full-pipeline test from this result. The qualification experiment is removed from runtime; its exact text/helper and request snapshots are retained offline. V4 remains selected and deployed, and baseline V7 remains opt-in. No new prompt version was created.

This is not a claim that the instruction always worsens writing or that every flagged concern is a confirmed falsehood. Potential regressions are kept unresolved where a valid concise interpretation exists. Lack of demonstrated gain is sufficient not to retain a production option; an artificial factual-error count is not needed to justify that decision.

## Authorized execution and accounting

Fresh user authorization at `0196625`: at most eight GPT-4.1 editor calls, $0.65 total exposure, two hours. Executed **exactly eight calls**, all to `openai/gpt-4.1`, upstream OpenAI, with unchanged temperature 0.1, JSON mode and 4,000-token output cap. Four pairs used identical frozen sources, histories and settings; only the existing qualification suffix changed. Pair order alternated.

Native exact-request admission/reservation/settlement ran for every call in the existing isolated evaluation ledger. Reservations summed to **$0.521584**; actual reported and settled inference cost was **$0.091832**, with **$0 held and zero uncertain operations**. All eight provider generation IDs are distinct; no inference request was retried. Historical holds, receipts, grants and account/provider ceilings were unchanged.

A Cloudflare TLS reset initially prevented a read-only ledger preflight, before any grant, reservation or inference send. Explicit IPv4 dispatch for the same ledger endpoint, with normal certificate verification, restored connectivity. OpenRouter transport and model requests were unchanged. This was not a model retry or accounting bypass. The failed preflight and successful accounting receipts are retained privately.

No verifier, repair, other model, external judge, publication, deployment or notification call occurred. All eight call slots are consumed; unused dollars are not permission for another experiment. Full-pipeline and stronger-verifier tests remain outside this authorization.

## Exact evidence and reproducibility

- [Exact requests, raw outputs, accounting totals and review annotations](../benchmarks/editorial-distillation/v7-qualification-results-2026-11-03.json).
- [Readable paired briefing outputs and verbatim JSON](../benchmarks/editorial-distillation/v7-qualification-outputs-2026-11-03.md).
- Full original articles, metadata and previous briefings: unchanged `benchmarks/editorial-distillation/corpus.json`.
- Exact archived suffix/helper: `benchmarks/editorial-distillation/rejected-qualification.ts`.
- `benchmarks/v7-writer.prepare.test.ts` regenerates each actual paid request exactly; failed experiment reproduction does not run in the production engine.
- Private approval, native grants/reservations/settlements, append-only send journal, provider receipts and failure log: `.local-reports/v7-writer-qualification/trial20261103/`.

All responses parsed without truncation. Every prepared reference was accounted for; no unknown selected reference was observed. These checks establish source ownership/bookkeeping, **not semantic completeness**. Some English AI responses both cite S4 and list it as a redundant exclusion; that is a bookkeeping ambiguity, not evidence that a development was omitted.

## Essential factual meaning: controlled findings

Assessments are source-linked AI-assisted engineering judgments, **not human ground truth or independent human validation**. There is one Arabic AI generation per variant containing both target facts; these are not independent reliability trials. Four paired windows use two source corpora in two languages, not four independent corpora.

### Fund approval: both fresh variants retain it

Original primary source: **“Subject to stockholder approval, 5% of Anthropic’s shares will be committed today”**.

Fresh V7 Arabic includes “وذلك بعد موافقة المساهمين”. V7+qualifications also includes “وذلك بعد موافقة المساهمين”. The latter is better than the historical V7 body that omitted approval, but the fresh control already does the same. It cannot be credited as a controlled fix.

Both headlines state an allocation/commitment without explicitly mentioning approval; the body qualifies it. Whether that headline overstates a proposed commitment is a remaining risk, not automatically a proven completed-transfer claim. The instruction's promise to preserve qualifications in headlines is not robustly demonstrated.

The English baseline uses “at least 5%”, while the candidate says “5%”. Initial commitment is fixed and conditional, with later discretionary increases possible. “At least” can describe an eventual floor; do not mechanically equate it with the known unsupported “up to 5%” error or count its removal as a proven accuracy gain.

### METR rights: both fresh variants are supported

Original primary source: **“Anthropic can’t veto publication, but we can require them to redact information”**.

Fresh baseline Arabic says METR publishes without Anthropic objecting, with limited deletions. Candidate says “ولا تملك أنثروبيك حق الاعتراض على النشر، لكنها تستطيع طلب حذف معلومات محددة ضمن فئات سرية مسبقة التعريف”. Both preserve no publication veto versus defined redactions.

The candidate is more explicit about categories, but extra detail is not a quality gain by itself. Neither repeats the historical unsupported exception allowing publication prevention. Again, this demonstrates that unchanged V7 can sometimes produce a correct answer, not that the qualification instruction caused the correction or that V7 is now reliable.

### Unresolved changes must not become fabricated error labels

- **English Replit:** baseline reports disagreement about whether the Anthropic partnership ended. Candidate says “The partnership with Anthropic is not entirely ended.” This can flatten disputed formal partnership status into fact. Conversely, a broad reading as continued model access is supported by the CEO's clarification. Record it as a potential material regression requiring resolution, not a proven false contract assertion.
- **Arabic fund escalator:** candidate body says “مع إضافة 2% إضافية لكل زيادة بنسبة 50%”, while the source adds “at the board’s discretion”. It sounds more automatic than the source, but the headline retains “مع إمكانية زيادة الحصة”. It remains unclear whether this sufficiently qualifies the detailed rule. Do not flag an error solely for omitting the board's identity, or demand the optional escalator itself.
- **Arabic Qantara attribution:** candidate uses a concise assertive headline, close to the channel's assertive source text, while baseline also has attribution language in its body. Adequacy of implicit citation for the channel claim remains a source-trust/attribution concern. No invented event is established; do not demand generic “a Telegram channel reported” boilerplate.

The exact wording, source IDs and verified source quotations are retained in the result's assessment findings. Unresolved does not mean passed, and it does not mean proven wrong.

## Retention, grouping and useful reading

Source review finds all four expected Lebanon developments and all three expected AI developments retained in each corresponding variant: **14 developments per variant** across the four windows. The actual Baraachit strike stays separate from the prospective announcement S13. Duplicate Qantara coverage does not become a second event; the fund, Replit and METR remain distinct. No false merge/split was observed in these examples. This is provisional source review, not inferred only from citation counts and not a claim that every source detail is required.

The clearest useful change is Arabic Lebanon: **130 → 63 reader words**, with three complete headline-only items. It removes repeated body text while preserving the electricity decision's scope, nonpayment condition and effective date; actual/prospective strike distinctions remain. Those concise items are not rejected for lacking optional background.

English Lebanon is nearly unchanged. English AI grows **286 → 293 words**, still adding optional evaluator structure and historical customer rank without a new development. Arabic AI falls **274 → 242 words**, with a clearer Replit headline foregrounding the confirmed default plus continuing model availability. The baseline's headline implies reduced Anthropic usage, while the source predicts possible spending reduction; the candidate avoids that status implication. This is safer wording, not evidence of improved measured usage or a broad new accuracy rate.

Arabic technical phrasing remains somewhat literal. No native human review occurred. Fewer words, different brand transliterations, more citations and additional caution are not independent measures of improvement.

## Actual cost and request latency

| Window | Reader words V7 → check | Actual USD V7 → check | Request seconds V7 → check |
|---|---:|---:|---:|
| Lebanon English | 104 → 103 | .010246 → .010336 | 4.477 → 3.789 |
| Lebanon Arabic | 130 → 63 | .010822 → .010104 | 4.396 → 4.116 |
| AI English | 286 → 293 | .011930 → .012252 | 4.379 → 14.461 |
| AI Arabic | 274 → 242 | .013018 → .013124 | 4.811 → 5.213 |
| Four-window total | 794 → 701 | **.046016 → .045816** | **18.063 → 27.579** |

The check adds **89 measured input tokens per editor request** (527 UTF-8 bytes including separators); total input tokens 13,616 → 13,972. Output tokens 2,348 → 2,234. All eight report **zero cached input tokens**, so the cache imbalance from the earlier verifier-layout trial is absent.

Actual editor cost is about **0.4% lower**, not a meaningful established saving. Summed request time is **52.7% higher**, dominated by the 14.461-second English AI request. Do not discard that observation, but do not claim the instruction caused a stable latency regression from one sample either. Per-window results are shown to avoid hiding the variance. Request wall time includes HTTP/provider processing, not a provider-internal timing breakdown.

Read-only generation metadata for the two English AI calls agrees with the settled costs and reports generation_time values of 4,162 versus 14,169 milliseconds, alongside the 4.379/14.461-second client observations. This supports an upstream generation-time outlier rather than ledger timing; its cause is not established. No additional inference occurred. Field reference: [OpenRouter generation metadata](https://openrouter.ai/docs/api/api-reference/generations/get-generation). Do not add its timing fields as if they were independent components.

These are editor-only historical-source replays. **Full-pipeline latency, cost, verification/repair frequency, final factual accuracy, persistence and deadline delivery are unmeasured here.** The 10% full-pipeline target has not been established or tested. Whitespace word counts are descriptive within matched languages, not cross-language reading-speed or quality scores.

## Code and adoption

- Retire the unqualified runtime experiment flag and restore direct baseline V7 stage selection. No new mandatory calls or deterministic semantic guesses.
- Preserve the measured suffix, independent reproduction tests and exact paid requests outside runtime. Explicit retired flags fail before inference rather than silently paying for an unintended baseline request.
- Keep V4 selected; keep baseline V7 opt-in. Do not change routing, deployment, publication or financial history.

**Adoption recommendation: not accepted.** There is a local density improvement but no controlled fix for the two target factual failures, unresolved qualification/disagreement risks remain, and the observed latency does not justify advancement. No claim of a confirmed material regression is needed to reach this evidence-based non-adoption decision.

The separately prepared stronger-verifier comparison was not executed. Do not start it or a full-pipeline experiment using this scope's unused funds. Any next paid work requires fresh explicit approval and native admission.

## Final validation and CI context

- 177 briefing tests / 41 files passed.
- Three writer/archive checks and four evidence/archive checks passed; frozen writer and earlier layout requests still reproduce exactly.
- Briefing and Worker TypeScript checks passed.
- Runtime V7 stage prompts are identical to `9c9a251`; normal engine behavior is restored, with only an explicit pre-inference rejection of retired experiment flags. Default remains V4.
- Full Project checks at the preceding `0196625` passed: https://github.com/AmmarMohanna/distilled.news/actions/runs/41687805607 . No push implementation change was made to obtain that pass; the previous intermittent Miniflare assertion remains unproven as an application defect. CI for the new evidence/retirement commit is reported separately.
