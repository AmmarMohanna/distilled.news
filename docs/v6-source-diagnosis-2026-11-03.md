# V6 source omission and English evidence diagnosis

## Scope

Read-only investigation of retained paid responses, original frozen articles and existing engine code. No new inference, changed prompts, deployment or source edits. A deterministic replay used the exact retained V6 responses and asserted byte-for-byte-equivalent model request objects; it made no network calls. All semantic judgments below are source-based AI-assisted engineering findings, not human ground truth or a new independent automated verdict.

## Post 107635: exact loss boundary

Source ID `d54d92e1-3175-4465-8f47-09031a4de464`, [post 107635](https://t.me/lebanonnews2/107635), was supplied as **S13** in the actual V6 editor user message. Its publication timestamp was 2026-10-23T16:33:23Z, inside the historical replay window 15:20–17:20Z. Full text included:

> المجلس الإقليمي للجليل الأعلى : سنشنّ غارات جوية على الجبهة اللبنانية خلال الساعات المقبلة، وسيُسمع دوي الانفجارات وأصوات الطائرات في أنحاء المنطقة.

The earlier Baraachit strike was separate **S10**, published at 15:45:18Z. The prior reader memory concerned exercises the following week, oil and the Karak video; it did not already communicate S13's prospective-strike announcement.

| Boundary | Retained observation | Conclusion |
|---|---|---|
| Preparation | All 15 articles present, zero skipped; S13 full text present in exact editor request | Not filtered, truncated, stale or lost before the model |
| Raw editor `items` | Exactly three items: Qantara S7/S8; Baraachit S10; EDL S14 | S13 already missing before parser |
| Raw editor `left_out` | Only S5, S6, S1/S2 and S3, with reasons | No explicit S13 exclusion or insignificant/routine rank |
| Returned prose | No Upper Galilee Council announcement or prospective-strike content in any item | No observable merge into the earlier strike |
| Ranking | All three returned items importance 1; no fourth item returned | No numeric ranking exists for S13 |
| Parsing and caps | Same three valid drafts survive; safety cap is 30; dropped/skipped empty | Not lost through parsing, cap, sorting or dropping |
| Consolidation | No consolidator call; single editor chunk | Not a consolidation merge/cut |
| Verification | Checks three selected items and their cited evidence; all ok | Verifier did not inspect coverage of the omitted source |
| Final result | Same three items; S13 absent from `items`, `omitted` and `dropped` | Silent editorial omission, with no retained rationale |

**What is proven:** the model failed to include or account for S13 in its editor response. The application's omission audit is not exhaustive: `parseLeftOut` retains reasons the model supplies, but does not construct a decision for every input. The factual verifier's selected-item scope does not detect missing-news coverage.

**What is not proven:** whether the model privately decided the announcement was insignificant, conflated it with the prior strike/drills, or simply overlooked it. No retained reasoning says so. Treating this as an intentional, explained editorial rejection would overstate the evidence. In particular, the old speculation that it was classified as a low-value threat is unsupported by this exact response.

The 140-word guide was not a hard exclusion: the final V6 text is 107 words and the model selected only three items. This does not establish the guide had no influence, but rules out an application-enforced three-item/word cap. No new exhaustive fact/enumeration contract is proposed by this diagnosis.

## English verbosity: identify what is useful versus merely supported

Both variants selected the same three developments and combined the same fund sources. Main development coverage did not increase. Word counts include headline and body:

| Item | V4 | V6 | Added wording and assessment |
|---|---:|---:|---|
| METR access | 97 | 122 | Company hardware, highest access tier, voluntary arrangement and encouragement for competitors. Source-supported, but hardware and advocacy are usually optional for communicating the new independent-access arrangement. Access/publication rights and redaction limits are meaningful safeguards, not automatic filler. |
| Benefit fund | 129 | 138 | More wording about donations, founders/employees, company growth and governance. Much is present in the source; it does not establish another development. Proposed stake, approval requirement and discretionary growth mechanism matter; subsidiary form, political-giving restriction and governance timetable are optional depending on reader need. |
| Replit | 92 | 107 | Benchmark claim, historical top-five-customer status and repeated default/preferred-partner wording. These are mostly supported context, not another development. New default, continued Anthropic availability and attributed disagreement are the central change. |
| Total | 318 | 367 | +49 words (+15.4%), without another important development |

This is not a rule that longer is always worse or that every optional detail must be removed. The observed issue is redundant elaboration without demonstrated additional useful understanding. V4 also contains substantial optional detail; the conclusion is that V6 did not improve this case, not that V4 is already ideally distilled.

### METR source checks

Original source `an-update-on-independent-evaluators` explicitly states:

- Six METR staff received company hardware, office space and roughly equivalent internal access, subject to defined categories.
- METR will publish analysis; Anthropic cannot veto publication but can require defined redactions.
- The third access tier is the arrangement described for METR.
- Other partnerships involve SecureBio, Accenture and Faculty, at differing stages.
- The final sentence calls the arrangement voluntary and urges other frontier companies to do the same.

Therefore those additions are **supported but potentially unnecessary**, not hallucinations. V6 does not explicitly assert unlimited access, so the omission of every access exception is not by itself a confirmed factual error. Its main-access and publication-rights account remains supported. The industry encouragement sentence is company advocacy that can be omitted without losing the announcement.

## Factual checks: specific wording versus original evidence

| Wording | Original evidence | Assessment |
|---|---|---|
| **V6 headline:** “up to 5%” | Primary `public-benefit-fund`: “Subject to stockholder approval, 5% of Anthropic’s shares will be committed today” | Unsupported quantity formulation. A fixed 5% commitment conditional on approval is not a discretionary 0–5% range. V6's body correctly gives 5% and approval, but that does not make its different headline supported. Restore “5%” with the necessary condition. |
| **V4 body:** “about 20% ... are now dedicated” | Primary: “When combined with today’s announcement, roughly 20% of Anthropic shares will be dedicated to the public good”, following the approval-dependent 5% proposal | Unsupported present-completion strengthening. Prior pledges exist, but this source does not establish that the combined roughly 20% commitment is already completed. Preserve future/conditional framing. |
| **V6 body:** “roughly 20% ... will be dedicated” | Same future source wording | Better supported timing than V4. V6 also retains stockholder approval earlier in the item. |
| **V6:** additional 2% “to be added ... at the board's discretion” | Primary explicitly makes the escalator discretionary, tied to a 50% increase above a baseline | Supported when read as the whole qualified sentence; do not falsely flag “to be added” while ignoring the retained discretion. |
| **Both:** METR will publish risk assessments | Primary describes future publication of analysis of risk levels/incidents/practices | Supported; neither says results have already been published. |
| **Both:** OpenAI default, Anthropic still selectable | Replit article's later clarification and CEO quote | Supported; no complete termination/exclusivity claim in these final bodies. |
| **V6:** Masad says ChatGPT outperforms on “internal and public benchmarks” | CEO says “I think ChatGPT is better now”; article says internal benchmark assesses performance, followed by a public-benchmark comparison | Compressed attribution is broadly plausible, but exact results are more explicitly stated for the public comparison. Treat any objection to the combined benchmark scope as unresolved, not a proven fabricated result. It remains the CEO's account, not independent benchmark verification. |
| **Both:** reduction in Anthropic spending is expected | Article: “This shift could significantly reduce Replit’s spend ... since most customers stick with the default” | Still a prediction, not an accomplished saving. Consistent with the user's earlier equivalence judgment, this is not counted as a confirmed material error merely because “could” became “is expected to.” |
| **V6:** previously a top-five customer | Article attributes the prior top-five status to Masad onstage | Supported historical context, optional for the main change. |

Both English product verifiers returned ok for all three items. Thus the fund problems were in the editor outputs and were not challenged by verification; no English repair ran. The unsupported V6 headline was not introduced by parsing or repair. The V4 temporal strengthening likewise existed before verification. This shows specific missed checks in these samples, not a general verifier error rate.

## Independent-review limitations

The separate English evaluator's preference for V4 is not the basis of these source checks. Its alleged exact quotations failed the mechanical quote audit. The separate Arabic evaluator identified missing S13, but put its explanation in coverage without the required quoted finding. Neither a generic preference nor a structurally accepted JSON response is enough to establish semantic correctness. Source passages above provide the inspectable basis for this diagnosis.

## Reproduction and boundaries

`packages/briefing/test/v6-source-diagnosis.test.ts` replays the exact saved editor and verifier responses, verifies the exact input request objects, confirms S13 was visible but neither selected nor explained, and checks final output matches the three raw editor selections. It also preserves the fund quantity/timing counterexamples and the product verifier's all-ok responses. This is an offline retained-response replay, not a new quality evaluation or new model call.

Runtime prompts, parsers, accounting, reader history and deployed routing remain unchanged. No model can be assumed to have intentionally ranked an unaccounted source; future experiments should target this observed silent omission and verbose detail selection separately, rather than infer a parsing or merge bug that this trace does not show.

Validation: 142 briefing tests passed across 31 files; briefing TypeScript and `git diff --check` passed. The two new retained-evidence tests add no inference or runtime stage.
