"""Reproduce pilot aggregates from immutable paid artifacts. No network or credentials."""
import argparse,collections,gzip,hashlib,io,json,sqlite3,statistics,tarfile
from pathlib import Path
METRICS=['claimSupport','citationCorrectness','importantDevelopmentRecall','relevance','repetition','temporalCorrectness','languageCorrectness']
PHASES=[('v1','generation','blind-packets.json','paired-value-pilot'),('v2','followup-generation','followup-blind-packets.json','paired-value-followup'),('v3','wire-generation','wire-blind-packets.json','paired-value-wire')]
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def pooled(rows,key):
 completed=[r for r in rows if r['status']=='completed']; ms=[r['metrics'][key] for r in completed];n=sum(m['numerator'] for m in ms);d=sum(m['denominator'] for m in ms)
 return dict(numerator=n,denominator=d,value=n/d if d else None,completedAssessments=len(completed),failedAssessments=len(rows)-len(completed))
def compare(a,b,key):
 pairs=[(x['metrics'][key]['value'],y['metrics'][key]['value']) for x,y in [(a[k],b[k]) for k in sorted(a.keys()&b.keys())] if x['status']==y['status']=='completed' and x['metrics'][key]['value'] is not None and y['metrics'][key]['value'] is not None]
 return dict(pairedWindows=len(pairs),meanDifference=statistics.mean(x-y for x,y in pairs) if pairs else None,confidenceInterval=None,reason='One exposed chronological development block; no independent superiority interval is defensible')
