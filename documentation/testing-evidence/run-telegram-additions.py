"""Two explicit replacement targets; retains earlier invalid/unsupported attempts."""
import subprocess
from pathlib import Path
REMOTE=r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
set -a
. "$HOME/.config/distilled-bench/telegram.env"
set +a
.venv/bin/python - <<'PY'
import json,subprocess,sys
from pathlib import Path
folder=Path('data/campaigns/controlled-510-v1'); config=json.loads((folder/'telegram.json').read_text())
window=config['targets'][0]['options']
config['targets']=[{'id':'tg_'+n.lower(),'kind':'telegram','input':n,'routes':['telegram_public','telegram_api'],'options':window} for n in ['bbcpersian','AlArabiya']]
path=folder/'telegram-additions.json'
if not path.exists():
    with path.open('x') as f: json.dump(config,f,indent=2)
run='controlled-510-v1-telegram-additions'; marker=folder/'telegram-additions-submitted'
if not marker.exists():
    subprocess.run([sys.executable,'-m','bench','preflight','--config',str(path)],check=True)
    marker.write_text(run)
    subprocess.run([sys.executable,'-m','bench','run','--config',str(path),'--run-id',run],check=True)
subprocess.run([sys.executable,'-m','bench','process','--data-dir','data/live','--run-id',run],check=True)
print((Path('data/live/reports')/run/'report.md').read_text())
PY
'''
result=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=REMOTE.encode(),capture_output=True)
(Path(__file__).with_name('controlled-510-v1')/'telegram-additions.txt').write_bytes(result.stdout+result.stderr)
print((result.stdout+result.stderr).decode(errors='replace'))
raise SystemExit(result.returncode)
