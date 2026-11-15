"""Post-freeze sensitivity checks (frozen primary remains reference_frozen.py). Source-derived facet checks for fictional controls; not a general semantic judge."""
import re,unicodedata
from pathlib import Path
import json

def normalize(s):
 s=''.join(c for c in unicodedata.normalize('NFKC',s).casefold() if unicodedata.category(c)!='Mn').translate(str.maketrans('٠١٢٣٤٥٦٧٨٩','0123456789'))
 s=re.sub(r'(?<=\d)[,،](?=\d)','',s)
 for a,b in [('forty thousand','40000'),('اثنتي عشرة','12'),('اثنتا عشرة','12'),('twelve','12'),('seven','7'),('three','3'),('two','2'),('قاربين','2 قاربين'),('قاربَيْن','2 قاربين'),('ليومين','2 يومين')]:s=s.replace(a,b)
 return s

def has(text,fragment):
 fragment=normalize(fragment)
 return bool(re.search(r'(?<!\d)'+re.escape(fragment)+r'(?!\d)',text)) if fragment.isdigit() else fragment in text
FACETS={'close':[['bridge','جسر']],'ferry':[['boat','ferr','قارب','عبار']],'grant':[['approved','approves','approval','وافق','موافق'],['grant','منح']],'school':[['school','classes','مدرس','الدراس']],'water':[['pump','مضخ']],'reopen':[['bridge','جسر']],'correct':[['pump','مضخ']],'second':[['pump','مضخ']],'plan':[['bus','حافل']],'withdraw':[['grant','منح'],['not approved','did not approve','never approved','لم يوافق','لم تتم الموافقة','لم يقر']]}
def matches(text,fact):
 t=normalize(text)
 if not all(any(has(t,a) for a in group) for group in fact['anchors']):return False
 if not any(has(t,a) for a in fact['actions']):return False
 if not all(any(has(t,a) for a in group) for group in FACETS[fact['id']]):return False
 if fact['id']=='plan' and not any(has(t,a) for a in ['not approved','not yet approved','awaiting approval','approval pending','لم يوافق','لم تتم الموافقة','لم يقر']):return False
 if fact['id']=='correct' and not any(has(t,a) for a in ['damage','damaged','تضرر','ضرر','أصيبت','أصيب']):return False
 if fact['id']=='grant' and any(has(t,a) for a in ['not approved','did not approve','لم يوافق','لم تتم الموافقة']):return False
 if fact['id']=='water' and any(has(t,a) for a in ['not 12','لا 12','ليس 12']):return False
 if fact['id']=='close' and any(has(t,a) for a in ['did not close','not closed','لم يغلق','لم تغلق']):return False
 return True

def assess(case,output):
 items=output.get('result',{}).get('items',[]);expected=case['expected'];found=[];uncited=[];wrong_relation=[];all_sources=[]
 for f in expected:
  hits=[i for i in items if matches(i['headline']+' '+i['body'],f)]
  cited=[i for i in hits if set(i['sourceIds'])&set(f['sourceIds'])]
  correct=[i for i in cited if i['relation']==f['relation'] and (not f['priorId'] or i.get('updatesId')==f['priorId'])]
  if correct:found.append(f['id'])
  if hits and not cited:uncited.append(f['id'])
  if cited and not correct:wrong_relation.append(f['id'])
  if correct and any(set(f['sourceIds'])<=set(i['sourceIds']) for i in correct):all_sources.append(f['id'])
 repeats=[]
 for n,i in enumerate(items):
  t=i['headline']+' '+i['body']
  if not any(matches(t,f) for f in expected) and any(matches(t,f) for f in case.get('nonNovel',[])):repeats.append(n)
 return dict(eligible=len(expected),matched=len(found),matchedIds=found,unmatched=[f['id'] for f in expected if f['id'] not in found],uncitedMatches=uncited,wrongRelations=wrong_relation,allSupportingSources=len(all_sources),unnecessaryRepeatedItems=repeats,scope='Post-freeze stricter sensitivity; not the prespecified primary. Facet/citation/relation retention; unrecognized paraphrases are unresolved, not automatically factual errors')