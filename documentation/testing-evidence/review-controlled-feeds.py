"""Independent XML field checks and same-capture parser replay; no network fetches."""
import subprocess
from pathlib import Path
REMOTE = r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
export PATH="$HOME/.local/node24/bin:$PATH"
.venv/bin/python - <<'PY'
import asyncio, hashlib, html, json, re
from collections import Counter
from datetime import datetime
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
import xml.etree.ElementTree as ET
from bench.processing import normalize
class Text(HTMLParser):
    def __init__(self, value):
        super().__init__(); self.parts=[]; self.feed(value or '')
    def handle_data(self,data): self.parts.append(data)
def clean(value): return ' '.join(html.unescape(' '.join(Text(value).parts)).split())
def stamp(value):
    try: return datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
    except (ValueError,AttributeError):
        try: return parsedate_to_datetime(value).timestamp()
        except (ValueError,TypeError): return None
data=Path('data/live'); all_results=[]; inventory=[]
for family in ('rss','google'):
    report_path=data/'reports'/('controlled-510-v1-'+family)/'report.json'
    if not report_path.exists(): continue
    report=json.loads(report_path.read_text())
    for job in report['jobs']:
        target=job['spec']['target']
        for step in (job.get('result') or {}).get('steps',[]):
            evidence=next((e['artifact'] for e in step.get('evidence',[]) if e.get('metadata',{}).get('canonical_payload')),None)
            if not evidence:
                all_results.append({'family':family,'target':target['id'],'capture_error':step.get('error',step.get('outcome',step.get('status'))),'step_keys':list(step)})
                continue
            raw=(data/evidence['path']).read_bytes()
            assert hashlib.sha256(raw).hexdigest()==evidence['sha256']
            try:
                if b'<!ENTITY' in raw.upper(): raise ValueError('Entity refused')
                tree=ET.fromstring(raw)
            except Exception as exc:
                all_results.append({'target':target['id'],'xml_error':type(exc).__name__}); continue
            entries=tree.findall('./channel/item')
            if not entries: entries=tree.findall('{http://www.w3.org/2005/Atom}entry') or tree.findall('{http://purl.org/rss/1.0/}item')
            def value(e,name):
                return next((''.join(c.itertext()) for c in e if c.tag.split('}')[-1]==name), '')
            expected=[]
            for entry in entries[:10]:
                link=value(entry,'link')
                if not link:
                    link=next((c.attrib.get('href','') for c in entry if c.tag.split('}')[-1]=='link' and c.attrib.get('rel','alternate')=='alternate'),'')
                expected.append({'url':link,'title':clean(value(entry,'title')),'description':clean(value(entry,'description') or value(entry,'summary') or value(entry,'content') or value(entry,'encoded')), 'date':value(entry,'pubDate') or value(entry,'published') or value(entry,'updated') or value(entry,'date'), 'source':clean(value(entry,'source'))})
            inventory.append({'family':family,'target':target['id'],'input':target['input'],'payload_sha256':evidence['sha256'],'raw_entries':len(entries),'sample':expected,'independent_page_review':'PENDING'})
            for parser in (('baseline','feedparser') if family=='rss' else ('baseline',)):
                route={'adapter':'rss' if family=='rss' else 'google_news_rss','settings':{'parser':parser}}
                result=asyncio.run(normalize(raw,target,route,step['started_at'],max_items=10))
                items=result['items']; mapped={}
                for item in items: mapped.setdefault(item['url'], []).append(item)
                failures=[]
                for entry in expected:
                    candidates=mapped.get(entry['url'],[]); title=entry['title']
                    if family=='google' and entry['source'] and title.endswith(' - '+entry['source']): title=title[:-(3+len(entry['source']))]
                    checks={'retained':bool(candidates),'title':bool(title) and any(title in clean(i.get('text','')) for i in candidates),'date':stamp(entry['date']) is not None and any(stamp(entry['date'])==stamp(i.get('published_at')) for i in candidates)}
                    if family=='rss': checks['description']=not entry['description'] or any(entry['description'] in clean(i.get('text','')) for i in candidates)
                    failures += [{'url':entry['url'],'check':k} for k,v in checks.items() if not v]
                all_results.append({'family':family,'target':target['id'],'parser':parser,'expected':len(expected),'returned':len(items),'urls_match':Counter(e['url'] for e in expected)==Counter(i['url'] for i in items),'duplicate_urls':len(items)-len(mapped),'failed_checkpoints':failures,'issues':result.get('issues',[]),'payload_sha256':evidence['sha256']})
                if target['id']=='dw_en' and parser=='feedparser':
                    import feedparser
                    first=feedparser.parse(raw).entries[0]
                    all_results[-1]['date_diagnostic']={k:v for k,v in first.items() if 'date' in k or 'publish' in k}
folder=Path('data/campaigns/controlled-510-v1')
output={'scope':'XML-derived field checks, not independent original-article review or uncapped recall','network_calls':0,'results':all_results,'inventory':inventory}
(folder/'feed-review.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
print(json.dumps(output,ensure_ascii=True))
PY
'''
result=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=REMOTE.encode(),capture_output=True)
folder=Path(__file__).with_name('controlled-510-v1'); folder.mkdir(exist_ok=True)
(folder/'feed-review.json').write_bytes(result.stdout)
if result.returncode: print(result.stderr.decode(errors='replace'))
else:
    import json
    output=json.loads(result.stdout)
    print(json.dumps(output['results'],indent=2))
raise SystemExit(result.returncode)
