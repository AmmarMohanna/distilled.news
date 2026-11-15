# Engine improvement pilot: no demonstrated overall advantage

Date: 2026-11-15. Branch: `research/engine-value`, isolated from `a2e111e2`. Authorization: **$5 pilot only**, not the proposed larger campaign. Preregistered plan: [PREREGISTRATION.md](../../engine-value/PREREGISTRATION.md). Previous measurements and reports remain unchanged.

## Answer to the research question

**This pilot does not establish that the improved engine offers a reproducible, meaningful overall quality advantage over a simpler single-LLM approach, or that its added complexity is worthwhile.** It establishes one narrow, source-inspectable correction: an exact recognized Arabic incident wire can preserve its original locality, strike count and district without guessing a Latin place name. The same correction works with a single-call baseline. The engine's extra model stages therefore cannot be credited for that correction.

Development-ledger and atomic-verification prompts did not consistently prevent the known place substitution. A source-spelling instruction alone also failed in the engine. No general candidate has met the preregistered coverage, factual non-inferiority and efficiency requirements. The research options remain experimental and disabled by default. Nothing was deployed or merged.

The pilot cost **$2.649593 in conservatively rounded settled ledger charges** ($2.6495796 provider-reported usage), with **zero new unresolved holds**. Remaining authorization was not spent merely to increase the number of development scores. A larger final comparison requires qualified independent data, a frozen selected candidate and separate financial approval.

## Protocol and actual sample

The plan was committed before engine edits (`5498a9c5`); the initial implementation and pilot were committed at `205132d2`. Thresholds were not relaxed after seeing results. The primary target is a >=10 percentage-point coverage advantage over the matched-budget single-call baseline, with an event-aware 95% interval excluding zero. Factual precision and citation targets are >=99%, with -1 point non-inferiority margins; any independently source-confirmed material factual substitution fails the absolute safety gate. Other gates cover relevance, repetition, language, cost and latency. See the preregistration for every margin and the power calculations.

Only **three previously exposed consecutive development windows** were used, all for the same Lebanon interest with English narration:

| Frozen case prefix | UTC window, 14 November | Eligible retained source rows |
|---|---|---:|
| `41de1d7a` | 19:55–20:25 | 22 |
| `5b5376c7` | 20:25–20:55 | 13 |
| `f9387f2b` | 20:55–21:25 | 8 |

These are **one chronological reader-history block**, not 42 independent experiments or 43 independent events. They contain headline/post evidence; `evidenceComplete=false` remains preserved. Recall is conditional on retained evidence and fallible source-only inventories, never exhaustive real-world news recall. The last window was quiet for this interest. Candidate arms and matched comparators used the same 110-word ceiling per window, without truncation. The original engine and existing unconstrained baselines retain their original policies and output lengths.

Each arm has its own chronological reader history, with a common cold start. All eligible frozen article text, source metadata, interest and reporting boundaries were retained. Existing source-only inventories were reused by exact request hash. Judge packets omit system identity and generator importance fields; opaque IDs and hash-ordered assessment tasks reduce order/identity cues. The judges can still infer differences from prose. GPT-4.1 and Claude Sonnet 4.5 are independent diagnostics, not adjudicated truth.

Across three development phases there were **42 generation opportunities**: 12 immutable historical outputs reused without new generation charges, plus 30 fresh generation attempts. **41 completed; one combined-policy generation failed.** There were **84 judge opportunities**, of which **82 were attempted, 70 completed and 12 failed validation**. Two assessments were unperformed because generation failed. Completion is 85.37% of attempted assessments, or 83.33% of all planned opportunities. Failed assessments were not converted to correct judgments or removed from the opportunity count.

| Phase | Arms × windows | Completed generation | GPT completed/attempted | Claude completed/attempted |
|---|---:|---:|---:|---:|
| v1: original, ledger, atomic, combined, existing evidence-v2, matched single, original single, all-headlines, keyword | 9 × 3 | 26/27 | 23/26 | 22/26 |
| v2: isolated combined, source-script engine, same-instruction single | 3 × 3 | 9/9 | 7/9 | 7/9 |
| v3: source-wire engine, same-guard single | 2 × 3 | 6/6 | 5/6 | 6/6 |

## Root causes and interventions

