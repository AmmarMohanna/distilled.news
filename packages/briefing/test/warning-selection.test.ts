import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import fixture from './fixtures/v3-warning-selection.json';
import {generateBriefing} from '../src/engine';
import type {ModelRequest} from '../src/model';
import {prepareArticles} from '../src/prepare';
import {MODELS,scripted,article,WINDOW} from './helpers';

it('retains the same real evidence and reproduces the observed editorial omission, without claiming new model results',()=>{
  const [en,ar]=fixture.cases;
  for(const c of fixture.cases)for(const a of c.input.articles)expect(createHash('sha256').update(a.text).digest('hex')).toBe(c.sourceSha256[a.url as keyof typeof c.sourceSha256]);
  expect(en.input.articles.map(a=>a.url).sort()).toEqual(ar.input.articles.map(a=>a.url).sort());
  const included=(c:typeof en)=>c.recordedResult.items.flatMap(i=>i.sourceIds.map(id=>c.input.articles.find(a=>a.id===id)!.url));
  expect(included(en).sort()).toEqual([...en.expectedIncludedUrls].sort());
  expect(included(ar)).toEqual(['https://t.me/lebanonnews2/107636']);
  const missing=ar.input.articles.find(a=>a.url.endsWith('/107635'))!;
  expect(ar.recordedResult.omitted.find(o=>o.sourceIds.includes(missing.id))).toMatchObject({stage:'editor',reason:'تصريح عن نية شن غارات وليس تنفيذ أو قرار جديد'});
  expect(ar.recordedResult.dropped).toEqual([]);
});

for(const c of fixture.cases)it(`carries the real ${c.language} warning and its attribution through the existing workflow (scripted, not model qualification)`,async()=>{
  const {prepared}=prepareArticles(c.input.articles);
  const ref=(url:string)=>prepared.find(p=>p.url===url)!.ref;
  const warning=c.input.articles.find(a=>a.url.endsWith('/107635'))!;
  const body=c.language==='ar'?'نقل المصدر عن المجلس الإقليمي للجليل الأعلى تصريحاً عن شن غارات على الجبهة اللبنانية خلال الساعات المقبلة.':'The source attributes a statement about airstrikes on the Lebanese front in the coming hours to the Upper Galilee Regional Council.';
  const mock=scripted({edit:[(request:ModelRequest)=>{
    expect(request.user).toContain(prepared.find(p=>p.id===warning.id)!.text);
    expect(request.user).toContain(c.input.prior[c.input.prior.length-1].body);
    return {items:[{headline:c.language==='ar'?'تصريح عن غارات مرتقبة على الجبهة اللبنانية':'Statement warns of upcoming airstrikes on the Lebanese front',body,sources:[ref(warning.url)],relation:'new',updates:null,importance:1}]};
  }],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
  const result=await generateBriefing({...c.input,feed:{...c.input.feed,language:c.language as 'en'|'ar'}},mock.port,MODELS);
  expect(result.status).toBe('published');
  expect(result.items[0].body).toBe(body);
  expect(result.items[0].sourceIds).toEqual([warning.id]);
  expect(mock.calls.map(call=>call.stage)).toEqual(['edit','verify']);
});

// Synthetic controls, manually labelled. These exercise bookkeeping and context
// transport only; canned model decisions are not evidence of editorial accuracy.
for (const language of ['en','ar'] as const) it(`preserves ${language} updates/corrections and explicit low-value/repeat omissions without added stages`,async()=>{
  const articles=[
    article('extension','Emergency management extended the existing evacuation order to the river district. The order takes effect tonight.'),
    article('routine','A trade association plans a routine introductory workshop next month. Registration details have not been announced.'),
    article('speculation','An unnamed social media account speculated that a foreign leader might change policy. It cited no announcement or evidence.'),
    article('repeat','The weather service repeated its coastal flood warning without changing the area, timing or severity.'),
    article('correction','Emergency management corrected the evacuation notice: the hill district is excluded from the order, contrary to its previous notice.')
  ];
  const prior=[{id:'evacuation',at:WINDOW.windowStart,headline:'Evacuation order',body:'Emergency management ordered evacuation of the coastal and hill districts.'},{id:'weather',at:WINDOW.windowStart,headline:'Flood warning',body:'The weather service warned of coastal flooding.'}];
  const {prepared}=prepareArticles(articles);const ref=(id:string)=>prepared.find(p=>p.id===id)!.ref;
  const bodies=language==='en'?['Emergency management extended the evacuation order to the river district, effective tonight.','Emergency management corrected its notice: the hill district is excluded from the evacuation order.']:['????? ????? ??????? ??? ??????? ????? ????? ?????? ??? ?? ???? ??????.','???? ????? ??????? ???????: ????? ???? ??????? ?? ??? ???????.'];
  const mock=scripted({edit:[(request:ModelRequest)=>{
    expect(request.user).toContain(prior[0].body);expect(request.user).toContain(prior[1].body);
    for(const a of prepared)expect(request.user).toContain(a.text);
    return {items:[{headline:language==='en'?'Evacuation order extended':'????? ??? ???????',body:bodies[0],sources:[ref('extension')],relation:'update',updates:'evacuation',importance:1},{headline:language==='en'?'Evacuation notice corrected':'????? ????? ???????',body:bodies[1],sources:[ref('correction')],relation:'correction',updates:'evacuation',importance:1}],left_out:[{sources:[ref('routine')],why:'routine plan'},{sources:[ref('speculation')],why:'vague off-topic speculation'},{sources:[ref('repeat')],why:'unchanged warning already told'}]};
  }],verify:[{results:[{i:0,verdict:'ok',issues:[]},{i:1,verdict:'ok',issues:[]}]}]});
  const result=await generateBriefing({feed:{interest:'Important local public safety developments',language,windowMinutes:30},...WINDOW,articles,prior},mock.port,MODELS);
  expect(result.status).toBe('published');
  expect(result.items.map(i=>({relation:i.relation,updates:i.updatesId,body:i.body}))).toEqual([{relation:'update',updates:'evacuation',body:bodies[0]},{relation:'correction',updates:'evacuation',body:bodies[1]}]);
  expect(result.omitted.map(o=>o.sourceIds).flat().sort()).toEqual(['routine','speculation','repeat'].sort());
  expect(mock.calls.map(c=>c.stage)).toEqual(['edit','verify']);
});
