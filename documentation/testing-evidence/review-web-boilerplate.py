"""Check exact known boilerplate paragraphs from the saved publisher DOM."""
import json,unicodedata
from pathlib import Path
root=Path(__file__).with_name('controlled-510-v1')
audit=json.loads((root/'web-checkpoints.json').read_text(encoding='utf-8'))
jobs={j['spec']['target']['id']:j for j in json.loads((root/'web-report.json').read_text(encoding='utf-8'))['jobs']}
markers=('o-em-consent','o-em-adblock','hds-footer-details','c-featured-nav__')
def clean(v):return ''.join(c for c in v if not c.isspace() and unicodedata.category(c)!='Cf')
results=[]
for row in audit['results']:
    unwanted=[p for p in row['paragraph_inventory'] if any(m in (a['class'] or '') for a in p['ancestors'] for m in markers)]
    for parser,v in jobs[row['target']]['result']['steps'][0]['extractions'].items():
        body=clean((v.get('article') or {}).get('body') or '')
        hits=[{'text':p['text'],'ancestors':p['ancestors']} for p in unwanted if clean(p['text']) in body]
        results.append({'target':row['target'],'parser':parser,'known_boilerplate_paragraphs_checked':len(unwanted),'retained':hits})
(root/'web-boilerplate-review.json').write_text(json.dumps({'scope':'Exact retention of inspected consent/adblock, NASA footer and Euronews navigation paragraphs. Zero hits does not establish absence of all unwanted text.','results':results},ensure_ascii=False,indent=2),encoding='utf-8')
for r in results:
    if r['retained']: print(r['target'],r['parser'],'unwanted paragraphs:',len(r['retained']))
