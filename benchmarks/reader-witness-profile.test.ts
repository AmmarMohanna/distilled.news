import {expect,it} from 'vitest';
import {writeFileSync} from 'node:fs';
import {decidePublicationPackets} from '../apps/worker/src/v1-intelligence/publication-validation';
// @ts-expect-error benchmark-only immutable Git baseline
import {decidePublicationPackets as before} from 'virtual:baseline-validation';
it('measures deterministic reader-witness overhead without treating controlled verdicts as provider accuracy',()=>{
 const claims:any[]=Array.from({length:12},(_,i)=>({id:'claim'+i,candidateId:'story'+i,text:'Officials said the road reopened.',support:[],context:[],requiredFacts:[{id:'f'+i,text:'The road reopened, officials said.',evidenceRevisionIds:['r'+i]}]}));
 const result:any={supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.map(c=>c.requiredFacts[0].id),claimEntailment:claims.map(c=>({claimId:c.id,fullyEntailed:true,unsupportedMeaning:[],reason:'Controlled port.'})),semanticChecks:claims.map(c=>({candidateId:c.candidateId,factId:c.requiredFacts[0].id,communicated:true,sourceSupported:true,readerEntailsProposition:true,preservedInSummary:true,attribution:true,certainty:true,temporal:true,qualifiers:true,readerSpans:[{claimId:c.id,text:c.text,start:0,end:c.text.length}],reason:'Controlled port.'}))};
 const samples=[];
 for(let round=0;round<11;round++)for(const variant of round%2?['after','before']:['before','after']){
  const run=variant==='before'?before:decidePublicationPackets,start=performance.now();let decision;
  for(let i=0;i<100;i++)decision=run(claims,[{claims,result}]).decision;
  const durationMs=performance.now()-start;expect(decision.status).toBe('ACCEPT');
  samples.push({round,variant,warmup:round===0,decisions:100,durationMs,msPerDecision:durationMs/100});
 }
 const report={scope:'Deterministic combined gate and one-packet merge, controlled semantic port, 12 stories/claims/required facts; not provider accuracy or inference latency',baseline:'2e46fa9',providerCalls:0,samples};
 if(process.env.READER_WITNESS_PROFILE_OUTPUT)writeFileSync(process.env.READER_WITNESS_PROFILE_OUTPUT,JSON.stringify(report,null,2),{flag:'wx'});
 console.info(JSON.stringify(report));
});
