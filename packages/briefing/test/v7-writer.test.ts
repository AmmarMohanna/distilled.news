import {it,expect} from 'vitest';
import type {ModelRequest} from '../src/model';
import {generateBriefing,DEFAULT_ENGINE} from '../src/engine';
import {EDITOR_SYSTEM_V7,VERIFY_SYSTEM_V7} from '../src/prompts-v7';
import {article,FEED,WINDOW,MODELS,scripted} from './helpers';
it('keeps V4 default and requires explicit V7 selection',()=>{expect(DEFAULT_ENGINE.promptVersion).toBe(4);expect(EDITOR_SYSTEM_V7).toContain('Every supplied reference');expect(VERIFY_SYSTEM_V7).toContain('Optional');});
it('preserves headline-only publication and diagnostic source accounting without extra stages',async()=>{
 const x=scripted({edit:[{items:[{headline:'A conditional commitment',body:'',sources:['S1'],importance:1}],left_out:[]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
 const r=await generateBriefing({feed:FEED,...WINDOW,articles:[article('a','A board proposed a conditional commitment subject to approval.'),article('b','A different optional background report about an unrelated issue.')]},x.port,MODELS,{promptVersion:7});
 expect(r.status).toBe('published');expect(r.items[0].body).toBe('');expect(r.unaccounted).toEqual([{ref:'S2',sourceIds:['b']}]);expect(x.calls.map(c=>c.stage)).toEqual(['edit','verify']);expect(x.calls[0].request.system).toBe(EDITOR_SYSTEM_V7);expect(x.calls[1].request.system).toBe(VERIFY_SYSTEM_V7);
});
it('accepts an accounted quiet result without calling a verifier on no items',async()=>{const x=scripted({edit:[{items:[],left_out:[{sources:['S1'],why:'repeat; no material change'}]}]});const r=await generateBriefing({feed:FEED,...WINDOW,articles:[article('a','A repeated announcement without a meaningful change.')]},x.port,MODELS,{promptVersion:7});expect(r.items).toEqual([]);expect(r.unaccounted).toEqual([]);expect(x.calls).toHaveLength(1);});
it('preserves repair numbering and reverifies the corrected item without adding a routine stage',async()=>{
 const x=scripted({edit:[{items:[{headline:'Fund completed',body:'',sources:['S1'],importance:1}]}],verify:[{results:[{i:0,verdict:'fix',issues:['completed is unsupported; the source says subject to approval.']}]},{results:[{i:0,verdict:'ok',issues:[]}]}],repair:[(r:ModelRequest)=>{expect(r.user).toContain('#0');return {items:[{i:0,headline:'Fund planned subject to approval',body:'',drop:false}]};}]});
 const r=await generateBriefing({feed:FEED,...WINDOW,articles:[article('a','A fund is planned subject to approval from its members.')]},x.port,MODELS,{promptVersion:7});expect(r.items[0].headline).toBe('Fund planned subject to approval');expect(x.calls.map(c=>c.stage)).toEqual(['edit','verify','repair','verify']);
});
it('keeps complementary citation ownership while consolidating only when existing size limits require it',async()=>{
 const x=scripted({edit:[{items:[{headline:'One decision',body:'First evidence',sources:['S1'],importance:1}]},{items:[{headline:'The same decision',body:'Complementary evidence',sources:['S2'],importance:1}]}],consolidate:[{items:[{from:[0,1],headline:'One supported decision',body:'Complementary evidence',importance:1}],cut:[]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});const r=await generateBriefing({feed:FEED,...WINDOW,articles:[article('a','First source describing a newly announced policy decision.'),article('b','Second independent source with complementary details about the decision.')]},x.port,MODELS,{promptVersion:7,maxEditorChars:1});expect(r.items[0].sourceIds).toEqual(['a','b']);expect(x.calls.map(c=>c.stage)).toEqual(['edit','edit','consolidate','verify']);
});
