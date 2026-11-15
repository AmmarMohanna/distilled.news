"""Reproduce aggregate funded results; no credentials, network or model calls."""
import collections,hashlib,json,random,sqlite3,statistics
from pathlib import Path
ROOT=Path('evaluation/briefing-quality/private/funded-v3')
OUT=Path('evaluation/briefing-quality/reports/reliability-v3')
CATEGORIES=['factual','citation','coverage','relevance','repetition','temporal','language']
SYSTEMS=['current-engine','single-llm','all-headlines','keyword']
MODELS=['gpt','claude']
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def fraction(n,d):return n/d if d else None
def confusion(rows):
 out={k:0 for k in ['TP','FP','TN','FN','failedPositive','failedNegative','abstainedPositive','abstainedNegative']}
 for truth,prediction,_group in rows:
  if prediction=='failed':key='failedPositive' if truth else 'failedNegative'
  elif prediction is None:key='abstainedPositive' if truth else 'abstainedNegative'
  else:key=('TP' if prediction else 'FN') if truth else ('FP' if prediction else 'TN')
  out[key]+=1
 tp,fp,fn=out['TP'],out['FP'],out['FN'];out.update(total=len(rows),classifiable=out['TP']+out['FP']+out['TN']+out['FN'],precision=fraction(tp,tp+fp),recall=fraction(tp,tp+fn),F1=fraction(2*tp,2*tp+fp+fn))
 positive=tp+fn+out['failedPositive']+out['abstainedPositive'];negative=out['TN']+fp+out['failedNegative']+out['abstainedNegative']
 out['failureAwareRecallBounds']=[fraction(tp,positive),fraction(tp+out['failedPositive']+out['abstainedPositive'],positive)]
 out['failureAwareFalsePositiveBounds']=[fraction(fp,negative),fraction(fp+out['failedNegative']+out['abstainedNegative'],negative)]
 out['failureAwareCorrectDecisions']=fraction(tp+out['TN'],len(rows));out['eventGroups']=len(set(r[2] for r in rows))
 return out
def prediction(d,category,combined=True):
 if not d or d['status']!='completed':return 'failed'
 pred=d['predicted' if combined else 'modelPredicted'][category]
 if pred:return True
 r=d['review']
 if category=='factual':unknown=any(c['support']=='uncertain' for c in r['claims'])
 elif category=='citation':unknown=any(c['citationSupport']=='uncertain' for c in r['claims'])
 elif category=='coverage':unknown=any(c['status']=='uncertain' for c in r['coverage'])
 elif category=='language' and combined:unknown=any(i['combined']=='uncertain' for i in d['candidate']['language'])
 else:unknown=any(i[category]=='uncertain' for i in r['items'])
 return None if unknown else False
def overall(d,ref,combined=True):
 if not d or d['status']!='completed':return 'failed'
 cats=ref['acceptableDetectionCategories'] if ref['isFault'] else [k for k,v in ref['strictExpected'].items() if v==0]
 vals=[prediction(d,k,combined) for k in cats]
 if True in vals:return True
 return None if None in vals else False
def metric(d,name):
 if not d or d['status']!='completed':return None
 if name=='sourceGroundedCoverage':
  rows=[r for r in d['review']['coverage'] if r['status'] in ['covered','omitted']];return fraction(sum(r['status']=='covered' for r in rows),len(rows))
 return d['metrics'][name]['value']
def pooled(ds,name):
 n=d=0;unknown=0
 for x in ds:
  if x['status']!='completed':continue
  if name=='sourceGroundedCoverage':
   rows=x['review']['coverage'];n+=sum(r['status']=='covered' for r in rows);d+=sum(r['status'] in ['covered','omitted'] for r in rows);unknown+=sum(r['status']=='uncertain' for r in rows)
  else:
   m=x['metrics'][name];n+=m['numerator'];d+=m['denominator']
 return {'numerator':n,'denominator':d,'value':fraction(n,d),'uncertainDevelopments':unknown} if name=='sourceGroundedCoverage' else {'numerator':n,'denominator':d,'value':fraction(n,d)}
def bootstrap_groups(rows):
 groups=sorted(set(r[2] for r in rows));rng=random.Random(81473);values=[]
 for _ in range(2000):
  selected=[rng.choice(groups) for _ in groups];res=confusion([r for g in selected for r in rows if r[2]==g]);v=res['failureAwareRecallBounds'][0]
  if v is not None:values.append(v)
 values.sort();return {'method':'2000 event-group bootstrap draws, seed 81473; descriptive only, very few groups','groups':len(groups),'lowerRecallPercentile95':[values[int(.025*(len(values)-1))],values[int(.975*(len(values)-1))]] if values else None}
