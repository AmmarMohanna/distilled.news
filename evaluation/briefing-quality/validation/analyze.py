"""Read-only analysis of frozen references, model reports AND all financial ledgers."""
import argparse,json,sqlite3,statistics
from collections import Counter
from pathlib import Path
CATEGORIES=['factual','citation','coverage','relevance','repetition','temporal','language']
def ratio(n,d):return n/d if d else None
def confusion(rows,labels,category):
 c=dict(TP=0,FP=0,TN=0,FN=0)
 for r in rows:
  target=labels[r['id']]['expected'][category]
  if target is None:continue
  prediction=bool(r['predicted'][category]);c[('T' if prediction==bool(target) else 'F')+('P' if prediction else 'N')]+=1
 return {**c,'precision':ratio(c['TP'],c['TP']+c['FP']),'recall':ratio(c['TP'],c['TP']+c['FN']),'f1':ratio(2*c['TP'],2*c['TP']+c['FP']+c['FN']),'falsePositiveRate':ratio(c['FP'],c['FP']+c['TN']),'falseNegativeRate':ratio(c['FN'],c['FN']+c['TP'])}
def percentile(xs,q):
 if not xs:return None
 xs=sorted(xs);i=(len(xs)-1)*q;lo=int(i);return xs[lo]+(xs[min(lo+1,len(xs)-1)]-xs[lo])*(i-lo)
def analyze(root):
 root=Path(root);labels=json.loads((root/'control-labels.json').read_text(encoding='utf-8'));models={};all_results={}
 for model in sorted((root/'controls-run').iterdir()):
  if not model.is_dir():continue
  results=[json.loads(p.read_text(encoding='utf-8')) for p in model.glob('*/result.private.json')];complete=[r for r in results if r['status']=='completed'];controls=[r for r in complete if not labels[r['id']]['isFault']];faults=[r for r in complete if labels[r['id']]['isFault']];all_results[model.name]={r['id']:r for r in complete}
  calls=[];ledger_errors=[]
  for p in model.glob('*/eval.sqlite'):
   try:
    with sqlite3.connect(p.resolve().as_uri()+'?mode=ro',uri=True) as db:
     db.row_factory=sqlite3.Row;calls.extend(dict(row,caseId=p.parent.name) for row in db.execute('SELECT * FROM eval_calls'))
   except sqlite3.DatabaseError as e:ledger_errors.append({'id':p.parent.name,'error':str(e)})
  failures=[{'id':r['id'],'category':labels[r['id']]['category'],'language':r['language'],'phase':r.get('phase'),'error':r.get('error'),'latencyMs':r.get('latencyMs')} for r in results if r['status']=='failed'];attempted={c['caseId'] for c in calls}|{r['id'] for r in results};failed_fault_ids={i for i in attempted if labels[i]['isFault'] and i not in {r['id'] for r in complete}};found=sum(bool(r['predicted'][labels[r['id']]['category']]) for r in faults)
  missed=[{'id':r['id'],'category':labels[r['id']]['category'],'language':r['language'],'predicted':r['predicted'],'alert':r['alert']} for r in faults if not r['predicted'][labels[r['id']]['category']]]
  m={'planned':len(labels),'attempted':len(attempted),'completed':len(complete),'failedReports':failures,'incompleteWithoutReport':sorted(attempted-{r['id'] for r in results}),'notAttempted':sorted(set(labels)-attempted),'knownCorrectControls':len(controls),'falseAlertControls':sum(bool(r['alert']) for r in controls),'injectedFaultsCompleted':len(faults),'targetFaultsDetected':found,'missed':missed,'targetRecallCompleted':ratio(found,len(faults)),'targetRecallFailureAdjustedLower':ratio(found,len(faults)+len(failed_fault_ids)),'targetRecallFailureAdjustedUpper':ratio(found+len(failed_fault_ids),len(faults)+len(failed_fault_ids)),'byCategory':{c:confusion(complete,labels,c) for c in CATEGORIES},'byLanguage':{l:{'completed':sum(r['language']==l for r in complete),'categories':{c:confusion([r for r in complete if r['language']==l],labels,c) for c in CATEGORIES}} for l in ['en','ar','fr']},'calls':len(calls),'callStates':dict(Counter(c['state'] for c in calls)),'costUsd':sum((c['cost_micro'] or 0)/1e6 for c in calls),'unresolvedReservationUsd':sum(c['reservation_micro']/1e6 for c in calls if c['cost_micro'] is None),'ledgerErrors':ledger_errors,'latencyCompletedMs':{'n':len(complete),'p50':percentile([r['latencyMs'] for r in complete],.5),'p95':percentile([r['latencyMs'] for r in complete],.95)},'errorsDetected':dict(Counter(labels[r['id']]['category'] for r in faults if r['predicted'][labels[r['id']]['category']]))}
  case_confusion=dict(TP=0,FP=0,TN=0,FN=0)
  for r in complete:
   truth=labels[r['id']]['isFault'];prediction=any(r['predicted'].values());case_confusion[('T' if prediction==truth else 'F')+('P' if prediction else 'N')]+=1
  q=case_confusion;m['anyFaultDetection']={**q,'precision':ratio(q['TP'],q['TP']+q['FP']),'recall':ratio(q['TP'],q['TP']+q['FN']),'f1':ratio(2*q['TP'],2*q['TP']+q['FP']+q['FN'])}
  m['uncertainAssessments']={'claims':sum(sum(c['support']=='uncertain' or c['citationSupport']=='uncertain' for c in r['review']['claims']) for r in complete),'coverage':sum(sum(c['status']=='uncertain' for c in r['review']['coverage']) for r in complete),'items':sum(sum(any(i[k]=='uncertain' for k in ['relevance','repetition','temporal','language']) for i in r['review']['items']) for r in complete)}
  m['attemptedTargetFailuresByCategory']=dict(Counter(labels[i]['category'] for i in failed_fault_ids))
  m['unavailableCorrectControls']=sum(not labels[i]['isFault'] for i in attempted if i not in {r['id'] for r in complete})
  models[model.name]=m
 disagreements=[]
 if len(all_results)==2:
  a,b=list(all_results)
  for i in sorted(set(all_results[a])&set(all_results[b])):
   ra,rb=all_results[a][i],all_results[b][i];different=[c for c in CATEGORIES if ra['predicted'][c]!=rb['predicted'][c]]
   if different or ra['alert']!=rb['alert']:disagreements.append({'id':i,'language':labels[i]['language'],'expected':labels[i]['expected'],'eventGroup':labels[i]['eventGroup'],'categories':different,a:{'predicted':ra['predicted'],'alert':ra['alert']},b:{'predicted':rb['predicted'],'alert':rb['alert']}})
 jointly_completed=len(set.intersection(*(set(v) for v in all_results.values()))) if all_results else 0
 return {'models':models,'jointlyCompletedCases':jointly_completed,'disagreements':disagreements,'scoring':'Prespecified target-category mask on faulty cases; all categories negative on correct controls. Completed-only and conservative failure-adjusted detection are separate. Unknown cost holds are NOT settled as zero. Synthetic cases are not real published briefing quality.','independence':'Seven constructed event groups, with matched translations and mutations. Artificial prevalence; no real-world positive predictive value or superiority claim.'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--out');a=p.parse_args();result=analyze(a.root);text=json.dumps(result,indent=2,ensure_ascii=False)+'\n'
 if a.out:Path(a.out).write_text(text,encoding='utf-8')
 else:print(text)