def summarize(root):
 result={'scope':'Three exposed consecutive English-output Lebanon development windows; not a held-out study','independentChronologicalBlocks':1,'phases':{},'generation':[],'artifacts':{},'snapshots':read(root/'source-snapshots/manifest.json')}
 all_results=[];gen_events=collections.defaultdict(list);settled=[]
 for line in (root/'events.jsonl').read_text(encoding='utf8').splitlines():
  e=json.loads(line)
  if e['state']=='RESERVED':gen_events[e['id']].append(e)
  if e['state']=='SETTLED':settled.append(e)
 metadata={i:es[0]['metadata'] for i,es in gen_events.items()}
 for phase,folder,packets,cohort in PHASES:
  ps=read(root/packets);ids={p['c']['id']:p for p in ps};generated=[read(p) for p in sorted((root/folder).glob('*/*/output.json'))];arms=sorted(set(g['arm'] for g in generated));wordsById={g['id']:g.get('wordCount',0) for g in generated};r={'generationAttempts':len(generated),'generationCompleted':sum(g['status']=='completed' for g in generated),'assessmentOpportunities':2*len(generated),'assessments':{}}
  for arm in arms:
   gs=[g for g in generated if g['arm']==arm];costs=[e for e in settled if metadata[e['id']].get('arm')==arm];reused=any('reusedFrom' in g for g in gs)
   rows=dict(phase=phase,arm=arm,attempted=len(gs),completed=sum(g['status']=='completed' for g in gs),pipelineStatuses=dict(collections.Counter(g.get('result',{}).get('status','generation_failed') for g in gs)),words=[g.get('wordCount') for g in sorted(gs,key=lambda g:g['caseId'])],totalWords=sum(g.get('wordCount',0) for g in gs),meanLatencyMs=statistics.mean(g.get('originalGenerationLatencyMs',g['latencyMs']) for g in gs),latenciesMs=[g.get('originalGenerationLatencyMs',g['latencyMs']) for g in sorted(gs,key=lambda g:g['caseId'])],empiricalP95Ms=max(g.get('originalGenerationLatencyMs',g['latencyMs']) for g in gs),p95Method='nearest rank; n=3, observed maximum, not a population-tail estimate',newCostUsd=sum(e['costMicro'] for e in costs)/1e6,newCalls=len(costs),inputTokens=sum(e['receipt']['inputTokens'] for e in costs),outputTokens=sum(e['receipt']['outputTokens'] for e in costs),reusedPriorGeneration=reused,errors=[g['error'] for g in gs if g['status']!='completed'])
   result['generation'].append(rows)
  for model in ['gpt','claude']:
   ds=[read(p) for p in sorted((root/cohort/model).glob('*/result.json'))];assert {r['id'] for r in ds}==set(ids),'ASSESSMENT_ROSTER_MISMATCH';all_results.extend(ds);r['assessments'][model]={}
   for arm in arms:
    rows=sorted([d for d in ds if ids[d['id']]['arm']==arm],key=lambda d:ids[d['id']]['caseId']);completed=[d for d in rows if d['status']=='completed'];r['assessments'][model][arm]={'attempted':len(rows),'completed':len(completed),'unperformedGenerationFailures':1 if arm=='combined' else 0,'metrics':{m:pooled(rows,m) for m in METRICS},'claimAssessments':dict(collections.Counter(c['support'] for d in completed for c in d['review']['claims'])),'unknownClaims':sum(d['metrics'].get('uncertainClaims',0) for d in completed),'unknownDevelopments':sum(d['metrics'].get('uncertainDevelopments',0) for d in completed),'errors':[{'id':d['id'],'error':d.get('error')} for d in rows if d['status']!='completed'],'meanLatencyMs':statistics.mean(d['latencyMs'] for d in rows) if rows else None,'costUsd':sum(d['costUsd'] for d in rows),'correctionsAttempted':sum(any('correction' in c['stage'] for c in d['calls']) for d in rows),'correctionsSucceeded':sum(bool(d.get('candidate',{}).get('correction')) for d in completed),'modelAssessedImportantDevelopmentsPer100Words':100*sum(d['metrics']['importantDevelopmentRecall']['numerator'] for d in completed)/sum(wordsById[d['id']] for d in completed) if any(ids[d['id']]['c']['items'] for d in completed) else None}
   # Preserve per-output diagnoses; no majority-vote gold labels.
  a={d['id']:d for d in [read(p) for p in (root/cohort/'gpt').glob('*/result.json')]};b={d['id']:d for d in [read(p) for p in (root/cohort/'claude').glob('*/result.json')]};comparable=[i for i in ids if a[i]['status']==b[i]['status']=='completed'];r['disagreement']={'pairedOutputs':len(ids),'bothCompleted':len(comparable),'notBothCompleted':len(ids)-len(comparable),'categoryDisagreements':{k:sum(a[i]['predicted'][k]!=b[i]['predicted'][k] for i in comparable) for k in ['factual','citation','coverage','relevance','repetition','temporal','language']},'note':'Negative classification with uncertainty is not confirmed absence of a fault'}
  comparator='wire-single' if phase=='v3' else 'matched-source-script' if phase=='v2' else 'matched-single'
  r['pairedDifferences']={}
  for model,ds in [('gpt',a),('claude',b)]:
   byarm={arm:{ids[i]['caseId']:d for i,d in ds.items() if ids[i]['arm']==arm} for arm in arms}
   r['pairedDifferences'][model]={arm:{m:compare(byarm[arm],byarm[comparator],m) for m in METRICS} for arm in arms if arm!=comparator}
  result['phases'][phase]=r
 result['assessmentTotals']={'opportunities':sum(p['assessmentOpportunities'] for p in result['phases'].values()),'attempted':len(all_results),'completed':sum(d['status']=='completed' for d in all_results),'failed':sum(d['status']!='completed' for d in all_results),'unperformedDueToGenerationFailure':2}
 db=sqlite3.connect('file:'+str((root/'campaign.sqlite').resolve()).replace('\\','/')+'?mode=ro',uri=True);db.row_factory=sqlite3.Row;calls=[dict(r) for r in db.execute('select * from calls')];db.close();result['financial']={'ceilingUsd':5,'calls':len(calls),'settledCostUsd':sum(c['cost_micro'] or 0 for c in calls)/1e6,'heldUsd':sum(c['reservation_micro'] for c in calls if c['cost_micro'] is None)/1e6,'states':dict(collections.Counter(c['state'] for c in calls)),'generationCostUsd':sum(e['costMicro'] for e in settled if metadata[e['id']].get('arm'))/1e6,'assessmentCostUsd':sum(e['costMicro'] for e in settled if not metadata[e['id']].get('arm'))/1e6,'inputTokens':sum(e['receipt']['inputTokens'] for e in settled),'outputTokens':sum(e['receipt']['outputTokens'] for e in settled),'providerReportedCostUsd':sum(json.loads(read(root/'http'/(c['id']+'.json'))['body'])['usage']['cost'] for c in calls if c['state']=='SETTLED')}
 # Hash private evidence for a reproducible manifest without publishing retained article bodies.
 for p in sorted(root.rglob('*')):
  if p.is_file() and p.suffix in ['.json','.jsonl','.sqlite'] and 'source-snapshots' not in p.parts:result['artifacts'][p.relative_to(root).as_posix()]=sha(p)
 return result

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=Path('evaluation/briefing-quality/private/value-v1/pilot'));parser.add_argument('--out',type=Path,default=Path('evaluation/briefing-quality/reports/engine-value-v1'));args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True);r=summarize(args.root)
 (args.out/'pilot-results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 archive=io.BytesIO()
 with tarfile.open(fileobj=archive,mode='w') as tar:
  for p in sorted((args.root/'source-snapshots').rglob('*')):
   if p.is_file():
    data=p.read_bytes();info=tarfile.TarInfo(p.relative_to(args.root/'source-snapshots').as_posix());info.size=len(data);info.mtime=0;tar.addfile(info,io.BytesIO(data))
 with (args.out/'source-snapshots.tar.gz').open('wb') as f:
  with gzip.GzipFile(fileobj=f,mode='wb',mtime=0,filename='') as gz:gz.write(archive.getvalue())
 print(json.dumps({k:r[k] for k in ['assessmentTotals','financial']},indent=2))
if __name__=='__main__':main()