1. **Article exclusion accounting does not guarantee development coverage.** The editor selects and compresses in the same call. A valid source-level `left_out` record does not prove every potentially relevant development was considered. The experimental development ledger adds explicit proposed facts, selection/exclusion reasons and item bindings inside the existing editor call. It validates structure, not semantic completeness. In this pilot it dropped the Bar Elias fire headline and did not produce a coverage improvement.
2. **A categorical verifier approval is insufficient.** The experimental atomic policy requires indexed claim assessments and cited evidence bindings inside the existing verifier call. Contradiction/uncertainty overrides item-level approval. It still accepted the wrong locality in a real run; the judge may omit an atomic fact entirely. Requiring rows is not proof of exhaustive fact extraction or truth.
3. **Malformed item assessments could reject valid neighbors.** The first combined-policy run failed the whole first window after a missing atomic assessment. The revised experimental path carries the affected indexed item as unverified and preserves independently verified neighbors. Unknown indices and transport failures still fail closed. Real follow-up generation completed all three windows, but lost the fire item and again produced the wrong town. This repairs failure isolation, not factual reliability.
4. **Cross-script entity substitution is shared model error.** The source names `عيتا الجبل`; the original engine, mini verifier and GPT-4.1 source-only inventory accepted Aita al-Shaab. Claude's inventory identified Aita al-Jabal. The original source is decisive about the written town; model agreement cannot override it. Prompt-only instructions and additional claim rows did not reliably resolve this.
5. **Narrow source-derived rendering can remove that guessing step.** `sourceWirePolicy` recognizes only a complete affirmative Arabic correspondent/Israeli-airstrike/outskirts/town/district/southern-Lebanon sentence, with one current citation and a `new` relation. It renders the complete recognized tuple and preserves Arabic locality names. It does not infer casualties or dates. Other forms, corrections, extra clauses, uncertainty, negation and multi-source items are not rewritten. Before/after text and the original source are recorded. It runs before verification and again after repair. It is not a general entity verifier, contradiction resolver or multi-source synthesis mechanism.
6. **Quiet-window omission remains unresolved.** A zero-selection window still does not receive a new general source-extraction/omission stage in this candidate. No extra stage was justified by these development results. Correctly returning zero on one exposed quiet case cannot establish omission safety.

The original transaction, citation expansion, source-accounting, recovery and spending policies are preserved. Optional word-budget enforcement rejects an overrun with carry-forward records; it never cuts a factual sentence to meet the cap. Existing engine request-byte replay tests remain passing when research options are absent.

## Ablation evidence and adverse examples

- **Neither / original:** wrongly renders Aita al-Shaab; omits the source's explicit two-strike count and district from its short item.
- **Ledger only:** same wrong town; removes the Bar Elias fire headline. More private working text did not translate into better retained information.
- **Atomic only:** same wrong town despite explicit claim rows. A structural factuality contract did not prevent semantic mistranslation.
- **Both, first version:** correct Latin town on the adverse window, but first-window generation fails. A later combined run with isolation again substitutes the wrong town. One stochastic success is not a reliable fix.
- **Existing evidence-first-v2:** correct town and more retained items, but produces “New arrangements underway in southern Lebanon” from a vague headline saying the South faces new arrangements. That is a plausible status overstatement; it is preserved as an adverse example, not silently counted as a confirmed new development or repaired to improve the score. Two Al-Alwani items may also describe the same statement. No general win is established.
- **Original-script instruction:** the engine still writes Aita al-Shaab. The same-instruction single call writes Aita al-Jabal in that run. This does not establish prompt robustness in either system.
- **Source-derived guard:** both the engine and the one-call comparator render the correct original-script locality, two airstrikes, outskirts and Bint Jbeil district. The one-call comparator retains an additional qualified new-arrangements headline; its useful importance remains uncertain from the supplied evidence.

The source-wire option is retained as a narrow experimental correction. Ledger/atomic/source-script experiments remain available for reproducing rejected ablations; none is selected as a general improved product engine. No stage is promoted merely for scoring better on one judge.

## Quantitative comparisons

The accompanying [pilot-results.json](pilot-results.json) contains every arm's exact numerators, denominators, failures, uncertain claims/developments, completion counts, words, generation costs/tokens/latencies, paired differences and artifact hashes. Tables below show **completion-conditioned, judge-extracted** measurements. Failed reviews and unextracted facts have unknown accuracy; they cannot be assigned a factual denominator retrospectively.

### Final development ablation: identical guard in both systems

| Diagnostic judge | Arm | Reviews completed | Resolved factual support | Citation correctness | Important-development coverage | Uncertain claims |
|---|---|---:|---:|---:|---:|---:|
| GPT-4.1 | Wire engine | 3/3 | 3/3 | 3/3 | 3/4 | 0 |
| GPT-4.1 | Wire single | 2/3 | 2/2 | 2/2 | 2/3 | 0 in completed reviews |
| Claude | Wire engine | 3/3 | 17/17 | 17/17 | 3/10 | 0 |
| Claude | Wire single | 3/3 | 15/15 | 16/16 | 4/10 | 1 |

