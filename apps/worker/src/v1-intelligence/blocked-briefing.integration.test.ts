import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const prepared=vi.hoisted(()=>({value:undefined as any}));
vi.mock('./semantic-preparation',()=>({prepareSemanticMatch:async()=>prepared.value}));
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,acceptEvidence} from './test-utils';
import {processEvidenceIntelligence} from './engine';
import {deterministicMatchers} from './matchers';
import {dispatchV1Intelligence,processV1Briefing,processV1Rematch} from './runtime';
import {withdrawV1Edition} from './public-read';
import {fallbackEditorialPlan} from './editorial-plan';
import {compactEditorialInput} from './editorial-transport';
import {readScheduleAudit} from './schedule-audit';
import {readBlockedWindows,BLOCKED_REASON,ESCALATED_REASON,CARRIED_FORWARD_REASON} from './blocked-window';
import type {ShortlistRecord} from './shortlist';
import type {RematchRequest,RematchAttempt} from './rematch';
import type {BriefingEditionRecord} from './publication';
import type {Env,DistilledQueueMessage} from '../types';

const w1={start:'2026-10-06T11:00:00Z',end:'2026-10-06T12:00:00Z',kind:'HOURLY' as const},w2={start:'2026-10-06T12:00:00Z',end:'2026-10-06T13:00:00Z',kind:'HOURLY' as const};
const NOW2='2026-10-06T13:00:05Z',TEXT='Anthropic updated its usage policy to ban repeated extreme abuse of Claude.';
const deferMatchers={...deterministicMatchers,event:{match:()=>({structuralRelation:'DEFER' as const,epistemicEffects:[],confidence:0,provenance:{scorer:'SEMANTIC' as const,policyVersion:'test',fallbackReason:'NO_ACCEPTED_JUDGMENT'}})}};
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,env:Env,sent:DistilledQueueMessage[];
const calls={planner:0,writer:0,verifier:0};

/** OpenRouter stand-in: planner, writer and verifier answer their real wire schemas from the request payload alone. */
const reply=(content:unknown)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(content)}}],usage:{prompt_tokens:900,completion_tokens:200,cost:.0011}}),{status:200,headers:{'content-type':'application/json'}});
const fetcher=(async(_url:unknown,init:RequestInit)=>{
 const body=JSON.parse(String(init.body)),prompt=JSON.parse(body.messages.at(-1).content),payload=prompt.input??prompt;
 if(Array.isArray(prompt.candidates)){
  calls.planner++;
  const shortlists=(await store.list<ShortlistRecord>('feed-1','shortlists')).filter(s=>s.window.end===prompt.window.end).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),sl=shortlists[0],plan=fallbackEditorialPlan(sl);
  for(const s of plan.stories){
   const c=sl.candidates.find(c=>c.targetVersionId===s.targetVersionId)!,blocked=c.flags.some(f=>['IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE','TITLE_EXTRACTION_PENDING'].includes(f));
   if(blocked)Object.assign(s,{decision:'DEFER',treatment:'OMIT',deltaType:'UNRESOLVED',mustIncludeFactIds:[],newUnderstandingFactIds:[],rationale:'Identity not established; reassessment pending.'});
   else if(c.correctionObligationIds.length)Object.assign(s,{decision:'SELECT',treatment:'STANDARD',deltaType:'CORRECTION',feedFit:'DIRECT',newUnderstandingFactIds:[],mustIncludeFactIds:c.facts.map(f=>f.id),previousLedgerEntryIds:sl.ledger.filter(e=>e.eventIds.includes(c.stableTargetId)).map(e=>e.id),rationale:'Correct the withdrawn communication with the supported facts.'});
  }
  plan.obligations=sl.obligations.map(o=>{const c=sl.candidates.find(c=>c.correctionObligationIds.includes(o.id));const ready=c&&plan.stories.find(s=>s.targetVersionId===c.targetVersionId)!.decision==='SELECT';return ready?{obligationId:o.id,handling:'ADDRESS' as const,targetVersionId:c!.targetVersionId,reason:'Explicitly correct the withdrawn prose.'}:{obligationId:o.id,handling:'DEFER' as const,targetVersionId:null,reason:'Blocked until identity reassessment completes.'}});
  return reply(compactEditorialInput(sl).encodeKeyed(plan));
 }
 if(prompt.input){
  calls.writer++;
  return reply({language:payload.outputLanguage,stories:payload.stories.map((s:any)=>({storyId:s.storyId,correctionAcknowledgment:s.correctionTask?'An earlier Distilled briefing on this topic was withdrawn.':null,claims:[{text:s.approvedFacts.filter((f:any)=>f.mustInclude).map((f:any)=>f.text).join(' '),supportIds:[...new Set(s.approvedFacts.filter((f:any)=>f.mustInclude).flatMap((f:any)=>f.supportIds))].slice(0,3),communicatedFactIds:s.approvedFacts.filter((f:any)=>f.mustInclude).map((f:any)=>f.factId)}]}))});
 }
 calls.verifier++;
 const claims=payload.stories.flatMap((s:any)=>s.claims);
 return reply({claimEntailment:claims.map((c:any)=>({claimId:c.id,fullyEntailed:true,reason:'Every component is supported.',unsupportedMeaning:[]})),supportedClaimIds:claims.map((c:any)=>c.id),preservedFactIds:payload.stories.flatMap((s:any)=>s.requiredFactIds),novelFactIds:payload.stories.flatMap((s:any)=>s.newUnderstandingFactIds),addressedCorrectionObligationIds:payload.stories.flatMap((s:any)=>(s.correctionObligations??[]).map((o:any)=>o.id)),semanticChecks:payload.stories.flatMap((s:any)=>s.requiredFactIds.map((id:string)=>{const fact=s.facts.find((f:any)=>f.id===id),claim=s.claims.find((c:any)=>c.text.includes(fact.text))??s.claims[0];return {readerNovelty:{status:s.newUnderstandingFactIds.includes(id)?'NEW':'NOT_APPLICABLE',reason:'Compared with the offered same-story reader history.',previousFactTexts:[]},factId:id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,nonRepetitive:true,reason:'Claim prose expresses the complete fact.',readerSpans:[{claimId:claim.id,text:claim.text.includes(fact.text)?fact.text:claim.text}]}}))});
}) as typeof fetch;

