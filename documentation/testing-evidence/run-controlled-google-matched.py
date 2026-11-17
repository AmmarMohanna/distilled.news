"""Six matched query settings, within the existing Google campaign budget ledger."""
import subprocess
from pathlib import Path
REMOTE=r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
.venv/bin/python - <<'PY'
import json,subprocess,sys
from pathlib import Path
folder=Path('data/campaigns/controlled-510-v1')
config=json.loads(Path('configs/pilot-google-matched-isolated.local.json').read_text())
config['data_dir']=str(Path('data/google-matched-20260924').resolve())
config['repetitions']=1
config['stage']='controlled'
config['limits'].update({'max_items':10,'max_pages':1})
config['targets']=json.loads((folder/'google.json').read_text())['targets']
for target in config['targets']: target['routes']=['google_rss','google_apify']
route=next(r for r in config['routes'] if r['id']=='google_apify')
route['cost_ceiling_usd']=0.04
route['settings']['input'].update({'language':'{language}','geo':'{region}','maxItemsPerQuery':10})
path=folder/'google-matched.json'
if not path.exists():
    with path.open('x') as f: json.dump(config,f,ensure_ascii=False,indent=2)
run='controlled-510-v1-google-matched'; marker=folder/'google-matched-submitted'
if not marker.exists():
    subprocess.run([sys.executable,'-m','bench','preflight','--config',str(path)],check=True)
    marker.write_text(run)
    subprocess.run([sys.executable,'-m','bench','run','--config',str(path),'--run-id',run],check=True)
subprocess.run([sys.executable,'-m','bench','process','--data-dir',config['data_dir'],'--run-id',run],check=True)
print((Path(config['data_dir'])/'reports'/run/'report.md').read_text())
PY
'''
result=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=REMOTE.encode(),capture_output=True)
(Path(__file__).with_name('controlled-510-v1')/'google-matched.txt').write_bytes(result.stdout+result.stderr)
print((result.stdout+result.stderr).decode(errors='replace'))
raise SystemExit(result.returncode)
