"""30 HTTP-body requests; preserve old reservations and add at most $0.10."""
import subprocess
from pathlib import Path
REMOTE=r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
.venv/bin/python - <<'PY'
import json,subprocess,sys
from pathlib import Path
folder=Path('data/campaigns/controlled-510-v1'); original=json.loads(Path('configs/pilot-zyte.local.json').read_text()); config=json.loads((folder/'web.json').read_text())
route=original['routes'][0]
if route['adapter']!='zyte_http' or route['settings'].get('request')!={}: raise SystemExit('Unexpected paid request features')
route['cost_ceiling_usd']=0.003
config['data_dir']=str(Path('data/live').resolve()); config['credentials_file']=original['credentials_file']; config['budget']={'total_usd':1.1,'providers':{'zyte':1.1}}; config['routes']=[route]; config['limits']['concurrency']=1
for target in config['targets']: target['routes']=[route['id']]
path=folder/'web-zyte.json'
if not path.exists(): path.write_text(json.dumps(config,indent=2))
elif json.loads(path.read_text())!=config: raise SystemExit('Frozen config changed')
(folder/'zyte-budget-basis.json').write_text(json.dumps({'earlier_reservation_preserved_usd':1,'ledger_cap_usd':1.1,'new_requests':30,'per_request_reserved_usd':0.003,'new_reserved_maximum_usd':0.09,'basis':'HTTP response body only, no browser/rendering/extraction/geolocation addons. Published upper standard HTTP tier $1.27/1000; reservation exceeds that rate. This is a harness bound, not an enforced provider spending limit.','pricing_source':'https://www.zyte.com/pricing/'},indent=2))
run='controlled-510-v1-web-zyte'; marker=folder/'web-zyte-submitted'
if not marker.exists():
    subprocess.run([sys.executable,'-m','bench','preflight','--config',str(path)],check=True)
    marker.write_text(run)
    subprocess.run([sys.executable,'-m','bench','run','--config',str(path),'--run-id',run],check=True)
subprocess.run([sys.executable,'-m','bench','process','--data-dir','data/live','--run-id',run],check=True)
print((Path('data/live/reports')/run/'report.md').read_text())
PY
'''
if __name__=='__main__':
    r=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=REMOTE.encode(),capture_output=True)
    Path(__file__).with_name('controlled-510-v1').joinpath('zyte-run.txt').write_bytes(r.stdout+r.stderr)
    print((r.stdout+r.stderr).decode(errors='replace')); raise SystemExit(r.returncode)
