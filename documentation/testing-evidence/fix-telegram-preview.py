"""Apply one guarded benchmark-only fix and test; no provider collection."""
import subprocess
from pathlib import Path
remote=r"""
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
.venv/bin/python - <<'PY'
from pathlib import Path
p=Path('bench/processing.py'); s=p.read_text()
old='    if adapter == "telegram_public": return await isolated("telegram", raw, target, fetched_at)'
new='''    if adapter == "telegram_public":
        result = await isolated("telegram", raw, target, fetched_at)
        # A channel landing page supplies no message inventory. It is not evidence
        # that the requested channel/window contains zero posts.
        if not result["items"] and not re.search(r"\\bdata-post\\s*=", raw, re.I):
            result.setdefault("issues", []).append("public_preview_has_no_message_inventory")
        return result'''
if old in s:
    backup=Path('data/campaigns/controlled-510-v1/processing-before-preview-fix.py')
    if not backup.exists(): backup.write_text(s)
    p.write_text(s.replace(old,new,1))
elif new not in s: raise SystemExit('Unexpected source; no replacement applied')
PY
.venv/bin/python -m pytest -q
.venv/bin/python - <<'PY'
import asyncio,json
from pathlib import Path
from bench.processing import normalize
data=Path('data/live'); r=json.loads((data/'reports/controlled-510-v1-telegram/report.json').read_text())
for j in r['jobs']:
    if j['spec']['target']['id']!='tg_rtnews': continue
    for s in j['result']['steps']:
        if s['adapter']!='telegram_public': continue
        result=asyncio.run(normalize((data/s['payload']['path']).read_bytes(),j['spec']['target'],{'adapter':'telegram_public','settings':{}},None))
        evidence={'target':'tg_rtnews','items':len(result['items']),'issues':result['issues'],'network_requests':0}
        Path('data/campaigns/controlled-510-v1/telegram-preview-fix.json').write_text(json.dumps(evidence,indent=2))
        print(json.dumps(evidence))
PY
"""
r=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=remote.encode(),capture_output=True)
Path(__file__).with_name('controlled-510-v1').joinpath('telegram-preview-fix.txt').write_bytes(r.stdout+r.stderr)
print((r.stdout+r.stderr).decode(errors='replace')); raise SystemExit(r.returncode)
