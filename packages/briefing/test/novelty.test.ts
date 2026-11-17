import {it,expect} from 'vitest';
import {verificationMemory,exactPriorRepeat,redundantDrafts} from '../src/novelty';
import {UsageMeter} from '../src/model';
import {generateBriefing} from '../src/engine';
import {FEED,MODELS,WINDOW,article,scripted} from './helpers';
const headline='Authority orders illegal internet users moved to licensed networks';
const body='The transfer must finish within three months.';
const prior={id:'old',at:WINDOW.windowStart,headline:`${headline}\n${body}`,body:`${headline}\n${body}`};
it('requires a complete novelty decision and does not conflate novelty with factual support',async()=>{
 const drafts=[{headline,body},{headline,body:'The deadline has been extended to six months.'}];
 const port={complete:async()=>({text:JSON.stringify({results:[{i:0,redundant:true,delta:'none'},{i:1,redundant:false,delta:'Deadline changed to six months'}]}),inputTokens:1,outputTokens:1})};
 expect([...(await redundantDrafts(port,new UsageMeter(),'test',drafts,[prior]))]).toEqual([0]);
 const incomplete={complete:async()=>({text:'{"results":[]}',inputTokens:1,outputTokens:1})};
 await expect(redundantDrafts(incomplete,new UsageMeter(),'test',drafts,[prior])).rejects.toThrow();
});
it('retrieves older reader-language memory independently of source language and unrelated recent stories',()=>{
 const history=[prior,...Array.from({length:40},(_,i)=>({id:`p${i}`,at:WINDOW.windowEnd,headline:`Football team wins match ${i}`,body:'League results and standings.'}))];
 expect(verificationMemory(history,[{headline,body}],new Date(WINDOW.windowEnd)).some(p=>p.id==='old')).toBe(true);
 expect(exactPriorRepeat({headline,body},history)).toBe(true);
 expect(exactPriorRepeat({headline,body:'The authority has extended the deadline to six months.'},history)).toBe(false);
});
it('rejects an exact repeat without another paid verifier call and preserves legacy behavior',async()=>{
 const draft={headline,body,sources:['S1'],relation:'new',updates:null,importance:1};
 const input={feed:FEED,...WINDOW,prior:[prior],articles:[article('a',`${headline}. ${body}`)]};
 const fixed=scripted({edit:[{items:[draft]}]});
 const result=await generateBriefing(input,fixed.port,MODELS,{noveltyGuard:true,promptVersion:4});
 expect(result.items).toEqual([]);expect(result.dropped[0].carry).toBe(false);expect(fixed.calls).toHaveLength(1);
 const legacy=scripted({edit:[{items:[draft]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
 expect((await generateBriefing(input,legacy.port,MODELS,{promptVersion:4})).items).toHaveLength(1);
});
