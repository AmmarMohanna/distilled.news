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
