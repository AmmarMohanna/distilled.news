"""Bounded paired baseline/current timing evidence; no timeout overrides."""
import argparse,json,os,subprocess,time,shutil
from pathlib import Path
root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-dir',type=Path,default=Path('.local-reports/timing-followup'))
args=parser.parse_args()
out=(root/args.output_dir).resolve()
out.mkdir(exist_ok=False)
cases=[('apps/worker/src/v1-intelligence/publication.test.ts','restart after durable model draft and grounding resumes publication without a second paid call'),('apps/worker/src/v1-intelligence/store.test.ts','batches 227 immutable lookups without losing missing IDs or changing the Feed epoch'),('benchmarks/validation-contract-evaluation.test.ts','replays reviewed labels and saved drafting routes with network forbidden and no invented semantic verdicts')]
rows=[]
for n in range(2):
 for index,(file,title) in enumerate(cases):
  for variant in (['baseline','current'] if (n+index)%2==0 else ['current','baseline']):
   name=f'{n+1}-{index+1}-{variant}'
   report=out/(name+'.json');log=out/(name+'.log')
   assert len(str(report))<260
   env=dict(os.environ);env.pop('VALIDATION_TIMING_BASELINE',None)
   if variant=='baseline':env['VALIDATION_TIMING_BASELINE']='2e46fa9'
   command=[shutil.which('corepack'),'pnpm','exec','vitest','run','--config','scripts/vitest.validation-followup.config.ts',file,'-t','^'+title+'$','--reporter=default','--reporter=json','--outputFile='+str(report)]
   start=time.monotonic()
   with log.open('xb') as stream:r=subprocess.run(command,cwd=root,env=env,stdout=stream,stderr=subprocess.STDOUT)
   data=json.loads(report.read_text(encoding='utf-8-sig'));assertions=[a for f in data['testResults'] for a in f['assertionResults'] if a['status'] in ['passed','failed']]
   assert len(assertions)==1 and assertions[0]['fullName']==title
   a=assertions[0];text=log.read_text(encoding='utf-8-sig',errors='replace')
   passed=a['status']=='passed' and r.returncode==0 and data.get('success') is True
   row={'round':n+1,'case':index+1,'variant':variant,'exitCode':r.returncode,'reportSuccess':data.get('success'),'assertionStatus':a['status'],'status':'passed' if passed else 'failed','durationMs':a.get('duration'),'processWallMs':(time.monotonic()-start)*1000,'timeout':('Test timed out in' in text or 'Hook timed out in' in text)}
   rows.append(row);(out/'results.json').write_text(json.dumps(rows,indent=2));print(json.dumps(row),flush=True)
