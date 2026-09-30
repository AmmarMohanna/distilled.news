"""Check saved LinkedIn fields and finalized charges, without new runs."""
import subprocess
from pathlib import Path
REMOTE=r'''
set -e
set -a
. "$HOME/.config/distilled-bench/apify.env"
set +a
python3 - <<'PY'
import json,os
from pathlib import Path
from urllib.request import Request,urlopen
folder=Path.home()/'.local/share/distilled-bench/controlled-linkedin-v1'
summary=json.loads((folder/'summary.json').read_text()); reports=[]
for case in summary['cases']:
    key=case['kind']+'-'+case['target'].rstrip('/').rsplit('/',1)[-1]
    request=Request('https://api.apify.com/v2/actor-runs/'+case['run_id'],headers={'Authorization':'Bearer '+os.environ['APIFY_TOKEN']})
    with urlopen(request,timeout=30) as response: run=json.load(response)['data']
    billing={k:run.get(k) for k in ('id','status','usageTotalUsd','chargedEventCounts','buildId')}
    (folder/(key+'-billing.json')).write_text(json.dumps(billing,indent=2))
    rows=json.loads((folder/(key+'-raw.json')).read_text()); items=json.loads((folder/(key+'-normalized.json')).read_text())['baseline']; mapped={i['sourceUrl']:i for i in items}; failures=[]
    for row in rows:
        item=mapped.get(row.get('linkedinUrl'),{}); links=[a['hyperlink'] for a in row.get('contentAttributes',[]) if isinstance(a.get('hyperlink'),str) and a['hyperlink'].startswith(('http://','https://'))]
        values={'retained':bool(item),'text':bool(row.get('content')) and item.get('text')==row['content'].strip(),'author':item.get('source',{}).get('title')==row.get('author',{}).get('name'),'date':item.get('postedAt')==row.get('postedAt',{}).get('date'),'url':item.get('sourceUrl')==row.get('linkedinUrl'),'attribute_links':all(link in item.get('links',[]) for link in links)}
        failures += [{'id':row.get('id'),'checkpoint':k} for k,v in values.items() if not v]
    reports.append({'target':case['target'],'returned':len(rows),'normalized':len(items),'checks':len(rows)*6,'failed_checkpoints':failures,'status':'EMPTY_UNVERIFIED' if not rows else 'FIELD_CHECKS_FAIL' if failures else 'FIELD_CHECKS_PASS','billing':billing,'nested_reposts':sum(bool(r.get('repost')) for r in rows),'reposted_by':sum(bool(r.get('repostedBy')) for r in rows)})
result={'cases':reports,'provider_total_usd':sum(r['billing']['usageTotalUsd'] or 0 for r in reports),'limitations':'Provider-field preservation only, not independent completeness. Empty target unresolved. Repost semantics and production-use rights are not established by this test.'}
(folder/'review.json').write_text(json.dumps(result,indent=2)); print(json.dumps(result,indent=2))
PY
'''
r=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=REMOTE.encode(),capture_output=True)
Path(__file__).with_name('controlled-510-v1').joinpath('linkedin-review.json').write_bytes(r.stdout)
print(r.stdout.decode(errors='replace'),r.stderr.decode(errors='replace')); raise SystemExit(r.returncode)
