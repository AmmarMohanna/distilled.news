"""Report executed experiments and their missingness, without promoting tests to scores."""
import hashlib,json,sqlite3,statistics
from collections import Counter
from pathlib import Path
from analyze import analyze,ratio,percentile
ROOT=Path('evaluation/briefing-quality/private/reliability-v1')
OUT=Path('evaluation/briefing-quality/reports/reliability-v1')
def load(p):
 p=Path(p)
 if len(str(p.resolve()))>240:p=Path('\\\\?\\'+str(p.resolve()))
 return json.loads(p.read_text(encoding='utf-8'))
def results(run):return [load(p) for p in (ROOT/run).glob('*/*/result.private.json')]
def score(r,key):return r.get('metrics',{}).get(key,{}).get('value')
METRICS=['claimSupport','citationCorrectness','importantDevelopmentRecall','repetition','relevance','temporalCorrectness','languageCorrectness']
def summarize(rows):
 complete=[r for r in rows if r.get('status')=='completed' or 'review' in r];m={}
 for key in METRICS:
  values=[r.get('metrics',{}).get(key,{}) for r in complete];n=sum(v.get('numerator',0) for v in values);d=sum(v.get('denominator',0) for v in values);m[key]={'numerator':n,'denominator':d,'value':ratio(n,d)}
 return {'available':len(complete),'failed':len(rows)-len(complete),'metrics':m,'failures':[{'id':r['id'],'phase':r.get('phase'),'error':r.get('error')} for r in rows if r.get('status')=='failed']}
def paired(cohort):
 base=ROOT/(cohort+'-paired');mapping={};observations=[]
 for p in base.glob('*/*/output.private.json'):
  v=load(p);mapping[v['id']]=v
 corrected=load(ROOT/'bridge-corrected/audit.json')['rows']
 for row in corrected:
  if row['cohort']!=cohort:continue
  c=load(ROOT/'bridge-corrected'/cohort/row['system']/(row['id']+'.json'));old=mapping.get(row['id'],{});mapping[row['id']]={**old,**c,'status':'completed','result':{'items':c['items']},'bridgeCorrected':not row['identicalPriorOutput'],'wordCount':len(' '.join(i['headline']+' '+i['body'] for i in c['items']).split())}
 judged={r['id']:r for r in results(cohort+'-judged')};supplement={r['id']:r for r in results('bridge-scored')};judged.update({k:v for k,v in supplement.items() if k in mapping})
 systems={}
 for system in ['all-headlines','keyword','single-llm','v3']:
  outputs=[v for v in mapping.values() if v['system']==system];rs=[judged[v['id']] for v in outputs if v['id'] in judged];systems[system]={**summarize(rs),'generationCompleted':sum(v['status']=='completed' for v in outputs),'generationFailures':[{'caseId':v['caseId'],'error':v.get('error')} for v in outputs if v['status']!='completed'],'missingAssessments':[v['id'] for v in outputs if v['id'] not in judged],'totalWords':sum(v.get('wordCount',0) for v in outputs),'generationLatencyMs':[v.get('latencyMs') for v in outputs if v.get('latencyMs') is not None]}
  for v in outputs:
   r=judged.get(v['id']);observations.append({'system':system,'caseId':v['caseId'],'id':v['id'],'words':v.get('wordCount'),'generationStatus':v['status'],'reviewStatus':r.get('status') if r else 'missing','metrics':r.get('metrics') if r else None})
 differences={}
 for baseline in ['all-headlines','keyword','single-llm']:
  pairs=[]
  for a in [v for v in mapping.values() if v['system']=='v3']:
   b=next((v for v in mapping.values() if v['system']==baseline and v['caseId']==a['caseId']),None);ar,br=judged.get(a['id']),judged.get(b['id']) if b else None
   if ar and br and ar['status']==br['status']=='completed':pairs.append({'caseId':a['caseId'],'differences':{key:(score(ar,key)-score(br,key) if score(ar,key) is not None and score(br,key) is not None else None) for key in METRICS}})
  differences[baseline]={'completedPairs':len(pairs),'pairs':pairs,'meanDifferences':{key:(statistics.mean(values) if (values:=[p['differences'][key] for p in pairs if p['differences'][key] is not None]) else None) for key in METRICS}}
 return {'systems':systems,'observations':observations,'pairedV3MinusBaseline':differences,'scope':'Chronological retained-input exploratory comparison; incomplete source extraction; one feed; no significance or event-independent held-out claim. Inventories generated independently and may vary across system assessments. Judge shares GPT-4.1 family with editor.'}
