import {beforeEach,afterEach,it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {prepareSemanticShortlist} from './shortlist';
import {prepareEditorialPlan,fallbackEditorialPlan} from './editorial-plan';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {processV1Briefing} from './runtime';
import type {Env} from '../types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store);await seedIntelligence(store,2,'An earthquake destroyed homes in Beirut.','publisher-b','2026-10-03T12:30:00Z')});
afterEach(async()=>ctx.dispose());
it('one durable comparative call controls selection/order/treatment and replays without provider use',async()=>{
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),body=fallbackEditorialPlan(shortlist);
 const earthquake=shortlist.candidates.find(c=>c.facts.some(f=>f.text.includes('earthquake')))!;
 body.stories=body.stories.map(s=>s.targetVersionId===earthquake.targetVersionId?{...s,order:0,treatment:'DETAILED'}:{...s,decision:'SUPPRESS',order:1,treatment:'OMIT',mustIncludeFactIds:[],newUnderstandingFactIds:[],rationale:'Comparative feed/window judgment.'});
 let calls=0;const usage={calls:1,costUsd:.001,reported:true},strong={model:'fake-editor',usage:()=>usage,complete:async()=>{calls++;expect(await store.list('feed-1','semantic_intents')).toHaveLength(1);return {value:body,usage}}};
 const plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong);expect(plan.route).toBe('GPT');expect(await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong)).toEqual(plan);expect(calls).toBe(1);
 const selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan);expect(selection.selectedCandidateIds).toHaveLength(1);
 const candidate=await store.read<any>('feed-1','candidates',selection.selectedCandidateIds[0]);expect(candidate.targetVersionId).toBe(earthquake.targetVersionId);expect(selection.editorialByCandidate![candidate.id].treatment).toBe('DETAILED');expect(selection.editorialPlanId).toBeDefined();
},25000);
it('publication during the editor call prevents stale reader-state plan consumption',async()=>{
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),usage={calls:1,costUsd:.001,reported:true};
 const strong={model:'fake-editor',usage:()=>usage,complete:async()=>{
  await processV1Briefing({DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1'} as Env,{type:'v1_briefing',feedId:'feed-1',window:{start:'2026-10-03T11:00:00Z',end:'2026-10-03T12:15:00Z',kind:'HOURLY'}},()=>window.end);
  return {value:fallbackEditorialPlan(shortlist),usage};
 }};
 await expect(prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong)).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});expect(await store.list('feed-1','editorial_plans')).toHaveLength(0);
},25000);
