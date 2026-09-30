"""Read finalized Apify usage, reconcile existing jobs, and compare saved output."""
import subprocess
from pathlib import Path

REMOTE = r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
set -a
. "$HOME/.config/distilled-bench/apify.env"
set +a
.venv/bin/python - <<'PY'
import json,os,subprocess,sys
from pathlib import Path
from urllib.request import Request,urlopen
from datetime import datetime,timezone
from bench.state import State
from contextlib import closing
root=Path('data/google-matched-20260924'); run='controlled-510-v1-google-matched'
report=json.loads((root/'reports'/run/'report.json').read_text())
folder=Path('data/campaigns/controlled-510-v1'); billing=[]; pairs={}
with closing(State(root)) as state:
    for job in report['jobs']:
        step=job['result']['steps'][0]; route=job['spec']['candidate']; target=job['spec']['target']['id']
        pairs.setdefault(target,{})[route]=step['normalized']['items']
        if route!='google_apify': continue
        remote=step['coverage']['remote_id']
        request=Request('https://api.apify.com/v2/actor-runs/'+remote,headers={'Authorization':'Bearer '+os.environ['APIFY_TOKEN']})
        with urlopen(request,timeout=30) as response: data=json.load(response)['data']
        evidence={k:data.get(k) for k in ('id','status','usageTotalUsd','chargedEventCounts','buildId','finishedAt')}
        evidence['observed_at']=datetime.now(timezone.utc).isoformat(); billing.append(evidence)
        if data['status']!='SUCCEEDED' or not isinstance(data.get('usageTotalUsd'),(int,float)): raise SystemExit('Final usage unavailable')
    (folder/'google-billing.json').write_text(json.dumps(billing,indent=2))
    for job in report['jobs']:
        if job['spec']['candidate']!='google_apify': continue
        remote=job['result']['steps'][0]['coverage']['remote_id']; entry=next(x for x in billing if x['id']==remote)
        state.reconcile(job['id']+'__google_apify',entry['usageTotalUsd'],str(folder/'google-billing.json')+'#'+remote)
summary=[]
for target,routes in pairs.items():
    def keyed(rows): return {x.get('url',x.get('sourceUrl')):x for x in rows}
    a=keyed(routes['google_apify']); b=keyed(routes['google_rss']); common=set(a)&set(b)
    summary.append({'target':target,'apify':len(a),'rss':len(b),'exact_url_overlap':len(common),'apify_only':len(set(a)-set(b)),'rss_only':len(set(b)-set(a))})
result={'billing':billing,'provider_total_usd':sum(x['usageTotalUsd'] for x in billing),'comparison':summary,'limitations':'Exact URLs only; query ordering and changing snapshots may differ. Not independent recall or publisher truth verification.'}
(folder/'google-closeout.json').write_text(json.dumps(result,indent=2))
subprocess.run([sys.executable,'-m','bench','process','--data-dir',str(root),'--run-id',run],check=True,stdout=subprocess.DEVNULL)
print(json.dumps(result,indent=2))
PY
'''
if __name__ == '__main__':
    result=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=REMOTE.encode(),capture_output=True)
    folder=Path(__file__).with_name('controlled-510-v1')
    (folder/'google-closeout.txt').write_bytes(result.stdout+result.stderr)
    print((result.stdout+result.stderr).decode(errors='replace'))
    raise SystemExit(result.returncode)
