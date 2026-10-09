import {compactEditorialInput,expandEditorialInput} from './editorial-transport';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {prepareSemanticShortlist} from './shortlist';
import {prepareEditorialPlan,fallbackEditorialPlan} from './editorial-plan';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {processV1Briefing} from './runtime';
import {durableSemanticOperation} from './semantic-operations';
import type {Env} from '../types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store);await seedIntelligence(store,2,'An earthquake destroyed homes in Beirut.','publisher-b','2026-10-03T12:30:00Z')});
afterEach(async()=>ctx.dispose());
it.each(['SUCCEEDED','KNOWN_INVALID','UNKNOWN'])('retained legacy %s operation is not replaced by a new-contract paid call',async mode=>{
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),body=fallbackEditorialPlan(shortlist),usage={calls:1,costUsd:.001,reported:true};
 const initial=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end,{model:'legacy-editor',usage:()=>usage,complete:async()=>({value:compactEditorialInput(shortlist).encodeKeyed(body),usage})});
 const intent=await store.read<any>('feed-1','semantic_intents',initial.operationId!),input=structuredClone(intent.input);
 delete input.state.outputContract;delete input.state.outputInstruction;
 let legacyCalls=0;
 const saved=await durableSemanticOperation(store,input,async()=>{legacyCalls++;if(mode!=='SUCCEEDED')throw Error(mode==='UNKNOWN'?'SEMANTIC_OUTCOME_UNKNOWN':'SEMANTIC_EDITORIAL_VALIDATION_FAILED');return {value:body,usage}},window.end,()=>mode==='UNKNOWN'?{...usage,reported:false}:usage);
 // A missing plan commit after a legacy call is precisely where a contract
 // switch could otherwise create a second paid operation. No rows are edited.
 const scope={...shortlist,id:shortlist.id+':legacy-uncommitted'};let newCalls=0;
 const model={model:'legacy-editor',usage:()=>usage,complete:async()=>{newCalls++;throw Error('UNSAFE_DUPLICATE_CALL')}};
 const plan=await prepareEditorialPlan(new V1FeedStore(ctx.db),scope,DEFAULT_BRIEFING_BUDGET,window.end,model);
 expect(plan.operationId).toBe(saved.id);expect(plan.route).toBe(mode==='SUCCEEDED'?'GPT':'DETERMINISTIC_FALLBACK');expect(newCalls).toBe(0);expect(legacyCalls).toBe(1);
 const replay=await prepareEditorialPlan(new V1FeedStore(ctx.db),scope,DEFAULT_BRIEFING_BUDGET,window.end,model);
 expect(replay.operationId).toBe(saved.id);expect(replay.route).toBe(plan.route);
 expect(await prepareEditorialPlan(new V1FeedStore(ctx.db),scope,DEFAULT_BRIEFING_BUDGET,window.end,model)).toEqual(replay);expect(newCalls).toBe(0);
 expect(await store.read('feed-1','semantic_results',saved.id)).toEqual(JSON.parse(JSON.stringify(saved)));
},25000);
it('one durable comparative call controls selection/order/treatment and replays without provider use',async()=>{
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),body=fallbackEditorialPlan(shortlist);
 const earthquake=shortlist.candidates.find(c=>c.facts.some(f=>f.text.includes('earthquake')))!;
 body.stories=body.stories.map(s=>s.targetVersionId===earthquake.targetVersionId?{...s,order:0,treatment:'DETAILED'}:{...s,decision:'SUPPRESS',order:1,treatment:'OMIT',mustIncludeFactIds:[],newUnderstandingFactIds:[],rationale:'Comparative feed/window judgment.'});
 let calls=0;const usage={calls:1,costUsd:.001,reported:true},strong={model:'fake-editor',usage:()=>usage,complete:async()=>{calls++;expect(await store.list('feed-1','semantic_intents')).toHaveLength(1);return {value:compactEditorialInput(shortlist).encodeKeyed(body),usage}}};
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
 const raw={id:JSON.stringify([initial.id,'INITIAL']),feedId:shortlist.feedId,shortlistId:shortlist.id,model:strong.model,rawProposal:compactEditorialInput(shortlist).encodeKeyed(body),rejection:'SCOPE_DENIED',usage};
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
 const raw=compactEditorialInput(shortlist).encodeKeyed(body),original=structuredClone(raw);let calls=0;const usage={calls:1,costUsd:.001,reported:true},strong={model:'contract-editor',usage:()=>usage,complete:async()=>{calls++;return {value:raw,usage}}};
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
  return {value:compactEditorialInput(shortlist).encodeKeyed(fallbackEditorialPlan(shortlist)),usage};
 }};
 await expect(prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong)).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});expect(await store.list('feed-1','editorial_plans')).toHaveLength(0);
},25000);
it.each([false,true])('cached oversized planning only acquires a first call when no billed operation exists (%s)',async billed=>{
 const {sha256}=await import('@distilled/contracts'),{canonicalJson}=await import('../v1-intake/canonical');
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),model='oversized-editor';
 const baseId=await sha256(canonicalJson({feedId:shortlist.feedId,shortlistId:shortlist.id,budget:DEFAULT_BRIEFING_BUDGET,model,policy:'comparative-editorial-plan-v21'}));
 const prior={id:baseId,feedId:shortlist.feedId,feedRevision:shortlist.feedRevision,shortlistId:shortlist.id,window:shortlist.window,communicationFingerprint:shortlist.communicationFingerprint,route:'DETERMINISTIC_FALLBACK' as const,plannerSource:'DETERMINISTIC_FALLBACK' as const,fallbackReason:'EMPTY_OR_OVERSIZED_EDITORIAL_INPUT',modelOperationIds:billed?['billed-op']:[],operationId:billed?'billed-op':undefined,evidenceRevisionIds:shortlist.evidenceRevisionIds,policyVersion:'comparative-editorial-plan-v21',createdAt:window.end,...fallbackEditorialPlan(shortlist)};
 await feedTransact(store,'feed-1',tx=>tx.write('editorial_plans',baseId,prior));
 let calls=0;const usage={calls:1,costUsd:.001,reported:true},strong={model,usage:()=>usage,complete:async()=>{calls++;return {value:compactEditorialInput(shortlist).encodeKeyed(fallbackEditorialPlan(shortlist)),usage}}};
 const plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong);
 expect(plan.route).toBe(billed?'DETERMINISTIC_FALLBACK':'GPT');expect(calls).toBe(billed?0:1);
 expect(await prepareEditorialPlan(new V1FeedStore(ctx.db),shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong)).toEqual(plan);expect(calls).toBe(billed?0:1);
 expect(await store.read('feed-1','editorial_plans',baseId)).toEqual(JSON.parse(JSON.stringify(prior)));
},25000);

