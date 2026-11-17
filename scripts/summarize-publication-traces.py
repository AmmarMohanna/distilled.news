"""Read retained Wrangler tails, emit only bounded numeric publication diagnostics."""
import argparse,collections,hashlib,json,math
from pathlib import Path
def stats(xs):
 xs=sorted(x for x in xs if isinstance(x,(float,int)))
 return {'n':len(xs),'p50':xs[math.ceil(len(xs)*.5)-1] if xs else None,'p95':xs[math.ceil(len(xs)*.95)-1] if xs else None}
def summarize(path):
 data=path.read_bytes();raw=data.decode('utf-16' if data[:2]==b'\xff\xfe' else 'utf-8-sig',errors='replace');decoder=json.JSONDecoder();i=0;events=[];records=[];publication=[]
 while i<len(raw):
  if raw[i]!='{':i+=1;continue
  try:o,i=decoder.raw_decode(raw,i)
  except ValueError:i+=1;continue
  if not isinstance(o,dict) or 'eventTimestamp' not in o:continue
  events.append(o)
  for log in o.get('logs',[]):
   for item in log.get('message',[]):
    if not isinstance(item,str):continue
    try:r=json.loads(item)
    except ValueError:continue
    if not isinstance(r,dict):continue
    records.append(r)
    if r.get('type')=='V1_PIPELINE_LATENCY' and r.get('phase') in ['PUBLICATION','PUBLICATION_TURN']:
     publication.append({'eventTimestamp':o['eventTimestamp'],'workerVersion':o.get('scriptVersion',{}).get('id'),'phase':r['phase'],'outcome':r.get('outcome'),'wallMs':r.get('durationMs'),'counts':r.get('counts',{}),'stages':r.get('stages',{}),'containingInvocationCpuMs':o.get('cpuTime'),'containingInvocationWallMs':o.get('wallTime')})
 queue=[r for r in records if r.get('type')=='V1_QUEUE_LATENCY']
 return {'file':path.name,'sha256':hashlib.sha256(data).hexdigest(),'events':len(events),'recordTypes':dict(collections.Counter(r.get('type','UNKNOWN') for r in records)),'workerVersions':sorted(set(o.get('scriptVersion',{}).get('id','UNKNOWN') for o in events)),'queueOutcomes':dict(collections.Counter(r.get('outcome','UNKNOWN') for r in queue)),'queueWaitMs':stats([r.get('queueWaitMs') for r in queue]),'publicationSamples':publication,'casRejectedCauses':dict(collections.Counter(r.get('cause','UNKNOWN') for r in records if r.get('type')=='V1_FEED_CAS_REJECTED'))}
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',required=True,type=Path);parser.add_argument('tails',nargs='+',type=Path);args=parser.parse_args()
 report={'caveats':['Files are separate observations; overlapping retained captures are not pooled.','Invocation CPU/wall is not attributable solely to a nested publication stage.','No publication record means not observed, not zero latency.','Stages overlap; do not sum nested durations.'], 'files':[summarize(p) for p in args.tails]}
 with args.output.open('x',encoding='utf8') as f:json.dump(report,f,indent=2)
 print(json.dumps([{'file':f['file'],'events':f['events'],'publicationMs':[r['wallMs'] for r in f['publicationSamples']]} for f in report['files']]))
