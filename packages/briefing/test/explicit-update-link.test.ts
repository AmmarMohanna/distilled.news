import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {occurrenceNovelty} from '../src/novelty';
import {UsageMeter} from '../src/model';
import {article,FEED,MODELS,WINDOW} from './helpers';
const prior=[{id:'p',at:WINDOW.windowStart,headline:'Model released',body:''}];
it('links a retained material update to its actual prior item rather than presenting a second launch',async()=>{
 const port={complete:async(q:any)=>{let raw:any;
  if(q.system.startsWith('You are the editor'))raw={items:[{headline:'New independent benchmark results for the model',body:'The model scored 61.',sources:['S1'],relation:'new',updates:null,importance:1}]};
  else if(q.system.startsWith('You assess whether'))raw={results:[{i:0,redundant:false,delta:'A newly released independent benchmark score of 61.',priorIds:['p'],sameOccurrence:'The same model release.',relation:'update'}]};
  else raw={results:[{i:0,verdict:'ok',issues:[]}]};
  return {text:JSON.stringify(raw),inputTokens:1,outputTokens:1};
 }};
 const result=await generateBriefing({feed:FEED,...WINDOW,prior,articles:[article('a','New independent benchmark results for the released model give it a score of 61.')]},port,MODELS,{editorSelectionPolicy:'preserve-selected-developments-v1',noveltyGuard:true,noveltyPolicy:'occurrence-aware-v1',now:()=>new Date(WINDOW.windowEnd)});
 expect(result.items[0]).toMatchObject({relation:'update',updatesId:'p'});
});
it('requires explicit prior identity for an update and does not infer updates from shared topics',async()=>{
 const port={complete:async()=>({text:JSON.stringify({results:[{i:0,redundant:false,delta:'A different incident.',priorIds:[],sameOccurrence:'',relation:'update'}]}),inputTokens:1,outputTokens:1})};
 await expect((occurrenceNovelty as any)(port,new UsageMeter(),MODELS.editor,[{headline:'Another incident',body:'',sources:[]}],prior,WINDOW.windowEnd,true)).rejects.toThrow('UNLINKED_OCCURRENCE_UPDATE');
});
it('requires a complete explicit-link response for every supplied draft at the provider boundary',async()=>{
 let request:any;const port={complete:async(q:any)=>{request=q;return {text:JSON.stringify({results:[0,1].map(i=>({i,redundant:false,delta:'A separate supported occurrence.',priorIds:[],sameOccurrence:'',relation:'new'}))}),inputTokens:1,outputTokens:1}}};
 await occurrenceNovelty(port,new UsageMeter(),MODELS.editor,[{headline:'First event',body:'',sources:[]},{headline:'Second event',body:'',sources:[]}],prior,WINDOW.windowEnd,true,'consistent-links-v2');
 expect(request.responseSchema.properties.results).toMatchObject({minItems:2,maxItems:2});
 expect(request.system).toContain('EXPLICIT UPDATE LINKS');expect(JSON.parse(request.user).requiredDraftIndices).toEqual([0,1]);
 const variants=request.responseSchema.properties.results.items.anyOf;
 expect(variants.map((v:any)=>[v.properties.relation.enum[0],v.properties.redundant.enum[0]])).toEqual([['new',false],['update',false],['correction',false],['repeat',true]]);
});
it('retains the paid explicit-links v1 schema when no new frozen wire marker exists',async()=>{
 const requests:any[]=[],p={complete:async(q:any)=>{requests.push(q);return {text:JSON.stringify({results:[{i:0,redundant:false,delta:'A distinct supported event.',priorIds:[],sameOccurrence:'',relation:'new'}]}),inputTokens:1,outputTokens:1}}};
 await occurrenceNovelty(p,new UsageMeter(),MODELS.editor,[{headline:'Event',body:'',sources:[]}],prior,WINDOW.windowEnd,true);
 expect(requests[0].responseSchema.properties.results.items).toEqual({type:'object',properties:{i:{type:'integer',enum:[0]},redundant:{type:'boolean'},delta:{type:'string'},priorIds:{type:'array',items:{type:'string',enum:['p']}},sameOccurrence:{type:'string'},relation:{type:'string',enum:['new','update','correction','repeat']}},required:['i','redundant','delta','priorIds','sameOccurrence','relation'],additionalProperties:false});
});
