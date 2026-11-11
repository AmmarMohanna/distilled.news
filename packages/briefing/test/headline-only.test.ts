import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {BriefingModelError} from '../src/types';
import {FEED,MODELS,WINDOW,article,scripted} from './helpers';
const input={feed:FEED,...WINDOW,articles:[article('one','The transit agency proposed raising fares by up to 10%, subject to council approval.')]};
const draft={headline:'Transit agency proposes fare increase of up to 10%, subject to council approval',body:'',sources:['S1'],relation:'new',importance:1};
it('verifies and publishes a complete headline without forcing a redundant body',async()=>{
 const {port,calls}=scripted({edit:[{items:[draft]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
 const result=await generateBriefing(input,port,MODELS,{promptVersion:4});
 expect(result.status).toBe('published');expect(result.items[0].body).toBe('');expect(result.items[0].sourceIds).toEqual(['one']);expect(calls.map(c=>c.stage)).toEqual(['edit','verify']);
 expect(calls[1].request.user).toContain(draft.headline);
});
it('headline-only content still requires factual verification and repair',async()=>{
 const {port,calls}=scripted({edit:[{items:[{...draft,headline:'Transit agency raises fares by 10%'}]}],verify:[{results:[{i:0,verdict:'fix',issues:['proposal is not completed; approval is required']}]},{results:[{i:0,verdict:'ok',issues:[]}]}],repair:[{items:[{i:0,...draft,drop:false}]}]});
 const result=await generateBriefing(input,port,MODELS,{promptVersion:4});expect(result.status).toBe('published');expect(result.items[0].headline).toBe(draft.headline);expect(calls.map(c=>c.stage)).toEqual(['edit','verify','repair','verify']);
});
it('accepts an explicit empty selection without asking a verifier or correcting an editorial omission',async()=>{
 const m=scripted({edit:[{items:[],left_out:[{sources:['S1'],why:'No relevant new development.'}]}]});
 const r=await generateBriefing(input,m.port,MODELS,{promptVersion:4});expect(r.status).toBe('empty');expect(r.omitted).toHaveLength(1);expect(m.calls.map(c=>c.stage)).toEqual(['edit']);
});
it.each([undefined,null,0,false,[],{}])('corrects a missing or invalid body %j using only the existing format retry',async body=>{
 const bad={...draft,body},m=scripted({edit:[{items:[bad]},{items:[draft]}],verify:[{results:[{i:0,verdict:'ok'}]}]});
 const r=await generateBriefing(input,m.port,MODELS,{promptVersion:4});expect(r.items[0].body).toBe('');expect(m.calls.map(c=>c.stage)).toEqual(['edit','edit','verify']);expect(m.calls[1].request.user).toContain('INVALID_ARTICLE_BODY');
});
it.each([undefined,null,'','  ',0,false,[],{}])('corrects a missing, empty or invalid headline %j instead of treating it as no news',async headline=>{
 const m=scripted({edit:[{items:[{...draft,headline}]},{items:[draft]}],verify:[{results:[{i:0,verdict:'ok'}]}]});
 const r=await generateBriefing(input,m.port,MODELS,{promptVersion:4});expect(r.status).toBe('published');expect(m.calls.map(c=>c.stage)).toEqual(['edit','edit','verify']);expect(m.calls[1].request.user).toContain('INVALID_ARTICLE_HEADLINE');
});
it('fails closed after a malformed headline persists through bounded correction',async()=>{
 const {headline,...missing}=draft,m=scripted({edit:[{items:[draft,missing]},{items:[draft,missing]}]});
 await expect(generateBriefing(input,m.port,MODELS,{promptVersion:4})).rejects.toBeInstanceOf(BriefingModelError);expect(m.calls.map(c=>c.stage)).toEqual(['edit','edit']);
});
it('rejects a mixed valid/malformed selection instead of publishing a silently reduced subset',async()=>{
 const second={...draft,headline:'The proposal remains subject to approval',body:null};
 const m=scripted({edit:[{items:[draft,second]},{items:[draft,{...second,body:''}]}],verify:[{results:[{i:0,verdict:'ok'},{i:1,verdict:'ok'}]}]});
 const r=await generateBriefing(input,m.port,MODELS,{promptVersion:4});expect(r.items).toHaveLength(2);expect(m.calls.map(c=>c.stage)).toEqual(['edit','edit','verify']);
});
it('throws a typed certain model failure after the one bounded correction is exhausted',async()=>{
 const {body,...missing}=draft,bad={items:[missing]},m=scripted({edit:[bad,bad]});
 await expect(generateBriefing(input,m.port,MODELS,{promptVersion:4})).rejects.toMatchObject({name:'BriefingModelError',retryable:true,uncertain:false});
 expect(m.calls.map(c=>c.stage)).toEqual(['edit','edit']);
 const again=scripted({edit:[bad,bad]});await expect(generateBriefing(input,again.port,MODELS,{promptVersion:4})).rejects.toBeInstanceOf(BriefingModelError);
});
it('frozen older prompt versions keep their required-body behavior',async()=>{
 const {port,calls}=scripted({edit:[{items:[draft]}]});const result=await generateBriefing(input,port,MODELS,{promptVersion:3});expect(result.status).toBe('empty');expect(calls).toHaveLength(1);
});

it('consolidation preserves a complete headline-only item and its source',async()=>{
 const {port,calls}=scripted({edit:[{items:[draft]},{items:[{...draft,headline:'Second transit agency proposes a fare increase',sources:['S2'],importance:2}]}],consolidate:[{items:[{from:[0],...draft} ],cut:[{from:[1],why:'lower priority'}]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
 const result=await generateBriefing({...input,articles:[...input.articles,article('two','A second transit agency proposed a fare increase.')]},port,MODELS,{promptVersion:4,maxEditorChars:1});
 expect(calls.some(c=>c.stage==='consolidate')).toBe(true);expect(result.items[0].body).toBe('');expect(result.items[0].sourceIds).toEqual(['one']);
});
