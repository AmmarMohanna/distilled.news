"""Replay field preservation and reconcile completed alternative-provider jobs."""
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
import asyncio,json,os,hashlib,subprocess,sys,html,re,difflib
from pathlib import Path
from urllib.request import Request,urlopen
from datetime import datetime
from email.utils import parsedate_to_datetime
from bench.extractors import isolated
from bench.state import State
folder=Path('data/campaigns/controlled-510-v1'); private=Path.home()/'.local/share/distilled-bench/controlled-x-alternatives-v1'
roster=json.loads((folder/'x-alternatives-roster.json').read_text()); checks=[]; billing=[]; pairs={}
def stamp(v):
    try: return datetime.fromisoformat(v.replace('Z','+00:00')).timestamp()
    except ValueError: return parsedate_to_datetime(v).timestamp()
def verify(rows,items):
    mapped={str(x.get('messageId')):x for x in items}; failures=[]
    for row in rows:
        ident=str(row.get('id')); item=mapped.get(ident,{})
        author=row.get('author') or {}; links=[e['expanded_url'] for e in (row.get('entities') or {}).get('urls',[]) if isinstance(e.get('expanded_url'),str) and e['expanded_url'].startswith(('http://','https://'))]
        try: correct_date=stamp(item.get('postedAt',''))==stamp(row.get('createdAt',''))
        except (ValueError,TypeError,AttributeError): correct_date=False
        values={'text':bool(row.get('text')) and row['text']==item.get('text'),'author':bool(author.get('userName')) and item.get('source',{}).get('username')==author['userName'],'date':correct_date,'url':bool(row.get('url')) and item.get('sourceUrl')==row['url'],'expanded_links':all(x in item.get('links',[]) for x in links)}
        failures += [{'id':ident,'checkpoint':k} for k,v in values.items() if not v]
    return failures
for family,values in [('profile',roster['profiles']),('search',roster['queries'])]:
    config=json.loads((folder/('x-'+family+'-apify.json')).read_text()); data=Path(config['data_dir']); run='controlled-510-v1-x-'+family+'-apify'
    report=json.loads((data/'reports'/run/'report.json').read_text()); state=State(data)
    for job in report['jobs']:
        step=job['result']['steps'][0]; target=job['spec']['target']; index=values.index(target['input'])+1; key=family+'-'+str(index)
        if step['status']!='captured': checks.append({'target':key,'provider':'apify','status':step['status'],'reason':step.get('reason')}); continue
        raw=(data/step['payload']['path']).read_bytes(); assert hashlib.sha256(raw).hexdigest()==step['payload']['sha256']
        rows=json.loads(raw); items=step['normalized']['baseline']; failures=verify(rows,items)
        checks.append({'target':key,'provider':'apify','status':'captured','raw':len(rows),'normalized':len(items),'failed_checkpoints':failures})
        pairs.setdefault(key,{})['apify']={str(r['id']):r for r in rows[:10]}
        remote=step['coverage']['remote_id']; req=Request('https://api.apify.com/v2/actor-runs/'+remote,headers={'Authorization':'Bearer '+os.environ['APIFY_TOKEN']})
        with urlopen(req,timeout=30) as response: info=json.load(response)['data']
        entry={k:info.get(k) for k in ('id','status','usageTotalUsd','chargedEventCounts','buildId')}; billing.append(entry)
        (folder/'x-apify-billing.json').write_text(json.dumps(billing,indent=2))
        if info['status']=='SUCCEEDED' and isinstance(info.get('usageTotalUsd'),(int,float)):
            state.reconcile(job['id']+'__'+step['route'],info['usageTotalUsd'],str(folder/'x-apify-billing.json')+'#'+remote)
    state.close()
    subprocess.run([sys.executable,'-m','bench','process','--data-dir',str(data),'--run-id',run],check=True,stdout=subprocess.DEVNULL)
    for i,value in enumerate(values):
        key=family+'-'+str(i+1); payload=json.loads((private/(key+'.json')).read_text()); rows=payload.get('data',payload)['tweets'][:10]
        request=json.loads((private/(key+'-submitted.json')).read_text())
        result=asyncio.run(isolated('apify',json.dumps(rows),{'id':key,'kind':'x_'+family,'input':value},request['requested_at']))
        checks.append({'target':key,'provider':'twitterapi_io','status':'captured','raw':len(rows),'normalized':len(result['baseline']),'failed_checkpoints':verify(rows,result['baseline'])})
        pairs.setdefault(key,{})['twitterapi_io']={str(r['id']):r for r in rows}
comparisons=[]
for key,p in pairs.items():
    a=p.get('apify',{}); b=p.get('twitterapi_io',{}); common=set(a)&set(b)
    differences=[]
    for ident in common:
        ta=a[ident].get('text') or ''; tb=b[ident].get('text') or ''
        if ta!=tb: differences.append({'id':ident,'apify_characters':len(ta),'twitterapi_characters':len(tb),'equal_after_html_unescape':html.unescape(ta)==html.unescape(tb),'equal_with_urls_masked':re.sub(r'https?://\S+','URL',ta)==re.sub(r'https?://\S+','URL',tb),'apify_prefix_of_twitterapi':tb.startswith(ta),'twitterapi_prefix_of_apify':ta.startswith(tb),'changed_segments':[{'operation':op,'apify':ta[i:j],'twitterapi_io':tb[k:l]} for op,i,j,k,l in difflib.SequenceMatcher(None,ta,tb).get_opcodes() if op!='equal']})
    def detail(rows,ids): return [{'id':i,'date':rows[i].get('createdAt'),'author':(rows[i].get('author') or {}).get('userName'),'is_retweet':bool(rows[i].get('isRetweet') or rows[i].get('retweeted_tweet')),'is_reply':rows[i].get('isReply')} for i in sorted(ids)]
    comparisons.append({'target':key,'apify':len(a),'twitterapi_io':len(b),'id_overlap':len(common),'common_text_differences':differences,'apify_only':detail(a,set(a)-set(b)),'twitterapi_only':detail(b,set(b)-set(a))})
result={'checks':checks,'comparison':comparisons,'apify_provider_total_usd':sum(x.get('usageTotalUsd') or 0 for x in billing),'twitterapi_billing':'Unreconciled; 200 raw results, prior-rate estimate $0.03, 100 evaluated.','limitations':['Latest-page snapshots were collected sequentially, not simultaneously; overlap is not recall.','Apify from-profile filtering and TwitterAPI.io last_tweets semantics may differ.','Field checks use each raw provider response, not independent source truth.','TwitterAPI.io compatibility normalizer still labels provider as apify; not production integration.','Nested quote/repost content not independently verified.','No official X API calls.']}
(folder/'x-alternatives-review.json').write_text(json.dumps(result,indent=2)); print(json.dumps(result,indent=2))
PY
'''
if __name__=='__main__':
    r=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=REMOTE.encode(),capture_output=True)
    Path(__file__).with_name('controlled-510-v1').joinpath('x-alternatives-review.json').write_bytes(r.stdout)
    print(r.stdout.decode(errors='replace'),r.stderr.decode(errors='replace')); raise SystemExit(r.returncode)
