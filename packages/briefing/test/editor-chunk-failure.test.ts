import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {BriefingModelError} from '../src/types';
import {FEED,MODELS,WINDOW,article} from './helpers';
const input={feed:FEED,...WINDOW,articles:[article('bad','One outlet reports an airport terminal decision by the cabinet.'),article('good','The cabinet approved emergency funding for flood victims today.')]};
const policy={editorFailurePolicy:'isolate-unusable-chunks-v1' as const,maxEditorChars:1,prepare:{nearDuplicate:1.01}};
function port(failure?:Error){return {complete:async(request:any)=>{
 if(request.system.startsWith('You are the editor')){
  if(request.user.includes('[S1]')){if(failure)throw failure;return {text:'{"items":[{"headline":"Bad citation","body":"","sources":["publisher-id"],"relation":"new","updates":null}]}',inputTokens:10,outputTokens:10};}
  return {text:'{"items":[{"headline":"Cabinet approves flood relief","body":"","sources":["S2"],"relation":"new","updates":null}]}',inputTokens:10,outputTokens:10};
 }
 return {text:'{"results":[{"i":0,"verdict":"ok","issues":[]}]}',inputTokens:10,outputTokens:10};
}}}
it('publishes independently verified work and explicitly carries every source from an unusable chunk',async()=>{
 const result=await generateBriefing(input,port(),MODELS,policy);
 expect(result.status).toBe('published');expect(result.items.map(i=>i.sourceIds)).toEqual([['good']]);
 expect(result.dropped).toContainEqual(expect.objectContaining({carry:true,sourceIds:['bad'],reason:expect.stringContaining('unusable')}));
 expect(result.unaccounted).toContainEqual({ref:'S1',sourceIds:['bad']});expect(result.usage.calls).toBe(4);
});
it('preserves the legacy frozen-window failure behavior when the policy is absent',async()=>{
 await expect(generateBriefing(input,port(),MODELS,{maxEditorChars:1,prepare:{nearDuplicate:1.01}})).rejects.toThrow('INVALID_ARTICLE_CITATIONS');
});
it('does not swallow uncertain paid outcomes or scope/transport errors',async()=>{
 for(const error of [new BriefingModelError('uncertain provider',false,true),new Error('SCOPE_DENIED')])await expect(generateBriefing(input,port(error),MODELS,policy)).rejects.toThrow(error.message);
});
it('does not report a quiet edition when all chunks were unusable',async()=>{
 const result=await generateBriefing(input,{complete:async()=>({text:'not json',inputTokens:10,outputTokens:10})},MODELS,policy);
 expect(result.status).toBe('rejected');expect(result.items).toEqual([]);expect(result.dropped.flatMap(d=>d.sourceIds).sort()).toEqual(['bad','good']);expect(result.dropped.every(d=>d.carry)).toBe(true);
});
