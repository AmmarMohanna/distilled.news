import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import * as shortlistProjection from './shortlist-v2';
import {prepareSemanticShortlist} from './shortlist';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {dispatchV1Intelligence,processV1Briefing} from './runtime';
import {equivalentFact} from './editorial';
import type {BriefingEditionRecord} from './publication';
import type {Env,DistilledQueueMessage} from '../types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,env:Env,sent:DistilledQueueMessage[];
const now=new Date('2026-10-06T12:00:05Z');
beforeEach(async(context)=>{
 ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed({...feedFixture,briefingFrequency:'HOURLY',...(context.task.name.includes('preparation')?{briefingSchedule:{durationMinutes:30 as const,timezone:'Asia/Beirut'}}:{}),...(context.task.name.includes('incomplete first')?{briefingSchedule:{durationMinutes:30 as const,timezone:'Asia/Beirut'},createdAt:'2026-10-06T11:35:00Z'}:{})});sent=[];
 env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',V1_SEMANTIC_POLICY:'DETERMINISTIC',V1_EDITORIAL_MODEL_POLICY:'DETERMINISTIC',V1_SYNTHESIS_MODEL_ENABLED:'true',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'test-key',PROCESSING_QUEUE:{send:async(body:DistilledQueueMessage)=>{sent.push(body)}}} as unknown as Env;
});
afterEach(async()=>ctx.dispose());
it('does not create an incomplete first window and dispatches oldest pending window alone',async()=>{
 await dispatchV1Intelligence(env,now);
 expect(await store.list('feed-1','briefing_requests')).toHaveLength(0);
 expect(sent).toHaveLength(0);
 await dispatchV1Intelligence(env,new Date('2026-10-06T12:30:05Z'));
 expect((await store.list<any>('feed-1','briefing_requests')).map(r=>r.window.start)).toEqual(['2026-10-06T12:00:00.000Z']);
 sent.length=0;
 await store.db.prepare("DELETE FROM v1_queue_dispatches").run();
 await dispatchV1Intelligence(env,new Date('2026-10-06T13:00:05Z'));
 expect(sent.filter(m=>m.type==='v1_briefing').map((m:any)=>m.window.end)).toEqual(['2026-10-06T12:30:00.000Z']);
},30000);
it('an empty V2 reporting window completes quietly without paying an editorial model',async()=>{
 env.V1_PUBLICATION_VALIDATION_CONTRACT='EVIDENCE_GROUNDED_V2';
 const {fetcher,calls}=providerDouble();await scheduled(fetcher);
 expect(calls).toEqual({writer:0,verifier:0});
 expect((await store.list<any>('feed-1','briefing_requests'))[0]).toMatchObject({state:'DONE',result:'QUIET'});
 expect(await store.list('feed-1','semantic_intents')).toHaveLength(0);
},30000);
it('a newer queue delivery cannot overtake an older runnable window',async()=>{
 env.V1_PUBLICATION_VALIDATION_CONTRACT='EVIDENCE_GROUNDED_V2';
 await dispatchV1Intelligence(env,now);
 const {fetcher,calls}=providerDouble();
 await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window:{start:'2026-10-06T12:00:00.000Z',end:'2026-10-06T13:00:00.000Z',kind:'HOURLY'}},()=> '2026-10-06T13:00:05Z',undefined,fetcher);
 const requests=await store.list<any>('feed-1','briefing_requests');
 expect(requests).toHaveLength(2);expect(requests.every(r=>r.state==='PENDING')).toBe(true);
 expect(calls).toEqual({writer:0,verifier:0});
},30000);
it('preparation costs no model call and final arrivals change the prepared shortlist',async()=>{
 env.V1_PUBLICATION_VALIDATION_CONTRACT='EVIDENCE_GROUNDED_V2';env.V1_EDITORIAL_RANKING_POLICY='SEMANTIC';
 await seedIntelligence(store,1,'Lebanon Parliament approved banking reform legislation.','publisher-1','2026-10-06T11:40:00Z','en','2026-10-06T11:35:00Z');
 await dispatchV1Intelligence(env,new Date('2026-10-06T11:55:00Z'));
 const before=(await store.list<any>('feed-1','shortlists')).find(s=>s.window.end==='2026-10-06T12:00:00.000Z');
 expect(before?.candidates).toHaveLength(1);
 expect(await store.list('feed-1','semantic_intents')).toHaveLength(0);
 expect(await store.list('feed-1','semantic_resource_waits')).toHaveLength(0);
 expect(await store.list('feed-1','editorial_deferred_work')).toHaveLength(0);
 await seedIntelligence(store,2,'Ukraine opened a new grain corridor on Monday.','publisher-2','2026-10-06T11:59:00Z','en','2026-10-06T11:58:00Z');
 env.V1_EDITORIAL_RANKING_POLICY='DETERMINISTIC';
 const final=await prepareSemanticShortlist(store,'feed-1',before.window,now.toISOString(),undefined,env);
 expect(final.id).not.toBe(before.id);expect(final.candidates).toHaveLength(2);
 expect(await store.list('feed-1','editions')).toHaveLength(0);
},30000);
it('does not mark a stale empty shortlist quiet after an in-window article commits',async()=>{
 env.V1_PUBLICATION_VALIDATION_CONTRACT='EVIDENCE_GROUNDED_V2';
 const original=shortlistProjection.prepareV2Shortlist;
 const spy=vi.spyOn(shortlistProjection,'prepareV2Shortlist').mockImplementationOnce(async(...args)=>{
  const empty=await original(...args);
  await seedIntelligence(store,1,'Lebanon Parliament approved banking reform legislation.','publisher-1','2026-10-06T11:59:00Z','en','2026-10-06T11:58:00Z');
  return empty;
 });
 try{const {fetcher,calls}=providerDouble();await scheduled(fetcher);expect(calls).toEqual({writer:0,verifier:0});}
 finally{spy.mockRestore();}
 expect((await store.list<any>('feed-1','briefing_requests'))[0].state).toBe('PENDING');
},30000);
/** A protocol-faithful OpenRouter stand-in: it answers the real writer/verifier wire schemas from the request payload alone. */
function providerDouble(mode:'OK'|'DOWN'='OK'){
 const calls={writer:0,verifier:0};
 const reply=(content:unknown)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(content)}}],usage:{prompt_tokens:900,completion_tokens:200,cost:.0011}}),{status:200,headers:{'content-type':'application/json'}});
 const fetcher=(async(_url:unknown,init:RequestInit)=>{
  if(mode==='DOWN')return new Response('upstream error',{status:503});
  const body=JSON.parse(String(init.body)),prompt=JSON.parse(body.messages.at(-1).content),payload=prompt.input??prompt;
  if(prompt.input){
   calls.writer++;
   return reply({language:payload.outputLanguage,stories:payload.stories.map((s:any)=>({storyId:s.storyId,claims:[{text:s.approvedFacts.filter((f:any)=>f.mustInclude).map((f:any)=>f.text).join(' '),supportIds:[...new Set(s.approvedFacts.filter((f:any)=>f.mustInclude).flatMap((f:any)=>f.supportIds))].slice(0,3),communicatedFactIds:s.approvedFacts.filter((f:any)=>f.mustInclude).map((f:any)=>f.factId)}]}))});
  }
  calls.verifier++;
  const claims=payload.stories.flatMap((s:any)=>s.claims);
  return reply({claimEntailment:claims.map((c:any)=>({claimId:c.id,fullyEntailed:true,reason:'Every component is supported.',unsupportedMeaning:[]})),supportedClaimIds:claims.map((c:any)=>c.id),preservedFactIds:payload.stories.flatMap((s:any)=>s.requiredFactIds),novelFactIds:payload.stories.flatMap((s:any)=>s.newUnderstandingFactIds),addressedCorrectionObligationIds:[],semanticChecks:payload.stories.flatMap((s:any)=>s.requiredFactIds.map((id:string)=>{const fact=s.facts.find((f:any)=>f.id===id),claim=s.claims.find((c:any)=>c.text.includes(fact.text))??s.claims[0];return {readerNovelty:{status:s.newUnderstandingFactIds.includes(id)?'NEW':'NOT_APPLICABLE',reason:'Compared with the offered same-story reader history.',previousFactTexts:[]},factId:id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Claim prose expresses the complete fact.',readerSpans:[{claimId:claim.id,text:claim.text.includes(fact.text)?fact.text:claim.text}]}}))});
 }) as typeof fetch;
 return {fetcher,calls};
}
async function scheduled(fetcher:typeof fetch){
 expect(await dispatchV1Intelligence(env,now)).toBe(1);
 const message=sent.at(-1)!;if(message.type!=='v1_briefing')throw Error('wrong queue type');
 return {message,edition:await processV1Briefing(env,message,()=>now.toISOString(),undefined,fetcher) as BriefingEditionRecord|undefined};
}
const accepted='2026-10-06T11:30:00Z',published='2026-10-06T11:20:00Z';
async function seedWindow(){
 await seedIntelligence(store,1,'US government ads could have violated federal law.','publisher-1',accepted,'en',published);
 await seedIntelligence(store,2,'US government advertisements may have violated federal law.','publisher-2',accepted,'en',published);
}
it('a scheduled window is written by the model path from approved facts: one proposition, both citations, two calls, idempotent replay',async()=>{
 await seedWindow();const {fetcher,calls}=providerDouble();
 const {message,edition}=await scheduled(fetcher);
 expect(edition).toBeDefined();expect(edition!.generation.provider).not.toBe('NONE');expect(edition!.generation.usageConfirmed).toBe(true);
 expect(calls).toEqual({writer:1,verifier:1});
 const verification=await store.read<any>('feed-1','verification_results',edition!.selectionId);expect(verification.semanticChecks.every((c:any)=>c.readerNovelty?.status==='NEW'&&c.readerNovelty.reason.length>0&&c.readerNovelty.previousFactTexts.length===0)).toBe(true);
 const claims=edition!.stories.flatMap(s=>s.claims);
 for(const [i,a] of claims.entries())for(const b of claims.slice(i+1))expect(equivalentFact(a.text,b.text)).toBe(false);
 expect(new Set(claims.flatMap(c=>c.support.map(s=>s.evidenceRevisionId))).size).toBe(2);
 const again=await processV1Briefing(env,message,()=>now.toISOString(),undefined,fetcher) as BriefingEditionRecord;
 expect(again.id).toBe(edition!.id);expect(calls).toEqual({writer:1,verifier:1});
 expect(await store.list('feed-1','editions')).toHaveLength(1);
},60000);
it('a provider outage falls back to the deterministic approved-fact draft without a second paid call',async()=>{
 await seedWindow();const {fetcher}=providerDouble('DOWN');
 const {edition}=await scheduled(fetcher);
 expect(edition).toBeDefined();expect(edition!.generation.provider).toBe('NONE');
 const claims=edition!.stories.flatMap(s=>s.claims);expect(claims).toHaveLength(1);expect(claims[0].support).toHaveLength(2);
},60000);
it('a quiet window makes no writer call and publishes nothing',async()=>{
 const {fetcher,calls}=providerDouble();
 const {edition}=await scheduled(fetcher);
 expect(edition).toBeUndefined();expect(calls).toEqual({writer:0,verifier:0});expect(await store.list('feed-1','editions')).toHaveLength(0);expect((await store.list<any>('feed-1','briefing_requests'))[0]).toMatchObject({state:'DONE',result:'QUIET',reason:'NO_SELECTED_DEVELOPMENTS'});expect(await store.list('feed-1','schedule_observations')).toHaveLength(1);
},30000);
