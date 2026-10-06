import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence,acceptEvidence} from './test-utils';
import {prepareSemanticMatch} from './semantic-preparation';
import {processEvidenceIntelligence} from './engine';
import type {Env} from '../types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>ctx.dispose());
const job=(n:number)=>JSON.stringify(['REASSESS',`observation-${n}`,'']);
const usage={calls:1,costUsd:.001,reported:true};
type Script={structure:(state:any)=>string;effect?:string;entails?:number};
/** JEV stand-in answering the real wire questions from the payload it receives; records which Event each stage saw. */
function jev(script:Script){
 const seen:{questions:string[];event?:string}[]=[];
 const fetcher:typeof fetch=async(_u,options)=>{
  const req=JSON.parse(String(options?.body)),answers:any={},keys=Object.keys(req.questions);seen.push({questions:keys,event:req.state.event?.id});
  for(const [key,q] of Object.entries(req.questions) as [string,any][]){
   if(q.type==='choice'){const chosen=key==='structure'?script.structure(req.state):script.effect??'CORROBORATES';answers[key]={type:'choice',choice:chosen,confidence:.99,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===chosen?1:0]))}}
   else if(q.type==='noul')answers[key]={type:'noul',noul:script.entails??1};
   else answers[key]={type:'score',score:0,confidence:1,probabilities:Object.fromEntries(q.criteria.map((_:any,i:number)=>[String(i),i===0?1:0]))};
  }
  return new Response(JSON.stringify({answers,usage:{input_tokens:20,output_tokens:10,cost:.001}}));
 };
 return {fetcher,seen};
}
const strongThatMustNotRun=()=>{let calls=0;return {calls:()=>calls,model:'fake',usage:()=>usage,complete:async()=>{calls++;throw Error('strong model must not be called')}}};
const pick=(needle:string)=>(state:any)=>{const i=state.events.findIndex((e:any)=>e.state.toLowerCase().includes(needle));return i<0?'NEW':`EVENT_${i}`};
async function twoEvents(){
 await seedIntelligence(store,1,'Lebanon Parliament approved banking reform legislation.');
 await seedIntelligence(store,2,'Ukraine opened a new grain corridor through the Black Sea.','publisher-2');
}
const incoming=(n:number,body:string,publisher='publisher-3')=>acceptEvidence(store,n,body,publisher);
it('same Event from another publisher: effect and entailment are judged against the CHOSEN Event, and the cheap tier is enough',async()=>{
 await twoEvents();
 const {fetcher,seen}=jev({structure:pick('grain'),entails:1});const strong=strongThatMustNotRun();
 await incoming(3,'Ukraine opened a new grain corridor through the Black Sea.');
 const prepared=await prepareSemanticMatch(store,{OPENROUTER_API_KEY:'test'} as Env,job(3),testPolicy.now(),{strong,fetcher});
 expect(prepared?.prepared.decision.structuralRelation).toBe('SAME_EVENT');expect(prepared?.prepared.decision.epistemicEffects).toEqual(['CORROBORATES']);expect(strong.calls()).toBe(0);
 expect(seen.map(s=>s.questions)).toEqual([['structure'],['effect','forward','reverse','novelty']]);
 expect(seen[1].event).toBe(prepared!.prepared.decision.eventId);
},60000);
it('same Event with a changed certainty keeps structural identity AND the epistemic effect, and is escalated as high consequence',async()=>{
 await twoEvents();
 const {fetcher}=jev({structure:pick('lebanon'),effect:'CHANGES_CERTAINTY',entails:.2});
 let escalated:string[]=[];const strong={model:'fake',usage:()=>usage,complete:async(_f:string,_p:string,state:any)=>{escalated=state.reasons;return {value:{groups:[{claimMentionIds:state.claimMentions.map((m:any)=>m.id),structuralRelation:'SAME_EVENT',eventId:state.prior.eventId,storylineId:null,epistemicEffects:['CHANGES_CERTAINTY'],entities:[],slots:[]}],backgroundMentionIds:[],confidence:.9},usage}}};
 await incoming(3,'Lebanon Parliament has now passed the banking reform law after Tuesday debate.');
 const prepared=await prepareSemanticMatch(store,{OPENROUTER_API_KEY:'test'} as Env,job(3),testPolicy.now(),{strong,fetcher});
 expect(escalated).toContain('HIGH_CONSEQUENCE');expect(prepared?.prepared.decision.structuralRelation).toBe('SAME_EVENT');expect(prepared?.prepared.decision.epistemicEffects).toContain('CHANGES_CERTAINTY');
},60000);
it('a new development in an existing Storyline is a NEW Event continuing that Storyline, not a collapse into the old Event',async()=>{
 await twoEvents();
 const {fetcher}=jev({structure:state=>`STORY_${state.storylines.findIndex((s:any)=>s.state.toLowerCase().includes('lebanon'))}`});
 const strong={model:'fake',usage:()=>usage,complete:async(_f:string,_p:string,state:any)=>({value:{groups:[{claimMentionIds:state.claimMentions.map((m:any)=>m.id),structuralRelation:'NEW_EVENT_EXISTING_STORYLINE',eventId:null,storylineId:state.prior.storylineId,epistemicEffects:['CHANGES_STATE'],entities:[],slots:[]}],backgroundMentionIds:[],confidence:.9},usage})};
 await incoming(3,'Lebanon central bank issued new depositor withdrawal rules.');
 const eventsBefore=(await store.list('feed-1','events')).length,storylinesBefore=(await store.list('feed-1','storylines')).length;
 const prepared=await prepareSemanticMatch(store,{OPENROUTER_API_KEY:'test'} as Env,job(3),testPolicy.now(),{strong,fetcher});
 expect(prepared?.prepared.decision.structuralRelation).toBe('NEW_EVENT_EXISTING_STORYLINE');expect(prepared?.prepared.decision.eventId).toBeUndefined();
 expect(eventsBefore).toBeGreaterThanOrEqual(2);expect(storylinesBefore).toBeGreaterThanOrEqual(2);
},60000);
it('uncertain relation with no strong model defers conservatively, completes the job and schedules a non-blocking rematch',async()=>{
 await twoEvents();
 const {fetcher}=jev({structure:()=>'DEFER'});
 await incoming(3,'Officials said the matter remains under review.');
 const prepared=await prepareSemanticMatch(store,{OPENROUTER_API_KEY:'test'} as Env,job(3),testPolicy.now(),{fetcher,strong:undefined});
 expect(prepared?.prepared.decision.structuralRelation).toBe('DEFER');
 const receipt=await processEvidenceIntelligence(store,job(3),testPolicy.now(),prepared?.matchers);
 expect(receipt.semanticDeferred).toBe(true);expect(await store.list('feed-1','rematch_requests')).toHaveLength(1);
},60000);
it('a prepared same-Event corroboration is consumed into the existing Event with no new Event or Storyline',async()=>{
 await twoEvents();const {fetcher}=jev({structure:pick('grain'),entails:1});
 await incoming(3,'Ukraine opened a new grain corridor through the Black Sea.');
 const before={events:(await store.list('feed-1','events')).length,storylines:(await store.list('feed-1','storylines')).length};
 const prepared=await prepareSemanticMatch(store,{OPENROUTER_API_KEY:'test'} as Env,job(3),testPolicy.now(),{strong:strongThatMustNotRun(),fetcher});
 await processEvidenceIntelligence(store,job(3),testPolicy.now(),prepared?.matchers);
 expect({events:(await store.list('feed-1','events')).length,storylines:(await store.list('feed-1','storylines')).length}).toEqual(before);
},60000);
it('choosing a non-first candidate Event no longer forces strong escalation and judges effects against that Event',async()=>{
 await twoEvents();let second:string|undefined;
 const {fetcher,seen}=jev({structure:state=>{second=state.events[1].id;return 'EVENT_1'},entails:1});const strong=strongThatMustNotRun();
 await incoming(3,'Parliament in Lebanon and grain shipments from Ukraine were both discussed.');
 const prepared=await prepareSemanticMatch(store,{OPENROUTER_API_KEY:'test'} as Env,job(3),testPolicy.now(),{strong,fetcher});
 expect(prepared?.prepared.decision.eventId).toBe(second);expect(seen[1].event).toBe(second);expect(strong.calls()).toBe(0);
},60000);
it('arrival order: an Event committed after preparation makes the prepared NEW judgment stale (defer + rematch), never a duplicate Event/Storyline',async()=>{
 await incoming(2,'Ukraine opened a new grain corridor through the Black Sea.','publisher-2');
 const strong={model:'fake',usage:()=>usage,complete:async(_f:string,_p:string,state:any)=>({value:{groups:[{claimMentionIds:state.claimMentions.map((m:any)=>m.id),structuralRelation:'NEW_STORYLINE',eventId:null,storylineId:null,epistemicEffects:['CHANGES_STATE'],entities:[],slots:[]}],backgroundMentionIds:[],confidence:.9},usage})};
 // B is prepared against an empty memory, then A (same development) commits first.
 const prepared=await prepareSemanticMatch(store,{OPENROUTER_API_KEY:'test'} as Env,job(2),testPolicy.now(),{strong});
 expect(prepared?.prepared.decision.structuralRelation).toBe('NEW_STORYLINE');
 await seedIntelligence(store,1,'Ukraine opened a new grain corridor through the Black Sea.','publisher-1');
 const receipt=await processEvidenceIntelligence(store,job(2),testPolicy.now(),prepared?.matchers);
 expect(receipt.semanticDeferred).toBe(true);expect(await store.list('feed-1','rematch_requests')).toHaveLength(1);
 expect((await store.list('feed-1','storylines')).length).toBe(1);
},60000);
