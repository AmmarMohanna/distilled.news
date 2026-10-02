"""Matched 30-URL browser batch, after verifying the known persistent firewall."""
import subprocess
from pathlib import Path
REMOTE=r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64
systemctl is-active --quiet distilled-bench-egress.service
.venv/bin/python - <<'PY'
import hashlib,json,subprocess,sys,os
from pathlib import Path
folder=Path('data/campaigns/controlled-510-v1')
if os.getuid()!=1000: raise SystemExit('Unexpected benchmark UID')
service=subprocess.check_output(['systemctl','cat','distilled-bench-egress.service'],text=True)
if 'ExecStart=/usr/sbin/nft -f /etc/distilled-bench-egress.nft' not in service:
    raise SystemExit('Firewall service changed; review before collection')
# The administrator already supplied the full ruleset for UID 1000. Recheck the
# active service and outbound behavior without requiring access to its root-only file.
probes=[]
for url in ('http://192.0.2.1','http://[2001:db8::1]','https://example.com'):
    p=subprocess.run(['curl','--noproxy','*','-g','-sS','--max-time','15','-o','/dev/null','-w','%{http_code}',url],capture_output=True,text=True)
    probes.append({'url':url,'exit':p.returncode,'status':p.stdout,'error':p.stderr})
if any(p['exit']!=7 for p in probes[:2]) or probes[2]['exit'] or probes[2]['status']!='200':
    raise SystemExit('Outbound probes failed: '+json.dumps(probes))
(folder/'browser-egress-probes.json').write_text(json.dumps({'uid':os.getuid(),'service':service,'probes':probes,'basis':'Previously administrator-verified full ruleset plus active service and current outbound probes; not a fresh full ruleset dump.'},indent=2))
config=json.loads((folder/'web.json').read_text())
config['limits']['concurrency']=1
config['routes']=[{'id':'browser_standard','adapter':'browser_playwright','enabled':True,'settings':{'network':'standard','host_egress_firewall_confirmed':True}}]
for target in config['targets']: target['routes']=['browser_standard']
path=folder/'web-browser.json'
if not path.exists():
    with path.open('x') as f: json.dump(config,f,ensure_ascii=False,indent=2)
run='controlled-510-v1-web-browser'; marker=folder/'web-browser-submitted'
if not marker.exists():
    subprocess.run([sys.executable,'-m','bench','server-check','--config',str(path)],check=True)
    marker.write_text(run)
    subprocess.run([sys.executable,'-m','bench','run','--config',str(path),'--run-id',run],check=True)
subprocess.run([sys.executable,'-m','bench','process','--data-dir','data/live','--run-id',run],check=True)
print((Path('data/live/reports')/run/'report.md').read_text())
PY
'''
result=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=REMOTE.encode(),capture_output=True)
(Path(__file__).with_name('controlled-510-v1')/'browser-collection.txt').write_bytes(result.stdout+result.stderr)
print((result.stdout+result.stderr).decode(errors='replace'))
raise SystemExit(result.returncode)
