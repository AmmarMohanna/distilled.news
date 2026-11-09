import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {article,FEED,MODELS,scripted,WINDOW} from './helpers';

const draft={headline:'Restriction announced',body:'Entry is prohibited.',sources:['S1'],relation:'new',updates:null,importance:1};
const fixed={i:0,headline:'Entry restricted until inspection',body:'Residents may enter only with permission.',drop:false};
const input={...WINDOW,feed:FEED,articles:[article('source','Entry is restricted until inspection. Residents may enter only with permission.')]};
const fix={results:[{i:0,verdict:'fix',issues:['Restore the inspection condition and permission exception.']}]};
const ok={results:[{i:0,verdict:'ok'}]};
const opts={now:()=>new Date(WINDOW.windowEnd)};

it.each([null,false,'0',-1,0.5,1])('refuses repair index %j rather than coercing it or dropping an item',async i=>{
 const bad={items:[{...fixed,i}]},m=scripted({edit:[{items:[draft]}],verify:[fix],repair:[bad,bad]});
 await expect(generateBriefing(input,m.port,MODELS,opts)).rejects.toThrow('INVALID_REPAIR_ITEM');
 expect(m.calls.map(c=>c.stage)).toEqual(['edit','verify','repair','repair']);
});

it.each([
 {items:[]},
 {items:[fixed,{...fixed,drop:true}]},
 {items:[{...fixed,headline:''}]},
 {items:[{i:0,headline:fixed.headline,drop:false}]},
 {items:[{...fixed,body:null}]},
 {items:[{...fixed,drop:'false'}]},
 {items:[{...fixed,drop:1}]}
])('requires an intentional drop rather than interpreting a malformed repair as omission: %j',async bad=>{
 const m=scripted({edit:[{items:[draft]}],verify:[fix,ok],repair:[bad,{items:[fixed]}]});
 const r=await generateBriefing(input,m.port,MODELS,opts);
 expect(r.items[0]).toMatchObject({headline:fixed.headline,body:fixed.body,sourceIds:['source']});
 expect(r.dropped).toEqual([]);
 expect(m.calls.map(c=>c.stage)).toEqual(['edit','verify','repair','repair','verify']);
 expect(m.calls[3].request.user).toContain('Your previous reply could not be used');
});

it('keeps a genuinely unrepairable explicit drop valid, without needless prose or another verifier call',async()=>{
 const m=scripted({edit:[{items:[draft]}],verify:[fix],repair:[{items:[{i:0,drop:true}]}]});
 const r=await generateBriefing(input,m.port,MODELS,opts);
 expect(r.status).toBe('rejected');expect(r.dropped).toHaveLength(1);
 expect(m.calls.map(c=>c.stage)).toEqual(['edit','verify','repair']);
});

it('repairs only the sparse flagged subset, preserving accepted text, citations and independent recheck',async()=>{
 const accepted={...draft,headline:'The road remains closed',body:'Until the safety inspection finishes.',sources:['S1']};
 const second={...draft,sources:['S2']};
 const m=scripted({edit:[{items:[accepted,second]}],verify:[{results:[{i:0,verdict:'ok'},{i:1,verdict:'fix',issues:['Restore the permission exception.']} ]},ok],
  repair:[{items:[{...fixed,i:null}]},{items:[fixed]}]});
 const r=await generateBriefing({...input,articles:[article('road','The road remains closed until the safety inspection finishes.'),article('entry',input.articles[0].text,{publishedAt:'2026-10-18T10:01:00Z'})]},m.port,MODELS,opts);
 expect(r.items[0]).toMatchObject({headline:accepted.headline,body:accepted.body,sourceIds:['road']});
 expect(r.items[1]).toMatchObject({headline:fixed.headline,sourceIds:['entry']});
 expect(m.calls.filter(c=>c.stage==='repair').every(c=>!c.request.user.includes('The road remains closed'))).toBe(true);
 expect(m.calls.at(-1)!.request.user).toContain('Residents may enter only with permission.');
 expect(m.calls.at(-1)!.request.user).not.toContain('headline: The road remains closed');
});

it('keeps a full valid repair on the existing edit/verify/repair/recheck path',async()=>{
 const m=scripted({edit:[{items:[draft]}],verify:[fix,ok],repair:[{items:[fixed]}]});
 const r=await generateBriefing(input,m.port,MODELS,opts);
 expect(r.items[0].body).toBe(fixed.body);
 expect(m.calls.map(c=>c.stage)).toEqual(['edit','verify','repair','verify']);
});

it('preserves prompt-3 legacy parsing for frozen responses',async()=>{
 const m=scripted({edit:[{items:[draft]}],verify:[fix,ok],repair:[{items:[{...fixed,i:null}]}]});
 expect((await generateBriefing(input,m.port,MODELS,{...opts,promptVersion:3})).items[0].headline).toBe(fixed.headline);
});
