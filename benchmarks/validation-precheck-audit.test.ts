import {it,expect,vi} from 'vitest';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inspectWriterDraft,invalidDirectQuotes} from '../apps/worker/src/v1-intelligence/writer-feedback';
import {checkReaderFidelity,numbers,faithfulFact} from '../apps/worker/src/v1-intelligence/fidelity';
import controlled from './validation-audit-cases.json';
const folder='.local-reports/briefing-latency/';
const load=(name:string)=>JSON.parse(readFileSync(folder+name,'utf8').replace(/^\uFEFF/,''));

// Offline architectural probe, NOT production validation: exact reference/scope
// failures remain hard; lexical factual alarms are evidence for semantic review.
// No model/oracle verdict is synthesized. NEEDS_SEMANTIC is never acceptance.
function proposedRoute(issues:{code:string;value?:string}[],spans:string[]){
 const exact=new Set(['INVALID_SUPPORT_QUOTE','UNKNOWN_OR_DUPLICATE_STORY','MISSING_STORY','UNAPPROVED_FACT_ID','UNAPPROVED_URL']);
 // Restricted presentation equivalence: quote delimiters and an editorial
 // comma/full stop adjoining a closing delimiter. Never alter quoted words.
 const presentation=(s:string)=>s.normalize('NFKC').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[.,](?=["'])/g,'');
 const quoteUnsupported=issues.some(i=>i.code==='INVALID_DIRECT_QUOTE'&&(!i.value||!spans.some(s=>presentation(s).includes(presentation(i.value!)))));
 return issues.some(i=>exact.has(i.code))||quoteUnsupported?'HARD_REJECT':'NEEDS_SEMANTIC';
}

it('measures both false rejections and unsafe passes of prechecks on controlled positive/negative cases',()=>{
 vi.stubGlobal('fetch',()=>{throw Error('OFFLINE_AUDIT_NETWORK_FORBIDDEN')});
 try{
  const evaluate=(cases:typeof controlled.cases)=>cases.map(c=>{
   const facts=c.facts.map((text,index)=>({id:'f'+index,text,evidenceRevisionIds:['r'],...('reportDate' in c?{timing:{sourcePublishedAt:c.reportDate,framingRequired:false}}:{})}));
   const required='required' in c?facts.filter((_,i)=>c.required!.includes(i)):facts;
   const issues=[...checkReaderFidelity([c.draft],required,facts,true,{pending:true}).failures,...invalidDirectQuotes(c.draft,c.facts).map(value=>({code:'INVALID_DIRECT_QUOTE',value}))];
   return {id:c.id,valid:c.valid,precheckPassed:issues.length===0,issues,proposedRoute:proposedRoute(issues,c.facts),proposedPublicationDecision:'UNRESOLVED_NO_SEMANTIC_VERDICT'};
  });
  const summarize=(results:ReturnType<typeof evaluate>)=>({positives:results.filter(r=>r.valid).length,negatives:results.filter(r=>!r.valid).length,falseRejections:results.filter(r=>r.valid&&!r.precheckPassed).length,unsafePrecheckPasses:results.filter(r=>!r.valid&&r.precheckPassed).length,proposedFalseHardRejections:results.filter(r=>r.valid&&r.proposedRoute==='HARD_REJECT').length,proposedHardRejections:results.filter(r=>r.proposedRoute==='HARD_REJECT').length,proposedAutomaticAcceptances:0,proposedUnresolved:results.filter(r=>r.proposedRoute==='NEEDS_SEMANTIC').length});
  const results=evaluate(controlled.cases),humanResults=evaluate(controlled.humanReviewCases),metrics=summarize(results),humanMetrics=summarize(humanResults);
  expect(results).toHaveLength(24);
  expect(results.filter(r=>r.id==='N01'||r.id==='N05').every(r=>!r.precheckPassed)).toBe(true);
  expect(humanMetrics).toMatchObject({positives:4,negatives:1,falseRejections:3,unsafePrecheckPasses:1,proposedFalseHardRejections:0,proposedAutomaticAcceptances:0});
  if(existsSync(folder))writeFileSync(folder+'validation-controlled-replay.json',JSON.stringify({labelProvenance:controlled.labelProvenance,inferenceCalls:0,metrics,results,humanMetrics,humanResults},null,2));
  console.log(JSON.stringify({validationAudit:metrics,humanReviewed:humanMetrics}));
 }finally{vi.unstubAllGlobals()}
});

it.skipIf(!existsSync(folder+'validation-artifacts.json'))('replays exact saved prechecks without providers or database writes',()=>{
 vi.stubGlobal('fetch',()=>{throw Error('OFFLINE_AUDIT_NETWORK_FORBIDDEN')});
 try{
 const artifact=load('validation-artifacts.json');
 const docs=artifact.result.flatMap((r:any)=>r.results).map((r:any)=>({kind:r.kind,value:JSON.parse(r.json)}));
 const report:any={artifactSha256:createHash('sha256').update(readFileSync(folder+'validation-artifacts.json')).digest('hex'),inferenceCalls:0,attempts:[]};
 for(const {value:work} of docs.filter((d:any)=>d.kind==='publication_work')){
  const writerStories=work.packets.flatMap((p:any)=>p.stories);
  const packet=work.packets[0];
  const input:any={...packet,editorialPlan:{id:'saved',route:'GPT'},stories:writerStories.map((s:any)=>({...s,eventVersions:[],plan:{...s.plan,facts:s.approvedFacts.map((f:any)=>({...f,evidenceRevisionIds:[...new Set(f.support.map((p:any)=>p.evidenceRevisionId))]}))}}))};
  const attempt:any={selectionId:work.selectionId,stages:[]};
  for(const {value:stored} of docs.filter((d:any)=>d.kind==='drafts'&&(d.value.id===work.selectionId||d.value.id===JSON.stringify([work.selectionId,'repair-1'])))){
   const issues=inspectWriterDraft(input,stored.draft,(s:any)=>writerStories.find((w:any)=>w.candidate.id===s.candidate.id).approvedSpans,true);
   const saved=docs.find((d:any)=>d.kind==='verification_feedback'&&d.value.draftId===stored.id)?.value;
   const precheckSaved=saved?.issues.filter((i:any)=>i.code!=='UNSUPPORTED_OR_INCOMPLETE_CLAIMS');
   const isSemanticFeedback=saved?.issues.some((i:any)=>i.code==='UNSUPPORTED_OR_INCOMPLETE_CLAIMS');
   if(!isSemanticFeedback)expect(issues).toEqual(precheckSaved);
   else expect(issues).toEqual([]);
   const ownedRoutes=writerStories.map((s:any)=>proposedRoute(issues.filter(i=>!i.candidateId||i.candidateId===s.candidate.id),s.approvedSpans.map((p:any)=>p.quote)));
   attempt.stages.push({draftId:stored.id,exactPrecheckMatch:!isSemanticFeedback,semanticFeedback:isSemanticFeedback,issues,proposedRoute:ownedRoutes.includes('HARD_REJECT')?'HARD_REJECT':'NEEDS_SEMANTIC',details:stored.draft.stories.map((s:any)=>{
    const approved=writerStories.find((w:any)=>w.candidate.id===s.candidateId);
    return {candidateId:s.candidateId,visibleQuantities:[...numbers(s.claims.map((c:any)=>c.text).join('\n'))],rejectedFacts:approved.approvedFacts.filter((f:any)=>issues.some(i=>i.factId===f.id)).map((f:any)=>({id:f.id,text:f.text,quantities:[...numbers(f.text)]})),quoteFailures:s.claims.flatMap((c:any)=>invalidDirectQuotes(c.text,approved.approvedSpans.map((p:any)=>p.quote)))};
   })});
  }
  const verification=docs.find((d:any)=>d.kind==='verification_results'&&d.value.id===JSON.stringify([work.selectionId,'repair-1']))?.value;
  if(verification){
   const failed=verification.semanticChecks.filter((c:any)=>!faithfulFact(c));
   expect(verification.claimEntailment).toHaveLength(1);
   expect(verification.claimEntailment[0].fullyEntailed).toBe(true);
   expect(failed).toHaveLength(1);
   expect(failed[0].attribution).toBe(false);
   attempt.archivedSemantic={wholeClaims:verification.claimEntailment.length,wholeClaimsApproved:verification.claimEntailment.filter((c:any)=>c.fullyEntailed).length,factChecks:verification.semanticChecks.length,failedFactChecks:failed.map((c:any)=>({factId:c.factId,reason:c.reason,attribution:c.attribution})),combinedGate:'REJECT',claimOnlyGate:'WOULD_ACCEPT',note:'Frozen saved verdict; no inference or complete publication replay.'};
  }
  report.attempts.push(attempt);
 }
 writeFileSync(folder+'validation-exact-replay.json',JSON.stringify(report,null,2));
 }finally{vi.unstubAllGlobals()}
});