At matched evaluable windows, GPT's mean coverage difference is **0 points on one nonempty comparable window**; Claude's is **−10 points across two comparable nonempty windows**. Undefined quiet-window recall is not assigned 100%. These are descriptive differences within one exposed block, not independent effect estimates. No superiority or non-inferiority interval is scientifically defensible here. Different judges' claim counts (3 versus 17 for the same engine outputs) illustrate extraction dependence; pooling them as independent claims would be misleading.

Claude's judged important-development density is 3/61 × 100 = **4.92 per 100 words** for the guarded engine and 4/67 × 100 = **5.97** for the guarded single call. This is a fallible development-inventory measure, not independently certified essential-fact density. GPT's incomplete assessments do not support an equally complete density comparison. A separate independent essential-fact inventory was not completed.

Both guarded arms had no classified relevance, repetition or temporal errors in completed reviews. These are tiny resolved item sets, not proof of perfect performance. Language mostly abstained on short outputs and original-script proper nouns: GPT had **0/0** resolved language decisions for both guarded arms; Claude had **0/0** for engine and **1/1** for single. No English/Arabic/French compliance generalization is justified. The model checker and deterministic validator are preserved; legitimate proper nouns are not automatically wrong-language narration.

### Existing baseline context, first phase only

| Arm | Total words, 3 windows | GPT support; coverage | Claude support; coverage | Judge failures GPT/Claude |
|---|---:|---|---|---:|
| Original engine | 58 | 3/3; 3/4 | 0/1; 1/5 | 0/1 |
| Matched single | 77 | 3/3; 2/3 | 13/13; 2/5 | 1/1 |
| Original unconstrained single | 144 | 2/2; 2/3 | 16/16; 4/10 | 1/0 |
| All-headlines | 752 | 12/12; 4/4 | 28/28; 5/5 | 0/1 |
| Keyword | 48 | 5/5; 0/4 | 8/8; 0/10 | 0/0 |

These denominators differ because of review failure, unknowns and different source inventories. They must not be compared as if all outputs were independently adjudicated. GPT's original-engine 3/3 support is specifically contradicted by inspection of the source locality. Claude correctly rejects that claim, but its first-window review failed, leaving a highly selected 0/1 denominator. Neither proportion estimates true population accuracy.

All-headlines preserves raw source text and so achieves high conditional coverage at a much larger reading burden, with poor relevance (GPT 5/43; Claude 5/27 among completed reviews) and no requested-language summarization guarantee. Keyword retains five irrelevant English headlines and misses the relevant Arabic security wires (0/4 and 0/10 coverage; 0/5 relevance for both). Beating this particular weak bilingual keyword baseline is not evidence of an advantage over the strong single-call comparator. Original single-call coverage is higher than original engine under Claude, but failed reviews and related windows prevent a reliable ranking.

**No overall best system is established.** All-headlines has the largest observed conditional retained coverage and output length; the guarded single call has higher Claude coverage/density and lower generation cost/latency than the guarded engine; resolved factual/citation assessments tie in the guarded comparison. The known location correction is shared. General novelty, language and factual precision rankings remain unresolved.

## Judge disagreements and failures

Among both-completed outputs, first-phase GPT/Claude flags disagree on factual errors for **2/20**, citations **3/20** and coverage **4/20**. Second phase: factual **1/6**, citations **2/6**, coverage **1/6**. Final phase: factual **0/5**, citations **0/5**, coverage **1/5**. These are classification disagreements, not accuracy estimates; uncertain negative flags remain uncertain.

The 12 failed reviews include `MISSING_EVIDENCE_REQUIRES_UNCERTAIN` and `UNBOUND_REVIEW_FINDING`. They remain failures, not fabricated successful scores. Bounded consistency correction was reused where permitted; its original/corrected records and paid calls remain in the artifacts. No old ambiguous operation was resent. Coverage inventories include vague headlines, disputed relevance and a source-confirmed wrong place name in GPT's inventory. They are diagnostic references, not unambiguous reference labels. The completed 54-case evaluator benchmark was **not rerun**.

## Efficiency and financial accounting

| Arm | New generation cost, 3 windows | Mean generation seconds | Words |
|---|---:|---:|---:|
| Matched single v1 | $0.032442 | 2.999 | 77 |
| Ledger | $0.059774 | 9.019 | 45 |
| Atomic | $0.039504 | 4.826 | 58 |
| Combined, including failed generation | $0.041864 | 7.420 | 11 from 2 completed windows |
| Existing evidence-v2 | $0.048748 | 5.686 | 92 |
| Combined isolated | $0.043104 | 6.623 | 45 |
| Source-script engine | $0.039036 | 3.399 | 55 |
| Same-instruction single | $0.031746 | 2.397 | 57 |
| Wire engine | $0.031550 | 5.893 | 61 |
| Same-guard single | $0.023154 | 2.222 | 67 |