beforeEach(async()=>{
 ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed({...feedFixture,briefingFrequency:'HOURLY'});sent=[];
 calls.planner=calls.writer=calls.verifier=0;
 env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',V1_SEMANTIC_POLICY:'DETERMINISTIC',V1_SYNTHESIS_MODEL_ENABLED:'true',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'test-key',PROCESSING_QUEUE:{send:async(body:DistilledQueueMessage)=>{sent.push(body)}}} as unknown as Env;
});
afterEach(async()=>{prepared.value=undefined;await ctx.dispose()});

/** A provisional (semantic DEFER) source is published once, then its edition is withdrawn: an OPEN protected correction. */
async function openCorrection(){
 await acceptEvidence(store,1,TEXT,'publisher-1','2026-10-06T11:30:00Z','en','2026-10-06T11:20:00Z');
 await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),'2026-10-06T11:30:00Z',deferMatchers as any);
 const first=await processV1Briefing({...env,V1_EDITORIAL_MODEL_POLICY:'DETERMINISTIC'} as Env,{type:'v1_briefing',feedId:'feed-1',window:w1},()=>w1.end,undefined,fetcher) as BriefingEditionRecord;
 expect(first.generation.provider).not.toBe('NONE');
 await withdrawV1Edition(ctx.db,first.id,feedFixture.ownerId,'POLICY_REQUIRED','2026-10-06T12:30:00Z');
 return first;
}
const run=(now=NOW2)=>processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window:w2},()=>now,undefined,fetcher);
const request2=async()=>(await store.list<any>('feed-1','briefing_requests')).find(r=>r.window.end===w2.end)!;
const open=async()=>{const resolved=new Set((await store.list<any>('feed-1','correction_resolutions')).map(r=>r.obligationId));return (await store.list<any>('feed-1','correction_obligations')).filter(o=>!resolved.has(o.id))};

