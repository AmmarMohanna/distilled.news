import {beforeEach,afterEach,it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {prepareSemanticShortlist} from './shortlist';
import {prepareEditorialPlan} from './editorial-plan';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection,extractiveDraft,approvedSupportSpans,type BriefingModelPort,type SynthesisInput} from './publication';
const A='Officials said Lebanon banking reform will start after 2026-10-06.';
const B='Lebanon banking reform may affect 100 depositors.';
const C='Lebanon banking reform also creates 900 new offices.';
const body=[A,B,C].join(' '),window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store,1,body);});
afterEach(async()=>ctx.dispose());
async function selection(){
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end);
 for(const s of plan.stories){const facts=shortlist.candidates.find(c=>c.targetVersionId===s.targetVersionId)!.facts;const allowed=new Set(facts.filter(f=>f.text===A||f.text===B).map(f=>f.id));
  for(const key of ['mustIncludeFactIds','newUnderstandingFactIds','contextFactIds','attributionFactIds','certaintyFactIds','disagreementFactIds','openQuestionFactIds'] as const)s[key]=s[key].filter(id=>allowed.has(id));
 }
 plan.id+=':approved-ab';
 await feedTransact(store,'feed-1',tx=>tx.write('editorial_plans',plan.id,plan));
 return scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan);
}
it('renders only approved A/B with exact spans, required coverage and idempotent immutable publication',async()=>{
 const selected=await selection(),edition=await publishSelection(store,'feed-1',selected.id,{now:()=>window.end});
 expect(edition.stories.flatMap(s=>s.claims).map(c=>c.text).join(' ')).toBe(A+' '+B);
 for(const c of edition.stories.flatMap(s=>s.claims)){expect(c.support[0].quote).toBe(c.text);expect((await store.revision('feed-1',c.support[0].evidenceRevisionId))!.body).toContain(c.support[0].quote);}
 expect(await publishSelection(store,'feed-1',selected.id,{now:()=>window.end})).toEqual(edition);
 expect(await store.list('feed-1','editions')).toHaveLength(1);
},25000);
it.each(['whole source','unapproved fact','missing required','attribution','certainty','temporal'])('rejects %s and fences writer access to unapproved C',async mode=>{
 const selected=await selection(),usage={tokensIn:100,tokensOut:40,cost:.001,confirmed:true};
 const model:BriefingModelPort={model:'controlled',provider:'TEST',maxCallCostUsd:.01,synthesize:async input=>{
  expect(JSON.stringify(input)).not.toContain(C);expect(input.stories[0]).not.toHaveProperty('eventVersions');
  const s=input.stories[0],id=s.evidence[0].id;
  const texts=mode==='whole source'?[body]:mode==='unapproved fact'?[A,B,C]:mode==='missing required'?[A]:mode==='attribution'?[A.replace('Officials said ',''),B]:mode==='certainty'?[A,B.replace('may affect','affects')]:[A.replace('will start after','started before'),B];
  return {draft:{language:'en',stories:[{candidateId:s.candidate.id,claims:texts.map((text,i)=>({text,support:[{evidenceRevisionId:id,quote:mode==='whole source'?body:i===2?C:i===0?A:B}]}))}]},usage};
 },verify:async claims=>({supportedClaimIds:claims.filter(c=>[A,B].includes(c.text)).map(c=>c.id),preservedFactIds:[],novelFactIds:claims.flatMap(c=>(c.newUnderstandingFacts??[]).map(f=>f.id)),usage})};
 await expect(publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(await store.list('feed-1','editions')).toHaveLength(0);
},25000);
it('keeps unsafe rebuttal and nonliteral approved facts closed',()=>{
 const input={feed:{outputLanguage:'en'},editorialPlan:{id:'p'},stories:[{candidate:{id:'c'},plan:{facts:[{id:'a',text:A,evidenceRevisionIds:['r']}],mustIncludeFactIds:['a'],newUnderstandingFactIds:['a'],contextFactIds:[],attributionFactIds:[],certaintyFactIds:[],disagreementFactIds:[],openQuestionFactIds:[]},evidence:[{id:'r',language:'en',body:A+' Verdict: false.'}]}]} as unknown as SynthesisInput;
 expect(()=>extractiveDraft(input)).toThrowError(expect.objectContaining({reason:'EXTRACTIVE_CAPACITY_UNSUPPORTED'}));
 input.stories[0].evidence[0].body='A paraphrased source with no exact approved span.';
 expect(()=>extractiveDraft(input)).toThrowError(expect.objectContaining({reason:'EXTRACTIVE_CAPACITY_UNSUPPORTED'}));
});
it('joins adjacent approved date fragments without including an unapproved tail',()=>{
 const story={plan:{facts:[{id:'a',text:'The spacecraft will dock on Oct.',evidenceRevisionIds:['r']},{id:'b',text:'2.',evidenceRevisionIds:['r']}],mustIncludeFactIds:['a','b'],newUnderstandingFactIds:['a','b'],contextFactIds:[],attributionFactIds:[],certaintyFactIds:[],disagreementFactIds:[],openQuestionFactIds:[]},evidence:[{id:'r',body:'The spacecraft will dock on Oct. 2. Unapproved extra information.'}]} as unknown as SynthesisInput['stories'][number];
 expect(approvedSupportSpans(story)).toEqual([{evidenceRevisionId:'r',quote:'The spacecraft will dock on Oct. 2.'}]);
 story.plan!.mustIncludeFactIds=['a'];story.plan!.newUnderstandingFactIds=['a'];
 expect(()=>approvedSupportSpans(story)).toThrowError(expect.objectContaining({reason:'EXTRACTIVE_CAPACITY_UNSUPPORTED'}));
});
it('uses a safe deterministic draft after model failure, retains unknown-call reservation and never repeats the call',async()=>{
 const selected=await selection();let calls=0;
 const model:BriefingModelPort={model:'unavailable',provider:'TEST',maxCallCostUsd:.01,synthesize:async()=>{calls++;throw Error('response unavailable');}};
 await ctx.db.exec("CREATE TRIGGER fail_approved_publication BEFORE INSERT ON v1_feed_documents WHEN NEW.kind='editions' BEGIN SELECT RAISE(ABORT,'simulated persistence outage'); END;");
 await expect(publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model})).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 await ctx.db.exec('DROP TRIGGER fail_approved_publication;');
 const edition=await publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model});
 expect(edition.generation.provider).toBe('NONE');expect(edition.generation.usageConfirmed).toBe(false);expect(edition.generation.cost).toBe(.01);
 expect(await publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model})).toEqual(edition);expect(calls).toBe(1);
 expect((await store.list<any>('feed-1','model_executions'))[0]).toMatchObject({status:'OUTCOME_UNKNOWN',reservationRetained:true});
},25000);