Final generation cost ratio is **1.36×** engine/single; mean latency ratio **2.65×**, incremental mean **3.67 seconds**. The latency-ratio gate is not met descriptively; empirical nearest-rank p95 is 10.703s versus 2.762s (each is the maximum of three observations). No stable population p95 inference is possible from three windows. Warm network state, provider variance and generation retries affect these measurements. Prior original outputs have historical latencies (original engine mean 13.595s; original single 3.080s); their new reuse cost is zero, not their historical generation cost. They are not used to claim a contemporaneous latency speedup.

Campaign totals: **154 settled HTTP operations**, **693,976 input tokens**, **90,151 output tokens**; new generation **$0.390922**, assessment **$2.258671**. Source-only inventories were cached, so their historical costs are excluded from new spend and end-to-end cost would be higher without cache reuse. Model responses, generation IDs, cost receipts, failures and source hashes remain private immutable artifacts. Ledger rounding adds $0.0000134 above provider-reported usage.

Account/key funding and provider prices were checked before inference. The same persisted $5 exposure ceiling was used across all phases, including reservations. Old holds remain separate: **$2.179596** from the earlier study and **$3.303565** from funded reliability-v3. Rechecking 31 available generation IDs returned 404; that is not evidence permitting release of a hold. The old ledger hash was unchanged. No UNKNOWN operation was replayed and no old hold was cleared.

## Broader data and final-study status

Free publisher discovery retained NASA English RSS (10 current entries), GOV.UK news API (100 listings), UN Arabic RSS (30 entries), and CNRS French newsroom pages. Detail responses include a GOV.UK savings-policy body, a UN Arabic Muscat forum story, and a CNRS plant-pathogen press article. These are candidate acquisition records, **not 80–120 qualified windows**. The prior larger retained archive is not available in this workspace. No production data were modified to obtain them.

A GOV.UK cold-alert article has later modifications than its original publication; UN page/RSS timestamps conflict; CNRS publication precision is day-level and its linked PDF was not collected. Publisher indices are not complete chronological event-group manifests. English/Arabic/French source availability does not certify independent multilingual evaluation. These records were not converted into a weakly certified final sample merely to produce more scores. Source bodies/URLs/retrieval metadata and hashes remain in the private acquisition namespace.

**Unperformed:** broad event-independent development/validation/final splits; a frozen independent held-out comparison; a powered six-system final experiment; Arabic/French generated-output trials; correction/contradiction/recurrence stratum certification; independent exhaustive essential-fact gold inventories; metric-level failure-aware bounds (completion counts are reported, but failed claim extraction has no known common claim denominator); factual precision/citation non-inferiority; reliable p95 latency inference. No exposed development case is labeled held-out. Power planning still requires about 71–126 independent coverage groups under the stated assumptions, and substantially more evidence for tight factual non-inferiority. The $5 pilot authorization does not authorize that study.

## Reproducibility and verification

Commands and replay rules are in [README.md](../../engine-value/README.md). [pilot-results.json](pilot-results.json) records hashes for the private financial, request, response and output artifacts. [source-snapshots.tar.gz](source-snapshots.tar.gz) contains only source code, not API secrets or retained news bodies: all **17 exact source snapshots** match their pre-request protocol hashes. v2/v3 code had not been committed before inference; snapshots were reconstructed from the narrow subsequent edits and accepted only when their hashes exactly matched the recorded protocols. This provenance limitation is explicit; the archived bytes are verified, not an invented pre-inference commit.

An offline audit verified all three original frozen inputs and source hashes for all 41 completed generations, including 12 historical reuses. Independent code review found missing pinned-input checks in follow-up runners; the checks and tests are now added. This prevents future changed evidence being reused under an old case ID; the retrospective hash audit found no change in the completed pilot. Current runners intentionally cannot overwrite an older immutable protocol with changed source hashes.

Local final verification: 68 evaluation Python tests, 2 pilot-analysis Python tests, 165 evaluation Vitest tests, 387 briefing-engine tests, 3 exporter tests, 14 research-analysis Python tests, and all four applicable TypeScript checks passed. Existing default engine replay and source-accounting tests passed. These are implementation checks, not real-world quality measurements. Remote CI status and final pushed commit are recorded separately in `VERIFICATION.md`.

The pilot supports further work on source-preserving entity rendering and better source-only reference adjudication. It does **not** justify adding more model stages or claiming that the current engine has earned its complexity premium. The main comparative research question remains open.