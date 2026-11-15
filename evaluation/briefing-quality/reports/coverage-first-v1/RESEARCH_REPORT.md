# Independent extraction pilot: advantage not demonstrated

16 November 2026, Beirut. Branch `research/coverage-first`, base `e917e154`. Frozen candidate/protocol commit `dbccaf84`; later parser/script fixes are explicitly post-freeze. Earlier negative reports remain valid. No deployment, merge, published-news change, dashboard change or production-resource write.

**Verdict:** independent extraction plus deterministic coverage-aware selection protects the statements it selects from subsequent compression, but this pilot does **not** demonstrate the preregistered meaningful advantage over the strong single-generation baseline. The frozen controlled comparison ties on paired completed GPT/Claude coverage diagnostics, is below the baseline on the prespecified literal-facet proxy, and has worse quiet-window reliability. A later parser correction recovers valid real-document outputs from the same paid completions; its independent diagnostic validation remains incomplete. Additional complexity has not earned a demonstrated overall quality premium.

## Architecture and safeguards

The actual briefing core now has an opt-in `coverage-first-v1` route:

1. GPT-4.1 sees every eligible original passage, exact source/passage IDs, metadata, interests and prior reader text. It extracts atomic reader-ready statements and accounts for passages **before** budget selection. It sees no candidate briefing or reader word quota.
2. GPT-4.1-mini independently checks original evidence, factual support, relevance, novelty, prior targets, equivalence and inventory coverage. Generator novelty/importance labels are withheld from this checker. Current evidence identities are resolved through existing immutable evidence tools. Unsupported/uncertain entries remain held; model approval is not a truth certificate.
3. A deterministic knapsack selects whole validated statements within 110 Unicode-counted words. Its lexicographic objective is important-development count, lead count, minor count, then evidence-quality tie-breaking. Each exclusion has a reason; budget exclusions carry forward. Equivalent same-occurrence facts may union citations; different occurrences are not silently merged.
4. Reader text is exactly the validated selected statement. There is no subsequent compression or repair model that can delete its qualifications. Source-bound proof records and selection decisions remain auditable.

**Strong baseline:** one GPT-4.1 editorial generation, receiving the identical passages/metadata, interests, requested language, fixed prior history and 110-word cap, followed by the **same mini-model factual/novelty safeguard**. It sees no candidate extraction inventory. Both receive the same source-script preservation rule and narrow source-wire correction. Thus both have **two model calls per controlled window**; “single” means one editorial generation plus the common safeguard, not a claim that its verification is free. Original V3/V4 is retained as an ablation with its original source-accounting/novelty policies and the common experimental word ceiling. Defaults and deployed routes remain unchanged.

## Diagnosis: demonstrated errors versus uncertain findings

The retained historical Aita source explicitly names `عيتا الجبل`; the previous engine, verifier and GPT inventory accepted Aita al-Shaab. That is a source-confirmed locality substitution. Its concise output also lost the explicit two-strike count and district. A ledger-only pilot dropped the Bar Elias fire headline, although whether that thin headline was important enough to publish remains uncertain. The “new arrangements” headline does not independently establish an important completed development. Previously observed Al-Alwani splitting/duplication is suspicious, not a confirmed distinct-event merge error from the available evidence.

No new source-confirmed historical example was established for every requested failure class, particularly new facts suppressed as old or budget-caused omissions: the old retained windows are incomplete and previously exposed. Controlled sequences separately exercise those mechanisms. Development caught a reopening mislabeled `new`; withholding generator novelty labels from the common checker corrected it for both systems. It also caught mixed-source passage references being incorrectly rejected as noncontiguous and an omitted sports-passage audit blocking verified neighbors. Host fixes preserve separate original-source proofs and isolate unaccounted evidence.

A real-document adverse example remains important: the strong baseline explicitly groups Tesco with firms joining the National Coalition of Workplace Savings. The source says Tesco is “working closely with the Coalition” and launched a scheme; it does not explicitly establish membership. Claude flags the stronger membership claim, while GPT/mini approve it. The candidate extractor keeps those roles separate, but the frozen candidate publishes nothing because of a parser failure. This is not a demonstrated publication-quality win for the candidate.

## Frozen dataset and conditions

[Cases and source-derived references](../../coverage-first/cases.json) were committed before final generation. One fictional sequence (three windows) is development; **four different fictional event sequences, three windows each, are final controls**. They contain bridge closures/reopenings, conditional grants, a reversal of an earlier grant announcement, a 12-to-7 pump correction, separate same-topic incidents, school/ferry changes and unchanged repeats. Evidence mixes English/Arabic; two final groups request English and two Arabic. All systems receive identical frozen prior-reader contexts. Word counts are not equivalent reading effort across languages; the paired comparison stays within each window. This is a state-conditional test, not a closed-loop reader simulation.

There are **40 prespecified important current developments**, eight active windows and four quiet windows. Each event chain stays in one split. The four chains share **one construction template family**; they are not a broad natural-news sample. All required facts can fit the word cap, so this does not establish a benefit under genuinely binding high-volume compression. The budget optimizer's binding-budget behavior is tested offline, not demonstrated as a population advantage here.

