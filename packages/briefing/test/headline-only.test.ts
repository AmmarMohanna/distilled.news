import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
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
it('a missing body field remains malformed rather than silently losing prose',async()=>{
 const {body,...missing}=draft;const {port,calls}=scripted({edit:[{items:[missing]}]});const result=await generateBriefing(input,port,MODELS,{promptVersion:4});expect(result.items).toHaveLength(0);expect(calls).toHaveLength(1);
});
it('frozen older prompt versions keep their required-body behavior',async()=>{
 const {port,calls}=scripted({edit:[{items:[draft]}]});const result=await generateBriefing(input,port,MODELS,{promptVersion:3});expect(result.status).toBe('empty');expect(calls).toHaveLength(1);
});

it('consolidation preserves a complete headline-only item and its source',async()=>{
 const {port,calls}=scripted({edit:[{items:[draft]},{items:[{...draft,headline:'Second transit agency proposes a fare increase',sources:['S2'],importance:2}]}],consolidate:[{items:[{from:[0],...draft} ],cut:[{from:[1],why:'lower priority'}]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
 const result=await generateBriefing({...input,articles:[...input.articles,article('two','A second transit agency proposed a fare increase.')]},port,MODELS,{promptVersion:4,maxEditorChars:1});
 expect(calls.some(c=>c.stage==='consolidate')).toBe(true);expect(result.items[0].body).toBe('');expect(result.items[0].sourceIds).toEqual(['one']);
});
