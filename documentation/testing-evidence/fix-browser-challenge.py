"""Guarded validator patch and saved-result rescoring, without acquisition."""
import base64,hashlib,subprocess
from pathlib import Path
source=Path('evaluation/acquisition-benchmark/bench/validator.py').read_text(encoding='utf-8')
added='    elif title.strip().casefold() == "client challenge" and re.search(r"required part of this site|verifying your browser", body[:600], re.I):\n        reasons.append("block_or_error_page")\n'
old=source.replace(added,'')
remote="""set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
.venv/bin/python - <<'PY'
import base64,hashlib
from pathlib import Path
p=Path('bench/validator.py'); old=p.read_text(); new=base64.b64decode('PAYLOAD').decode()
if old!=new:
    if hashlib.sha256(old.encode()).hexdigest()!='OLDHASH': raise SystemExit('Validator changed; review required')
    backup=Path('data/campaigns/controlled-510-v1/validator-before-challenge-fix.py')
    if not backup.exists(): backup.write_text(old)
    p.write_text(new)
PY
.venv/bin/python -m pytest -q
.venv/bin/python -m bench process --data-dir data/live --run-id controlled-510-v1-web-browser
""".replace('PAYLOAD',base64.b64encode(source.encode()).decode()).replace('OLDHASH',hashlib.sha256(old.encode()).hexdigest())
r=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=remote.encode(),capture_output=True)
Path(__file__).with_name('controlled-510-v1').joinpath('browser-challenge-fix.txt').write_bytes(r.stdout+r.stderr)
print((r.stdout+r.stderr).decode(errors='replace')); raise SystemExit(r.returncode)
