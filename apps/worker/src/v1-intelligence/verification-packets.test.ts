import {it,expect} from 'vitest';
import {partitionVerification,mergeVerification} from './verification-packets';
import type {VerificationClaim} from './publication';
const claims:VerificationClaim[]=Array.from({length:6},(_,i)=>({id:'claim-'+i,candidateId:'story-'+i,text:'Supported development '+i,support:[],context:[],requiredFacts:[{id:'fact-'+i,text:'Supported development '+i,evidenceRevisionIds:['source-'+i]}]}));
it('all stories and every cross-story pair are verified beyond one operation context',()=>{
 const packets=partitionVerification(claims,packet=>packet.length<=2);expect(packets).toHaveLength(15);expect(new Set(packets.flatMap(p=>p.map(c=>c.id))).size).toBe(6);for(let i=0;i<6;i++)for(let j=i+1;j<6;j++)expect(packets.some(p=>p.some(c=>c.id===claims[i].id)&&p.some(c=>c.id===claims[j].id))).toBe(true);
});
it('a permissive verdict cannot override a rejected claim from another comparison',()=>{
 const packets=partitionVerification(claims,packet=>packet.length<=2),results=packets.map((packet,index)=>({claims:packet,result:{supportedClaimIds:packet.filter(c=>index!==0||c.id!=='claim-0').map(c=>c.id),preservedFactIds:packet.flatMap(c=>c.requiredFacts!.map(f=>f.id)),usage:{tokensIn:1,tokensOut:1,cost:0,confirmed:true}}}));expect(mergeVerification(results).supportedClaimIds).not.toContain('claim-0');expect(mergeVerification(results).supportedClaimIds).toHaveLength(5);
});
it('accepts offered optional facts while preserving ownership and required completeness',()=>{
 const claim={...claims[0],allowedFacts:[{id:'optional',text:'Offered context',evidenceRevisionIds:['source-0']}]};
 const check={candidateId:'story-0',factId:'optional',communicated:false,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Offered context omitted'};
 const result={supportedClaimIds:['claim-0'],semanticChecks:[check],usage:{tokensIn:0,tokensOut:0,cost:0,confirmed:true}};
 expect(mergeVerification([{claims:[claim],result}]).semanticChecks).toEqual([check]);
 expect(()=>mergeVerification([{claims:[claim],result:{...result,semanticChecks:[{...check,candidateId:'story-1'}]}}])).toThrow('SCOPE_DENIED');
 expect(()=>mergeVerification([{claims:[claim],result}],true)).toThrow('SCOPE_DENIED');
});
it('unoffered claims or facts cannot be imported through verification reconciliation',()=>{
 expect(()=>mergeVerification([{claims:[claims[0]],result:{supportedClaimIds:['claim-1'],usage:{tokensIn:0,tokensOut:0,cost:0,confirmed:true}}}])).toThrow();
});
it('an individually unsupported context is explicit; it never gets shortened or accepted',()=>expect(()=>partitionVerification(claims,()=>false)).toThrow('MODEL_CONTEXT_CONTINUATION_REQUIRED'));

it('fills context-sized verification groups rather than issuing unnecessary pair calls',()=>{
 const packets=partitionVerification(claims,p=>p.length<=4);expect(packets.length).toBeLessThan(15);for(let i=0;i<6;i++)for(let j=i+1;j<6;j++)expect(packets.some(p=>p.some(c=>c.id===claims[i].id)&&p.some(c=>c.id===claims[j].id))).toBe(true);
});

it('full-entailment publication cannot borrow a missing packet verdict from another packet',()=>{
 const valid={supportedClaimIds:['claim-0'],preservedFactIds:['fact-0'],claimEntailment:[{claimId:'claim-0',fullyEntailed:true,unsupportedMeaning:[],reason:'Supported'}],usage:{tokensIn:0,tokensOut:0,cost:0,confirmed:true}};
 expect(()=>mergeVerification([{claims:[claims[0]],result:valid},{claims:[claims[0]],result:{supportedClaimIds:['claim-0'],usage:valid.usage}}],true)).toThrow();
});

import {partitionWriterInput} from './publication-packets';
import type {SynthesisWriterInput} from './publication';
it('writer fragments preserve every owned fact and never redefine Event boundaries',()=>{
 const story={candidate:{id:'candidate',targetType:'EVENT' as const,targetVersionId:'event'},evidence:[],approvedFacts:Array.from({length:9},(_,i)=>({id:'f'+i,text:'Fact '+i,support:[]}))};
 const input={feed:{id:'feed',revision:1,title:'News',interests:[],outputLanguage:'en'},selectionId:'selection',stories:[story]} as SynthesisWriterInput;
 const packets=partitionWriterInput(input,p=>p.stories.reduce((n,s)=>n+(s.approvedFacts?.length??0),0)<=3);
 expect(packets.flatMap(p=>p.stories.flatMap(s=>s.approvedFacts!.map(f=>f.id)))).toEqual(story.approvedFacts.map(f=>f.id));expect(packets.every(p=>p.stories.every(s=>s.candidate.targetVersionId==='event'))).toBe(true);
});
it('a blocked writer story remains explicitly pending while an independent story proceeds',()=>{
 const stories=['blocked','valid'].map(id=>({candidate:{id,targetType:'EVENT' as const,targetVersionId:id},evidence:[],approvedFacts:[{id:id+'-fact',text:id,support:[]}]}));
 const input={feed:{id:'feed',revision:1,title:'News',interests:[],outputLanguage:'en'},selectionId:'selection',stories} as SynthesisWriterInput,pending:string[]=[];
 const packets=partitionWriterInput(input,p=>p.stories.every(s=>s.candidate.id!=='blocked'),{onPending:id=>pending.push(id)});
 expect(pending).toEqual(['blocked']);expect(packets.flatMap(p=>p.stories.map(s=>s.candidate.id))).toEqual(['valid']);
});