Three separate real publisher panels cover UK workplace savings, the UN Arabic Muscat forum and French CNRS potato-pathogen research. [Qualification metadata](natural-qualification.json) records original titles/URLs, hashes and text boundaries. These are complete declared current-document text panels, with linked PDFs/images excluded; they are **not untouched historical feed windows**. Prior source inspection, publication precision, UN intraday timestamp conflict and unavailable historical feed completeness prevent that certification. They are reported separately from constructed controls.

## Frozen controlled results

| System | Executions completed | Recognized current-development facets / 40 | Total words | Legitimate quiet results / 4 | New generation cost | Mean / empirical p95 latency |
|---|---:|---:|---:|---:|---:|---:|
| Original core | 12/12 | 22/40 | 346 | 4/4 | $0.111820 | 3.700 / 6.338 s |
| Independent extraction | 12/12 | 36/40 | 508 | 1/4 | $0.152654 | 9.408 / 12.729 s |
| Strong single generation + common safeguard | 12/12 | 38/40 | 450 | 4/4 | $0.078300 | 4.902 / 7.426 s |

Execution completion is not publication success: candidate statuses are eight published, one empty and **three rejected quiet windows**. Missing passage accounting and an invalid grounding `support:already_reported` enum caused those rejections. No quiet-window repeated item was delivered by any system. Unrecognized names/paraphrases and missing qualifications make the facet counts imperfect proxies: the original core's transliterated names are particularly underrecognized. They are **not certified factual accuracy or complete semantic development recall**.

The prespecified paired proxy difference is **−5 percentage points**, with a 10,000-draw equal-event-group bootstrap interval **[−15, 0] points**, seed 20261115. This resamples four fictional chains within one template family and does not estimate real-news population performance. A post-freeze stricter sensitivity checker yields 22/40, 34/40 and 38/40 respectively; it is not substituted for the frozen metric. The original checker can accept a proposal that incorrectly also says approved, and can miss legitimate paraphrases. Neither version validates all semantic qualifications. Independent essential-fact density is therefore **not established**. The frozen facet-density proxy is 7.09 versus 8.44 matches per 100 words for candidate versus strong baseline.

### Independent model diagnostics, completion-conditioned

| Judge | System | Completed / attempted | Resolved supported claims | Citation correctness | Model-important coverage |
|---|---|---:|---:|---:|---:|
| GPT-4.1 | Original | 11/12 | 29/29 | 29/29 | 29/55 |
| GPT-4.1 | Extraction | 10/12 | 30/30 | 30/30 | 29/44 |
| GPT-4.1 | Strong single | 9/12 | 25/25 | 25/25 | 25/44 |
| Claude Sonnet 4.5 | Original | 11/12 | 61/61 | 59/59 | 29/35 |
| Claude Sonnet 4.5 | Extraction | 11/12 | 84/84 | 83/84 | 35/40 |
| Claude Sonnet 4.5 | Strong single | 12/12 | 85/86 | 84/86 | 40/40 |

Do not compare these pooled denominators as paired effects. On matching completed/defined cases, the **mean model-important coverage difference is zero for GPT (8 pairs) and Claude (7 pairs)**. Paired Claude factual/citation differences favor the candidate by about 1.10/1.34 points over seven pairs, but include fallible judgments and cannot establish factual non-inferiority. GPT ties over five factual/citation pairs. Both-completed output flags disagree on coverage for **15/29**, factual support **1/29**, and citations **1/29**; seven output pairs lack two completed assessments.

Source inspection identifies doubtful judge findings: “temporarily” for a closure pending inspection is a plausible legitimate paraphrase, and a current correction explicitly containing the old number can support a reference to that number. Those raw flags remain preserved rather than being automatically adjudicated away. Claim extraction granularity differs sharply between models. Agreement and 100% resolved support are not ground truth. All failed reviews remain counted.

Completed diagnostics classified no relevance, repetition or temporal errors, but this is a small conditional set. Language has many abstentions: candidate GPT 13/13 resolved, Claude 18/18; baseline GPT 8/8, Claude 16/16. Remaining short/proper-name items are not proven compliant. No >=99% language or factual precision guarantee follows. Citation/all-support-source facet matches are 36/36 recognized candidate facts and 37/38 baseline facts; this does not certify global citation completeness.

## Natural panels and post-freeze corrections

After safe recovery, original and strong baseline publish on all three panels. The **frozen candidate publishes only CNRS** and rejects GOV.UK/UN. In both rejected cases the grounder explicitly says coverage is complete but omits the redundant `missing:[]` field; the parser rejects the entire otherwise supported inventory. Candidate pooled model-important coverage is GPT **2/10**, Claude **2/12**, with three completed reviews each. Original GPT is **5/5** on two completed panels (one failed), Claude **9/12** on three. Baseline GPT is **10/10** on three, Claude **9/10** on two (one truncated/refused review). These are separate descriptive document diagnostics with differing completions, not a held-out advantage estimate.

