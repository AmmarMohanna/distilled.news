"""Reuse local real-source exports; exposed historical material is never held-out."""
import argparse,hashlib,json,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from evaluate import baseline
sha=lambda value:hashlib.sha256(value).hexdigest()
def run(source,public,out,materialize=False):
 source=Path(source);public=Path(public);out=Path(out);out.mkdir(parents=True,exist_ok=True)
 records=json.loads(source.read_text(encoding='utf-8'))['result'][0]['results'];documents=[(r,json.loads(r['json'])) for r in records]
 editions={e['id']:e for e in json.loads(public.read_text(encoding='utf-8'))['editions']}
 observations=[];cases=[];qualification=[]
 for row,d in sorted((v for v in documents if v[0]['kind']=='v3_window_inputs'),key=lambda v:v[1]['input']['windowStart']):
  i=d['input'];matched=editions[d['id']];feed=d['feedId'];articles=i['articles'];assert matched['windowStart']==i['windowStart'] and matched['windowEnd']==i['windowEnd'];assert all(a.get('text') and a.get('id') for a in articles)
  c={**i,'interestProfile':i['feed']['interest'],'language':i['feed']['language']};input_hash=sha(json.dumps(i,sort_keys=True,ensure_ascii=False).encode());qualification.append({'caseId':d['id'],'feedId':feed,'windowStart':i['windowStart'],'windowEnd':i['windowEnd'],'language':c['language'],'articles':len(articles),'originalPriorItems':len(i.get('prior',[])),'fullRetainedInput':True,'extractionCompleteness':'unknown: original export does not retain per-article completeness flags','independence':'exposed historical same-feed chronological track; event-connected windows must not be independent samples','sourceInputSha256':input_hash})
  for system in ['all-headlines','keyword']:
   started=time.perf_counter();items=baseline(c,system);latency=(time.perf_counter()-started)*1000
   observations.append({'caseId':d['id'],'system':system,'language':c['language'],'articles':len(articles),'selected':len(items),'characters':sum(len(v['headline'])+len(v['body']) for v in items),'latencyMs':latency,'outputSha256':sha(json.dumps(items,sort_keys=True,ensure_ascii=False).encode()),'inputSha256':input_hash,'calls':0,'costUsd':0,'scope':'actual deterministic baseline selection only; not a model-judged quality score'})
  if materialize:
   result=next(x['result'] for r,x in documents if r['kind']=='v3_window_results' and x['id']==d['id']);frozen=json.loads((out/'freeze.json').read_text(encoding='utf-8'))['frozenAt']
   case={'id':d['id'],'feedId':feed,'language':c['language'],'interest':c['interestProfile'],'windowStart':i['windowStart'],'windowEnd':i['windowEnd'],'frozenAt':frozen,'publishedAt':matched['publishedAt'],'evidenceScope':'all_eligible_frozen_input','evidenceComplete':False,'articles':[{'id':a['id'],'feedId':feed,'text':a['text'],'title':a.get('title'),'url':a.get('url'),'publishedAt':a.get('publishedAt'),'completeness':'unknown'} for a in articles],'prior':i.get('prior',[]),'items':result['items'],'pipelineStatus':'published' if result['items'] else 'quiet','sourceLabel':'historical-retained-nov1-public-feed','limitations':['Retained export lacks independent source extraction-completeness metadata; assess retained text only.']}
   p=out/'historical'/f"{d['id']}.json";p.parent.mkdir(exist_ok=True)
   if p.exists():assert json.loads(p.read_text(encoding='utf-8'))==case
   else:p.write_text(json.dumps(case,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
   cases.append({'id':d['id'],'path':str(p.resolve()),'windowStart':i['windowStart'],'windowEnd':i['windowEnd'],'inputSha256':input_hash})
 report={'sourceExportSha256':sha(source.read_bytes()),'publicExportSha256':sha(public.read_bytes()),'qualification':qualification,'extractiveObservations':observations,'paidComparisonPerformed':False,'qualityScores':None,'heldOut':False}
 (out/'historical-extractive-results.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
 if materialize:(out/'paired-plan.private.json').write_text(json.dumps({'measurementClass':'historical-exploratory-retained-full-input','initialHistory':None,'historyPolicy':'Explicit shared cold start, separate actual chronological history per replay system; actual published outputs analysed separately with original history','cases':cases},indent=2)+'\n',encoding='utf-8')
 print(json.dumps(report))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('public');p.add_argument('out');p.add_argument('--materialize',action='store_true');a=p.parse_args();run(a.source,a.public,a.out,a.materialize)