def financials():
 totals={'settledUsd':0.,'unresolvedReservationUsd':0.,'calls':0,'callStates':Counter(),'readErrors':[],'providerRejections':[],'uninitializedDatabases':[]}
 for p in ROOT.rglob('eval.sqlite'):
  try:
   with sqlite3.connect(p.resolve().as_uri()+'?mode=ro',uri=True) as db:
    db.row_factory=sqlite3.Row
    if not db.execute("SELECT 1 FROM sqlite_master WHERE name='eval_calls'").fetchone():
     totals['uninitializedDatabases'].append({'path':str(p.relative_to(ROOT)),'reason':'Initialization stopped before evaluator tables existed; no call ledger rows or requests sent by this attempt.'});continue
    rows=[dict(r) for r in db.execute('SELECT * FROM eval_calls')]
   totals['calls']+=len(rows)
   for r in rows:totals['callStates'][r['state']]+=1;totals['settledUsd']+=(r['cost_micro'] or 0)/1e6;totals['unresolvedReservationUsd']+=(r['reservation_micro']/1e6 if r['cost_micro'] is None else 0)
  except sqlite3.DatabaseError as e:totals['readErrors'].append({'path':str(p.relative_to(ROOT)),'error':str(e)})
 for p in ROOT.rglob('calls.jsonl'):
  rows=[json.loads(s) for s in p.read_text(encoding='utf-8').splitlines()];last={}
  for r in rows:last[r['id']]=r
  totals['calls']+=len(last)
  for r in last.values():totals['callStates'][r['state']]+=1;totals['settledUsd']+=r.get('costUsd',0);totals['unresolvedReservationUsd']+=r.get('reservationUsd',0) if r['state']!='SETTLED' else 0
 for p in ROOT.rglob('provider/*.json'):
  try:
   v=load(p)
   if v['status']!=200:
    e=json.loads(v['body']).get('error',{});totals['providerRejections'].append({'artifact':str(p.relative_to(ROOT)),'status':v['status'],'reason':e.get('metadata',{}).get('reason'),'message':e.get('message')})
  except (ValueError,KeyError):pass
 totals['callStates']=dict(totals['callStates']);return totals
