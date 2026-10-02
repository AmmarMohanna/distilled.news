"""Read-only status snapshot and evidence download for the five-day schedules."""
import json
import subprocess
from pathlib import Path
REMOTE=r'''
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
.venv/bin/python - <<'PY'
import json,sqlite3,time
from datetime import datetime,timezone
from pathlib import Path
root=Path.cwd(); folder=root/'data/campaigns/stage3-free-20260927'
result={'checked_at':datetime.now(timezone.utc).isoformat(),'manifest':json.loads((folder/'manifest.json').read_text()),'families':{}}
for family in ('core','telegram'):
    data=root/('data/stage3-free-20260927-'+family)
    db=sqlite3.connect('file:'+str(data/'benchmark.sqlite')+'?mode=ro',uri=True); db.row_factory=sqlite3.Row
    parent='stage3-free-20260927-'+family+'-schedule'
    anchor=db.execute('select created from runs where id=?',(parent,)).fetchone()[0]
    rounds=[dict(r) for r in db.execute('select id,created from runs where id!=? order by created',(parent,))]
    item={'start_utc':datetime.fromtimestamp(anchor,timezone.utc).isoformat(),'last_round_due_utc':datetime.fromtimestamp(anchor+120*3600,timezone.utc).isoformat(),'job_statuses':[dict(r) for r in db.execute('select run,status,count(*) as count from jobs group by run,status')],'rounds':rounds,'reports':{}}
    for r in rounds:
        r['scheduled_at']=anchor+int(r['id'].rsplit('r',1)[1])*21600
        r['start_lateness_seconds']=max(0,r['created']-r['scheduled_at'])
        report=data/'reports'/r['id']/'report.md'
        if report.exists(): item['reports'][r['id']]=report.read_text()
    result['families'][family]=item; db.close()
zyte=root/'data/live/reports/controlled-510-v1-web-zyte/report.json'
result['zyte_report']=json.loads(zyte.read_text())
print(json.dumps(result,ensure_ascii=True))
PY
'''
if __name__=='__main__':
    r=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=REMOTE.encode(),capture_output=True)
    if r.returncode: raise SystemExit(r.stderr.decode(errors='replace'))
    data=json.loads(r.stdout); zyte=data.pop('zyte_report')
    folder=Path(__file__).with_name('stage3-free-20260927')
    (folder/'status.json').write_text(json.dumps(data,indent=2),encoding='utf-8')
    Path(__file__).with_name('controlled-510-v1').joinpath('zyte-report.json').write_text(json.dumps(zyte,indent=2),encoding='utf-8')
    for name,item in data['families'].items(): print(name,json.dumps(item,ensure_ascii=True))
