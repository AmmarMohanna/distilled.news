import {compactEditorialInput} from './editorial-transport';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
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
 let calls=0;const usage={calls:1,costUsd:.001,reported:true},strong={model:'fake-editor',usage:()=>usage,complete:async()=>{calls++;expect(await store.list('feed-1','semantic_intents')).toHaveLength(1);return {value:compactEditorialInput(shortlist).encode(body),usage}}};
 const plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong);expect(plan.route).toBe('GPT');expect(await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong)).toEqual(plan);expect(calls).toBe(1);
 const selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan);expect(selection.selectedCandidateIds).toHaveLength(1);
 const candidate=await store.read<any>('feed-1','candidates',selection.selectedCandidateIds[0]);expect(candidate.targetVersionId).toBe(earthquake.targetVersionId);expect(selection.editorialByCandidate![candidate.id].treatment).toBe('DETAILED');expect(selection.editorialPlanId).toBeDefined();
},25000);
it.each(['KNOWN_STRUCTURAL_FAILURE','UNKNOWN_OUTCOME','FOREIGN_FACT','INFEASIBLE_PLAN'])('retained %s never reissues the billed call and survives restart',async mode=>{
 await seedIntelligence(store,3,'A company launched a new product. The product costs $99.','publisher-c','2026-10-03T12:40:00Z');
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),body=fallbackEditorialPlan(shortlist),target=shortlist.candidates.find(c=>c.facts.length>=2)!;
 for(const s of body.stories)Object.assign(s,s.targetVersionId===target.targetVersionId?{newUnderstandingFactIds:target.facts.map(f=>f.id),mustIncludeFactIds:[target.facts[0].id]}:{decision:'DEFER',treatment:'OMIT'});
 if(mode==='FOREIGN_FACT')body.stories.find(s=>s.targetVersionId===target.targetVersionId)!.newUnderstandingFactIds.push(shortlist.candidates.find(c=>c.targetVersionId!==target.targetVersionId)!.facts[0].id);
 if(mode==='INFEASIBLE_PLAN')target.communicationCost={inputUnits:DEFAULT_BRIEFING_BUDGET.maxInputTokens,evidenceCount:1,briefWords:40,standardWords:100,detailedWords:180};
 let calls=0;const usage=mode==='UNKNOWN_OUTCOME'?{calls:1,costUsd:.02,reported:false}:{calls:1,costUsd:.001,reported:true},strong={model:'retained-editor',usage:()=>usage,complete:async()=>{calls++;throw Error(mode==='UNKNOWN_OUTCOME'?'SEMANTIC_OUTCOME_UNKNOWN':'SEMANTIC_EDITORIAL_VALIDATION_FAILED')}};
 const initial=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong);
 // Seed the retained pre-deployment proposal alongside the genuinely deferred
 // operation. No immutability trigger is disabled and no result is overwritten.
 const saved=await store.read<any>('feed-1','semantic_results',initial.operationId!),old=structuredClone(saved),prior=structuredClone(initial);
 const raw={id:JSON.stringify([initial.id,'INITIAL']),feedId:shortlist.feedId,shortlistId:shortlist.id,model:strong.model,rawProposal:compactEditorialInput(shortlist).encode(body),rejection:'SCOPE_DENIED',usage};
 await feedTransact(store,'feed-1',tx=>tx.write('editorial_proposals',raw.id,raw));
 if(mode==='KNOWN_STRUCTURAL_FAILURE'){
  await ctx.db.exec(`CREATE TRIGGER fail_recovered_plan BEFORE INSERT ON v1_feed_documents WHEN NEW.kind='editorial_plans' AND NEW.id!='${initial.id}' BEGIN SELECT RAISE(ABORT,'simulated restart'); END;`);
  await expect(prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong)).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
  await ctx.db.exec('DROP TRIGGER fail_recovered_plan;');
 }
 const plan=await prepareEditorialPlan(new V1FeedStore(ctx.db),shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong);
 if(mode==='KNOWN_STRUCTURAL_FAILURE'){
  expect(plan.route).toBe('GPT');expect(plan.recoveredFromPlanId).toBe(initial.id);expect(plan.id).not.toBe(initial.id);expect(plan.operationId).toBe(saved.id);
  expect(plan.stories.find(s=>s.decision==='SELECT')!.mustIncludeFactIds).toEqual(target.facts.map(f=>f.id));
  const recovery=(await store.list<any>('feed-1','editorial_proposals')).find(p=>p.attempt==='RETAINED_NORMALIZATION');expect(recovery.usage).toEqual({calls:0,costUsd:0,reported:true});
 }else{expect(plan.route).toBe('DETERMINISTIC_FALLBACK');if(mode==='UNKNOWN_OUTCOME')expect(plan).toEqual(prior);expect((await store.list<any>('feed-1','editorial_proposals')).some(p=>p.attempt==='RETAINED_NORMALIZATION')).toBe(false)}
 expect(await prepareEditorialPlan(new V1FeedStore(ctx.db),shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong)).toEqual(plan);expect(calls).toBe(1);
 expect(await store.read('feed-1','semantic_results',saved.id)).toEqual(JSON.parse(JSON.stringify(old)));
 expect(await store.read('feed-1','editorial_plans',initial.id)).toEqual(JSON.parse(JSON.stringify(prior)));
 expect(await store.read('feed-1','editorial_proposals',raw.id)).toEqual(raw);
},25000);
it('promotes both editor-declared new facts and retains the raw response across restart',async()=>{
 await seedIntelligence(store,3,'A company launched a new product. The product costs $99.','publisher-c','2026-10-03T12:40:00Z');
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),body=fallbackEditorialPlan(shortlist);
 const target=shortlist.candidates.find(c=>c.facts.length>=2)!;expect(target).toBeDefined();
 for(const s of body.stories)Object.assign(s,s.targetVersionId===target.targetVersionId?{newUnderstandingFactIds:target.facts.map(f=>f.id),mustIncludeFactIds:[target.facts[0].id]}:{decision:'DEFER',treatment:'OMIT'});
 const raw=compactEditorialInput(shortlist).encode(body),original=structuredClone(raw);let calls=0;const usage={calls:1,costUsd:.001,reported:true},strong={model:'contract-editor',usage:()=>usage,complete:async()=>{calls++;return {value:raw,usage}}};
 const plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong);
 expect(plan.route).toBe('GPT');expect(plan.normalization?.added).toEqual([{targetVersionId:target.targetVersionId,factIds:target.facts.slice(1).map(f=>f.id)}]);
 expect(plan.stories.find(s=>s.decision==='SELECT')!.mustIncludeFactIds).toEqual(target.facts.map(f=>f.id));expect(raw).toEqual(original);
 expect((await store.list<any>('feed-1','editorial_proposals'))[0].rawProposal).toEqual(original);
 expect(await prepareEditorialPlan(new V1FeedStore(ctx.db),shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong)).toEqual(plan);expect(calls).toBe(1);
},25000);
it('publication during the editor call prevents stale reader-state plan consumption',async()=>{
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),usage={calls:1,costUsd:.001,reported:true};
 const strong={model:'fake-editor',usage:()=>usage,complete:async()=>{
  await processV1Briefing({DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1'} as Env,{type:'v1_briefing',feedId:'feed-1',window:{start:'2026-10-03T11:00:00Z',end:'2026-10-03T12:15:00Z',kind:'HOURLY'}},()=>window.end);
  return {value:compactEditorialInput(shortlist).encode(fallbackEditorialPlan(shortlist)),usage};
 }};
 await expect(prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong)).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});expect(await store.list('feed-1','editorial_plans')).toHaveLength(0);
},25000);
