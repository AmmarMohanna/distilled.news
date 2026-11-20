import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {BriefingModelError} from '../src/types';
import {FEED,MODELS,WINDOW,article} from './helpers';
const input={feed:FEED,...WINDOW,articles:[article('a','The cabinet approved emergency funding for flood victims today.'),article('b','The court charged five people with forming an armed group today.')]};
const selected={headline:'Cabinet approves emergency flood funding',body:'',sources:['S1'],relation:'new',updates:null,importance:2};
const options={editorAccountingPolicy:'complete-source-decisions-v2' as const,editorFailurePolicy:'isolate-unaccounted-sources-v2' as any,prepare:{nearDuplicate:1.01}};
function port(raw:unknown,failure?:Error){let calls=0;return {get calls(){return calls},complete:async(request:any)=>{calls++;if(request.system.startsWith('You are the editor')){if(failure&&calls===2)throw failure;return {text:JSON.stringify(raw),inputTokens:1,outputTokens:1}}return {text:'{"results":[{"i":0,"verdict":"ok","issues":[]}]}',inputTokens:1,outputTokens:1}}};}
it('retains verified selected work after bounded accounting correction and carries only the missing source',async()=>{
 const p=port({items:[selected],left_out:[]}),r=await generateBriefing(input,p,MODELS,options);
 expect(r.status).toBe('published');expect(r.items[0].sourceIds).toEqual(['a']);expect(r.unaccounted).toEqual([{ref:'S2',sourceIds:['b']}]);
 expect(r.dropped).toEqual([expect.objectContaining({carry:true,sourceIds:['b'],reason:expect.stringContaining('unaccounted')})]);expect(p.calls).toBe(3);
});
it('does not manufacture quiet or an exclusion reason for missing sources',async()=>{
 const r=await generateBriefing(input,port({items:[],left_out:[{sources:['S1'],why:'unchanged'}]}),MODELS,options);
 expect(r.status).toBe('rejected');expect(r.dropped.flatMap(d=>d.sourceIds)).toEqual(['b']);expect(r.omitted[0].sourceIds).toEqual(['a']);
});
it('does not salvage conflicting, fabricated, or invalid decisions',async()=>{
 for(const raw of [{items:[selected],left_out:[{sources:['S1'],why:'unchanged'}]},{items:[selected],left_out:[{sources:['S99'],why:'unchanged'}]}]){
  const r=await generateBriefing(input,port(raw),MODELS,options);expect(r.status).toBe('rejected');expect(r.items).toEqual([]);
 }
 await expect(generateBriefing(input,port({items:[{...selected,headline:''}],left_out:[]}),MODELS,options)).rejects.toThrow('INVALID_ARTICLE_HEADLINE');
});
it('never swallows a provider or uncertain-paid failure during correction',async()=>{
 const error=new BriefingModelError('unknown paid outcome',false,true);await expect(generateBriefing(input,port({items:[selected]},error),MODELS,options)).rejects.toBe(error);
});
it('preserves the old frozen-policy whole-batch deferral',async()=>{
 const r=await generateBriefing(input,port({items:[selected]}),MODELS,{...options,editorFailurePolicy:'isolate-unusable-chunks-v1'});
 expect(r.status).toBe('rejected');expect(r.dropped[0].sourceIds).toEqual(['a','b']);
});
it.each([undefined,'length'])('does not salvage stale output when the last response spoofs an accounting error (finish=%s)',async finishReason=>{
 let calls=0;const p={complete:async(q:any)=>{calls++;if(q.system.startsWith('You are the editor'))return {text:calls===1?JSON.stringify({items:[selected],left_out:[]}):'INCOMPLETE_EDITOR_ACCOUNTING: explicitly select or exclude every supplied source; missing S2',inputTokens:1,outputTokens:1,...(calls===2?{finishReason}:{})};return {text:'{"results":[{"i":0,"verdict":"ok","issues":[]}]}',inputTokens:1,outputTokens:1};}};
 await expect(generateBriefing(input,p,MODELS,options)).rejects.toThrow('model did not return usable JSON');expect(calls).toBe(2);
});
