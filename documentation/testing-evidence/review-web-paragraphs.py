"""Check publisher DOM paragraphs against outputs without using either extractor as gold."""
import json,re,unicodedata
from pathlib import Path
ROOT=Path(__file__).with_name('controlled-510-v1')
audit=json.loads((ROOT/'web-checkpoints.json').read_text(encoding='utf-8'))
report=json.loads((ROOT/'web-report.json').read_text(encoding='utf-8'))
jobs={j['spec']['target']['id']:j for j in report['jobs']}
markers={'web_guardian_world':'article-body-commercial-selector','web_dw_en':'rich-text',
 'web_bbc_arabic':'css-ffsn56','web_nasa':'entry-content','web_esa':'article__block',
 'web_euronews':'c-article-content','web_aljazeera':'wysiwyg','web_un_ar':'field--name-field-text-column',
 'web_france24_fr':'t-content__'}
def compact(s): return ''.join(c for c in (s or '') if not c.isspace() and unicodedata.category(c)!='Cf')
results=[]
for row in audit['results']:
    family=row['target'].rsplit('_',1)[0]; marker=markers.get(family)
    selected=[p['text'] for p in row['paragraph_inventory'] if marker and any(marker in (a['class'] or '') for a in p['ancestors']) and not any('o-em-' in (a['class'] or '') for a in p['ancestors'])]
    for parser,entry in jobs[row['target']]['result']['steps'][0]['extractions'].items():
        body=compact((entry.get('article') or {}).get('body'))
        missing=[{'paragraph_index':i,'text':p} for i,p in enumerate(selected) if compact(p) not in body]
        results.append({'target':row['target'],'parser':parser,'selector_marker':marker,'paragraphs_checked':len(selected),'paragraphs_present':len(selected)-len(missing),'missing':missing,'status':'NO_REFERENCE' if not selected else 'CHECKPOINT_FAILURE' if missing else 'PARAGRAPH_CHECKS_PASS'})
output={'scope':'Only publisher DOM paragraphs at least 100 characters, selected by inspected article-container classes. Whitespace and Unicode format controls ignored (including zero-width spacing and word joiners); letters and diacritics retained. Not full-body gold: shorter paragraphs, headings, lists, decks and contamination need separate checks.','results':results}
(ROOT/'web-paragraph-review.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
for r in results: print(r['target'],r['parser'],r['paragraphs_present'], '/',r['paragraphs_checked'])
