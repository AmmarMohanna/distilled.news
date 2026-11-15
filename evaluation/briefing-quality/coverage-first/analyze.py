"""Offline campaign aggregation. Reuses existing evaluator metrics; never calls models."""
import collections,gzip,hashlib,io,json,random,sqlite3,statistics,sys,tarfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'validation'))
from funded_analysis import pooled,prediction
from reference_frozen import assess
from reference import assess as sensitivity
ROOT=Path('evaluation/briefing-quality/private/coverage-v1/campaign')
OUT=Path('evaluation/briefing-quality/reports/coverage-first-v1')
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def interval(values):
 if not values:return None
 rng=random.Random(20261115);draws=sorted(statistics.mean(rng.choices(values,k=len(values))) for _ in range(10000));return [draws[int(.025*(len(draws)-1))],draws[int(.975*(len(draws)-1))]]
def main():
 cases={c['id']:c for c in read('evaluation/briefing-quality/coverage-first/cases.json')+read('evaluation/briefing-quality/private/coverage-v1/natural-cases.json')};r={'scope':'Fixed-reader-history conditional controls; separate current-document panels. No real-world population superiority inference.','phases':{},'financial':{},'artifactHashes':{},'protocols':{}}
 db=sqlite3.connect('file:'+str((ROOT/'campaign.sqlite').resolve()).replace('\\','/')+'?mode=ro',uri=True);db.row_factory=sqlite3.Row;calls=[dict(c) for c in db.execute('select * from calls')];db.close()
 settled=[c for c in calls if c['state']=='SETTLED'];r['financial']={'ceilingUsd':5,'costUsd':sum(c['cost_micro'] or 0 for c in calls)/1e6,'heldUsd':sum(c['reservation_micro'] for c in calls if c['cost_micro'] is None)/1e6,'states':dict(collections.Counter(c['state'] for c in calls)),'generationCostUsd':sum(c['cost_micro'] for c in settled if json.loads(c['metadata']).get('cohort')=='coverage-generation')/1e6,'evaluationCostUsd':sum(c['cost_micro'] for c in settled if json.loads(c['metadata']).get('role')=='evaluation')/1e6,'inputTokens':sum(json.loads(c['receipt'])['inputTokens'] for c in settled),'outputTokens':sum(json.loads(c['receipt'])['outputTokens'] for c in settled),'providerReportedCostUsd':sum(json.loads(read(ROOT/'http'/(c['id']+'.json'))['body'])['usage']['cost'] for c in settled)}
 r['financial']['exposureUsd']=r['financial']['costUsd']+r['financial']['heldUsd']
 for protocolFile in sorted(ROOT.glob('*-protocol.json')):
  p=read(protocolFile)
  if 'phase' not in p:continue
  phase=p['phase'];r['protocols'][phase]=p
  for file,expected in p['sourceHashes'].items():assert sha(ROOT/'source-snapshots'/phase/file)==expected,'FROZEN_CODE_CHANGED'
  generations=[read(f) for f in sorted((ROOT/(phase+'-generation')).glob('*/*/output.json'))];packets=read(ROOT/(phase+'-blind-packets.json')) if (ROOT/(phase+'-blind-packets.json')).exists() else [];ids={p['c']['id']:p for p in packets};rs={'generation':{},'judges':{},'perCase':[]}
  for g in generations:
   assert g['inputHash']==cases[g['caseId']]['inputHash'],'INPUT_CHANGED'
  for arm in p['arms']:
   gs=[g for g in generations if g['arm']==arm];genCalls=[c for c in settled if (m:=json.loads(c['metadata'])).get('cohort')=='coverage-generation' and m.get('phase')==phase and m.get('arm')==arm];ms=[assess(cases[g['caseId']],g) for g in gs] if not phase.startswith('natural-') else []
   n=sum(m['matched'] for m in ms);d=sum(m['eligible'] for m in ms);words=sum(g.get('wordCount',0) for g in gs);lat=[g['latencyMs'] for g in gs]
   rs['generation'][arm]={'attempted':len(gs),'completed':sum(g['status']=='completed' for g in gs),'failed':sum(g['status']!='completed' for g in gs),'pipelineStatuses':dict(collections.Counter(g.get('result',{}).get('status','failed') for g in gs)),'facetMatches':{'numerator':n,'denominator':d,'value':n/d if d else None},'words':words,'facetMatchesPer100Words':100*n/words if words and d else None,'meanLatencyMs':statistics.mean(lat) if lat else None,'empiricalP95Ms':sorted(lat)[max(0,__import__('math').ceil(.95*len(lat))-1)] if lat else None,'newGenerationCostUsd':sum(c['cost_micro'] for c in genCalls)/1e6,'newGenerationCalls':len(genCalls),'inputTokens':sum(json.loads(c['receipt'])['inputTokens'] for c in genCalls),'outputTokens':sum(json.loads(c['receipt'])['outputTokens'] for c in genCalls),'allSupportingSourceFacetMatches':sum(m['allSupportingSources'] for m in ms),'quietWindows':sum(not cases[g['caseId']]['expected'] for g in gs) if not phase.startswith('natural-') else None,'legitimateQuiet':sum(not cases[g['caseId']]['expected'] and g.get('result',{}).get('status')=='empty' for g in gs) if not phase.startswith('natural-') else None}
   for g in gs:
    rs['perCase'].append({'id':g['id'],'arm':arm,'caseId':g['caseId'],'eventGroup':cases[g['caseId']]['eventGroup'],'status':g['status'],'pipelineStatus':g.get('result',{}).get('status'),'error':g.get('error'),'words':g.get('wordCount'),'latencyMs':g['latencyMs'],'reference':assess(cases[g['caseId']],g) if not phase.startswith('natural-') else None,'postFreezeSensitivity':sensitivity(cases[g['caseId']],g) if not phase.startswith('natural-') else None,'recoveryReasons':[d['reason'] for d in g.get('result',{}).get('dropped',[])]})
  dsByModel={}
  for model in ['gpt','claude']:
   ds=[read(f) for f in (ROOT/('paired-coverage-'+phase)/model).glob('*/result.json')];dsByModel[model]={d['id']:d for d in ds};rs['judges'][model]={}
   for arm in p['arms']:
    selected=[d for d in ds if ids[d['id']]['arm']==arm];complete=[d for d in selected if d['status']=='completed'];eligible=sum(g['arm']==arm and g['status']=='completed' for g in generations)
    rs['judges'][model][arm]={'opportunities':sum(g['arm']==arm for g in generations),'attempted':len(selected),'completed':len(complete),'failed':len(selected)-len(complete),'unperformed':sum(g['arm']==arm for g in generations)-len(selected),'metrics':{m:pooled(selected,m) for m in ['claimSupport','citationCorrectness','importantDevelopmentRecall','sourceGroundedCoverage','repetition','relevance','temporalCorrectness','languageCorrectness']},'claimAssessments':dict(collections.Counter(c['support'] for d in complete for c in d['review']['claims'])),'unknownClaims':sum(d['metrics'].get('uncertainClaims',0) for d in complete),'unknownDevelopments':sum(d['metrics'].get('uncertainDevelopments',0) for d in complete),'errors':[{'id':d['id'],'phase':d.get('phase'),'error':d.get('error')} for d in selected if d['status']!='completed'],'meanLatencyMs':statistics.mean(d['latencyMs'] for d in selected) if selected else None}
  both=dsByModel['gpt'].keys()&dsByModel['claude'].keys();bothComplete=[i for i in both if dsByModel['gpt'][i]['status']==dsByModel['claude'][i]['status']=='completed'];rs['judgeDisagreement']={'bothCompleted':len(bothComplete),'notBothCompleted':len(ids)-len(bothComplete),'categoryFlags':{k:sum(dsByModel['gpt'][i]['predicted'][k]!=dsByModel['claude'][i]['predicted'][k] for i in bothComplete) for k in ['factual','citation','coverage','relevance','repetition','temporal','language']},'note':'Classification disagreement, not accuracy or adjudicated truth; unknown negative flags do not establish correctness.'}
  if phase=='final':
   rs['pairedDiagnosticDifferences']={}
   for model,ds in dsByModel.items():
    byarm={arm:{ids[i]['caseId']:d for i,d in ds.items() if ids[i]['arm']==arm} for arm in ['coverage','single']}
    rs['pairedDiagnosticDifferences'][model]={}
    for metric in ['claimSupport','citationCorrectness','importantDevelopmentRecall','relevance','repetition','languageCorrectness']:
     pairs=[]
     for caseId in sorted(byarm['coverage'].keys()&byarm['single'].keys()):
      a,b=byarm['coverage'][caseId],byarm['single'][caseId]
      if a['status']==b['status']=='completed' and a['metrics'][metric]['value'] is not None and b['metrics'][metric]['value'] is not None:pairs.append({'caseId':caseId,'difference':a['metrics'][metric]['value']-b['metrics'][metric]['value']})
     rs['pairedDiagnosticDifferences'][model][metric]={'pairedWindows':len(pairs),'meanDifference':statistics.mean(x['difference'] for x in pairs) if pairs else None,'failedOrUndefinedWindows':12-len(pairs),'perCase':pairs,'inference':'Descriptive fallible judge assessments; no population non-inferiority or superiority established'}
  if phase=='final':
   effects=[];groups=sorted(set(cases[g['caseId']]['eventGroup'] for g in generations));groupEffects=[]
   for group in groups:
    values={}
    for arm in ['coverage','single']:
     xs=[x for x in rs['perCase'] if x['arm']==arm and x['eventGroup']==group];n=sum(x['reference']['matched'] for x in xs);d=sum(x['reference']['eligible'] for x in xs);values[arm]=n/d if d else None
    diff=values['coverage']-values['single'];effects.append(diff);groupEffects.append({'eventGroup':group,'coverage':values['coverage'],'single':values['single'],'difference':diff})
   rs['pairedFacetDifference']={'eventGroups':len(effects),'templateFamilies':1,'meanDifference':statistics.mean(effects),'interval95':interval(effects),'perGroup':groupEffects,'method':'10000 equal-event-group bootstrap draws seed 20261115; conditional on one fictional template, not a real-news population interval','validatesFullSemanticRetention':False}
  r['phases'][phase]=rs
 r['postFreezeReplay']=read(ROOT/'postfix-replay-summary.json')
 r['postFreezeReplay']['noteAtReplayTime']=r['postFreezeReplay'].pop('note')
 r['postFreezeReplay']['subsequentReview']='All changed outputs were submitted for diagnostics; one of four attempts completed. Original replay-time artifact remains unchanged.'
 r['postFreezeDiagnostics']={}
 for model in ['gpt','claude']:
  ds=[read(f) for f in (ROOT/'paired-coverage-postfix'/model).glob('*/result.json')]
  r['postFreezeDiagnostics'][model]={'opportunities':2,'attempted':len(ds),'completed':sum(d['status']=='completed' for d in ds),'failed':sum(d['status']!='completed' for d in ds),'unperformed':2-len(ds),'metrics':{m:pooled(ds,m) for m in ['claimSupport','citationCorrectness','importantDevelopmentRecall','sourceGroundedCoverage','languageCorrectness']},'errors':[{'id':d['id'],'error':d.get('error')} for d in ds if d['status']!='completed']}
 for f in sorted(ROOT.rglob('*')):
  if f.is_file() and f.suffix in ['.json','.jsonl','.sqlite'] and 'source-snapshots' not in f.parts:r['artifactHashes'][f.relative_to(ROOT).as_posix()]=sha(f)
 OUT.mkdir(exist_ok=True,parents=True);(OUT/'results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 archive=io.BytesIO()
 with tarfile.open(fileobj=archive,mode='w') as tar:
  for f in sorted((ROOT/'source-snapshots').rglob('*')):
   if f.is_file():
    b=f.read_bytes();info=tarfile.TarInfo(f.relative_to(ROOT/'source-snapshots').as_posix());info.size=len(b);info.mtime=0;tar.addfile(info,io.BytesIO(b))
 with (OUT/'source-snapshots.tar.gz').open('wb') as f:
  with gzip.GzipFile(fileobj=f,filename='',mode='wb',mtime=0) as z:z.write(archive.getvalue())
 print(json.dumps({'financial':r['financial'],'phases':{p:{'generation':v['generation'],'judges':{m:{a:(x['completed'],x['attempted'],x['unperformed']) for a,x in arms.items()} for m,arms in v['judges'].items()}} for p,v in r['phases'].items()}},ensure_ascii=False))
if __name__=='__main__':main()