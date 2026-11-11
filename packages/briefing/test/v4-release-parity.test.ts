import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {it,expect} from 'vitest';
import {generateBriefing,DEFAULT_ENGINE} from '../src/engine';
import {prepareArticles,selectPrior} from '../src/prepare';
import {scripted,MODELS} from './helpers';
import {normalizeSpace} from '../src/text';
const load=(name:string)=>JSON.parse(readFileSync(new URL('../../../benchmarks/editorial-information-gain/'+name,import.meta.url),'utf8'));
const pack=load('lebanese-human-review-2026-11-08.json'),archive=load('v4-final-release-replay.json');
const inputFor=(c:any)=>({feed:c.feed,windowStart:c.windowStart,windowEnd:c.windowEnd,articles:c.sourceIds.map((id:string)=>pack.sourceDictionary[id].article),prior:c.fullHistoryIds.map((id:string)=>pack.historyDictionary[id])});
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
for(const c of pack.cases) it('exactly replays valid V4 requests and output: '+c.id,async()=>{
 const retained=archive.cases.find((x:any)=>x.caseId===c.id);let n=0;
 const r=await generateBriefing(inputFor(c),{async complete(request){const old=retained.calls[n++];expect(old,'Unexpected inference stage').toBeDefined();expect(hash(request)).toBe(old.requestHash);return old.response;}},{editor:'openai/gpt-4.1',verifier:'openai/gpt-4.1-mini'},{now:()=>new Date(c.windowEnd)});
 expect(n).toBe(retained.calls.length);expect(r.status).toBe(c.v4.status);expect(r.items).toEqual(c.v4.items);
 if(retained.calls.length) expect(r.usage.costUsd).toBeCloseTo(retained.calls.reduce((sum:number,c:any)=>sum+c.costUsd,0),12);
 else {expect(r.usage.calls).toBe(0);expect(r.usage.costUsd).toBeUndefined();}
});
it('keeps V4 defaults and ordinary conditional repair without an experimental policy',()=>{
 expect(DEFAULT_ENGINE).toMatchObject({promptVersion:4,maxRepairs:2,safetyGuard:'none'});
 expect(DEFAULT_ENGINE.architecture).toBeUndefined();expect(DEFAULT_ENGINE).not.toHaveProperty('quietReview');expect(DEFAULT_ENGINE).not.toHaveProperty('repairRelations');
});
it('preserves the source restriction, speaker/modality/scope and ambiguous fuel evidence verbatim apart from whitespace',()=>{
 for(const [id,phrases] of [
 ['lebanonnews2/108143',['ومنعت حركة الدخول إليها والخروج منها','أوقفت أحد أبناءها']],
 ['lebanonnews2/108139',['رندلى جبور','ربما','بين عكار وطرابلس']],
 ['lebanonnews2/108126',['77','25','استقرّ سعر الغاز']]
 ] as Array<[string,string[]]>){
  const source=pack.sourceDictionary[id].article,prepared=prepareArticles([source]).prepared[0];
  expect(prepared.text).toBe(normalizeSpace(source.text));for(const phrase of phrases)expect(prepared.text).toContain(phrase);
  if(id.endsWith('108126')){expect(prepared.text.match(/95/g)).toHaveLength(2);expect(prepared.text).not.toContain('98');}
 }
});
const control=pack.cases.find((c:any)=>c.id==='robbery-control-reader-told-six');
const source=pack.sourceDictionary[control.sourceIds[0]].article,antecedent=pack.historyDictionary['constructed-reader-six'];
const distractors=Array.from({length:16},(_,i)=>({id:'selected-'+i,at:control.windowStart,headline:source.text,body:''}));
const prior=[{...antecedent,at:new Date(Date.parse(control.windowStart)-60000).toISOString()},...distractors];
const draft={headline:'مصادر الداخلية: ثلاث عمليات سلب في 5 تشرين الثاني وليس ستًا',body:'',sources:['S1'],relation:'correction',updates:antecedent.id,importance:1};
const input={...inputFor(control),prior};const options={now:()=>new Date(control.windowEnd)};
it('fails safely when a true antecedent exists only outside the default selected history',async()=>{
 const chosen=selectPrior(prior,prepareArticles([source]).prepared,options.now());expect(chosen).toHaveLength(16);expect(chosen.some(p=>p.id===antecedent.id)).toBe(false);
 const bad={items:[draft]},m=scripted({edit:[bad,bad]});await expect(generateBriefing(input,m.port,MODELS,options)).rejects.toThrow('INVALID_ARTICLE_RELATION');
 expect(m.calls.map(x=>x.stage)).toEqual(['edit','edit']);expect(m.calls[0].request.user).not.toContain(antecedent.id);
});
it('does not invent a missing antecedent or claim structural checks solve full-history semantic novelty',async()=>{
 const m=scripted({edit:[{items:[{...draft,relation:'new',updates:null}]}],verify:[{results:[{i:0,verdict:'ok'}]}]});
 const r=await generateBriefing(input,m.port,MODELS,options);expect(r.items[0].relation).toBe('new');expect(r.items[0].updatesId).toBeUndefined();
});
it('preserves an exact valid prior ID and never trims an invalid reference into a valid one',async()=>{
 const valid={...antecedent,id:'exact  reader id'},base={...inputFor(control),prior:[valid]};
 const m=scripted({edit:[{items:[{...draft,updates:valid.id}]}],verify:[{results:[{i:0,verdict:'ok'}]}]});
 expect((await generateBriefing(base,m.port,MODELS,options)).items[0].updatesId).toBe(valid.id);
 const bad={items:[{...draft,updates:' '+valid.id+' '}]},b=scripted({edit:[bad,bad]});await expect(generateBriefing(base,b.port,MODELS,options)).rejects.toThrow('INVALID_ARTICLE_RELATION');
});
