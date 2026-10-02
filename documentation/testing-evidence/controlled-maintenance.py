"""Sync the narrow RSS date fix and inspect saved campaign results. No live collection."""
import base64, json, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
test=(root/'evaluation/acquisition-benchmark/tests/test_rss_pilot_fixes.py').read_text()
test=test[test.index('def test_atom_updated_date_fallback'):test.index('@pytest.mark.parametrize')]
changes=[('                dates = entry.get("published_parsed")','                dates = entry.get("published_parsed") or entry.get("updated_parsed")\n                date_source = "published" if entry.get("published_parsed") else "updated" if dates else None'), ('"published_at": parsed_date(stamp), "url": entry.get("link")','"published_at": parsed_date(stamp), "date_source": date_source, "url": entry.get("link")')]
script=r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
.venv/bin/python - <<'PY'
import base64,json
from pathlib import Path
payload=json.loads(base64.b64decode('PAYLOAD'))
path=Path('bench/processing.py'); source=path.read_text()
for old,new in payload['changes']:
    if new in source: continue
    if source.count(old)!=1: raise SystemExit('Unexpected processing.py state; not changed')
    source=source.replace(old,new,1)
backup=Path('data/campaigns/controlled-510-v1/processing-before-date-fix.py')
if not backup.exists(): backup.write_text(path.read_text())
path.write_text(source)
testpath=Path('tests/test_rss_date_fallback.py')
testpath.write_text('import asyncio\nfrom bench.processing import normalize\nTARGET={"id":"feed","kind":"rss","input":"https://example.com/feed"}\nSTAMP="2026-09-26T10:00:00Z"\n\n'+payload['test'])
report=json.loads(Path('data/live/reports/controlled-510-v1-telegram/report.json').read_text())
summary=[]
for job in report['jobs']:
    for step in (job.get('result') or {}).get('steps',[]):
        items=(step.get('normalized') or {}).get('items',[])
        summary.append({'target':job['spec']['target']['id'],'route':step['route'],'status':step.get('status'),'error':step.get('error'),'count':len(items),'ids':[i.get('id') for i in items],'dates':[i.get('published_at') for i in items]})
Path('data/campaigns/controlled-510-v1/telegram-summary.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary))
PY
.venv/bin/python -m pytest -q
'''.replace('PAYLOAD',base64.b64encode(json.dumps({'changes':changes,'test':test}).encode()).decode())
result=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=script.encode(),capture_output=True)
(Path(__file__).with_name('controlled-510-v1')/'maintenance.txt').write_bytes(result.stdout+result.stderr)
print((result.stdout+result.stderr).decode(errors='replace'))
raise SystemExit(result.returncode)
