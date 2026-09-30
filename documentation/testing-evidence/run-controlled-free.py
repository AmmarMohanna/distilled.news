"""Bounded controlled collection: RSS/Google RSS/Telegram, no paid providers.

Creates frozen configs and stable run IDs; repeat invocation processes existing
runs, never submits a second acquisition for that ID.
"""
import subprocess
from pathlib import Path

REMOTE = r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
set -a
. "$HOME/.config/distilled-bench/telegram.env"
set +a
.venv/bin/python -u - <<'PY'
import json, subprocess, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
root = Path.cwd()
folder = root / 'data/campaigns/controlled-510-v1'
folder.mkdir(parents=True, exist_ok=True)
now = datetime.now(timezone.utc)
window = {'start_time': (now - timedelta(days=30)).isoformat(), 'end_time': now.isoformat()}
feeds = [
('bbc_world','https://feeds.bbci.co.uk/news/world/rss.xml'),
('bbc_science','https://feeds.bbci.co.uk/news/science_and_environment/rss.xml'),
('guardian_world','https://www.theguardian.com/world/rss'),
('nasa','https://www.nasa.gov/feed/'),
('lemonde','https://www.lemonde.fr/rss/une.xml'),
('aljazeera','https://www.aljazeera.net/aljazeerarss'),
('bbc_arabic','https://feeds.bbci.co.uk/arabic/rss.xml'),
('france24_fr','https://www.france24.com/fr/rss'),
('france24_ar','https://www.france24.com/ar/rss'),
('dw_en','https://rss.dw.com/rdf/rss-en-all'),
('un_ar','https://news.un.org/feed/subscribe/ar/news/all/rss.xml'),
('esa','https://www.esa.int/rssfeed/Our_Activities/Space_News')]
queries = [('lebanon_en','Lebanon electricity','en','US'), ('space_en','James Webb telescope','en','US'),
('lebanon_ar','الكهرباء لبنان','ar','LB'), ('space_ar','تلسكوب جيمس ويب','ar','EG'),
('energy_fr','électricité énergie','fr','FR'), ('space_fr','télescope James Webb','fr','FR')]
channels = ['AjaNews','telegram','bbcrussian','durov','NASA','rtnews']
cases = {
'rss': ([{'id':'rss_baseline','adapter':'rss','enabled':True,'settings':{'parser':'baseline'}}],
    [{'id':n,'kind':'rss','input':u,'routes':['rss_baseline']} for n,u in feeds]),
'google': ([{'id':'google_rss','adapter':'google_news_rss','enabled':True,'settings':{}}],
    [{'id':n,'kind':'google_news','input':q,'routes':['google_rss'],'options':{'language':lang,'region':region}} for n,q,lang,region in queries]),
'telegram': ([{'id':'telegram_public','adapter':'telegram_public','enabled':True,'settings':{}}, {'id':'telegram_api','adapter':'telethon','enabled':True,'settings':{}}],
    [{'id':'tg_'+n.lower(),'kind':'telegram','input':n,'routes':['telegram_public','telegram_api'],'options':window} for n in channels])}
for family,(routes,targets) in cases.items():
    run_id = 'controlled-510-v1-' + family
    config = {'version':1,'mode':'live','data_dir':str(root/'data/live'), 'stage':'controlled', 'repetitions':1,
        'budget':{'total_usd':0,'providers':{}},'costs':{'server_monthly_usd':None},
        'limits':{'concurrency':1,'max_items':10,'max_pages':1,'attempt_seconds':30,'job_seconds':120},
        'routes':routes,'targets':targets}
    path = folder / (family + '.json')
    if not path.exists():
        with path.open('x') as f: json.dump(config,f,ensure_ascii=False,indent=2)
    print('FAMILY ' + family, flush=True)
    pre = subprocess.run([sys.executable,'-m','bench','preflight','--config',str(path)], capture_output=True,text=True)
    (folder / (family+'-preflight.json')).write_text(pre.stdout)
    if pre.returncode:
        print(pre.stdout,flush=True); continue
    marker = folder / (family+'-submitted')
    if not marker.exists():
        marker.write_text(run_id)
        result = subprocess.run([sys.executable,'-m','bench','run','--config',str(path),'--run-id',run_id],capture_output=True,text=True)
        (folder / (family+'-collection.txt')).write_text(result.stdout+'\n'+result.stderr)
        print(result.stdout,flush=True)
        if result.returncode: print('Collection exited nonzero; inspect saved state, do not automatically retry',flush=True)
    result = subprocess.run([sys.executable,'-m','bench','process','--data-dir','data/live','--run-id',run_id],capture_output=True,text=True)
    (folder / (family+'-processing.txt')).write_text(result.stdout+'\n'+result.stderr)
    print(result.stdout,flush=True)
    report = root/'data/live/reports'/run_id/'report.md'
    if report.exists(): print(report.read_text(),flush=True)
result = subprocess.run([sys.executable,'-m','bench','faults','--output',str(folder/'faults.json')],capture_output=True,text=True)
print(result.stdout,flush=True)
PY
'''
result = subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=REMOTE.encode(),stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
folder = Path(__file__).with_name('controlled-510-v1')
folder.mkdir(exist_ok=True)
(folder/'free-collection.txt').write_bytes(result.stdout)
print(result.stdout.decode(errors='replace'))
raise SystemExit(result.returncode)
