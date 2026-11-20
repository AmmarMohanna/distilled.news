import {expect,it} from 'vitest';
import {sourceBoundIdentityRepair} from '../src/verification-recovery';
import {generateBriefing} from '../src/engine';
import {readerTokens} from '../src/source-bound-claims';
import {article,FEED,MODELS,WINDOW} from './helpers';
import type {ModelPort} from '../src/model';

const nameIssue='PERSON_NAME_NOT_SOURCE_BOUND: John Smith -> Smith. Use only the identity established by cited evidence.';
it('removes only a source-unestablished given name, keeping every other character and material fact',()=>{
 const item={headline:'Mayor John Smith announces an inspection.',body:'The bridge remains closed; 123 residents were evacuated.',refs:['S1'],issues:[nameIssue]};
 const sources=[{ref:'S1',text:'Mayor Smith announced an inspection. The bridge remains closed; 123 residents were evacuated.'}] as any;
 expect(sourceBoundIdentityRepair(item,sources)).toEqual({headline:'Mayor Smith announces an inspection.',body:item.body});
 expect(sourceBoundIdentityRepair({...item,issues:[nameIssue,'The count must be 125.']},sources)).toBeUndefined();
 expect(sourceBoundIdentityRepair(item,[{ref:'S2',text:'Smith'}] as any)).toBeUndefined();
 expect(sourceBoundIdentityRepair(item,[{ref:'S1',text:'Mayor Smithson announced an inspection.'}] as any)).toBeUndefined();
});
it('uses only an exact source-bound role and refuses ambiguous or ungrounded replacements',()=>{
 const issue='INDEPENDENT_ROLE_MISMATCH: Alex Brown / Commander -> President. Preserve the independently extracted current source role.';
 const item={headline:'Commander Alex Brown approved the plan.',body:'It still requires parliamentary approval.',refs:['S1'],issues:[issue]};
 expect(sourceBoundIdentityRepair(item,[{ref:'S1',text:'President Alex Brown approved the plan.'}] as any)).toEqual({headline:'President Alex Brown approved the plan.',body:item.body});
 expect(sourceBoundIdentityRepair(item,[{ref:'S1',text:'Commander Alex Brown spoke. President Jane Doe approved the plan.'}] as any)).toBeUndefined();
});

it('repairs a proven identity in code, re-verifies it, and preserves its body and approved sibling without a generative rewrite',async()=>{
 const bad='Mayor John Smith announces an inspection.',good='Mayor Smith announces an inspection.',body='The bridge remains closed; 123 residents were evacuated.';
 let reviews=0,repairCalls=0;
 const port:ModelPort={complete:async req=>{
  let raw:unknown;const p=JSON.parse(req.user.startsWith('{')?req.user:'{}');
  if(req.system.startsWith('You are the editor'))raw={items:[{headline:bad,body,sources:['S1'],relation:'new',importance:1},{headline:'Park reopened.',body:'',sources:['S2'],relation:'new',importance:2}]};
  else if(req.system.startsWith('Independently extract explicitly supported HUMAN'))raw={sources:Object.fromEntries(p.units.map((u:any)=>[u.id,u.id==='S1'?[{personTokens:{start:'T1',end:'T1'},roleTokens:{start:'T0',end:'T0'}}]:[]]))};
  else if(req.system.startsWith('Independently identify'))raw={units:Object.fromEntries(p.units.map((u:any)=>[u.id,u.id==='I0.H'?[{personTokens:{start:'T1',end:u.text.includes('John')?'T2':'T1'},roleTokens:{start:'T0',end:'T0'}}]:[]])),assertions:Object.fromEntries(p.units.map((u:any)=>[u.id,[{tokens:{start:'T0',end:readerTokens(u.text).at(-1)!.id},kind:'action'}]]))};
  else if(req.system.startsWith('You are a meticulous')){reviews++;raw={results:Object.fromEntries(p.items.map((item:any,i:number)=>[i,{inventory:'complete',verdict:'ok',issues:[],priorIds:[],citationChecks:Object.fromEntries(item.refs.map((ref:string)=>[ref,{support:'supported',quote:p.evidencePassages.find((v:any)=>v.source===ref).id,explanation:'Same development.'}])),facets:Object.fromEntries(p.inventory.filter((f:any)=>f.item===i).map((f:any)=>[f.id,{support:'supported',evidence:[{source:item.refs[0],quote:p.evidencePassages.find((v:any)=>v.source===item.refs[0]).id}],explanation:'Compared with retained evidence.'}]))}]))};}
  else {repairCalls++;throw Error('GENERIC_REWRITE_MUST_NOT_RUN');}
  return {text:JSON.stringify(raw),inputTokens:1,outputTokens:1};
 }};
 const result=await generateBriefing({feed:{...FEED,identityFidelityPolicy:'source-bound-claims-v3',verificationRecoveryPolicy:'supported-core-v2'},...WINDOW,articles:[article('a','Mayor Smith announced an inspection. '+body),article('b','Park reopened.')]},port,MODELS,{prepare:{minChars:1}});
 expect(repairCalls).toBe(0);expect(reviews).toBe(2);expect(result.items.map(i=>i.headline)).toEqual([good,'Park reopened.']);expect(result.items[0].body).toBe(body);expect(result.dropped).toEqual([]);
});
