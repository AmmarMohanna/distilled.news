"""Render the concise report from actual versioned aggregate measurements."""
import json
from pathlib import Path
R=Path('evaluation/briefing-quality/reports/reliability-v3');d=json.loads((R/'FUNDED_RESULTS.json').read_text(encoding='utf8'))
def pct(v):return 'unknown' if v is None else f'{100*v:.1f}%'
def ratio(v):return f"{v['numerator']}/{v['denominator']} ({pct(v['value'])})" if v['denominator'] else 'unknown (0 assessed)'
def table(headers,rows):return '| '+' | '.join(headers)+' |\n| '+' | '.join(['---']*len(headers))+' |\n'+''.join('| '+' | '.join(map(str,r))+' |\n' for r in rows)
f=d['financial'];bench=[]
for cohort in ['synthetic','real-source']:
 for model in ['gpt','claude']:
  b=d['benchmark'][cohort][model];c=b['combined'];bench.append([cohort,model,f"{b['completed']}/{b['attempted']}",f"{c['TP']}/{c['FP']}/{c['TN']}/{c['FN']}",f"{c['abstainedPositive']}+ / {c['abstainedNegative']}−",f"{c['failedPositive']}+ / {c['failedNegative']}−",f"{pct(c['precision'])} / {pct(c['recall'])} / {pct(c['F1'])}",f"{pct(c['failureAwareRecallBounds'][0])}–{pct(c['failureAwareRecallBounds'][1])}"])
generation=table(['System','Windows / items / words','Generation cost','Mean generation latency','Input / output tokens'],[[s,f"{g['windows']} / {g['items']} / {g['words']}",f"${g['costUsd']:.6f}",f"{g['meanLatencySeconds']:.2f} s",f"{g['inputTokens']} / {g['outputTokens']}"] for s,g in d['generation'].items()])
paired=[]
for model in ['gpt','claude']:
 for system,v in d['paired']['paired-compact'][model]['systems'].items():
  m=v['metrics'];paired.append([model,system,f"{v['completed']}/6",ratio(m['claimSupport']),ratio(m['citationCorrectness']),ratio(m['importantDevelopmentRecall']),ratio(m['sourceGroundedCoverage']),ratio(m['relevance']),ratio(m['repetition'])])
pairedtable=table(['Judge','System','Completed','Supported claims','Correct citations','Importance recall','All grounded developments','Relevant items','Repeated items'],paired)
raw=[]
for c in ['synthetic','real-source']:
 for m in ['gpt','claude']:
  b=d['benchmark'][c][m];v=b['judgeOnly'];raw.append([c,m,f"{v['TP']}/{v['FP']}/{v['TN']}/{v['FN']}",pct(v['precision']),pct(v['recall']),pct(v['F1']),f"${b['costUsd']:.6f}",f"{b['meanLatencySeconds']:.1f} / {b['maxLatencySeconds']:.1f} s"])
