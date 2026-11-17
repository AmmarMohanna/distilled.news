"""Install bounded five-day free-route schedules; reruns preserve frozen inputs."""
import subprocess
from pathlib import Path

REMOTE = r'''
set -eu
umask 077
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
set -a
. "$HOME/.config/distilled-bench/telegram.env"
set +a
.venv/bin/python - <<'PY'
import json, subprocess, sys, shlex
from pathlib import Path
from datetime import datetime, timezone, timedelta
root=Path.cwd(); old=root/'data/campaigns/controlled-510-v1'
folder=root/'data/campaigns/stage3-free-20260927'; folder.mkdir(parents=True,exist_ok=True)
def read(name): return json.loads((old/(name+'.json')).read_text())
core=read('web'); core['routes']+=read('rss')['routes']+read('google')['routes']
core['targets']+=read('rss')['targets']+read('google')['targets']
tg=read('telegram'); additions=read('telegram-additions')
alltargets=tg['targets']+additions['targets']
names={'AjaNews','telegram','bbcrussian','rtnews','bbcpersian','AlArabiya'}
tg['targets']=[t for t in alltargets if t['input'].lower() in {n.lower() for n in names}]
assert len(tg['targets'])==6
# Initial windows satisfy preflight; scheduler replaces them each round.
summary={'campaign':'stage3-free-20260927','families':{},'paid_routes_enabled':False,'quality_acceptance':'Unverified without independent references; record failures, do not treat capture as PASS.'}
for name,c in [('core',core),('telegram',tg)]:
    c.update(stage='soak',repetitions=1,data_dir=str(root/('data/stage3-free-20260927-'+name)),budget={'total_usd':0,'providers':{}},schedule={'rounds':21,'interval_seconds':21600})
    c.pop('credentials_file',None); c['limits']['concurrency']=1
    if name=='telegram': c['schedule']['rolling_window_hours']=720
    for t in c['targets']: t.pop('reference',None)
    path=folder/(name+'.json')
    if path.exists():
        existing=json.loads(path.read_text())
        if existing!=c:
            assert name=='telegram' and not (folder/'manifest.json').exists(), 'Frozen config differs'
            path.write_text(json.dumps(c,ensure_ascii=False,indent=2))
    else: path.write_text(json.dumps(c,ensure_ascii=False,indent=2))
    pre=subprocess.run([sys.executable,'-m','bench','preflight','--config',str(path)],capture_output=True,text=True)
    (folder/(name+'-preflight.json')).write_text(pre.stdout)
    if pre.returncode or not json.loads(pre.stdout)['ready']: raise SystemExit(pre.stdout)
    run='stage3-free-20260927-'+name
    wrapper=folder/(name+'.sh')
    lines=['#!/bin/bash','set -eu','umask 077',f'cd {shlex.quote(str(root))}',f'exec 9>{shlex.quote(str(folder/(name+".lock")))}','flock -n 9 || exit 0',f'test ! -f {shlex.quote(str(folder/(name+".complete")))} || exit 0','export PATH="$HOME/.local/node24/bin:$PATH"']
    if name=='telegram': lines+=['set -a','. "$HOME/.config/distilled-bench/telegram.env"','set +a']
    lines += [f'.venv/bin/python -u -m bench schedule --config {shlex.quote(str(path))} --run-id {run} >> {shlex.quote(str(folder/(name+".log")))} 2>&1',f'touch {shlex.quote(str(folder/(name+".complete")))}']
    wrapper.write_text('\n'.join(lines)+'\n'); wrapper.chmod(0o700)
    summary['families'][name]={'run_id':run,'config':str(path),'data_dir':c['data_dir'],'targets':len(c['targets']),'jobs_per_round':sum(len(t['routes']) for t in c['targets']),'rounds':21,'interval_hours':6,'span_hours':120}
cron=subprocess.run(['crontab','-l'],capture_output=True,text=True)
if cron.returncode not in (0,1): raise SystemExit(cron.stderr)
lines=[l for l in cron.stdout.splitlines() if '# distilled-stage3-free-20260927-' not in l]
for name in ('core','telegram'):
    lines.append(f'*/5 * * * * /bin/bash {folder}/{name}.sh >> {folder}/{name}-watchdog.log 2>&1 # distilled-stage3-free-20260927-{name}')
subprocess.run(['crontab','-'],input='\n'.join(lines)+'\n',text=True,check=True)
for name in ('core','telegram'):
    with open(folder/(name+'-watchdog.log'),'ab') as log:
        subprocess.Popen(['/bin/bash',str(folder/(name+'.sh'))],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
(folder/'manifest.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,indent=2))
PY
'''
if __name__=='__main__':
    r=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=REMOTE.encode(),capture_output=True)
    folder=Path(__file__).with_name('stage3-free-20260927'); folder.mkdir(exist_ok=True)
    (folder/'launch.txt').write_bytes(r.stdout+r.stderr)
    print((r.stdout+r.stderr).decode(errors='replace')); raise SystemExit(r.returncode)
