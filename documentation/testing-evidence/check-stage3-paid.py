"""Read-only snapshot of paid schedule, reservations, billing and reports."""
import json
import subprocess
from pathlib import Path
REMOTE=r'''
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
.venv/bin/python - <<'PY'
import json,sqlite3,time
from datetime import datetime,timezone
from pathlib import Path
root=Path.cwd(); folder=root/'data/campaigns/stage3-paid-20260927'
m=json.loads((folder/'manifest.json').read_text())
out={'checked_at':datetime.now(timezone.utc).isoformat(),'start_utc':datetime.fromtimestamp(m['anchor_epoch'],timezone.utc).isoformat(),'last_round_due_utc':datetime.fromtimestamp(m['anchor_epoch']+120*3600,timezone.utc).isoformat(),'allocations_usd':m['stage3_allocations_usd'],'families':{},'halts':{},'rounds':[]}
for family in ('x','google','linkedin','web'):
    data=root/('data/stage3-paid-20260927-'+family); dbfile=data/'benchmark.sqlite'
    row={'status':'not_started'}
    if dbfile.exists():
        db=sqlite3.connect('file:'+str(dbfile)+'?mode=ro',uri=True); db.row_factory=sqlite3.Row
        row={'jobs':[dict(x) for x in db.execute('select run,status,count(*) as count from jobs group by run,status')],'reserved_usd':db.execute('select coalesce(sum(reserved),0) from spend').fetchone()[0],'reports':{}}
        for p in (data/'reports').glob('*/report.md'): row['reports'][p.parent.name]=p.read_text()
        row['completed_processing']=[json.loads(p.read_text()) for p in folder.glob('stage3-paid-20260927-'+family+'-r*-processed.json')]
        db.close()
    out['families'][family]=row
results=[json.loads(p.read_text()) for p in folder.glob('twitter-r*/*-result.json')]
out['twitterapi_io']={'requests_reserved':len(list(folder.glob('twitter-r*/*-submitted.json'))),'completed':len(results),'observed_account_delta_usd':sum(x['observed_account_delta_usd'] for x in results),'raw_records':sum(x['raw_count'] for x in results),'evaluated_records':sum(x['evaluated_count'] for x in results)}
out['halts']={p.name:json.loads(p.read_text()) for p in folder.glob('*-HALTED.json')}
out['rounds']=[json.loads(p.read_text()) for p in sorted(folder.glob('round-*.json'))]
out['worker_log_tail']=(folder/'worker.log').read_text()[-2000:] if (folder/'worker.log').exists() else ''
print(json.dumps(out,ensure_ascii=True))
PY
'''
if __name__=='__main__':
    r=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=REMOTE.encode(),capture_output=True)
    if r.returncode: raise SystemExit(r.stderr.decode(errors='replace'))
    d=json.loads(r.stdout)
    Path(__file__).with_name('stage3-paid-20260927').joinpath('status.json').write_text(json.dumps(d,indent=2),encoding='utf-8')
    for row in d['families'].values():
        row.pop('reports',None)
        for item in row.get('completed_processing',[]):
            billing=item.pop('billing',[])
            item['provider_reported_usd']=sum(x.get('usageTotalUsd') or 0 for x in billing)
            item['caps_returned']=[(x.get('options') or {}).get('maxTotalChargeUsd') for x in billing]
    print(json.dumps(d,indent=2))