def main():
 OUT.mkdir(parents=True,exist_ok=True);report={'protocolHash':hashlib.sha256((ROOT/'protocol.json').read_bytes()).hexdigest(),'benchmark':{},'paired':{},'preparedCorrections':{},'diagnostics':[]}
 for cohort in ['synthetic','real-source']:
  audit=read(Path('evaluation/briefing-quality/private/reliability-v2/r2')/(cohort+'-reference-audit.json'));assert not audit['integrityFailures'];refs=audit['rows'];by_model={}
  for model in MODELS:
   ds={d['id']:d for p in (ROOT/cohort/model).glob('*/result.json') if (d:=read(p))};assert len(ds)==len(refs),'INCOMPLETE_BENCHMARK_ENUMERATION'
   rows=[(r['isFault'],overall(ds.get(r['id']),r),r['eventGroup']) for r in refs]
   category={c:confusion([(bool(r['strictExpected'][c]),prediction(ds.get(r['id']),c),r['eventGroup']) for r in refs if r['strictExpected'][c] is not None]) for c in CATEGORIES}
   rawrows=[(r['isFault'],overall(ds.get(r['id']),r,False),r['eventGroup']) for r in refs]
   errors=[{'id':r['id'],'eventGroup':r['eventGroup'],'language':r['language'],'category':r['category'],'expectedFault':r['isFault'],'predicted':overall(ds.get(r['id']),r),'error':ds[r['id']].get('error'),'predictedCategories':ds[r['id']].get('predicted'),'modelLanguage':ds[r['id']].get('candidate',{}).get('languageOutcome')} for r in refs if overall(ds.get(r['id']),r) in ['failed',None] or overall(ds.get(r['id']),r)!=r['isFault']]
   by_model[model]={'attempted':len(ds),'completed':sum(d['status']=='completed' for d in ds.values()),'failed':sum(d['status']!='completed' for d in ds.values()),'correctionsSucceeded':sum(bool(d.get('candidate',{}).get('correction')) for d in ds.values()),'correctionsAttempted':sum(any('correction' in c['stage'] for c in d['calls']) for d in ds.values()),'combined':confusion(rows),'judgeOnly':confusion(rawrows),'categories':category,'languages':{l:confusion([row for row,r in zip(rows,refs) if r['language']==l]) for l in ['en','ar','fr']},'groupUncertainty':bootstrap_groups(rows),'errorsAndAbstentions':errors,'costUsd':sum(d['costUsd'] for d in ds.values()),'meanLatencySeconds':statistics.mean(d['latencyMs']/1000 for d in ds.values()),'maxLatencySeconds':max(d['latencyMs']/1000 for d in ds.values()),'unknownClaims':sum(d.get('metrics',{}).get('uncertainClaims',0) for d in ds.values()),'_results':ds}
  disagreements=[]
  for ref in refs:
   a,b=[by_model[m]['_results'][ref['id']] for m in MODELS];pa,pb=overall(a,ref),overall(b,ref)
   cats=[c for c in CATEGORIES if prediction(a,c)!=prediction(b,c)]
   if pa!=pb or cats:disagreements.append({'id':ref['id'],'language':ref['language'],'eventGroup':ref['eventGroup'],'overall':[pa,pb],'categories':cats,'completedBoth':a['status']==b['status']=='completed'})
  for m in MODELS:del by_model[m]['_results']
  report['benchmark'][cohort]={**by_model,'disagreements':disagreements,'maskedExpectedLabels':sum(v is None for r in refs for v in r['strictExpected'].values()),'labelStatus':'AI-curated/source-audited development reference, not independent human gold'}
 packets=read(ROOT/'paired-packets.json');packetmap={p['c']['id']:p for p in packets};assert len(packets)==24
 windows=sorted(set(p['caseId'] for p in packets));assert len(windows)==6
 gen=[read(p) for p in (ROOT/'paired-generation').glob('*/*/output.json')];assert len(gen)==24
 sql=sqlite3.connect(ROOT/'campaign.sqlite');sql.row_factory=sqlite3.Row;calls=[dict(r) for r in sql.execute('select * from calls')];sql.close()
 for r in calls:r['metadata']=json.loads(r['metadata']);r['receipt']=json.loads(r['receipt']) if r['receipt'] else None
 report['generation']={}
 for system in SYSTEMS:
  ds=[g for g in gen if g['system']==system];cs=[r for r in calls if r['metadata'].get('cohort')=='paired-generation' and r['metadata']['system']==system];report['generation'][system]={'windows':len(ds),'completed':sum(g['status']=='completed' for g in ds),'quiet':sum(g.get('result',{}).get('status')=='empty' for g in ds),'items':sum(len(g.get('result',{}).get('items',[])) for g in ds),'words':sum(g.get('wordCount',0) for g in ds),'meanLatencySeconds':statistics.mean(g['latencyMs']/1000 for g in ds),'latenciesSeconds':[g['latencyMs']/1000 for g in ds],'costUsd':sum((r['cost_micro'] or 0)/1e6 for r in cs),'inputTokens':sum((r['receipt'] or {}).get('inputTokens',0) for r in cs),'outputTokens':sum((r['receipt'] or {}).get('outputTokens',0) for r in cs),'modelCalls':len(cs),'sourceCitationCounts':sum(len(set(s for i in g.get('result',{}).get('items',[]) for s in i['sourceIds'])) for g in ds)}
 names=['claimSupport','citationCorrectness','sourceGroundedCoverage','importantDevelopmentRecall','repetition','relevance','temporalCorrectness','languageCorrectness']
 for cohort in ['paired','paired-compact']:
  report['paired'][cohort]={};raw={}
  for model in MODELS:
   ds=[read(p) for p in (ROOT/cohort/model).glob('*/result.json')];assert len(ds)==24,'INCOMPLETE_PAIRED_ENUMERATION';raw[model]={d['id']:d for d in ds};summaries={}
   for system in SYSTEMS:
    selected=[d for d in ds if packetmap[d['id']]['system']==system];summaries[system]={'attempted':len(selected),'completed':sum(d['status']=='completed' for d in selected),'failed':sum(d['status']!='completed' for d in selected),'metrics':{n:pooled(selected,n) for n in names},'uncertainClaims':sum(d.get('metrics',{}).get('uncertainClaims',0) for d in selected),'uncertainDevelopments':sum(d.get('metrics',{}).get('uncertainDevelopments',0) for d in selected),'uncertainLanguageItems':sum(d.get('candidate',{}).get('languageOutcome',{}).get('uncertain',0) for d in selected),'errors':[{'id':d['id'],'error':d.get('error')} for d in selected if d['status']!='completed']}
   diffs={}
   for baseline in SYSTEMS[1:]:
    differences={}
    for name in names:
     rows=[]
     for window in windows:
      ids={p['system']:p['c']['id'] for p in packets if p['caseId']==window};a,b=[raw[model].get(ids[s]) for s in ['current-engine',baseline]];va,vb=metric(a,name),metric(b,name)
      if va is not None and vb is not None:rows.append({'window':window,'engine':va,'baseline':vb,'difference':va-vb})
     differences[name]={'nPairedWindows':len(rows),'meanEngineMinusBaseline':statistics.mean(r['difference'] for r in rows) if rows else None,'minDifference':min((r['difference'] for r in rows),default=None),'maxDifference':max((r['difference'] for r in rows),default=None),'rows':rows,'inference':'Exploratory paired descriptive differences; six related windows from one feed, no independent-window population inference'}
    diffs[baseline]=differences
   report['paired'][cohort][model]={'systems':summaries,'pairedDifferences':diffs,'failed':sum(d['status']!='completed' for d in ds),'costUsd':sum(d['costUsd'] for d in ds),'correctionsSucceeded':sum(bool(d.get('candidate',{}).get('correction')) for d in ds),'correctionsAttempted':sum(any('correction' in c['stage'] for c in d['calls']) for d in ds)}
  disagreements=[]
  for p in packets:
   a,b=[raw[m][p['c']['id']] for m in MODELS];differences={n:[metric(a,n),metric(b,n)] for n in names if metric(a,n)!=metric(b,n)}
   if differences or a['status']!=b['status']:disagreements.append({'id':p['c']['id'],'window':p['caseId'],'system':p['system'],'status':[a['status'],b['status']],'metrics':differences})
  report['paired'][cohort]['disagreements']=disagreements
 corrections=[read(p) for p in (ROOT/'prepared-corrections').glob('*.json')];report['preparedCorrections']={'prepared':len(corrections),'completed':sum(c['status']=='completed' for c in corrections),'failed':sum(c['status']=='failed' for c in corrections),'notSent':sum(c['status'].startswith('not_sent') for c in corrections),'costUsd':sum(sum((r['cost_micro'] or 0)/1e6 for r in c.get('calls',[])) for c in corrections),'rows':[{'id':c['caseId'],'model':c['model'],'status':c['status'],'error':c.get('error'),'reconsideredConcerns':c.get('assessed',{}).get('correction',{}).get('reconsideredConcerns',[]),'retainedConcerns':c.get('assessed',{}).get('correction',{}).get('retainedConcerns',[])} for c in corrections]}
 report['invalidInputDiagnostics']={'assessments':len(list((ROOT/'diagnostics').glob('*/*/result.json'))),'reason':'PowerShell pipe corrupted Unicode literals in extra diagnostics; all original responses/costs retained; no valid language accuracy inferred from this version'}
 for p in (ROOT/'diagnostics-r2').glob('*/*/result.json'):
  d=read(p);report['diagnostics'].append({'id':d['id'],'model':d['model'],'status':d['status'],'error':d.get('error'),'claims':[{k:v for k,v in c.items() if k in ['support','citationSupport','explanation']} for c in d.get('review',{}).get('claims',[])],'language':d.get('candidate',{}).get('language'),'costUsd':d['costUsd']})
 report['financial']={'ceilingUsd':20,'newConfirmedUsd':sum((r['cost_micro'] or 0)/1e6 for r in calls),'newHeldUsd':sum(r['reservation_micro']/1e6 for r in calls if r['cost_micro'] is None),'priorConfirmedUsd':2.6470218,'priorHeldUsd':read(ROOT/'prior-reconciliation.private.json')['unresolvedHoldsUsd'],'operations':len(calls),'settled':sum(r['state']=='SETTLED' for r in calls),'unknown':sum(r['state']=='UNKNOWN' for r in calls),'inputTokens':sum((r['receipt'] or {}).get('inputTokens',0) for r in calls),'outputTokens':sum((r['receipt'] or {}).get('outputTokens',0) for r in calls),'byCohort':{c:{'costUsd':sum((r['cost_micro'] or 0)/1e6 for r in calls if r['metadata'].get('cohort')==c),'calls':sum(r['metadata'].get('cohort')==c for r in calls)} for c in sorted(set(r['metadata'].get('cohort','unknown') for r in calls))}}
 report['financial']['providerReportedConfirmedUsd']=sum(json.loads(read(ROOT/'http'/(r['id']+'.json'))['body'])['usage']['cost'] for r in calls if r['state']=='SETTLED')
 report['financial']['newExposureUsd']=report['financial']['newConfirmedUsd']+report['financial']['newHeldUsd'];assert report['financial']['newExposureUsd']<=20
 report['financial']['receiptLookups']={'lookups':len(list((ROOT/'receipt-lookups').glob('*.json'))),'statusCounts':dict(collections.Counter(read(p)['status'] for p in (ROOT/'receipt-lookups').glob('*.json'))),'resolution':'404 or absent provider receipts do not prove zero cost; no original hold released or UNKNOWN operation resent'}
 report['heldout']={'executed':False,'qualification':read(ROOT/'heldout-decision.json'),'reason':'OAuth refresh succeeded after initial401. Two new windows screened source-only: no exact source overlap, but event-thread dependence prevented whole-window independence certification. All30 source occurrences have unknown completeness; no exhaustive recall claim.'}
 # Commit audit hashes and paid receipt metadata without exposing private feeds or full evidence.
 artifacts=[]
 for p in sorted(ROOT.rglob('*')):
  evidence_roots={'http','requests','targeted','prepared-corrections','correction-ledgers','paired-generation','paired','paired-compact','synthetic','real-source','shared-inventories','diagnostics','diagnostics-r2','receipt-lookups','heldout-screen'}
  evidence_files={'protocol.json','compact-protocol.json','diagnostic-cases.json','diagnostic-reference.json','diagnostic-r2-cases.json','diagnostic-r2-protocol.json','paired-packets.json','prior-reconciliation.private.json','events.jsonl','heldout-decision.json','heldout-source-overlap.json','heldout-source-overlap-r2.json'}
  relative=p.relative_to(ROOT)
  if p.is_file() and p.suffix in ['.json','.jsonl'] and (relative.parts[0] in evidence_roots or relative.as_posix() in evidence_files):artifacts.append({'path':p.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
 (OUT/'ARTIFACT_HASHES.json').write_text(json.dumps(artifacts,indent=2)+'\n',encoding='utf8')
 (OUT/'PAID_OPERATIONS.json').write_text(json.dumps([{k:r[k] for k in ['id','request_hash','reservation_micro','cost_micro','state','metadata','receipt','created_at','finished_at']} for r in calls],indent=2)+'\n',encoding='utf8')
 (OUT/'FUNDED_RESULTS.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
 print(json.dumps({'financial':report['financial'],'benchmark':{c:{m:{k:v for k,v in report['benchmark'][c][m].items() if k in ['attempted','completed','failed','combined','correctionsAttempted','correctionsSucceeded']} for m in MODELS} for c in report['benchmark']},'pairedCompact':{m:report['paired']['paired-compact'][m]['systems'] for m in MODELS}},indent=2))
if __name__=='__main__':main()
