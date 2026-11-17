import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {article,FEED,FUND,MODELS,scripted,WINDOW} from './helpers';

const prior={id:'reader',at:WINDOW.windowStart,headline:'Earlier report',body:''};
const input={...WINDOW,feed:FEED,articles:[article('source',FUND)],prior:[prior]};
const draft={headline:'Fund proposed subject to stockholder approval',body:'',sources:['S1'],relation:'new',updates:null,importance:1};
const ok={results:[{i:0,verdict:'ok'}]};
const options={now:()=>new Date(WINDOW.windowEnd)};

it.each([
 {relation:'NEW',updates:null}, {relation:'invented',updates:null},
 {relation:'new',updates:'reader'}, {relation:'new',updates:'foreign'},
 {relation:'update',updates:null}, {relation:'correction',updates:'foreign'},
 {relation:'correction',updates:' reader '}, {relation:'update',updates:undefined}
])('refuses invalid relationship metadata before verification: %j',async metadata=>{
 const bad={items:[{...draft,...metadata}]};
 const m=scripted({edit:[bad,bad]});
 await expect(generateBriefing(input,m.port,MODELS,options)).rejects.toThrow('INVALID_ARTICLE_RELATION');
 expect(m.calls.map(c=>c.stage)).toEqual(['edit','edit']);
});

it.each(['update','correction'])('preserves an exact supplied %s link without extra inference',async relation=>{
 const m=scripted({edit:[{items:[{...draft,relation,updates:prior.id}]}],verify:[ok]});
 const r=await generateBriefing(input,m.port,MODELS,options);
 expect(r.items[0]).toMatchObject({relation,updatesId:prior.id});
 expect(m.calls.map(c=>c.stage)).toEqual(['edit','verify']);
});

it.each([{verdict:'OK'},{verdict:' ok '},{verdict:'approve'},{verdict:true},
 {verdict:'ok',issues:'unsupported'}, {verdict:'ok',issues:[{problem:'missing speaker'}]},
 {verdict:'ok',issues:null}])('never coerces a malformed verdict into approval: %j',async verdict=>{
 const bad={results:[{i:0,...verdict}]};
 const m=scripted({edit:[{items:[draft]}],verify:[bad,bad]});
 await expect(generateBriefing(input,m.port,MODELS,options)).rejects.toThrow('INVALID_VERIFIER_VERDICT');
 expect(m.calls.map(c=>c.stage)).toEqual(['edit','verify','verify']);
});

it('uses only the existing format correction when a malformed verdict is corrected',async()=>{
 const m=scripted({edit:[{items:[draft]}],verify:[{results:[{i:0,verdict:'OK'}]},ok]});
 const r=await generateBriefing(input,m.port,MODELS,options);
 expect(r.items).toHaveLength(1);
 expect(m.calls[2].request.user).toContain('INVALID_VERIFIER_VERDICT');
});

it('rejects bad consolidation links and clears the old link when consolidation legitimately chooses new',async()=>{
 const articles=[article('a',FUND),article('b','A separate laboratory opens a research centre with funding from the science ministry.')];
 const edits=[{items:[{...draft,relation:'update',updates:prior.id}]},{items:[{...draft,sources:['S2']}]}];
 const bad={items:[{...draft,from:[0,1],relation:'new',updates:prior.id}]};
 const m=scripted({edit:edits,consolidate:[bad,{items:[{...draft,from:[0,1]}]}],verify:[ok]});
 const r=await generateBriefing({...input,articles},m.port,MODELS,{...options,maxEditorChars:100});
 expect(m.calls.filter(c=>c.stage==='consolidate')).toHaveLength(2);
 expect(r.items[0].relation).toBe('new');
 expect(r.items[0]).not.toHaveProperty('updatesId');
});

it.each(['',draft.headline,'Subject to stockholder approval.','According to the company, the commitment remains conditional.'])('removes only a complete exact duplicate after verification: %s',async body=>{
 const m=scripted({edit:[{items:[{...draft,body}]}],verify:[ok]});
 const r=await generateBriefing(input,m.port,MODELS,options);
 expect(r.items[0].body).toBe(body===draft.headline?'':body);
 expect(m.calls[1].request.user).toContain(body);
 expect(m.calls.map(c=>c.stage)).toEqual(['edit','verify']);
});