describe('blocked protected correction, through processV1Briefing',()=>{
 it('is BLOCKED (not failed), repeats without spending attempts, reassesses a real persisted job, then delivers a verified correction and resolves the obligation',async()=>{
  const first=await openCorrection();
  expect(await open()).toHaveLength(1);const writerBefore=calls.writer,verifierBefore=calls.verifier;
  // 1. Empty selection: the only candidate is the withdrawn Event, provisional and protected, so identity is a hard block.
  expect(await run()).toBeUndefined();
  let request=await request2();
  expect(request).toMatchObject({state:'PENDING',attempts:0,reason:BLOCKED_REASON});expect(request.failure).toBeUndefined();
  expect(request.blocked).toMatchObject({checks:1,reassessment:{prospect:'SCHEDULED'}});expect(request.blocked.targets[0].causes).toEqual(['IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE']);
  expect(request.blocked.obligationIds).toHaveLength(1);
  expect(calls.writer).toBe(writerBefore);expect(calls.verifier).toBe(verifierBefore);
  expect(await store.list('feed-1','editions')).toHaveLength(1);expect(await store.list('feed-1','correction_resolutions')).toHaveLength(0);expect(await open()).toHaveLength(1);
  // 2. Redelivery of the same message never consumes the failure-attempt budget and never repeats paid planning.
  const plannerCalls=calls.planner;
  for(let i=0;i<6;i++)expect(await run(`2026-10-06T13:0${i}:10Z`)).toBeUndefined();
  request=await request2();expect(request).toMatchObject({state:'PENDING',attempts:0,reason:BLOCKED_REASON});expect(request.blocked.checks).toBe(7);
  expect(calls.planner).toBe(plannerCalls);// the unchanged plan is reused: no repeated billed operation
  expect(await readScheduleAudit(ctx.db,'feed-1',new Date('2026-10-06T13:06:00Z'))).toMatchObject({state:'BLOCKED',reason:BLOCKED_REASON,attempts:0,blocked:{reassessment:{prospect:'SCHEDULED'}}});
  expect(await readBlockedWindows(store,'feed-1')).toMatchObject([{state:'BLOCKED',requestId:request.id,obligationIds:request.blocked.obligationIds}]);
  // 3. Dispatch does not resend the blocked window before its recheck time, but does send the reassessment that gates it.
  sent.length=0;await dispatchV1Intelligence(env,new Date('2026-10-06T13:07:00Z'));
  expect(sent.filter(m=>m.type==='v1_briefing'&&m.window.end===w2.end)).toHaveLength(0);
  const rematch=sent.find(m=>m.type==='v1_rematch') as Extract<DistilledQueueMessage,{type:'v1_rematch'}>;expect(rematch).toBeDefined();
  // 4. Reassessment executes against the real persisted intake job and commits supported semantic processing (a stale race first, then success).
  const rematchRequest=(await store.list<RematchRequest>('feed-1','rematch_requests')).find(r=>r.id===rematch.requestId)!;
  expect(await new V1IntakeStore(ctx.db).read('jobs',rematchRequest.jobId)).toBeDefined();
  prepared.value={prepared:{decision:{structuralRelation:'SAME_EVENT',provenance:{scorer:'GPT',policyVersion:'t'}}},matchers:{...deterministicMatchers,event:{match:()=>({structuralRelation:'DEFER',epistemicEffects:[],confidence:0,provenance:{scorer:'SEMANTIC',policyVersion:'t',fallbackReason:'STALE_PREPARED_MEMORY'}})}}};
  await processV1Rematch(env,'feed-1',rematch.requestId,'2026-10-06T13:08:00Z');
  expect((await store.list<RematchAttempt>('feed-1','rematch_attempts')).at(-1)).toMatchObject({state:'DEFERRED',reason:'STALE_PREPARED_MEMORY'});
  expect((await store.list<any>('feed-1','event_semantic_states')).some(s=>!s.provisional)).toBe(false);// stale race committed nothing
  const eventId=(await store.list<any>('feed-1','events'))[0].id;
  // A settled semantic judgment: the same development, now with an established (non-provisional) identity.
  prepared.value={prepared:{decision:{structuralRelation:'SAME_EVENT',provenance:{scorer:'GPT',policyVersion:'t'}}},matchers:{...deterministicMatchers,event:{match:()=>({structuralRelation:'SAME_EVENT',eventId,epistemicEffects:['CORROBORATES'],confidence:.99,provenance:{scorer:'GPT',policyVersion:'settled',judgmentId:'judgment-reassess'}}) as any}}};
  await processV1Rematch(env,'feed-1',rematch.requestId,'2026-10-06T13:20:00Z');
  expect((await store.list<RematchAttempt>('feed-1','rematch_attempts')).at(-1)).toMatchObject({state:'SUCCEEDED'});
  expect(await open()).toHaveLength(1);// reassessment alone never resolves the obligation
  // 5. Reassessment committed a new Event version after w2 closed, so w2 settles visibly as not delivered; the obligation stays OPEN for the next window.
  expect(await run('2026-10-06T13:30:00Z')).toBeUndefined();
  expect(await request2()).toMatchObject({state:'DONE',result:'DEFERRED',reason:CARRIED_FORWARD_REASON,attempts:0});
  expect(await store.list('feed-1','editions')).toHaveLength(1);expect(await open()).toHaveLength(1);
  expect(await readBlockedWindows(store,'feed-1')).toMatchObject([{state:'CARRIED_FORWARD',requestId:request.id}]);
  // 6. The next window sees a reassessed, eligible, supported target; the planner selects corrective treatment; verified publication resolves the obligation.
  const w3={start:'2026-10-06T13:00:00Z',end:'2026-10-06T14:00:00Z',kind:'HOURLY' as const};
  const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window:w3},()=>'2026-10-06T14:00:10Z',undefined,fetcher) as BriefingEditionRecord;
  expect(edition).toBeDefined();expect(edition.id).not.toBe(first.id);expect(edition.generation.provider).not.toBe('NONE');
  expect(calls.writer).toBe(writerBefore+1);expect(calls.verifier).toBe(verifierBefore+1);
  expect(edition.stories[0].claims[0].text).toContain('withdrawn');expect(edition.stories[0].claims[0].text).toContain('Anthropic');
  expect(await store.list('feed-1','correction_resolutions')).toHaveLength(1);expect(await open()).toHaveLength(0);
  expect((await store.list<any>('feed-1','briefing_requests')).find(r=>r.window.end===w3.end)).toMatchObject({state:'DONE',result:'PUBLISHED'});
 },90000);

 it('with reassessment exhausted the condition stays visible, rechecks slowly, and settles as an escalated deferral without ever failing or resolving the obligation',async()=>{
  await openCorrection();
  await run();
  let request=await request2();expect(request.blocked.reassessment.prospect).toBe('SCHEDULED');
  const exhaust=async(at:string)=>{for(const r of await store.list<RematchRequest>('feed-1','rematch_requests')){if(!(await store.list<RematchAttempt>('feed-1','rematch_attempts')).some(a=>a.requestId===r.id&&a.state==='EXHAUSTED'))await feedTransact(store,'feed-1',tx=>tx.write('rematch_attempts',`ex-${r.id}`,{id:`ex-${r.id}`,feedId:'feed-1',requestId:r.id,attempt:3,state:'EXHAUSTED',reason:'SEMANTIC_IDENTITY_UNRESOLVED',createdAt:at}))}};
  await exhaust('2026-10-06T13:10:00Z');
  // The legacy request is exhausted, so one bounded new generation is scheduled once; when that is exhausted too there is no prospect.
  await run('2026-10-06T13:30:00Z');request=await request2();expect(request.blocked.reassessment.prospect).toBe('NEW_REQUEST_SCHEDULED');
  await exhaust('2026-10-06T13:40:00Z');
  const times=['2026-10-06T14:00:00Z','2026-10-06T20:00:00Z','2026-10-07T02:00:00Z','2026-10-07T08:00:00Z'];let before=calls.planner;
  for(const [i,at] of times.entries()){
   await run(at);request=await request2();
   if(i<3){expect(request).toMatchObject({state:'PENDING',attempts:0,reason:BLOCKED_REASON});expect(request.blocked.reassessment.prospect).toBe('NONE');expect(Date.parse(request.nextAttemptAt)-Date.parse(at)).toBeGreaterThanOrEqual(6*3600000)}
  }
  expect(request).toMatchObject({state:'DONE',result:'DEFERRED',reason:ESCALATED_REASON,attempts:0});expect(request.failure).toBeUndefined();expect(request.blocked.escalated).toBe(true);
  expect(calls.planner).toBe(before);// no paid re-planning in any recheck
  expect((await store.list('feed-1','rematch_requests')).length).toBe(2);// bounded: legacy + one protected generation, never more
  expect(await open()).toHaveLength(1);expect(await store.list('feed-1','correction_resolutions')).toHaveLength(0);expect(await store.list('feed-1','editions')).toHaveLength(1);
  expect(await readBlockedWindows(store,'feed-1')).toMatchObject([{state:'ESCALATED',reassessment:{prospect:'NONE'}}]);
 },90000);
});
