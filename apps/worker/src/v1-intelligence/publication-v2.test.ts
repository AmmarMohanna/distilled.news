import {withLatency} from './latency';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence,syntheticModelAdmission} from './test-utils';
import {prepareSemanticShortlist} from './shortlist';
import {fallbackEditorialPlan} from './editorial-plan';
import {scoreAndSelect,ADAPTIVE_BRIEFING_PROCESSING} from './scoring';
import {publishSelection,type BriefingModelPort} from './publication';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
const source='Lebanon banking reform gained about a thousand supporters over the course of two days.';
const reader='Lebanon banking reform gained about a thousand supporters over two days.';
const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store,1,source);});
afterEach(async()=>ctx.dispose());
async function selected(){
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),body=fallbackEditorialPlan(shortlist);
 for(const s of body.stories){const c=shortlist.candidates.find(c=>c.targetVersionId===s.targetVersionId)!;c.protectedReasons=[];s.newUnderstandingFactIds=c.facts.map(f=>f.id);s.mustIncludeFactIds=c.facts.map(f=>f.id);s.validation={policyVersion:'editorial-requirements-v2',propositions:c.facts.map(f=>({id:'p:'+f.id,parentFactId:f.id,text:f.text,start:0,end:f.text.length})),dispositions:c.facts.map(f=>({propositionId:'p:'+f.id,disposition:'REQUIRED',reasonCode:'CORE_DEVELOPMENT',justification:'The development and its duration define this story.',obligationIds:[]}))};}
 const plan:any={...body,id:'v2-plan',feedId:'feed-1',feedRevision:1,shortlistId:shortlist.id,window,communicationFingerprint:shortlist.communicationFingerprint,route:'GPT',evidenceRevisionIds:shortlist.evidenceRevisionIds,policyVersion:'evidence-grounded-editorial-plan-v2',validationContract:'EVIDENCE_GROUNDED_V2',createdAt:window.end};
 await feedTransact(store,'feed-1',async tx=>{await tx.write('shortlists',shortlist.id,shortlist);await tx.write('editorial_plans',plan.id,plan);});
 return scoreAndSelect(store,'feed-1',window,ADAPTIVE_BRIEFING_PROCESSING,window.end,undefined,plan);
}
function model(conflict=false):BriefingModelPort{
 const usage={tokensIn:100,tokensOut:30,cost:.001,confirmed:true};
 return {model:'test-v2',provider:'TEST',promptVersion:'approved-propositions-v2',validationContract:'EVIDENCE_GROUNDED_V2',requiresFullEntailment:true,maxCallCostUsd:.02,admission:syntheticModelAdmission,
 synthesize:async input=>({draft:{language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:[{text:reader,support:s.approvedSpans!}]}))},usage}),
 verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>f.id)),novelFactIds:claims.flatMap(c=>(c.newUnderstandingFacts??[]).map(f=>f.id)),claimEntailment:claims.map(c=>({claimId:c.id,fullyEntailed:true,unsupportedMeaning:[],reason:'Controlled fixture, not provider evidence.'})),semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({candidateId:c.candidateId,factId:f.id,communicated:true,sourceSupported:true,readerEntailsProposition:true,attribution:!conflict,certainty:true,temporal:true,qualifiers:true,readerNovelty:{status:'NEW' as const,reason:'New supported meaning.',previousFactTexts:[]},readerSpans:[{claimId:c.id,text:c.text,start:0,end:c.text.length}],reason:'Controlled fixture.'}))),usage})};
}
it('v2 publishes the valid duration through complementary verification and durable receipt fencing',async()=>{
 const selection=await selected(),port=model();let calls=0;const verify=port.verify!;port.verify=async(...args)=>{calls++;return verify(...args);};
 const edition=await withLatency({feedId:'feed-1',phase:'PUBLICATION',windowId:'controlled-v2'},()=>publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model:port,requireModel:true,validationContract:'EVIDENCE_GROUNDED_V2'}));
 expect(edition.stories[0].claims[0].text).toBe(reader);expect(calls).toBe(1);
 expect((await store.list<any>('feed-1','publication_validation_results')).some(r=>r.status==='ACCEPT')).toBe(true);
 await publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model:port,requireModel:true,validationContract:'EVIDENCE_GROUNDED_V2'});expect(calls).toBe(1);
},30000);
it('v2 conflict stays unpublished without buying a repair',async()=>{
 const selection=await selected();const port=model(true);let verifies=0;const verify=port.verify!;port.verify=async(...args)=>{verifies++;return verify(...args);};let repairs=0;port.repair=async()=>{repairs++;throw Error('MUST_NOT_REPAIR_UNRESOLVED');};
 await expect(publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model:port,requireModel:true,validationContract:'EVIDENCE_GROUNDED_V2'})).rejects.toThrow();
 expect(await store.list('feed-1','editions')).toHaveLength(0);expect(repairs).toBe(0);
 expect((await store.list<any>('feed-1','publication_validation_results')).some(r=>r.status==='UNRESOLVED'&&r.reasons.includes('SEMANTIC_VERDICT_CONFLICT'))).toBe(true);
 await expect(publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model:port,requireModel:true,validationContract:'EVIDENCE_GROUNDED_V2'})).rejects.toThrow();expect(verifies).toBe(1);expect(repairs).toBe(0);
 port.providerRoute='changed-route';await expect(publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model:port,validationContract:'EVIDENCE_GROUNDED_V2'})).rejects.toThrow();expect(verifies).toBe(1);
},30000);
it('default legacy mode cannot reinterpret a retained v2 selection or purchase its writer call',async()=>{
 const selection=await selected(),port=model();let syntheses=0;port.synthesize=async()=>{syntheses++;throw Error('FLAG_DISABLED');};
 await expect(publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model:port})).rejects.toThrow();
 expect(syntheses).toBe(0);expect(await store.list('feed-1','editions')).toHaveLength(0);
},30000);
it('incomplete fact verification persists unresolved and cannot buy a repair',async()=>{
 const selection=await selected(),port=model(),verify=port.verify!;let repairs=0;
 port.verify=async(...args)=>({...await verify(...args),semanticChecks:[]});port.repair=async()=>{repairs++;throw Error('NO_REPAIR_FOR_INCOMPLETE_VERIFICATION');};
 await expect(publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model:port,validationContract:'EVIDENCE_GROUNDED_V2'})).rejects.toThrow();
 expect(await store.list('feed-1','editions')).toHaveLength(0);expect(repairs).toBe(0);
 expect((await store.list<any>('feed-1','publication_validation_results')).some(r=>r.status==='UNRESOLVED'&&r.reasons.includes('INCOMPLETE_FACT_VERDICT'))).toBe(true);
},30000);
it.each(['missing','UNRESOLVED'])('v2 %s novelty verification cannot persist acceptance or buy a repair',async status=>{
 const selection=await selected(),port=model(),verify=port.verify!;let repairs=0,calls=0;
 port.verify=async(...args)=>{calls++;const result=await verify(...args);for(const check of result.semanticChecks??[])if(status==='missing')delete check.readerNovelty;else check.readerNovelty={status:'UNRESOLVED',reason:'Cannot determine novelty.',previousFactTexts:[]};return result;};
 port.repair=async()=>{repairs++;throw Error('NO_REPAIR_FOR_UNRESOLVED_NOVELTY');};
 const publish=()=>publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model:port,validationContract:'EVIDENCE_GROUNDED_V2'});
 await expect(publish()).rejects.toThrow();await expect(publish()).rejects.toThrow();
 expect(repairs).toBe(0);expect(calls).toBe(1);expect(await store.list('feed-1','editions')).toHaveLength(0);
 const proofs=await store.list<any>('feed-1','publication_validation_results');expect(proofs.some(r=>r.status==='ACCEPT')).toBe(false);expect(proofs.some(r=>r.status==='UNRESOLVED')).toBe(true);
},30000);
