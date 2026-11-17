"""Eight public LinkedIn targets, five posts each, $0.02/run maximum."""
import subprocess
from pathlib import Path
REMOTE=r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
set -a
. "$HOME/.config/distilled-bench/apify.env"
set +a
.venv/bin/python - <<'PY'
import asyncio,json,os,time
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from bench.extractors import isolated
os.umask(0o077)
folder=Path.home()/'.local/share/distilled-bench/controlled-linkedin-v1'; folder.mkdir(parents=True,exist_ok=True)
targets={'company':['microsoft','nasa','reuters','bbc-news'],'profile':['satyanadella','billgates','sundarpichai','richardbranson']}
roster={'targets':targets,'max_posts':5,'per_run_ceiling_usd':0.02,'batch_ceiling_usd':0.16,'media':'excluded','scope':'Public company and professional posts; no comments/reactions collection or authenticated private content.'}
rp=folder/'roster.json'
if rp.exists() and json.loads(rp.read_text())!=roster: raise SystemExit('Roster changed')
rp.write_text(json.dumps(roster,indent=2))
def save(name,value): (folder/name).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
def api(path,payload=None):
    req=Request('https://api.apify.com/v2/'+path,data=json.dumps(payload).encode() if payload is not None else None,headers={'Authorization':'Bearer '+os.environ['APIFY_TOKEN'],'Content-Type':'application/json'})
    try:
        with urlopen(req,timeout=45) as r: return json.load(r)
    except HTTPError as e:
        save('last-api-error.json',{'status':e.code,'body':e.read().decode(errors='replace')}); raise SystemExit('Provider HTTP '+str(e.code))
reports=[]
for kind,names in targets.items():
    actor='harvestapi~linkedin-'+kind+'-posts'
    save(kind+'-actor.json',api('acts/'+actor)['data'])
    for name in names:
        key=kind+'-'+name; target='https://www.linkedin.com/'+('company' if kind=='company' else 'in')+'/'+name+'/'
        state=folder/(key+'-run.json'); marker=folder/(key+'-submitted.json')
        if state.exists(): info=json.loads(state.read_text())
        else:
            if marker.exists(): raise SystemExit('Uncertain submission; inspect '+key)
            payload={'targetUrls':[target],'maxPosts':5,'scrapeComments':False,'scrapeReactions':False}
            save(marker.name,{'input':payload,'ceiling_usd':0.02})
            info=api('acts/'+actor+'/runs?timeout=180&maxItems=5&maxTotalChargeUsd=0.02',payload)['data']; save(state.name,info)
        deadline=time.monotonic()+240
        while info['status'] in ('READY','RUNNING','TIMING-OUT','ABORTING') and time.monotonic()<deadline:
            time.sleep(5); info=api('actor-runs/'+info['id'])['data']; save(state.name,info)
        if info['status']!='SUCCEEDED':
            reports.append({'target':target,'kind':kind,'run_id':info['id'],'status':info['status'],'returned':None}); continue
        rawfile=folder/(key+'-raw.json')
        if rawfile.exists(): rows=json.loads(rawfile.read_text())
        else:
            rows=api('datasets/'+info['defaultDatasetId']+'/items?format=json&clean=true&limit=5'); save(rawfile.name,rows)
        result=asyncio.run(isolated('apify',json.dumps(rows),{'id':key,'kind':'linkedin_'+kind,'input':target},info['startedAt']))
        save(key+'-normalized.json',result)
        reports.append({'target':target,'kind':kind,'run_id':info['id'],'status':info['status'],'returned':len(rows),'normalized':len(result['baseline']),'provider_reported_usd':info.get('usageTotalUsd'),'build_id':info.get('buildId'),'raw_file':rawfile.name})
summary={'cases':reports,'batch_ceiling_usd':0.16,'provider_usage_provisional':True,'limitations':'Field preservation and original-source truth review follow separately; success does not establish completeness or lawful production reuse.'}
save('summary.json',summary)
Path('data/campaigns/controlled-510-v1/linkedin-summary.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,indent=2))
PY
'''
if __name__=='__main__':
    r=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=REMOTE.encode(),capture_output=True)
    Path(__file__).with_name('controlled-510-v1').joinpath('linkedin-run.txt').write_bytes(r.stdout+r.stderr)
    print((r.stdout+r.stderr).decode(errors='replace')); raise SystemExit(r.returncode)
