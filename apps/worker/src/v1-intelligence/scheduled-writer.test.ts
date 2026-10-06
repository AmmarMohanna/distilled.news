import {afterEach,beforeEach,expect,it} from 'vitest';
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
beforeEach(async()=>{
 ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed({...feedFixture,briefingFrequency:'HOURLY'});sent=[];
 env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',V1_SEMANTIC_POLICY:'DETERMINISTIC',V1_SYNTHESIS_MODEL_ENABLED:'true',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'test-key',PROCESSING_QUEUE:{send:async(body:DistilledQueueMessage)=>{sent.push(body)}}} as unknown as Env;
});
afterEach(async()=>ctx.dispose());
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
  return reply({supportedClaimIds:claims.map((c:any)=>c.id),preservedFactIds:payload.stories.flatMap((s:any)=>s.requiredFactIds),novelFactIds:payload.stories.flatMap((s:any)=>s.newUnderstandingFactIds),addressedCorrectionObligationIds:[],semanticChecks:payload.stories.flatMap((s:any)=>s.requiredFactIds.map((id:string)=>{const fact=s.facts.find((f:any)=>f.id===id),claim=s.claims.find((c:any)=>c.text.includes(fact.text))??s.claims[0];return {factId:id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Claim prose expresses the complete fact.',readerSpans:[{claimId:claim.id,text:claim.text.includes(fact.text)?fact.text:claim.text}]}}))});
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
 expect(edition).toBeUndefined();expect(calls).toEqual({writer:0,verifier:0});expect(await store.list('feed-1','editions')).toHaveLength(0);
},30000);