def pct(v):return '—' if v is None else f'{v*100:.1f}%'
def public_metadata(value):
 """Keep private source text and generated review prose out of tracked reports."""
 if isinstance(value,list):return [public_metadata(v) for v in value]
 if not isinstance(value,dict):return value
 out={}
 for key,v in value.items():
  if key in {'quote','text','body','headline','explanation','limitations','inventoryLimitations'}:out[key+'Sha256']=hashlib.sha256(json.dumps(v,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
  elif key=='path':out['privateArtifact']=True
  else:out[key]=public_metadata(v)
 return out
def language_detection(root):
 labels=load(root/'control-labels.json');out={}
 for model in (root/'controls-run').iterdir():
  if not model.is_dir():continue
  rows=[load(p) for p in model.glob('*/result.private.json')];out[model.name]={}
  for language in ['en','ar','fr']:
   rs=[r for r in rows if r['language']==language];c=dict(TP=0,FP=0,TN=0,FN=0)
   for r in rs:
    if r['status']!='completed':continue
    truth=labels[r['id']]['isFault'];predicted=any(r['predicted'].values());c[('T' if truth==predicted else 'F')+('P' if predicted else 'N')]+=1
   out[model.name][language]={**c,'completed':sum(r['status']=='completed' for r in rs),'failed':sum(r['status']=='failed' for r in rs),'precision':ratio(c['TP'],c['TP']+c['FP']),'recall':ratio(c['TP'],c['TP']+c['FN']),'f1':ratio(2*c['TP'],2*c['TP']+c['FP']+c['FN'])}
 return out
def main():
 synthetic=analyze(ROOT);real=analyze(ROOT/'real-challenges');pairs={c:paired(c) for c in ['recent-historical','prospective']};existing=[]
 for r in load(ROOT/'existing-report-roster.json'):
  if r['status']=='retrieved':
   v=load(r['path']);existing.append({**r,'status':v['status'],'metrics':v['metrics'],'findings':v['review']['findings'],'limitations':v['review']['limitations'],'inventoryLimitations':v['inventory']['limitations'],'operational':v['operational'],'claims':len(v['review']['claims']),'inventoryDevelopments':len(v['inventory']['developments'])})
 fresh=results('published-run');finance=financials();q=load(ROOT/'qualification.private.json');freeze=load(ROOT/'freeze.json');labels=load(ROOT/'control-labels.json');false_positives=[]
 for dataset,analysis,subroot in [('synthetic',synthetic,ROOT),('real-source',real,ROOT/'real-challenges')]:
  labs=load(subroot/'control-labels.json')
  for model in analysis['models']:
   for p in (subroot/'controls-run'/model).glob('*/result.private.json'):
    r=load(p)
    if r['status']=='completed' and not labs[r['id']]['isFault'] and any(r['predicted'].values()):false_positives.append({'dataset':dataset,'model':model,'id':r['id'],'language':r['language'],'predicted':r['predicted'],'items':r['review']['items'],'findings':r['review']['findings']})
 data={'status':'executed_with_reported_missingness','freeze':freeze,'synthetic':synthetic,'realSourceChallenges':real,'pairedComparisons':pairs,'existingPublishedEvaluations':existing,'freshPublishedEvaluations':{m:summarize([r for r in fresh if r['model']==m]) for m in sorted({r['model'] for r in fresh})},'falsePositiveDetails':false_positives,'financials':finance,'qualification':{'retainedWindows':len(q),'postFreezeWindows':sum(r.get('postFreeze',False) for r in q),'completeNonemptyPostFreezeWindows':sum(r.get('postFreeze',False) and r.get('complete',False) and r.get('articles',0)>0 for r in q),'certifiedEventIndependentHeldOut':0},'limitations':['AI-curated source-relative references, no human gold','Seven constructed and two real-source event groups; translations are dependent','One English feed in small paired comparison, incomplete extraction metadata','No certified event-independent untouched evaluation','Provider rejects, schema failures and original disk interruption retained','GPT judge shares model family with GPT editor; cross-family comparison on controls and attempted published assessments, not complete paired baseline judging','Independent candidate-blind inventories can vary between system outputs; no fixed gold development list for real windows']}
 lines=['# Existing evaluator reliability and measured briefing quality','','This study extends the operational evaluator without changing its deployed prompts, validators, model routing, accounting, dashboards or publisher. The evidence supports using it as fallible triage. It does **not** establish automated certification of briefing quality or statistical superiority over simpler baselines.','','## Protocol and execution','',f"Branch `research/evaluator-reliability`; base `{freeze['baseRevision']}`. Protocol frozen `{freeze['frozenAt']}`, SHA-256 `{freeze['protocolSha256']}`. The original disk-interrupted results are preserved in `PARTIAL_REPORT.md`; this report supersedes its experiment-status statements.",'','The source inventory is candidate-blind; expected labels were frozen separately and never supplied to either tested judge. References are source-relative AI-curated constructions, not human adjudication. No claim of external real-world truth, universal news importance or exhaustive news recall is made.','','## Reliability measurements','','Completed-only case-level any-fault metrics are below. Category-specific counts and all language strata, failures, abstentions and disagreements are preserved in `FINAL_RESULTS.json`. A temporal fault recognized as factual still counts as case-level detection. Missing/failed assessments are not counted as correct.','','| Set / judge | Planned | Attempted | Completed | TP / FP / FN / TN | Precision | Recall | F1 |','| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |']
 for title,analysis in [('Constructed (7 event groups)',synthetic),('Retained-source (2 events)',real)]:
  for model,m in analysis['models'].items():
   c=m['anyFaultDetection'];lines.append(f"| {title} / {model} | {m['planned']} | {m['attempted']} | {m['completed']} | {c['TP']} / {c['FP']} / {c['FN']} / {c['TN']} | {pct(c['precision'])} | {pct(c['recall'])} | {pct(c['f1'])} |")
 lines+=['','Constructed cases are 21 matched faults and 21 known-correct controls across English, Arabic and French. The real-source set has six faults and six controls, from two retained Arabic statements, with English/Arabic/French output variants. Neither set is pooled with real published-quality measurements. Artificial prevalence and dependent translations prevent extrapolating precision to production.','','### What failed or disagreed','','- GPT-4.1 missed all three language swaps: French requested with English supplied, Arabic requested with English supplied, and English requested with French supplied. These passed validation and raised no alert.','- Claude caught the language swaps, but falsely marked correct controls adverse, including a valid French paraphrase of an Arabic source. Its explanation conflated source/output language and optional detail omissions. Stronger cross-family agreement is not a factual oracle.','- Both judges identified evacuation omissions in raw coverage rows, but added inconsistent factual/relevance findings. The unchanged validator rejected those complete reviews with `UNBOUND_REVIEW_FINDING`. GPT also had an Arabic repetition validation failure; Claude had an additional French quantity-case failure. These remain failures, not silently normalized outputs.','- Claude labeled wrong meeting dates as factual contradictions rather than temporally incorrect. The error was detected, but category agreement differs.','']
 for title,analysis in [('Constructed',synthetic),('Real-source',real)]:
  for model,m in analysis['models'].items():lines.append(f"- {title} / {model}: target-category recall {pct(m['targetRecallCompleted'])}; attempted-fault failure-adjusted lower/upper bounds {pct(m['targetRecallFailureAdjustedLower'])} / {pct(m['targetRecallFailureAdjustedUpper'])}; completed latency p50/p95 {m['latencyCompletedMs']['p50']:.0f}/{m['latencyCompletedMs']['p95']:.0f} ms.")
 lines+=['','Category metrics use the frozen mask: target positive for each injected fault, all categories negative for correct controls, collateral consequences unlabelled. Full seven-category tables and language counts are in the JSON. `flagged()` also includes uncertainty and evidence limitations, so an alert is not a proven-error verdict.','','## Paired comparison: actual executions','','Four existing systems were run on identical full retained inputs, with a declared cold start and separate chronological output histories. No paid V3 or single-LLM output was regenerated to improve a score. Historical and prospective cohorts each have three windows from one English feed. The retained sources have partial/unknown completeness. This is a small exploratory core replay, not scheduler or end-to-end delivery benchmarking.','','An initial large historical Arabic trial (three-window track, 615 article occurrences) executed all-headlines/keyword selection. Single-LLM and V3 both failed citation validation on the first window. Those model outputs cited internal IDs instead of supplied S-labels; costs and failure artifacts are retained. They are not converted into low-quality published prose or used to claim a baseline win.','','The Windows Python adapter initially used CP1252, causing keyword hashing to fail on UTF-8 data. A regression test reproduced the failure; explicit UTF-8 fixed the research adapter. All six existing all-headlines outputs were byte-equivalent after the correction. Keyword outputs were generated deterministically and scored in a separate supplement. Original adapter failures remain available. No application selection or production pipeline was changed.','','| Cohort / system | Generated | Assessed | Failed assessment | Claim support | Citation correctness | Development recall | Repetition | Output words |','| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
 for cohort,p in pairs.items():
  for system,s in p['systems'].items():
   m=s['metrics'];lines.append(f"| {cohort} / {system} | {s['generationCompleted']}/3 | {s['available']}/3 | {s['failed']} | {pct(m['claimSupport']['value'])} | {pct(m['citationCorrectness']['value'])} | {pct(m['importantDevelopmentRecall']['value'])} | {pct(m['repetition']['value'])} | {s['totalWords']} |")
 lines+=['','Ratios above pool reported numerators/denominators among completed assessments only. They are not a fair paired superiority estimate when availability differs. Empty-output claim/citation denominators are unavailable, not perfect. All-headlines is deliberately an unmatched-length coverage/reading-load comparator. Keyword filtering is the existing Unicode-token lexical algorithm, not a translation-aware model.','','### Same-window paired differences','','| Cohort / baseline | Completed V3-baseline pairs | Mean claim-support difference | Mean recall difference |','| --- | ---: | ---: | ---: |']
 for cohort,p in pairs.items():
  for baseline,d in p['pairedV3MinusBaseline'].items():lines.append(f"| {cohort} / {baseline} | {d['completedPairs']} | {pct(d['meanDifferences']['claimSupport'])} | {pct(d['meanDifferences']['importantDevelopmentRecall'])} |")
 lines+=['','Differences are V3 minus baseline on the same windows with both reviews completed; null-denominator metrics are omitted, and denominators vary by dimension. These tiny, connected samples have no inferential confidence interval. Inventories are independently candidate-blind but can vary between assessments, so development recall has additional judge variance. GPT judging GPT-generated systems also creates potential family bias.','','## Actual published briefings, kept separate','','Six already-paid deployed GPT-4.1 reports were retrieved and verified against the exact retained snapshot hash. They assess the real published output with its actual prior history, unlike the cold-start replay. They are observations from the existing fallible evaluator, not ground-truth accuracy measurements.','','| Cohort / edition | Claims judged | Claim support | Citation correctness | Development recall | Status |','| --- | ---: | ---: | ---: | ---: | --- |']
 for e in existing:
  m=e['metrics'];lines.append(f"| {e['cohort']} / `{e['editionId'][:12]}` | {e['claims']} | {pct(m.get('claimSupport',{}).get('value'))} | {pct(m.get('citationCorrectness',{}).get('value'))} | {pct(m.get('importantDevelopmentRecall',{}).get('value'))} | {e['status']} |")
 lines+=['','Independent new assessment was also attempted with both families; completed and rejected assessments are enumerated in the JSON. Most were rejected by OpenRouter’s in-flight-credit guard. No disagreement is inferred where one judge failed to produce a review. Existing evidence-completeness limitations mean apparent omission or clean support cannot establish external completeness.','','## Accounting and operational limitations','',f"Confirmed cost of this research across every new local ledger and generation journal, including failed attempts: **${finance['settledUsd']:.6f}**. Outstanding conservative reservations: **${finance['unresolvedReservationUsd']:.6f}**. Total recorded call identities: **{finance['calls']}**.",f"Provider rejection responses recorded: **{len(finance['providerRejections'])}**. These include HTTP 402 `in_flight_budget_exhausted`, distinct from exhausted key balance. They remain recorded with their original local UNKNOWN holds; rejected requests are not claimed as completed inference. No automatic retries or rewriting live financial history occurred.",'','The initial two storage-interrupted paid stages remain unresolved, with no durable generation receipt sufficient for safe recovery. No repeat inference was sent for those operations. Settled outputs were reused. Existing deployed-report retrieval incurred no new judge call; its historical cost is outside the new research total.','','## Untouched-window decision and unperformed work','',f"Retrieved roster: {len(q)} snapshots, including {sum(r.get('postFreeze',False) for r in q)} post-freeze windows. **Zero** nonempty post-freeze windows have complete retained-source declarations. Event independence from earlier related news is also not certified. The three wholly post-freeze chronological windows were exercised and reported as exploratory; they are **not** relabeled independent held-out data.",'','A fully observed fair paired campaign, independent human calibration and event-independent complete-evidence confirmatory testing remain unperformed. Provider/storage/schema failures are not substituted with configuration, tests or favorable subset scores. There is no statistically supported conclusion that Distilled.news outperforms simpler baselines.','','## Conclusion','','The evaluator detects many straightforward source-relative quantity, modality, citation and relevance faults, but its language judgments and schema robustness are unreliable enough to prevent automatic quality certification. Cross-family judging exposes genuine disagreements and false positives; it should remain an offline diagnostic until independently calibrated. Use metric-specific evidence, retain failed/unassessable states, and validate new independent source-grounded cases before treating automated scores as proof of product quality. No production change was made to chase these scores.','']
 lines+=['## Provider balance clarification','','A subsequent authenticated read of the account credit endpoint reported total credits $7,619 and usage $7,618.956905921: about **$0.043094079 account balance**. This is distinct from the key’s approximately $16.77 remaining spending allowance. The nearly depleted account balance explains persistent admission refusals; continuing the missing model assessments requires account credit, not a new application monetary limit.','']
 data['providerAccountBalanceObservedUsd']=0.043094079
 data['replayAdapterLimitations']=['Evaluator snapshots retain article IDs, text, titles, publication times and completeness but not full original publisher identity; replay uses article IDs as source metadata.','Existing replay.ts invokes core engine defaults and fixed models, not all deployed rollout flags or Worker scheduling/accounting/publication behavior.','The large historical citation failures therefore describe this recorded core replay and cannot be attributed directly to currently published production output.']
 data['sourceHashesRecordedAfterExecution']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for base in ['evaluation/briefing-quality/validation','evaluation/briefing-quality/worker/src','packages/briefing/src'] for p in Path(base).glob('*') if p.is_file() and p.suffix in {'.py','.ts','.mjs','.json'}}
 data['languageDetection']={name:language_detection(root) for name,root in [('synthetic',ROOT),('realSourceChallenges',ROOT/'real-challenges')]}
 lines+=['## Case-level detection by language','','| Set / judge / language | Completed | Failed reports | TP / FP / FN / TN | Precision | Recall | F1 |','| --- | ---: | ---: | --- | ---: | ---: | ---: |']
 for dataset,models in data['languageDetection'].items():
  for model,languages in models.items():
   for language,m in languages.items():lines.append(f"| {dataset} / {model} / {language} | {m['completed']} | {m['failed']} | {m['TP']} / {m['FP']} / {m['FN']} / {m['TN']} | {pct(m['precision'])} | {pct(m['recall'])} | {pct(m['f1'])} |")
 lines+=['','Language strata are tiny matched variants, not independent multilingual population estimates. A blocked stage without a terminal result remains included in the attempt/financial register even when absent from failed-report counts.','']
 lines+=['## Replay adapter boundary','','Evaluator snapshots do not retain the full original publisher identity; the existing replay adapter uses article IDs as source metadata. The reused core replay also does not apply every deployed rollout flag, scheduling policy or Worker publication mechanism. Citation failures in that replay cannot be directly attributed to current production output. The separate deployed reports assess actual published prose and its actual history.','', '## Reproduction and validation','','Run `python evaluation/briefing-quality/validation/final_report.py` from the research worktree to rebuild this report from the ignored private run artifacts. Source hashes recorded after execution are in the JSON; they support reproduction but are not falsely represented as preregistered hashes. The original blind-run manifest and pre-inference protocol freeze remain immutable.','', 'Twelve analysis, privacy, denominator and multilingual bridge regression checks passed. The unchanged evaluator suite passed 104 tests; the offline TypeScript check passed. These are recorded separately from model measurements. All raw evidence, provider replies, generation journals and rejected artifacts remain private; public structured reports contain metadata, hashes, counts, errors and scores. No Worker or dashboard was deployed.','']
 OUT.mkdir(parents=True,exist_ok=True);(OUT/'FINAL_RESULTS.json').write_text(json.dumps(public_metadata(data),indent=2,ensure_ascii=False)+'\n',encoding='utf-8');(OUT/'FINAL_REPORT.md').write_text('\n'.join(lines),encoding='utf-8');print(json.dumps({'report':str(OUT/'FINAL_REPORT.md'),'confirmedCostUsd':finance['settledUsd'],'holdsUsd':finance['unresolvedReservationUsd'],'providerRejections':len(finance['providerRejections'])}))
if __name__=='__main__':main()
