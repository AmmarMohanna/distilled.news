"""Freeze 30 publisher-linked articles and collect direct HTTP once; no paid routes."""
import base64,json,subprocess
from pathlib import Path
folder=Path(__file__).with_name('controlled-510-v1')
inventory=json.loads((folder/'feed-review.json').read_text())['inventory']
selected={'bbc_arabic':[0,1,2],'guardian_world':[0,1,2],'nasa':[1,2,3],'lemonde':[0,1,2],'aljazeera':[0,1,2],'france24_fr':[0,1,2],'dw_en':[0,1,2],'un_ar':[0,1,2],'esa':[2,3,5]}
targets=[]
for name,indices in selected.items():
    entries=next(i['sample'] for i in inventory if i['target']==name)
    for index in indices:
        e=entries[index]
        targets.append({'id':f'web_{name}_{index+1}','kind':'article','input':e['url'],'routes':['direct'],'options':{'language':'ar' if name in ('bbc_arabic','aljazeera','un_ar') else 'fr' if name in ('lemonde','france24_fr') else 'en'},'selection_title':e['title']})
for index,slug in enumerate(['drones-russes-macron-affirme-que-la-cia-na-pas-alerte-la-france','le-danemark-juge-une-invasion-russe-dun-pays-de-lotan-tres-improbable-mais-possible','ukraine-au-moins-huit-morts-dans-une-nouvelle-vague-de-frappes-russes-a-travers-le-pays'],1):
    targets.append({'id':f'web_euronews_{index}','kind':'article','input':'https://fr.euronews.com/2026/09/24/'+slug,'routes':['direct'],'options':{'language':'fr'}})
assert len(targets)==30 and len({t['input'] for t in targets})==30
(folder/'web-roster.json').write_text(json.dumps(targets,ensure_ascii=False,indent=2),encoding='utf-8')
script=r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
.venv/bin/python -u - <<'PY'
import base64,json,subprocess,sys
from pathlib import Path
folder=Path('data/campaigns/controlled-510-v1'); path=folder/'web.json'
config={'version':1,'mode':'live','stage':'controlled','data_dir':str(Path('data/live').resolve()),'repetitions':1,'limits':{'concurrency':2,'max_items':10,'max_pages':1,'attempt_seconds':30,'job_seconds':90},'budget':{'total_usd':0,'providers':{}},'costs':{'server_monthly_usd':None},'routes':[{'id':'direct','adapter':'direct_http','enabled':True,'settings':{}}],'targets':json.loads(base64.b64decode('TARGETS'))}
if not path.exists():
    with path.open('x') as f: json.dump(config,f,ensure_ascii=False,indent=2)
marker=folder/'web-submitted'; run='controlled-510-v1-web'
if not marker.exists():
    subprocess.run([sys.executable,'-m','bench','preflight','--config',str(path)],check=True)
    marker.write_text(run)
    subprocess.run([sys.executable,'-m','bench','run','--config',str(path),'--run-id',run],check=True)
subprocess.run([sys.executable,'-m','bench','process','--data-dir','data/live','--run-id',run],check=True)
print((Path('data/live/reports')/run/'report.md').read_text())
PY
'''.replace('TARGETS',base64.b64encode(json.dumps(targets).encode()).decode())
result=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=script.encode(),capture_output=True)
(folder/'web-collection.txt').write_bytes(result.stdout+result.stderr)
print((result.stdout+result.stderr).decode(errors='replace'))
raise SystemExit(result.returncode)
