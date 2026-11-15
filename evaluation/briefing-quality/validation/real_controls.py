"""Source-conditioned real-text challenges, separate from full-window performance."""
import hashlib,json,random,sys
from pathlib import Path
from build_controls import CATEGORIES
TEXT={
 'customs':{
  'en':('Only report the seized substance and its explicitly qualified weight, with customs attribution. Other incident details need not be listed.','Lebanese customs reported intercepting a cocaine shipment at Beirut airport with a semi-gross weight of 46.7 kg.','Lebanese customs reported intercepting a cocaine shipment at Beirut airport with a semi-gross weight of 64.7 kg.'),
  'ar':('اذكر المادة المضبوطة ووزنها الموصوف بدقة مع نسب المعلومة للجمارك فقط. لا يلزم سرد بقية تفاصيل الواقعة.','أعلنت الجمارك اللبنانية ضبط شحنة كوكايين في مطار بيروت بوزن نصف قائم بلغ 46.7 كيلوغراماً.','أعلنت الجمارك اللبنانية ضبط شحنة كوكايين في مطار بيروت بوزن نصف قائم بلغ 64.7 كيلوغراماً.'),
  'fr':('Rapporter uniquement la substance saisie et son poids avec sa qualification exacte, en attribuant aux douanes. Les autres détails ne sont pas requis.','Les douanes libanaises ont annoncé une saisie de cocaïne à l’aéroport de Beyrouth, d’un poids semi-brut de 46,7 kg.','Les douanes libanaises ont annoncé une saisie de cocaïne à l’aéroport de Beyrouth, d’un poids semi-brut de 64,7 kg.')},
 'electricity':{
  'en':('Track whether EDL sources describe a possible electricity outage or an outage that has actually happened. An exhaustive list of institutions is not required.','EDL sources told MTV that ministries and public administrations could face power cuts.','EDL sources told MTV that ministries and public administrations are already suffering power cuts.'),
  'ar':('تابع ما إذا كانت مصادر كهرباء لبنان تتحدث عن احتمال انقطاع الكهرباء أم عن انقطاع حدث فعلاً. لا يلزم ذكر كل المؤسسات.','نقلت MTV عن مصادر في شركة كهرباء لبنان أن العتمة قد تعم في الوزارات والإدارات.','نقلت MTV عن مصادر في شركة كهرباء لبنان أن العتمة عمت فعلاً في الوزارات والإدارات.'),
  'fr':('Distinguer le risque de coupure selon les sources d’EDL d’une coupure déjà survenue. La liste exhaustive des institutions n’est pas requise.','Des sources d’Électricité du Liban ont déclaré à MTV que les ministères et les administrations publiques pourraient subir des coupures de courant.','Des sources d’Électricité du Liban ont déclaré à MTV que les ministères et les administrations publiques subissent déjà des coupures de courant.')}}
IDS={'customs':'220bb5de-5383-4954-a4b7-49d1c56a0f75','electricity':'53752160-5ced-4af6-bc10-d22da5fbbcaf'}
def build(source,out):
 source=Path(source);out=Path(out);out.mkdir(parents=True,exist_ok=True);rows=json.loads(source.read_text(encoding='utf-8'))['result'][0]['results'];articles={}
 for r in rows:
  if r['kind']=='v3_window_inputs':
   for a in json.loads(r['json'])['input']['articles']:articles[a['id']]=a
 cases=[];labels={}
 for group,aid in IDS.items():
  a=articles[aid]
  if group=='customs':assert '46.7' in a['text'] and '64.7' not in a['text'] and 'نصف قائم' in a['text']
  else:assert 'قد تعم' in a['text'] and 'عمت فعلاً' not in a['text']
  for language,(interest,correct,fault) in TEXT[group].items():
   for is_fault in [False,True]:
    id=hashlib.sha256(f'real-source-challenge-v1|{group}|{language}|{is_fault}'.encode()).hexdigest()[:24];feed=hashlib.sha256((group+language).encode()).hexdigest()[:24]
    cases.append({'id':id,'feedId':feed,'language':language,'interest':interest,'windowStart':'2026-11-01T12:00:00Z','windowEnd':'2026-11-01T20:00:00Z','publishedAt':'2026-11-01T20:01:00Z','frozenAt':'2026-11-14T21:40:40.287Z','evidenceScope':'all_eligible_frozen_input','evidenceComplete':True,'articles':[{'id':aid,'feedId':feed,'text':a['text'],'publishedAt':a['publishedAt'],'completeness':'complete'}],'prior':[],'items':[{'headline':'','body':fault if is_fault else correct,'sourceIds':[aid]}],'pipelineStatus':'published','sourceLabel':'source-conditioned-retained-statement-challenge','limitations':[]})
    labels[id]={'measurementClass':'retained_real_source_fault_injection','language':language,'eventGroup':'real-'+group,'isFault':is_fault,'category':'factual' if is_fault else None,'expected':{c:(1 if is_fault and c=='factual' else (None if is_fault else 0)) for c in CATEGORIES},'evidence':[{'sourceId':aid,'quote':a['text'],'publishedAt':a['publishedAt'],'url':a.get('url'),'sha256':hashlib.sha256(a['text'].encode()).hexdigest()}],'labelOrigin':'Independent source-relative construction and bilingual AI curation, not a tested judge label and not human gold','transformation':('quantity_46.7_to_64.7' if group=='customs' else 'possibility_to_already_occurred') if is_fault else 'legitimate_paraphrase_translation_preserving_qualification_and_attribution','scope':'Complete retained statement used as an explicitly source-conditioned challenge; not the full eligible input of the original published edition. The linked article is not inferred. Previously exposed historical event, not held-out.'}
 random.Random(20261115).shuffle(cases)
 for name,value in [('blind-controls.json',cases),('control-labels.json',labels)]:
  p=out/name
  if p.exists():assert json.loads(p.read_text(encoding='utf-8'))==value
  else:p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 manifest={'cases':len(cases),'faults':6,'controls':6,'eventGroups':2,'sourceExportSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'scope':'Historical real-source statement challenges, kept separate from constructed sources and full-window quality.','files':{n:hashlib.sha256((out/n).read_bytes()).hexdigest() for n in ['blind-controls.json','control-labels.json']}}
 (out/'controls-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');print(json.dumps(manifest))
if __name__=='__main__':build(sys.argv[1],sys.argv[2])