rawtable=table(['Set','Judge','TP/FP/TN/FN','Precision','Recall','F1','Cost','Mean / max latency'],raw)
disagreement={c:{'anyCategory':len(d['benchmark'][c]['disagreements']),'overall':sum(r['overall'][0]!=r['overall'][1] for r in d['benchmark'][c]['disagreements'])} for c in ['synthetic','real-source']}
text=f'''# Funded automated evaluation research — final findings

The evaluator is useful for triage, but it is not a reliable quality certificate. The current Distilled.news engine demonstrated brevity and relevance advantages in this small retained-input replay; it did **not** demonstrate overall superiority over the baselines. A real source-relative town-name error was missed by GPT and caught by Claude. No production deployment was made.

## What actually ran

Starting point: `research/evaluator-reliability`, `f9a7a515`. Models: `openai/gpt-4.1`, independent-family `anthropic/claude-sonnet-4.5`; engine verifier `openai/gpt-4.1-mini`. Exact resolved identifiers, generation IDs, token usage, request hashes, timestamps and rounded settlement costs are in [PAID_OPERATIONS.json](PAID_OPERATIONS.json). Full raw requests, original/corrected replies and source evidence remain in the ignored private archive; [ARTIFACT_HASHES.json](ARTIFACT_HASHES.json) commits their hashes. Public aggregates do not replace that evidence.

- Six targeted assessments first (three cases × two judges), followed by the nine separately paid prepared corrections, **all with verified prior SETTLED operations**. Seven corrections succeeded, two remained `UNBOUND_REVIEW_FINDING`; cost **${d['preparedCorrections']['costUsd']:.6f}**. All eight pre-existing structured concerns in the successful corrected cases remained; none was cleared. Original/raw correction responses and original paid ledgers are retained. This is a structural concern-preservation check, not independent proof of every claim meaning; unbound narrative findings are not themselves concern keys.
- **24 generated outputs:** six recovered frozen real production inputs × four systems. Same 52 article occurrences, English feed interests, exact article bodies/IDs/publication metadata and window boundaries. Original engine prompt v4, source-accounting, citation coverage, novelty, failure-isolation and frozen model options are preserved. This replays the actual current V3 generation core; it does not measure scheduler, delivery, or new published editions.
- **48 original-protocol paired assessments**, then **48 separately frozen compact-schema assessments** of all the same outputs, both judges. Original Claude strict schemas were refused in 12/24 assessments because the compiled grammar was too large. The original failures and holds remain. The compact transport factors source/passage alternatives into enums while the **same local exact source/passage and review validators** remain authoritative. It is an additional protocol experiment, not a retry or overwrite of UNKNOWN operations. GPT completed 20/24 and Claude 21/24 in this experiment; remaining validation failures are preserved.
- **108 fresh benchmark assessments:** 42 synthetic + 12 retained-source controls/mutations × two judges. Exact source/reference hashes matched the existing r2 audit. No original benchmark results were overwritten. These are exposed development cases, not untouched tests.
- **12 valid UTF-8 diagnostics:** multilingual attributed quotations in English/Arabic/French, name-only and short-headline uncertainty, and unavailable evidence, each judged independently by both models. Both accepted all three legitimate quotation controls; both abstained on name-only language and the short French headline; both marked the missing-evidence assertion uncertain. An earlier 12-assessment extra diagnostic version had shell-corrupted Unicode and is explicitly **invalid-input**, preserved with its ${f['byCohort']['diagnostics']['costUsd']:.6f} cost; it is not counted as valid language validation.

Source/reference and initial protocol hashes were frozen before the funded calls. The compact transport and UTF-8 repair have separate dated artifacts frozen before their respective experiments. No evaluator threshold or deployed behavior was tuned to maximize these scores. Generative calls ran at temperature 0.1 with no transport retries; judgments use the existing evaluator defaults. At most two inference requests ran concurrently. The campaign budget covered confirmed costs plus unknown reservations.

## Fault detection: completed scores and unresolved outcomes

There are 21 faults + 21 valid paraphrase controls in seven synthetic event groups; the real-source set has six faults + six controls but only **two independent underlying events**, translated three ways. Labels are determined relative to source evidence, not the judge under test. They are source-audited AI-curated references, not human gold. Valid controls do not establish exhaustive importance coverage: control coverage labels remain unknown. Wrong explicit dates may count as factual or temporal for broad detection; strict per-category results retain the ambiguity.

Raw judge outputs, after the one bounded consistency correction but before independent language combination, give these **completion-conditioned** scores:

{rawtable}
GPT has one completed false negative: a French briefing requested in English. Claude has one synthetic false positive on a valid Arabic grant paraphrase and one real-source citation false positive on a valid EDL paraphrase. GPT's two fresh synthetic failures were a transport failure and an inconsistent repetition assessment; the raw response of a failed evaluation is not promoted to a completed score.

The combined candidate preserves independent-language uncertainty. It must not be advertised using only its decisive cases:

{table(['Set','Judge','Completed','TP/FP/TN/FN, decisive','Abstained (+fault / −control)','Failed (+ / −)','Decisive precision / recall / F1','Full-set recall bounds'],bench)}
Bounds retain all known positive cases; their upper endpoint treats unresolved positives as potentially detected, not as successful assessments. The apparent 100% decisive recall is **not** 100% end-to-end recall. The independent checker flags two language swaps but abstains on the third; it also abstains on legitimate short/ambiguous controls. It therefore improves GPT's treatment of uncertainty while reducing the decisive coverage of Claude's otherwise correct language finding. Deployment is not justified by these measurements alone.

The models differed on at least one category/status in **{disagreement['synthetic']['anyCategory']}/42 synthetic** and **{disagreement['real-source']['anyCategory']}/12 real-source** cases; broad fault decisions/status differed in {disagreement['synthetic']['overall']}/42 and {disagreement['real-source']['overall']}/12. Their full disagreements, category TP/FP/TN/FN, precision/recall/F1, language strata, failures, abstentions, and event-group descriptive bootstrap intervals are in [FUNDED_RESULTS.json](FUNDED_RESULTS.json) and [BENCHMARK_TABLES.md](BENCHMARK_TABLES.md). Seven and two event groups are far too few to establish production error rates; a degenerate two-group interval is not certainty.

## Current engine versus simpler baselines

All systems start from a common declared cold reader state, then maintain **their own** chronological history across the six windows. No system sees another system's output history or the original published history. The single-LLM comparator is the existing one-call editor baseline (prompt v3, no engine verifier/accounting); all-headlines and keyword use the unchanged existing extractive baseline implementation. Their original-language headlines are not silently translated for the English target. Full frozen engine options belong to the engine arm, not artificially added to the simple baselines. The existing single-LLM adapter omits the engine-specific feed style and requires nonempty bodies, while the engine can return headline-only items. Word differences describe these implemented systems, not an isolated compression algorithm advantage.

Each judge creates one source-only, candidate/history-blind grounded inventory per window, shared across all four systems. The candidate output is opaque with no system name in the judge packet. All four arms use the same frozen assessment policy and 12,000-token judge allowance. Reference novelty is evaluated against each arm's own history.

{generation}
The engine produced **90 words**, versus single-LLM **188**, all-headlines **737**, and keyword **94**. It was 52.1% shorter than single-LLM, but cost about 39.5% more to generate and had higher observed mean generation latency. Extractive baselines win generation cost and latency. These are six local sequential offline measurements, not production latency estimates or statistically independent timing trials.

The compact-schema diagnostic gives the following **pooled completed-assessment observations**. Different completion subsets and different claim inventories make these unsuitable for direct ranking; exact matched-window differences follow below and in the JSON.

{pairedtable}
Lower repetition is better. Unknown claims/developments and excluded uncertain language assessments remain separately counted. Importance recall is explicitly **model-assessed**, while all grounded-development coverage includes all supported inventory developments; neither proves exhaustive real-world news recall. Citation correctness checks support of extracted claims, not whether every corroborating publisher was credited. All-supporting-source attribution completeness was not independently certified.

**Fair paired findings:**

- GPT found equal support/citation correctness for engine versus single-LLM on only **two matched nonempty assessed windows**; equal importance recall on **three** paired evaluable windows. This is no demonstrated quality advantage.
- Claude's engine-minus-single-LLM mean support and citation differences were **−50 percentage points over two paired evaluable windows**; importance recall was **−10 points over two**. This is driven by a specific error, not a generalizable model ranking.
- Against all-headlines, engine-minus-baseline relevance was **+86.2 points (GPT, n=2)** and **+61.5 points (Claude, n=1)**. Importance recall favored all-headlines by **8.3 points (GPT, n=3)** and **80 points (Claude, n=1)**. Tiny, related, completed subsets prevent population claims.
- Against keyword, importance recall favored the engine by **60.4 points (GPT, n=4)** and **35 points (Claude, n=2)**; relevance also favored engine. Keyword remains fastest/cheapest but misses much judged important material.
- Temporal correctness and repetition show no persuasive engine advantage in the small matched subsets. Independent language validation abstained on every engine item in the completed paired subset, so combined language compliance is **unestablished**, despite the model language assessments generally accepting English narration. Raw extractive Arabic headlines often fail the English requirement.

**Auditable adverse example:** engine item `49ada50e970e293ff5f1c223` says **Aita al-Shaab**. Its cited source `cae9e385-1114-4f65-99b7-78f2e45bda49` says **عيتا الجبل / Aita al-Jabal**. The full cited text is retained, with its original [source URL](https://x.com/i/status/2121700772857463251). GPT accepted the claim; Claude flagged the location contradiction. Claude's accompanying assertion that the item had “no citations” was itself inaccurate—the supplied citation exists, although it does not support the substituted place name. Both the engine error and the judge's explanation error remain in the record.

The compact experiment still failed 7/48 assessments (GPT 4, Claude 3), including unbound findings, missing item judgments, unsupported citation assertions and violations of uncertainty requirements. Original-protocol completion was GPT 21/24 and Claude 11/24. No failed result is replaced in its original cohort or excluded without its denominator. Judge-specific per-window differences, min/max observed differences and all disagreement records remain available. Six related windows from one feed cannot support a meaningful confirmatory significance test.

## Cost, unresolved work and verdict

Provider-reported confirmed funded cost: **${f['providerReportedConfirmedUsd']:.8f}**; rounded-up micro-dollar settlement ledger: **${f['newConfirmedUsd']:.6f}**. There were **{f['operations']} HTTP inference operations**, {f['settled']} settled and {f['unknown']} unknown, with **{f['inputTokens']:,} input / {f['outputTokens']:,} output tokens** on settled receipts. New conservative unresolved holds: **${f['newHeldUsd']:.6f}**. New maximum accounted exposure **${f['newExposureUsd']:.6f}**, below the **$20** ceiling. Holds are not confirmed charges.

Prior confirmed study cost remains **$2.647022**; prior unresolved holds remain **$2.179596**. Read-only lookups of all 19 recorded old generation IDs and 12 new grammar-rejection IDs returned 404. This does not prove zero cost, so no hold was erased and no UNKNOWN operation resent. One fresh transport failure has no recoverable provider ID. Detailed cohort costs, shared evaluator overhead, original/corrected responses and generation costs are kept separate; shared inventory costs are not unfairly assigned as a system's generation expense.

No independent held-out experiment ran: the retained roster had no certified complete, event-independent untouched windows. A new read-only Cloudflare roster attempt failed **HTTP 401**. Previously exposed windows were not relabeled untouched; newly available windows therefore remain unverified, not claimed absent.

Local final checks and CI details are in [CI_INVESTIGATION.md](CI_INVESTIGATION.md). No staging/production resource, publishing path, dashboard, monitoring deployment or main merge was changed. The candidate remains offline.

**Verdict:** validated evidence supports cautious automated triage and dimensional comparisons, not evaluator reliability certification or overall current-engine superiority. Claude completed more fault assessments and detected the real town-name error; GPT had fewer false positives on these controls. The engine is concise and more relevant than unfiltered/keyword output in the small comparable sample. Single-LLM is cheaper and competitive; all-headlines can recover more judged developments at substantial verbosity and language cost. Broader factual precision, exhaustive recall, independent held-out generalization, and production-scale quality remain inconclusive.

## Reproduction

Install the existing pinned validation dependency, then run the following from the research worktree. The private qualified inputs/retained provider artifacts are required. Running the paid commands in the existing campaign reuses completed exact results and fences UNKNOWN operations; a fresh campaign must have a new explicit version and budget, never delete ledgers to obtain retries.

```powershell
npm ci --prefix evaluation/briefing-quality/validation --ignore-scripts --no-audit --no-fund
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/validation/funded-run.ts targeted
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/validation/funded-run.ts paired
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/validation/funded-run.ts benchmark
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/validation/funded-run.ts paired-compact
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/validation/funded-run.ts diagnostics-r2
python -X utf8 evaluation/briefing-quality/validation/funded_analysis.py
python -X utf8 evaluation/briefing-quality/validation/funded_report.py
python evaluation/briefing-quality/continuous.py
python -m unittest discover -s evaluation/briefing-quality/validation -p 'test_*.py'
```

Original protocol SHA-256: `{d['protocolHash']}`. Exact frozen sources, controls, reference audit, generated packets, shared inventories, request/response artifacts and corrected diagnostic hashes are indexed in the artifact manifest. The original v1 and unfunded v2 measurements remain intact and separate.
'''
(R/'RESEARCH_REPORT.md').write_text(text,encoding='utf8')
tables=['# Detailed fault-detection tables\n\nUnknown references are masked. Failed and uncertain judgments remain explicit; translations share event groups. P/R/F1 are conditional on completed decisive judgments.\n']
for cohort in ['synthetic','real-source']:
 for model in ['gpt','claude']:
  b=d['benchmark'][cohort][model];tables.append(f'\n## {cohort}: {model}\n\n')
  for title,rows in [('Category',b['categories']),('Requested language',b['languages'])]:
   tables.append(table([title,'N','TP','FP','TN','FN','Failed +/−','Abstained +/−','Precision','Recall','F1'],[[name,v['total'],v['TP'],v['FP'],v['TN'],v['FN'],f"{v['failedPositive']}/{v['failedNegative']}",f"{v['abstainedPositive']}/{v['abstainedNegative']}",pct(v['precision']),pct(v['recall']),pct(v['F1'])] for name,v in rows.items()])+'\n')
(R/'BENCHMARK_TABLES.md').write_text(''.join(tables),encoding='utf8')
print('Rendered funded report and full category/language tables.')
