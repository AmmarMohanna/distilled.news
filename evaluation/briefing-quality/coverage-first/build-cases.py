"""Construct explicit fictional source controls. No model output or evaluator labels used."""
import hashlib,json
from pathlib import Path
ROOT=Path('evaluation/briefing-quality/coverage-first')
def digest(x):return hashlib.sha256(json.dumps(x,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def make(group,place,second,language,split):
 date='2026-10-'+str(10+group).zfill(2);f=[]
 def fact(key,en,ar,anchors,action):return dict(id=key,en=en,ar=ar,anchors=[[a] for a in anchors],actions=action)
 f=[fact('close',f'The municipality closed {place} bridge pending a safety inspection.',f'أغلقت البلدية جسر {place} بانتظار فحص السلامة.',[place],['closed','closure','closes','أغلقت','إغلاق','مغلق']),fact('ferry',f'The ferry operator added 2 boats on the {second} route.',f'أضاف مشغل العبارة قاربين إلى خط {second}.',[second,'2'],['added','adds','extra','أضاف','إضافة','إضاف']),fact('grant',f'The council approved a 40,000-dollar repair grant for {place}, conditional on an audit.',f'وافق المجلس على منحة إصلاح بقيمة 40,000 دولار لـ{place} بشرط التدقيق.',[place,'40000'],['conditional','condition','audit','بشرط','شريطة','التدقيق']),fact('school',f'The education office suspended classes at {second} school for 2 days.',f'علّق مكتب التعليم الدراسة في مدرسة {second} ليومين.',[second,'2'],['suspend','suspended','closed','closure','cancelled','paused','علّق','تعليق','أوقف','إغلاق']),fact('water',f'The water authority reported damage to 12 pumps at {place} station.',f'أعلنت مؤسسة المياه تضرر 12 مضخة في محطة {place}.',[place,'12'],['damage','damaged','تضرر','تضررت','متضرر'])]
 updates=[fact('reopen',f'After a completed inspection, the municipality reopened {place} bridge.',f'أعادت البلدية فتح جسر {place} بعد اكتمال فحص السلامة.',[place],['reopened','reopens','reopening','أعادت','فتح']),fact('correct',f'Correction: the water authority says 7 pumps, not 12, were damaged at {place} station.',f'تصحيح: أكدت مؤسسة المياه تضرر 7 مضخات لا 12 في محطة {place}.',[place,'7'],['correction','corrected','revised','تصحيح','صححت','صحّحت']),fact('second',f'A separate incident damaged 3 pumps at {second} station.',f'تضررت 3 مضخات في محطة {second} في حادث منفصل.',[second,'3'],['damage','damaged','تضرر','تضررت','متضرر']),fact('plan',f'The council proposed, but has not approved, a new {second} bus route.',f'اقترح المجلس خط حافلات جديدا لـ{second} ولم يوافق عليه بعد.',[second],['proposed','proposal','proposes','اقترح','اقتراح','مقترح'])]
 updates.append(fact('withdraw',f'Correction: the council did not approve the {place} repair grant; its earlier announcement was issued in error.',f'تصحيح: لم يوافق المجلس على منحة إصلاح {place}، وصدر الإعلان السابق بالخطأ.',[place],['correction','corrected','previous announcement','earlier announcement','incorrect','issued in error','الإعلان السابق','تصحيح','صححت','صحّحت']))
 cases=[];prior=[]
 for w,eligible in enumerate([f,updates,[]]):
  current=f if w==0 else updates if w==1 else updates
  articles=[]
  for n,x in enumerate(current):
   # Alternating source languages, independent of requested output language.
   text=x['ar'] if (n+group+w)%2 else x['en'];articles.append(dict(id=f'g{group}-w{w}-s{n}',source='Constructed municipal wire '+str(n%3),publishedAt=f'{date}T{10+w:02}:01:00Z',text=text,url=f'https://controlled.invalid/{group}/{w}/{n}'))
  # A duplicate report must yield all supporting sources, not another development.
  articles.append(dict(articles[0],id=f'g{group}-w{w}-duplicate',source='Constructed independent relay'))
  articles.append(dict(id=f'g{group}-w{w}-sport',source='Constructed sports desk',publishedAt=f'{date}T{10+w:02}:02:00Z',text='A visiting football team won a friendly match 3-0.'))
  if w==1:articles.append(dict(id=f'g{group}-w{w}-repeat',source='Constructed ferry bulletin',publishedAt=f'{date}T{10+w:02}:03:00Z',text=f[1]['en']))
  refs=[]
  for x in eligible:
   row=dict(x,relation='correction' if x['id'] in ['correct','withdraw'] else 'update' if x['id']=='reopen' else 'new',priorId=f'g{group}-prior-close' if x['id']=='reopen' else f'g{group}-prior-water' if x['id']=='correct' else f'g{group}-prior-grant' if x['id']=='withdraw' else None)
   row['sourceIds']=[a['id'] for a in articles if a['text'] in [x['en'],x['ar']]];refs.append(row)
  inp=dict(feed=dict(interest=f'Official water, transport, education and local government service decisions affecting {place} and {second}; exclude sports.',language=language,windowMinutes=30),articles=articles,prior=list(prior),windowStart=f'{date}T{10+w:02}:00:00Z',windowEnd=f'{date}T{10+w:02}:30:00Z')
  cases.append(dict(id=f'{split}-g{group}-w{w}',split=split,kind='constructed',eventGroup=f'fictional-service-sequence-{group}',templateFamily='municipal-service-sequence',input=inp,expected=refs,nonNovel=f if w==1 else updates if w==2 else [],sourceCompleteness='Complete declared fictional source universe; not real news',history='Identical fixed prior context for every system; state-conditional comparison'))
  if w==0:prior=[dict(id=f'g{group}-prior-'+x['id'],at=inp['windowEnd'],headline=x[language],body='') for x in f]
  elif w==1:prior=[dict(id=f'g{group}-prior2-'+x['id'],at=inp['windowEnd'],headline=x[language],body='') for x in updates]+prior
 return cases
cases=make(0,'عين الصفصاف','وادي السنديان','en','development')
for i,(a,b,l) in enumerate([('مرج الياسمين','تل الزيتون','en'),('سهل الندى','عين الرمان','ar'),('وادي النور','رأس الصفصاف','en'),('عين الغزال','مرج السرو','ar')],1):cases+=make(i,a,b,l,'final')
# Each group is a separate fictional municipality/event chain. Shared template means limited diversity.
for c in cases:c['inputHash']=digest(c['input'])
p=ROOT/'cases.json';p.write_text(json.dumps(cases,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(dict(cases=len(cases),development=3,final=12,eventGroups=5,heldoutEventGroups=4,templateFamilies=1,importantFinalFacts=sum(len(c['expected']) for c in cases if c['split']=='final'),sha256=hashlib.sha256(p.read_bytes()).hexdigest())))