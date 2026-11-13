import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {article,FEED,MODELS,WINDOW,scripted} from './helpers';
const articles=[article('a','The cabinet approved funding for flood relief and emergency housing.'),article('b','The local official expressed hope that a visit would lead to projects.')];
const input={feed:FEED,...WINDOW,articles};
const options={editorAccountingPolicy:'complete-source-decisions-v1' as const,editorFailurePolicy:'isolate-unusable-chunks-v1' as const};
const item={headline:'Cabinet approves flood relief',body:'',sources:['S1'],relation:'new',updates:null,importance:1};
it('corrects missing decisions and retains a per-input trail for selected and omitted evidence',async()=>{
 const mock=scripted({edit:[{items:[item]},{items:[item],left_out:[{sources:['S2'],why:'hopes for unspecified projects; no commitment announced'}]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
 const result=await generateBriefing(input,mock.port,MODELS,options);
 expect(mock.calls.map(c=>c.stage)).toEqual(['edit','edit','verify']);
 expect(mock.calls[1].request.user).toContain('INCOMPLETE_EDITOR_ACCOUNTING');
 expect(result.unaccounted).toEqual([]);
 expect(result.sourceDecisions).toEqual(expect.arrayContaining([
  expect.objectContaining({sourceId:'a',outcomes:expect.arrayContaining([expect.objectContaining({stage:'final',decision:'selected'})])}),
  expect.objectContaining({sourceId:'b',outcomes:expect.arrayContaining([expect.objectContaining({stage:'editor',decision:'omitted',reason:'hopes for unspecified projects; no commitment announced'})])})
 ]));
});
it.each(['',null])('does not accept an exclusion without a real reason (%s)',async why=>{
 const mock=scripted({edit:[{items:[],left_out:[{sources:['S1','S2'],why}]},{items:[],left_out:[{sources:['S1','S2'],why:'outside this feed interest'}]}]});
 const result=await generateBriefing(input,mock.port,MODELS,options);expect(mock.calls).toHaveLength(2);expect(result.status).toBe('empty');expect(result.sourceDecisions).toHaveLength(2);
});
it('records unresolved carry-forward instead of a quiet success when both responses omit decisions',async()=>{
 const mock=scripted({edit:[{items:[]},{items:[]}]});
 const result=await generateBriefing(input,mock.port,MODELS,options);
 expect(result.status).toBe('rejected');expect(result.dropped.flatMap(d=>d.sourceIds).sort()).toEqual(['a','b']);
 expect(result.sourceDecisions?.every(d=>d.outcomes.some(o=>o.decision==='deferred'))).toBe(true);
});
it('preserves duplicate ownership and a preparation skip without another editorial call',async()=>{
 const duplicate=article('a-copy',articles[0].text,{url:'https://fixture.invalid/a'}),original={...articles[0],url:duplicate.url};
 const mock=scripted({edit:[{items:[item],left_out:[]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
 const result=await generateBriefing({...input,articles:[original,duplicate,article('empty','')]},mock.port,MODELS,options);
 expect(result.sourceDecisions).toHaveLength(3);
 expect(result.sourceDecisions?.find(d=>d.sourceId==='a-copy')).toMatchObject({duplicateOf:'a',outcomes:expect.arrayContaining([expect.objectContaining({decision:'selected'})])});
 expect(result.sourceDecisions?.find(d=>d.sourceId==='empty')).toMatchObject({outcomes:[{stage:'preparation',decision:'skipped',reason:'empty_or_too_short'}]});
});
it('preserves old frozen input behavior and request bytes without the policy',async()=>{
 const mock=scripted({edit:[{items:[]}]});const result=await generateBriefing(input,mock.port,MODELS);
 expect(mock.calls).toHaveLength(1);expect(mock.calls[0].request.user).not.toContain('SOURCE ACCOUNTING CONTRACT');expect(result.sourceDecisions).toBeUndefined();expect(result.unaccounted).toHaveLength(2);
});

it('does not count an unusable selected row as an editorial decision',async()=>{
 const mock=scripted({edit:[{items:[{...item,headline:''}],left_out:[{sources:['S2'],why:'routine hopes'}]},{items:[],left_out:[{sources:['S1'],why:'insufficient detail to establish a decision'},{sources:['S2'],why:'routine hopes'}]}]});
 const result=await generateBriefing(input,mock.port,MODELS,options);expect(mock.calls).toHaveLength(2);expect(result.sourceDecisions?.some(d=>d.outcomes.some(o=>o.decision==='unresolved'))).toBe(false);
});
it('corrects conflicting or fabricated exclusion references',async()=>{
 for(const sources of [['S1'],['S999']]){
  const mock=scripted({edit:[{items:[item],left_out:[{sources,why:'outside scope'}]},{items:[item],left_out:[{sources:['S2'],why:'routine hopes'}]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
  const result=await generateBriefing(input,mock.port,MODELS,options);expect(result.status).toBe('published');expect(mock.calls.filter(c=>c.stage==='edit')).toHaveLength(2);
 }
});

it.each(['off-topic','routine','not relevant','not important'])('requires a source-specific explanation rather than bare label %s',async why=>{
 const mock=scripted({edit:[{items:[],left_out:[{sources:['S1','S2'],why}]},{items:[],left_out:[{sources:['S1'],why:'the report describes an AI company rather than a Lebanese development'},{sources:['S2'],why:'the mayor expresses hopes without announcing an approved project'}]}]});
 const result=await generateBriefing(input,mock.port,MODELS,options);expect(mock.calls).toHaveLength(2);expect(result.unaccounted).toEqual([]);
});
