"""Install paid Stage 3 with suballocations below $20 per alternative."""
import base64
import subprocess
from pathlib import Path

REMOTE=r'''
set -eu
umask 077
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
set -a
. "$HOME/.config/distilled-bench/apify.env"
. "$HOME/.config/distilled-bench/twitterapi.env"
set +a
.venv/bin/python - <<'PY'
import base64,json,os,subprocess,sys,time,hashlib
from pathlib import Path
from urllib.request import Request,urlopen
root=Path.cwd(); old=root/'data/campaigns/controlled-510-v1'; folder=root/'data/campaigns/stage3-paid-20260927'; folder.mkdir(exist_ok=True)
def read(name): return json.loads((old/(name+'.json')).read_text())
x=read('x-profile-apify'); s=read('x-search-apify'); x['routes']+=s['routes']; x['targets']+=s['targets']
g=read('google-matched'); g['routes']=[r for r in g['routes'] if r['adapter']=='apify']
for t in g['targets']: t['routes']=['google_apify']
w=read('web-zyte'); assert w['routes'][0]['settings'].get('request',{})=={}
li={'version':1,'mode':'live','costs':{'server_monthly_usd':None},'credentials_file':str(Path.home()/'.config/distilled-bench/apify.env'),'limits':{'max_items':5,'max_pages':1,'job_seconds':180,'attempt_seconds':45,'poll_seconds':3},'routes':[],'targets':[]}
for kind,names in [('company',['microsoft','nasa','reuters','bbc-news']),('profile',['satyanadella','billgates','sundarpichai','richardbranson'])]:
    route='linkedin_'+kind
    li['routes'].append({'id':route,'adapter':'apify','provider':'apify','enabled':True,'cost_ceiling_usd':0.02,'cost_bound_confirmed':True,'settings':{'actor_id':'harvestapi/linkedin-'+kind+'-posts','schema_confirmed':True,'input':{'targetUrls':['{input}'],'maxPosts':5,'scrapeComments':False,'scrapeReactions':False}}})
    for name in names: li['targets'].append({'id':route+'_'+name.replace('-','_'),'kind':'linkedin_'+kind,'input':'https://www.linkedin.com/'+('company' if kind=='company' else 'in')+'/'+name+'/','routes':[route]})
budgets={'x':8.4,'google':5.04,'linkedin':3.36,'web':1.89}
configs={'x':x,'google':g,'linkedin':li,'web':w}
actor_evidence={}
for family,c in configs.items():
    c.update(stage='soak',repetitions=1,data_dir=str(root/('data/stage3-paid-20260927-'+family)))
    c['limits']['concurrency']=1
    provider='zyte' if family=='web' else 'apify'
    c['budget']={'total_usd':budgets[family],'providers':{provider:budgets[family]}}
    c.pop('schedule',None)
    # Capture provider pricing/build metadata; each run records its actual build.
    for route in c['routes']:
        if route['adapter']!='apify': continue
        actor=route['settings']['actor_id']
        if actor not in actor_evidence:
            req=Request('https://api.apify.com/v2/acts/'+actor.replace('/','~'),headers={'Authorization':'Bearer '+os.environ['APIFY_TOKEN']})
            with urlopen(req,timeout=30) as r: info=json.load(r)['data']
            actor_evidence[actor]={k:info.get(k) for k in ('id','pricingInfos','currentPricingInfo','taggedBuilds','defaultRunOptions')}
    path=folder/(family+'.json')
    if path.exists():
        assert json.loads(path.read_text())==c, 'Frozen config changed'
    else: path.write_text(json.dumps(c,ensure_ascii=False,indent=2))
    r=subprocess.run([sys.executable,'-m','bench','preflight','--config',str(path)],capture_output=True,text=True)
    (folder/(family+'-preflight.json')).write_text(r.stdout)
    assert r.returncode==0 and json.loads(r.stdout)['ready'], r.stdout
req=Request('https://api.twitterapi.io/oapi/my/info',headers={'X-API-Key':os.environ['TWITTERAPI_IO_KEY']})
with urlopen(req,timeout=30) as response: balance=json.load(response)['recharge_credits']
assert isinstance(balance,(int,float)) and balance>=2000, 'TwitterAPI.io requires enough credits for one reservation'
(folder/'provider-pricing-snapshot.json').write_text(json.dumps(actor_evidence,indent=2))
mp=folder/'manifest.json'
if not mp.exists():
    manifest={'campaign':'stage3-paid-20260927','anchor_epoch':time.time(),'rounds':21,'interval_seconds':21600,'alternative_ceiling_usd':20,'stage3_allocations_usd':{'X_combined':12.6,'Google_News':5.04,'LinkedIn':3.36,'Websites':1.89},'route_reservations_usd':budgets|{'twitterapi_io':4.2},'twitter_targets':x['targets'],'twitter_credit_baseline':balance,'credits_per_usd':100000,'prior_campaign_ledgers':'Preserved untouched. These are incremental Stage 3 suballocations, not a reset of prior spending.','official_x_api':False,'bright_data':False,'media':False,'billing_note':'Apify uses per-run provider charge caps; TwitterAPI.io and Zyte use fixed request counts and published-rate headroom. Reservations are not invoices; no auto-recharge changes.'}
    mp.write_text(json.dumps(manifest,indent=2))
else: manifest=json.loads(mp.read_text())
worker=folder/'worker.py'; source=base64.b64decode('__WORKER__')
if worker.exists(): assert worker.read_bytes()==source, 'Worker changed after installation'
else: worker.write_bytes(source)
wrapper=folder/'run.sh'
wrapper.write_text('#!/bin/bash\nset -eu\numask 077\ncd '+str(root)+'\nexec 9>'+str(folder/'worker.lock')+'\nflock -n 9 || exit 0\nexport PATH="$HOME/.local/node24/bin:$PATH"\nset -a\n. "$HOME/.config/distilled-bench/apify.env"\n. "$HOME/.config/distilled-bench/twitterapi.env"\nset +a\n.venv/bin/python -u '+str(worker)+' >> '+str(folder/'worker.log')+' 2>&1\n')
wrapper.chmod(0o700)
cron=subprocess.run(['crontab','-l'],capture_output=True,text=True)
assert cron.returncode in (0,1)
lines=[l for l in cron.stdout.splitlines() if '# distilled-stage3-paid-20260927' not in l]
lines.append('*/5 * * * * /bin/bash '+str(wrapper)+' >> '+str(folder/'watchdog.log')+' 2>&1 # distilled-stage3-paid-20260927')
subprocess.run(['crontab','-'],input='\n'.join(lines)+'\n',text=True,check=True)
with (folder/'watchdog.log').open('ab') as log: subprocess.Popen(['/bin/bash',str(wrapper)],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
print(json.dumps({'manifest':manifest,'worker_sha256':hashlib.sha256(source).hexdigest(),'preflight':'all ready','actor_metadata_saved':len(actor_evidence)},indent=2))
PY
'''
if __name__=='__main__':
    source=Path(__file__).with_name('stage3-paid-worker.py').read_bytes()
    script=REMOTE.replace('__WORKER__',base64.b64encode(source).decode())
    r=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=script.encode(),capture_output=True)
    folder=Path(__file__).with_name('stage3-paid-20260927'); folder.mkdir(exist_ok=True)
    (folder/'launch.json').write_bytes(r.stdout)
    print((r.stdout+r.stderr).decode(errors='replace')); raise SystemExit(r.returncode)
