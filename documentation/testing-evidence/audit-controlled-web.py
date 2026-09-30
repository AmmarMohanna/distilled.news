"""Independent HTML metadata/JSON-LD checkpoints; no acquisition or gold fabrication."""
import subprocess,sys
from pathlib import Path
REMOTE=r'''
set -e
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
.venv/bin/python - <<'PY'
import hashlib,json,re,html
from pathlib import Path
from lxml import html as treehtml
from datetime import datetime
data=Path('data/live'); report=json.loads((data/'reports/controlled-510-v1-web/report.json').read_text()); output=[]
def clean(s): return ' '.join(html.unescape(s or '').split())
def objects(value):
    if isinstance(value,dict):
        yield value
        for v in value.values(): yield from objects(v)
    elif isinstance(value,list):
        for v in value: yield from objects(v)
def date(s):
    try: return datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()
    except (ValueError,AttributeError): return None
for job in report['jobs']:
    step=job['result']['steps'][0]
    if not step.get('payload'):
        output.append({'target':job['spec']['target']['id'],'url':job['spec']['target']['input'],'acquisition_status':step.get('status'),'reason':step.get('reason'),'checks':[],'paragraph_inventory':[]}); continue
    ref=step['payload']; raw=(data/ref['path']).read_bytes()
    assert hashlib.sha256(raw).hexdigest()==ref['sha256']
    tree=treehtml.fromstring(raw.decode('utf-8')); meta={e.get('property') or e.get('name'):e.get('content') for e in tree.xpath('//meta[@content]')}
    articles=[]
    for node in tree.xpath('//script[@type="application/ld+json"]'):
        try: articles += [o for o in objects(json.loads(node.text or '')) if any('Article' in str(t) or 'BlogPosting' in str(t) for t in ([o.get('@type')] if isinstance(o.get('@type'),str) else o.get('@type',[])))]
        except (ValueError,TypeError): pass
    titles=[clean(x) for x in tree.xpath('//h1//text()') if clean(x)]
    titles += [clean(meta.get('og:title'))]+[clean(a.get('headline')) for a in articles]
    titles=list(dict.fromkeys(x for x in titles if x))
    dates=list(dict.fromkeys(x for x in [meta.get('article:published_time')]+[a.get('datePublished') for a in articles] if isinstance(x,str) and x))
    bodies=[clean(a.get('articleBody')) for a in articles if isinstance(a.get('articleBody'),str) and len(a['articleBody'])>100]
    candidates=[]
    for p in tree.xpath('//p'):
        text=clean(''.join(p.itertext()))
        if len(text)<100: continue
        ancestry=[{'tag':a.tag,'class':a.get('class'),'id':a.get('id')} for a in list(p.iterancestors())[:3]]
        candidates.append({'text':text,'ancestors':ancestry})
    row={'target':job['spec']['target']['id'],'url':job['spec']['target']['input'],'payload_sha256':ref['sha256'],'publisher_titles':titles,'publisher_dates':dates,'structured_body_lengths':[len(b) for b in bodies],'paragraph_inventory':candidates,'checks':[]}
    for parser,value in step.get('extractions',{}).items():
        article=value.get('article') or {}; body=clean(article.get('body')); published=article.get('published_at')
        row['checks'].append({'parser':parser,'title_matches_publisher_variant':clean(article.get('title')) in titles,'publication_matches_publisher_timestamp': any(date(published)==date(d) for d in dates if date(d) is not None) if dates else None,'extracted_publication':published,'body_length':len(body),'structured_body_exact':any(body==b for b in bodies) if bodies else None,'structured_body_contained':any(b in body for b in bodies) if bodies else None,'opening':body[:180],'ending':body[-180:]})
    output.append(row)
result={'scope':'Publisher HTML metadata and structured-body checks only; no full-body acceptance when independent text reference is absent. Publication mismatch may reflect precision and requires review.','results':output}
Path('data/campaigns/controlled-510-v1/web-checkpoints.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=True,indent=2))
PY
'''
if __name__=='__main__':
    browser='--browser' in sys.argv
    zyte='--zyte' in sys.argv
    name='browser' if browser else 'zyte' if zyte else 'web'
    script=REMOTE.replace('reports/controlled-510-v1-web/report.json','reports/controlled-510-v1-web-'+name+'/report.json').replace('web-checkpoints.json',name+'-checkpoints.json') if name!='web' else REMOTE
    r=subprocess.run([r'C:\Windows\System32\OpenSSH\ssh.exe','-i',str(Path.home()/'.ssh/distilled_bench_codex'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','distilled-bench@148.230.109.96','bash -s'],input=script.encode(),capture_output=True)
    Path(__file__).with_name('controlled-510-v1').joinpath(name+'-checkpoints.json').write_bytes(r.stdout)
    print('Audit exit:',r.returncode, r.stderr.decode(errors='replace'))
    raise SystemExit(r.returncode)
