"""Two matched serial V2 complete local publication pairs. No paid calls."""
import json,os,subprocess,shutil
from pathlib import Path
root=Path(__file__).resolve().parent.parent
out=root/'.local-reports/publication-day-pairs';out.mkdir(exist_ok=False)
rows=[]
for n in range(2):
 for variant in (['baseline','current'] if n==0 else ['current','baseline']):
  env=dict(os.environ);env.pop('PUBLICATION_DAY_BASELINE',None)
  if variant=='baseline':env['PUBLICATION_DAY_BASELINE']='dd88f5c'
  name=f'{n+1}-{variant}';log=out/(name+'.log');report=out/(name+'.json')
  command=[shutil.which('corepack'),'pnpm','exec','vitest','run','--config','scripts/vitest.publication-day.config.ts','-t','^v2 publishes the valid duration through complementary verification and durable receipt fencing$','--reporter=default','--reporter=json','--outputFile='+str(report)]
  with log.open('xb') as stream:result=subprocess.run(command,cwd=root,env=env,stdout=stream,stderr=subprocess.STDOUT)
  data=json.loads(report.read_text(encoding='utf-8-sig'));text=log.read_text(encoding='utf-8-sig',errors='replace')
  records=[]
  for line in text.splitlines():
   try:v=json.loads(line)
   except ValueError:continue
   if isinstance(v,dict) and v.get('type')=='V1_PIPELINE_LATENCY':records.append(v)
  record=next(v for v in records if v.get('phase')=='PUBLICATION' and v.get('windowId')=='controlled-v2')
  rows.append({'pair':n+1,'variant':variant,'exitCode':result.returncode,'success':data.get('success'),'record':record})
  (out/'results.json').write_text(json.dumps(rows,indent=2));print(json.dumps({'pair':n+1,'variant':variant,'exitCode':result.returncode,'wallMs':record['durationMs'],'inputLoads':record['counts']['publicationInputLoads']}),flush=True)
  if result.returncode or not data.get('success'):raise SystemExit('STRICT_PROFILE_ASSERTION_FAILED')
