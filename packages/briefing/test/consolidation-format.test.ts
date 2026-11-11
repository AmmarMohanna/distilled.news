import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {BriefingModelError} from '../src/types';
import {FEED,MODELS,WINDOW,article,scripted} from './helpers';

const input={feed:FEED,...WINDOW,articles:[article('one','Parliament approved banking legislation subject to presidential approval.'),article('two','Scientists discovered a meteorite beneath Antarctic ice.')]};
const draft={headline:'Banking legislation approved',body:'Presidential approval remains required.',sources:['S1'],relation:'new',importance:2};
const second={...draft,headline:'Meteorite discovered beneath Antarctic ice',body:'Scientists made the discovery during an expedition.',sources:['S2']};
const merged={...draft,from:[0]};
const options={promptVersion:4 as const,maxEditorChars:1};
const edits=[{items:[draft]},{items:[second]}];
const good={items:[merged,{...second,from:[1]}]};
const invalids=[
 ['headline missing',{...merged,headline:undefined},'INVALID_ARTICLE_HEADLINE'],
 ['headline empty',{...merged,headline:' '},'INVALID_ARTICLE_HEADLINE'],
 ['headline invalid',{...merged,headline:42},'INVALID_ARTICLE_HEADLINE'],
 ['body missing',{...merged,body:undefined},'INVALID_ARTICLE_BODY'],
 ['body null',{...merged,body:null},'INVALID_ARTICLE_BODY'],
 ['from missing',{...merged,from:undefined},'INVALID_CONSOLIDATION_FROM'],
 ['from empty',{...merged,from:[]},'INVALID_CONSOLIDATION_FROM'],
 ['from string',{...merged,from:['0']},'INVALID_CONSOLIDATION_FROM'],
 ['from null index',{...merged,from:[null]},'INVALID_CONSOLIDATION_FROM'],
 ['from mixed valid/invalid',{...merged,from:[0,9]},'INVALID_CONSOLIDATION_FROM'],
 ['from fractional',{...merged,from:[0.5]},'INVALID_CONSOLIDATION_FROM'],
] as const;
it.each(invalids)('corrects consolidation %s before applying cuts',async(_name,bad,error)=>{
 const m=scripted({edit:edits,consolidate:[{items:[{...second,from:[1]},bad],cut:[{from:[0],why:'not selected'}]},good],verify:[{results:[{i:0,verdict:'ok'},{i:1,verdict:'ok'}]}]});
 const r=await generateBriefing(input,m.port,MODELS,options);
 expect(r.status).toBe('published');expect(r.items).toHaveLength(2);expect(r.omitted).toEqual([]);
 expect(m.calls.map(c=>c.stage)).toEqual(['edit','edit','consolidate','consolidate','verify']);expect(m.calls[3].request.user).toContain(error);
});
it('cannot silently omit non-lead drafts when consolidation correction fails',async()=>{
 const bad={items:[{...merged,body:null}]},m=scripted({edit:edits,consolidate:[bad,bad]});
 await expect(generateBriefing(input,m.port,MODELS,options)).rejects.toBeInstanceOf(BriefingModelError);expect(m.calls.map(c=>c.stage)).toEqual(['edit','edit','consolidate','consolidate']);
});
it('preserves explicit editorial cuts and a valid empty consolidation selection',async()=>{
 const m=scripted({edit:edits,consolidate:[{items:[],cut:[{from:[0,1],why:'No material development for this feed.'}]}]});
 const r=await generateBriefing(input,m.port,MODELS,options);expect(r.status).toBe('empty');expect(r.omitted).toHaveLength(2);expect(m.calls).toHaveLength(3);
});
it('accepts a valid headline-only consolidated item without correction',async()=>{
 const m=scripted({edit:edits,consolidate:[{items:[{...merged,body:''}],cut:[{from:[1],why:'Off topic'}]}],verify:[{results:[{i:0,verdict:'ok'}]}]});
 const r=await generateBriefing(input,m.port,MODELS,options);expect(r.items[0].body).toBe('');expect(r.items[0].sourceIds).toEqual(['one']);expect(m.calls).toHaveLength(4);
});