it('offers a bounded real decision scope and durably carries unreviewed ordinary work without losing protected corrections',async()=>{
 const corpus=(await import('./fixtures/staging-2000-oversized-input.json')).default;
 const shortlist=structuredClone(corpus.shortlist) as unknown as import('./shortlist').ShortlistRecord;
 shortlist.feedId='feed-1';shortlist.feedRevision=1;shortlist.id='retained-growth-window';shortlist.window=window;
 // Input growth only: retained candidate facts are unchanged; no provider fetch.
 const original=structuredClone(shortlist.candidates);
 for(let i=0;i<19;i++){const c=structuredClone(original[1+i%(original.length-1)]);c.targetVersionId+=':growth:'+i;c.stableTargetId+=':growth:'+i;for(const f of c.facts)f.id+=':growth:'+i;shortlist.candidates.push(c)}
 shortlist.obligations=shortlist.obligations.map(o=>({...o,feedId:'feed-1'}));
 const current=await store.currentEvidence('feed-1');shortlist.evidenceRevisionIds=current.map(e=>e.revision.id);
 const {communicationFingerprint}=await import('./editorial');
 shortlist.communicationFingerprint=await feedTransact(store,'feed-1',tx=>communicationFingerprint(tx,window.end));
 let calls=0,offered:string[]=[];const usage={calls:1,costUsd:.001,reported:true};
 const strong={model:'bounded-contract-editor',usage:()=>usage,complete:async(_feed:string,_kind:string,input:any)=>{
  calls++;const expanded=expandEditorialInput(input);offered=expanded.candidates.map((c:any)=>c.targetVersionId);
  const stories=Object.fromEntries(expanded.candidates.map((c:any,i:number)=>[c.targetVersionId,{targetType:c.targetType,decision:'DEFER',order:i,treatment:'OMIT',deltaType:'UNRESOLVED',newUnderstandingFactIds:[],contextFactIds:[],mustIncludeFactIds:[],attributionFactIds:[],certaintyFactIds:[],disagreementFactIds:[],openQuestionFactIds:[],correctionObligationIds:[],previousLedgerEntryIds:[],rationale:'Conservative deferred work.',relevanceRationale:'Awaiting supported identity.',feedFit:'UNCERTAIN'}]));
  const obligations=Object.fromEntries(expanded.obligations.map((o:any)=>[o.id,{handling:'DEFER',targetVersionId:null,reason:'Awaiting supported identity.'}]));
  return {value:{stories,obligations},usage};
 }};
 const plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong);
 expect(plan.route).toBe('GPT');expect(calls).toBe(1);expect(plan.stories).toHaveLength(40);
 expect(plan.inputCoverage!.notComparativelyReviewedTargetVersionIds.length).toBeGreaterThan(0);
 for(const id of plan.inputCoverage!.notComparativelyReviewedTargetVersionIds){const story=plan.stories.find(s=>s.targetVersionId===id)!;expect(story.decision).toBe('DEFER');expect(story.rationale).toContain('PLANNER_INPUT_OVERFLOW');expect((await store.list<any>('feed-1','editorial_deferred_work')).some(w=>w.targetVersionId===id)).toBe(true)}
 expect(offered).toHaveLength(plan.inputCoverage!.offeredTargetVersionIds.length);
 expect(plan.inputCoverage!.offeredTargetVersionIds).toContain(shortlist.candidates[0].targetVersionId);
 expect(plan.obligations[0].obligationId).toBe(shortlist.obligations[0].id);
 expect(await prepareEditorialPlan(new V1FeedStore(ctx.db),shortlist,DEFAULT_BRIEFING_BUDGET,window.end,strong)).toEqual(plan);expect(calls).toBe(1);
},25000);
