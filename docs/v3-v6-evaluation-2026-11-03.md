# V4 versus V6 — bounded live evaluation, November 3

## Decision

**Keep V4 selected. V6 remains available only as an opt-in experiment.** V6 did not demonstrate better distillation in this trial: Arabic Lebanon omitted a distinct expected development while using more words, and English AI expanded rather than distilled. Lower measured costs do not justify the observed recall loss. Nothing was deployed or persisted as a reader edition.

Four full local V3 runs completed using real retained evidence, normal editor/verifier/targeted-repair logic and native authoritative accounting. Ten pipeline calls plus two separate offline evaluation calls cost **$0.1163072**, with all 12 settlements independently read back, no holds and no uncertain outcomes. The 18-call/$2.50 approval was not exhausted; unused calls were not sent.

## Controlled setup

The two frozen cases were `lebanon-roundup-ar` and `ai-multisource-en`. Both variants saw identical original sources, prior reader memory, feed interests, evidence preparation, GPT-4.1 editor/repair and GPT-4.1 mini verifier routing. V4 used its exact legacy systems; V6 used the four supplied rewrite systems. This compares the complete prompt versions, not a single instruction change.

Each run allowed one repair/recheck round. There were no provider retries, new product stages, live source acquisition, notifications or deployment. Calls ran sequentially with temperature 0.1 and existing JSON/output caps. A local BOM parsing issue stopped before financial admission on the first launch; it was corrected without a provider request. Exact requests, responses, system prompts, token counts and timings are preserved in `benchmarks/editorial-distillation/v6-results-2026-11-03.json`.

The renewed approval was valid 12:17:27–14:17:00 UTC on November 3. Native authorization capped this dedicated evaluation account at $2.50, 18 operations, the three approved models and the two case IDs. Every operation reserved its conservative byte-token upper bound before inference. No tracking-only accounting, changed historical grant, released hold or quota increase was used. Reviewer spending is separate evaluation overhead, not recurring product cost.

## Results including verifier and repair

| Case/version | Selected items | Reader words | Pipeline calls | Actual pipeline cost | Generation wall time |
|---|---:|---:|---:|---:|---:|
| Arabic Lebanon V4 | 4 | 102 | 4 | $0.0151732 | 17.362 s |
| Arabic Lebanon V6 | 3 | 107 | 2 | $0.0096356 | 8.897 s |
| English AI V4 | 3 | 318 | 2 | $0.0156780 | 9.928 s |
| English AI V6 | 3 | 367 | 2 | $0.0137984 | 10.645 s |

V4 Lebanon required a repair and recheck; all other runs used the normal two-call path. V4 verification flagged an added Israeli attribution in the prospective-strike headline because that actor was not explicit in the attributed announcement; repair removed it and retained the story. V6 verification accepted its three selected items, but it never reviewed the omitted prospective-strike source. Fewer repairs therefore do not establish better verification.

English AI V6 latency was 7.22% higher; Arabic V6 was faster because it avoided repair. Provider-call sums excluding native accounting were respectively 8.180/4.422 seconds (Arabic V4/V6) and 5.848/6.270 seconds (English V4/V6). Generation wall time includes local engine/accounting overhead, not live acquisition, queueing or publication. One sample per condition cannot establish a p95, statistically reliable latency gain or recurring cost forecast. Caching effects remain part of observed cost.

Total pipeline cost was $0.0542852; two external AI-assisted reviews cost $0.062022. No production inference stage was added. Engine result `status: published` means items survived this local generation workflow; **no edition was written or delivered**.

## Editorial observations

All findings below are provisional AI-assisted source review, not human ground truth or independently corroborated real-world news.

### Arabic Lebanon: less coverage, no reading saving

V4 included EDL's nonpayer cutoff, the Qantara explosion, the Baraachit strike and the separate Upper Galilee Council announcement of prospective strikes. V6 included only the first three, ranking all as major. Its left_out list did not explicitly explain omission of that announcement. The benchmark expectation considers this a distinct important announcement; that importance judgment is provisional, but the omission itself is directly observable.

