"""Bounded public-only alternative-provider sample; never calls the official X API."""
import subprocess
from pathlib import Path

REMOTE=r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
set -a
. "$HOME/.config/distilled-bench/twitterapi.env"
set +a
.venv/bin/python - <<'PY'
import json,os,subprocess,sys,time
from pathlib import Path
from datetime import datetime,timezone
from urllib.request import Request,urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError
os.umask(0o077)
folder=Path('data/campaigns/controlled-510-v1'); private=Path.home()/'.local/share/distilled-bench/controlled-x-alternatives-v1'
private.mkdir(parents=True,exist_ok=True)
profiles=['NASA','ESA','BBCWorld','Reuters','AP','UN']
queries=['"James Webb telescope" -filter:retweets','Lebanon electricity -filter:retweets','"renewable energy" -filter:retweets','"space exploration" -filter:retweets']
manifest={'profiles':profiles,'queries':queries,'evaluation_cap_per_target':10,'repetitions':1,'media':'excluded','official_x_api':'excluded','notes':'Public data only; no bypass or authenticated private content. Collection timestamps and raw counts retained. This is not a legal certification. Earlier pilots are not counted as this cohort.'}
mp=folder/'x-alternatives-roster.json'
if mp.exists() and json.loads(mp.read_text())!=manifest: raise SystemExit('Roster changed; review before dispatch')
mp.write_text(json.dumps(manifest,indent=2))
# Existing Apify ledgers and campaign budgets are reused, not reset.
for family,values,kind in [('profile',profiles,'x_profile'),('search',queries,'x_search')]:
    config=json.loads(Path('configs/pilot-x-'+family+'.local.json').read_text())
    for key in ('data_dir','credentials_file'):
        if config.get(key) and not Path(config[key]).is_absolute(): config[key]=str((Path('configs')/config[key]).resolve())
    config['repetitions']=1; config['limits'].update({'concurrency':1,'max_items':10,'max_pages':1})
    route=config['routes'][0]
    if route['adapter']!='apify': raise SystemExit('Unexpected provider')
    route['cost_ceiling_usd']=0.04; route['settings']['input']['maxItems']=10
    config['targets']=[{'id':'stage2_'+family+'_'+str(i+1),'kind':kind,'input':value,'routes':[route['id']]} for i,value in enumerate(values)]
    path=folder/('x-'+family+'-apify.json')
    if not path.exists(): path.write_text(json.dumps(config,indent=2))
    elif json.loads(path.read_text())!=config: raise SystemExit('Config changed; review before dispatch')
    run='controlled-510-v1-x-'+family+'-apify'; marker=folder/(run+'-submitted')
    if not marker.exists():
        subprocess.run([sys.executable,'-m','bench','preflight','--config',str(path)],check=True)
        marker.write_text(run)
        subprocess.run([sys.executable,'-m','bench','run','--config',str(path),'--run-id',run],check=True)
    # Config data_dir is relative to its original config file, as in the original.
    from bench.config import load
    loaded=load(path)
    subprocess.run([sys.executable,'-m','bench','process','--data-dir',loaded['data_dir'],'--run-id',run],check=True)
# Ten single-page TwitterAPI.io requests. No retries/pagination. A per-page
# response may contain 20 records; evaluate only the first ten. Estimated total
# $0.03 at the prior pilot rate, not an independently verified billing figure.
summaries=[]
for family,values in [('profile',profiles),('search',queries)]:
    for i,value in enumerate(values):
        name=family+'-'+str(i+1); path=private/(name+'.json'); marker=private/(name+'-submitted.json')
        endpoint='/twitter/user/last_tweets' if family=='profile' else '/twitter/tweet/advanced_search'
        params={'userName':value,'includeReplies':'false'} if family=='profile' else {'query':value,'queryType':'Latest'}
        if not path.exists():
            if marker.exists(): raise SystemExit('Uncertain earlier request; inspect '+name+' before retry')
            marker.write_text(json.dumps({'endpoint':endpoint,'params':params,'requested_at':datetime.now(timezone.utc).isoformat()},indent=2))
            req=Request('https://api.twitterapi.io'+endpoint+'?'+urlencode(params),headers={'X-API-Key':os.environ['TWITTERAPI_IO_KEY']})
            start=time.monotonic()
            try:
                with urlopen(req,timeout=60) as response: raw=response.read(10_000_001)
            except HTTPError as error:
                (private/(name+'-error.json')).write_bytes(error.read()); raise SystemExit('Provider HTTP '+str(error.code)+'; stopped')
            if len(raw)>10_000_000: raise SystemExit('Response byte cap exceeded')
            path.write_bytes(raw)
            (private/(name+'-timing.json')).write_text(json.dumps({'elapsed_seconds':time.monotonic()-start}))
            time.sleep(1)
        payload=json.loads(path.read_bytes()); data=payload.get('data',payload); rows=data.get('tweets') if isinstance(data,dict) else None
        if not isinstance(rows,list): raise SystemExit('Unexpected provider response: '+name)
        summaries.append({'target':name,'input':value,'raw_records':len(rows),'evaluated_records':min(10,len(rows)),'duplicates':len(rows)-len({r.get('id') for r in rows}),'missing_required_fields':sum(any(not r.get(k) for k in ('id','text','createdAt','url')) for r in rows[:10]),'request':json.loads(marker.read_text())})
result={'provider':'twitterapi_io','cases':summaries,'raw_records':sum(x['raw_records'] for x in summaries),'evaluated_records':sum(x['evaluated_records'] for x in summaries),'billing':'unreconciled; prior-rate estimate only','raw_storage':str(private)}
(folder/'x-twitterapi-summary.json').write_text(json.dumps(result,indent=2)); print(json.dumps(result,indent=2))
PY
'''
if __name__=='__main__':
    r=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=REMOTE.encode(),capture_output=True)
    Path(__file__).with_name('controlled-510-v1').joinpath('x-alternatives-run.txt').write_bytes(r.stdout+r.stderr)
    print((r.stdout+r.stderr).decode(errors='replace')); raise SystemExit(r.returncode)