Two local research-ledger lock interruptions occurred because the researcher overlapped runners. Work then proceeded serially with a busy timeout. One generation reused its already settled exact response; the other had no dispatched record. Neither replayed an UNKNOWN operation. Both original failures remain in the record. Two stranded reservations with saved, hash-correlated 200/usage receipts were settled for **$0.076716**; original HTTP/result artifacts remain unchanged.

Post-freeze changes on this branch add a common script-compatibility guard and accept an omitted empty missing-list **only when an explicit complete coverage verdict and reason exist**. Unknown/absent coverage and invalid support enums remain failures. Full English/French language discrimination still depends on the independent diagnostic and is not a publication guarantee.

Exact-request offline replay used the original **settled real model completions**, with zero new inference. All **24 controlled candidate/baseline outputs remain unchanged**; no published output triggers the new script guard. GOV.UK recovers four statements and UN three. These are development replays of exposed cases, not replacement final results. All changed outputs were submitted for additional diagnostics within the same cap: **one of four assessment attempts completed** (GPT GOV.UK: 4/4 supported claims, 4/4 citations, 3/3 important inventory developments). Claude GOV.UK failed `COVERAGE_WITHOUT_ITEM`; GPT UN failed `UNBOUND_REVIEW_FINDING`; Claude UN was blocked **before a provider request** by the conservative campaign ceiling. Fresh independent validation of the corrected candidate remains incomplete.

## Success gates and interpretation

The >=10-point primary improvement and positive event-aware interval are **not met**. A general semantic retention advantage, factual/citation/language non-inferiority, independently verified essential-fact density and broad chronological generalization remain unestablished. The controlled candidate's observed generation cost ratio is **1.95×**, mean latency ratio **1.92×**, p95 ratio **1.71×**, mean increment **4.51 s**; these narrowly meet the efficiency ceilings descriptively, but have no demonstrated primary benefit to justify the premium. Provider/order variability and tiny samples preclude stable production latency conclusions.

The mechanism guarantees that selected validated text is not compressed afterward; it cannot guarantee that extraction found every important fact, the checker was correct, or ranking matched reader value. The strong baseline already handles these small source sets effectively. Remaining bottlenecks are source-inventory completeness, model interpretation/novelty errors, verbose atomic units, fragile structured responses, and evaluation/reference uncertainty. High-volume independent event sequences and a fresh frozen corrected candidate have **not** been tested. No population-wide superiority or universal inferiority is claimed.

## Financial and execution record

New authorization: **$5 total exposure**, including new unknown reservations. Final rounded settled charges: **$4.387300** (provider usage **$4.3872692**); unresolved conservative holds **$0.420084**; exposure **$4.807384**. The six holds are the first development JSON-mode HTTP400 failures without authoritative usage receipts; they are not confirmed charges and were not cleared or replayed. Old study holds of $2.179596 and $3.303565 remain separate and unchanged; 31 receipt lookups returned 404, which does not authorize releasing them.

There are **341 provider operations: 335 settled, six UNKNOWN**, zero RESERVED. Generation cost is **$0.533942**, evaluation **$3.853358**, with **996,936 input / 215,681 output tokens** in settled operations. Development reused exact settled responses where safe; it did not charge them again. There were **71 generation executions**, 63 completed and eight failed (six initial format errors, two lock interruptions); some executions replay already paid stages. There were **130 assessment attempts**, 113 completed and 17 failed, including one pre-provider ceiling rejection. Sixteen additional assessment opportunities were unperformed after generation failure. No failed assessment is assigned a correct score. The completed 54-case evaluator benchmark was not rerun.

[results.json](results.json) contains each phase, every failure/unknown, exact paired denominators, costs/tokens/latencies and private artifact hashes. [source-snapshots.tar.gz](source-snapshots.tar.gz) preserves exact source bytes for each paid protocol; private source bodies/requests/responses are retained locally. Public data are insufficient for end-to-end reproduction without authorized private publisher artifacts. The fictional cases are public.

Reproduce offline (no credentials/model requests):

```powershell
python evaluation/briefing-quality/coverage-first/analyze.py
python -m unittest discover -s evaluation/briefing-quality/coverage-first -p 'test_*.py'
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/coverage-first/replay-postfix.ts
python evaluation/briefing-quality/continuous.py --output evaluation/briefing-quality/private/coverage-v1/verification
```

Do not rerun paid scripts as implicit authorization, change the persisted ceiling/root, overwrite immutable protocols, or resend an ambiguous request. Exact private evidence and dependencies are required for offline replay. Original and corrected output records are separate.

Local verification passed **661 tests and five applicable TypeScript checks**. Independent code review identified the language gap and weak facet oracle; both are disclosed, the script guard is added, and the frozen oracle is preserved separately from sensitivity changes. Remote CI status belongs to the final pushed SHA and is reported in the final response; local passing checks do not imply all broader inherited Project checks are green.