Original [post 107635](https://t.me/lebanonnews2/107635), source ID `d54d92e1-3175-4465-8f47-09031a4de464`, says: `المجلس الإقليمي للجليل الأعلى : سنشنّ غارات جوية على الجبهة اللبنانية خلال الساعات المقبلة`. This differs from the already-reported Baraachit strike. It was not supplied as merely another report of that earlier occurrence. The independent evaluator also preferred V4 because this development was missing in V6.

V6 did not save reader effort in exchange: 107 words versus V4's 102, despite one fewer story. It added routine absent-detail commentary: `لم ترد تفاصيل عن حجم الأضرار أو الإصابات حتى الآن` and `لم ترد معلومات عن الخسائر`. These are not necessary to express the selected developments. It also added `بحسب مصادر محلية` even though the frozen evidence establishes a Telegram-channel source, not independently identified local sources. Whether the attribution is materially misleading remains a source-grounding concern; the product verifier accepted it and the independent reviewer did not flag it.

Both versions combine the two Qantara reports into one item and keep Baraachit separate. No grouping gain was demonstrated. Both avoid replaying the old oil-price and drill stories. The quiet and meaningful-update reserved cases were not run, so no broader continuity claim follows.

### English AI: more elaboration, not better distillation

Both versions retain the same three developments: METR access, the benefit fund and Replit's default provider. Both combine primary and secondary fund coverage into one item and keep unrelated announcements separate. This is useful grouping already achieved by V4, not a demonstrated V6 improvement.

V6 expands from 318 to 367 words (+15.4%), including industry encouragement and access-tier background in the METR item and historical customer-ranking detail in Replit. Support does not automatically make these details necessary. The model continued writing source-by-source mini-articles rather than consistently extracting the minimum useful change.

V6's headline says `up to 5%` for the fund while the primary `public-benefit-fund` source specifies `Subject to stockholder approval, 5% of Anthropic's shares will be committed today`. A fixed percentage conditional on approval is not automatically an up-to range. V4 has its own issue: it says roughly 20% of shares `are now dedicated`, although the primary source says `When combined with today?s announcement, roughly 20% of Anthropic shares will be dedicated to the public good` and makes the 5% commitment subject to stockholder approval. V6's future/conditional framing improves that part. Both product verifiers returned ok. These are source-linked concerns that require further controlled evaluation, not clean factual approval of either output.

## Independent automated evaluator: results and limits

Claude Sonnet 4.5 received full original sources, prior reader memory, provisional expectations and anonymized final outputs, with no prompt-version names. A compact problem-only output instruction avoided the previous 4,000-token truncation; both responses completed within 2,000 tokens. Labels mapped to V4/V6 only after review. Both happened to place V4 first; no reversed-order control was run, so order bias remains unmeasured.

- **Lebanon:** preferred V4 for including all four expected developments; V6 missed the future-strike announcement. The response passed mechanical label/coverage/reference checks, but omitted the required quoted evidence for that missing-development judgment by placing it only in the coverage list. Thus mechanical audit success is not proof of complete evaluator-contract compliance or semantic truth. The exact source passage is documented above; do not describe the entire review as independently validated.
- **English AI:** preferred V4's tighter focus, but failed `SOURCE_QUOTE_NOT_FOUND`. It presented paraphrased/editor wording as exact source quotations for its wasted-reading findings. Those findings remain unvalidated; no partial quote was silently normalized or accepted. The runner stopped after recording the settled response. Both product outputs and the raw judgment are retained; no extra judge was called.

The evaluator also missed the potential fund headline/conditional problems noted above. An evaluator preference is evidence to inspect, not an authority to override source facts. This trial does not demonstrate human-validated quality improvement, general verifier accuracy or unseen-source transfer.

## Next action

Do not promote V6. Its lower observed cost is insufficient because the core objective—more important, new, supported understanding with less wasted reading—was not met in these cases. Preserve all versions and this negative result.

Before further paid trials, fix only the offline evaluation contract so every missing-development or material issue requires a valid quoted source span, including coverage-only omissions. Reuse saved outputs and validate the mechanical audit with counterexamples; do not rerun the editor just to repair evaluation formatting. Any future prompt candidate should address the specific observed recall/verbosity/qualification failures, one variable at a time, under fresh bounded authorization. No new runtime agents or verification stages are warranted.

The isolated k6/performance campaign is unchanged. Operational delivery results remain separate from these editorial findings.

Validation after recording results: 140 briefing tests passed across 30 files; briefing TypeScript passed; `git diff --check` passed. These regressions preserve measured outcomes and audit failures; they do not independently establish factual quality.
