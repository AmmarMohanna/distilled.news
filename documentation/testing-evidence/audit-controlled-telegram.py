"""Audit saved Telegram HTML/API against normalized records and matched windows."""
import subprocess
from pathlib import Path
REMOTE=r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
.venv/bin/python - <<'PY'
import hashlib,json
from datetime import datetime
from pathlib import Path
from lxml import html
data=Path('data/live'); results=[]; paired={}
def clean(v): return ' '.join((v or '').split())
def stamp(v): return datetime.fromisoformat(v.replace('Z','+00:00')).timestamp()
for run in ('controlled-510-v1-telegram','controlled-510-v1-telegram-additions'):
    report=json.loads((data/'reports'/run/'report.json').read_text())
    for job in report['jobs']:
        target=job['spec']['target']; options=target['options']
        for step in job['result']['steps']:
            row={'target':target['id'],'route':step['route'],'status':step['status'],'reason':step.get('reason')}
            if step['status']!='captured': results.append(row); continue
            artifact=step['payload']; raw=(data/artifact['path']).read_bytes()
            assert hashlib.sha256(raw).hexdigest()==artifact['sha256']
            items=step['normalized']['items']; expected={}
            if step['adapter']=='telethon':
                for post in json.loads(raw): expected[str(post['id'])]={'text':post.get('message',''),'date':post['date']}
            else:
                tree=html.fromstring(raw)
                for unwanted in tree.xpath('//script|//style'): unwanted.drop_tree()
                for br in tree.xpath('//br'): br.tail=' '+(br.tail or '')
                for post in tree.xpath('//*[@data-post]'):
                    texts=post.xpath('.//*[contains(concat(" ",normalize-space(@class)," ")," tgme_widget_message_text ")]')
                    texts=[node for node in texts if not node.xpath('ancestor::*[contains(@class,"tgme_widget_message_reply")]')]
                    dates=post.xpath('.//time/@datetime')
                    if dates: expected[post.attrib['data-post'].rsplit('/',1)[-1]]={'text':''.join(texts[0].itertext()) if texts else '', 'date':dates[0]}
            failures=[]
            for item in items:
                original=expected.get(str(item['id']))
                if not original: failures.append({'id':item['id'],'check':'id_not_in_raw'}); continue
                for check,ok in {'text':clean(item['text'])==clean(original['text']),'date':stamp(item['published_at'])==stamp(original['date'])}.items():
                    if not ok:
                        failure={'id':item['id'],'check':check}
                        if check=='text':
                            import difflib
                            a,b=clean(original['text']),clean(item['text'])
                            failure['differences']=[{'source':a[i:j],'normalized':b[k:l]} for op,i,j,k,l in difflib.SequenceMatcher(None,a,b).get_opcodes() if op!='equal']
                        failures.append(failure)
            eligible=[i for i in items if stamp(options['start_time'])<=stamp(i['published_at'])<stamp(options['end_time'])]
            eligible=sorted(eligible,key=lambda i:(stamp(i['published_at']),int(i['id'])),reverse=True)[:10]
            paired.setdefault(target['id'],{})[step['route']]=eligible
            row.update({'raw_posts':len(expected),'normalized':len(items),'eligible_latest_10':len(eligible),'raw_field_failures':failures,'omitted_raw_ids':sorted(set(expected)-{str(i['id']) for i in items}),'payload_sha256':artifact['sha256']})
            if not expected and step['adapter']=='telegram_public': row['empty_page_excerpt']=clean(tree.text_content())[-600:]
            results.append(row)
matches=[]
for target,routes in paired.items():
    if not all(k in routes for k in ('telegram_api','telegram_public')): continue
    api={str(i['id']):i for i in routes['telegram_api']}; public={str(i['id']):i for i in routes['telegram_public']}
    common=api.keys()&public.keys(); failed=[]
    for mid in sorted(common):
        for check,ok in {'text':clean(api[mid]['text'])==clean(public[mid]['text']),'date':stamp(api[mid]['published_at'])==stamp(public[mid]['published_at']),'url':api[mid]['url'].lower()==public[mid]['url'].lower()}.items():
            if not ok: failed.append({'id':mid,'check':check})
    matches.append({'target':target,'api_count':len(api),'public_count':len(public),'overlap':len(common),'api_only':sorted(api.keys()-public.keys()),'public_only':sorted(public.keys()-api.keys()),'failed_checks':failed})
output={'scope':'Saved-source field checks; matched latest ten within the frozen window. Not independent recall verification. Empty matches are not a quality pass.','results':results,'matched':matches,'network_calls':0}
Path('data/campaigns/controlled-510-v1/telegram-audit.json').write_text(json.dumps(output,indent=2))
print(json.dumps(output))
PY
'''
result=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=REMOTE.encode(),capture_output=True)
(Path(__file__).with_name('controlled-510-v1')/'telegram-audit.json').write_bytes(result.stdout)
print((result.stdout+result.stderr).decode(errors='replace'))
raise SystemExit(result.returncode)
