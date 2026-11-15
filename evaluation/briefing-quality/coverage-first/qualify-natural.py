"""Extract bounded publisher article panels; do not certify unavailable historical feed completeness."""
from html.parser import HTMLParser
from pathlib import Path
import json,hashlib
class Text(HTMLParser):
 def __init__(self,match=lambda t,a:True):super().__init__();self.match=match;self.stack=[];self.depth=0;self.parts=[];self.hits=0;self.skip=0
 def handle_starttag(self,t,a):
  attrs=dict(a);root=self.match(t,attrs) if not self.depth else False
  if root:self.depth=1;self.hits+=1
  elif self.depth:self.depth+=1
  self.stack.append((t,root));self.skip+=int(t in ['script','style','svg'])
  if self.depth and t in ['p','div','li','h1','h2','h3','br']:self.parts.append('\n')
  if t in ['br','hr','img','meta','link','input','source','wbr']:self.handle_endtag(t)
 def handle_endtag(self,t):
  if not self.stack:return
  # Real publisher markup includes void tags and optional end tags; close to matching ancestor.
  matches=[i for i,x in enumerate(self.stack) if x[0]==t]
  if not matches:return
  i=matches[-1]
  for tag,root in self.stack[i:][::-1]:
   self.skip=max(0,self.skip-int(tag in ['script','style','svg']))
   if self.depth:self.depth-=1
  self.stack=self.stack[:i]
  if t in ['p','div','li','h1','h2','h3']:self.parts.append('\n')
 def handle_data(self,d):
  if self.depth and not self.skip:self.parts.append(d)
 def text(self):return '\n'.join(' '.join(l.split()) for l in ''.join(self.parts).splitlines() if l.strip())
def extract(raw,match):
 p=Text(match);p.feed(raw);assert p.hits>0,'ARTICLE_ROOT_NOT_FOUND';return p.text(),p.hits
root=Path('evaluation/briefing-quality/private/value-v1/source-details');out=Path('evaluation/briefing-quality/private/coverage-v1');cases=[]
for name in ['govuk-new','un-ar','cnrs-fr']:
 r=json.loads((root/(name+'.json')).read_text(encoding='utf8'));assert r['status']==200
 if name=='govuk-new':
  j=json.loads(r['body']);text,hits=extract(j['details']['body'],lambda t,a:t=='div' and a.get('class')=='govspeak');title=j['title'];published=j['first_published_at'];note='Full GOV.UK content API body; observed current revision, not proof of past-cutoff availability.'
 elif name=='un-ar':
  text,hits=extract(r['body'],lambda t,a:a.get('id') in ['block-views-block-content-fields-block-lead','block-views-block-content-fields-block-body']);title='UN Arabic: Muscat forum and combating hate speech';published='2026-11-15T12:00:00Z';note='Full declared lead/body HTML blocks; publisher header/RSS and JSON-LD differ on intraday time. No point-in-time historical certification.'
 else:
  text,hits=extract(r['body'],lambda t,a:t=='section' and 'node--type-press-information' in a.get('class',''));title='CNRS: potato rot bacteria and cheating';published='2026-11-13T00:00:00Z';note='Full declared HTML article section; publication precision day-only. Linked PDF/images excluded from evidence universe; contacts/metadata may remain.'
 assert len(text)>1000,'ARTICLE_EXTRACTION_TOO_SHORT'
 article=dict(id='natural-'+name,source={'govuk-new':'GOV.UK','un-ar':'UN News Arabic','cnrs-fr':'CNRS'}[name],url=r['finalUrl'].replace('/api/content',''),publishedAt=published,title=title,text=text)
 interest={'govuk-new':'Workplace payroll savings arrangements, new employer participation and government implementation measures in the UK.','un-ar':'The Muscat religious and traditional leaders forum, concrete plans and actions against hate speech and for peaceful coexistence.','cnrs-fr':'Scientific findings about potato rot bacteria, the demonstrated mechanisms and the study limitations.'}[name]
 inp=dict(feed=dict(interest=interest,language='en',windowMinutes=30),articles=[article],prior=[],windowStart='2026-11-15T20:00:00Z',windowEnd='2026-11-15T20:30:00Z')
 cases.append(dict(id='natural-'+name,split='natural-panel',kind='natural-current-document',eventGroup=name,input=inp,inputHash=hashlib.sha256(json.dumps(inp,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),expected=[],qualification=dict(status='qualified_current_document_only',rawSha256=hashlib.sha256((root/(name+'.json')).read_bytes()).hexdigest(),extractedRoots=hits,note=note,eventIndependence='Workplace savings / Muscat religious forum / potato pathogen research; distinct subjects, source documents and actors; no previous candidate outputs. Previously inspected source acquisition, so not untouched final chronological data.',retrievedAt=r['retrievedAt']),sourceCompleteness='Complete declared textual HTML/API article panel, not complete publisher/feed chronology'))
(out/'natural-cases.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps([dict(id=c['id'],chars=len(c['input']['articles'][0]['text']),qualification=c['qualification']) for c in cases],ensure_ascii=False))