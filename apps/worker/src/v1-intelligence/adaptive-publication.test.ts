import {beforeEach,afterEach,it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence,syntheticModelAdmission} from './test-utils';
import {scoreAndSelect,ADAPTIVE_BRIEFING_PROCESSING} from './scoring';
import {publishSelection,type BriefingModelPort} from './publication';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});afterEach(async()=>ctx.dispose());
const window={start:'2026-10-03T00:00:00Z',end:'2026-10-04T00:00:00Z',kind:'DAILY' as const};
it('adaptive paid results survive failed draft commit and restart, retaining actual costs above old per-call ceilings',async()=>{
 await seedIntelligence(store);const selection=await scoreAndSelect(store,'feed-1',window,ADAPTIVE_BRIEFING_PROCESSING,testPolicy.now());let calls=0;
 const model:BriefingModelPort={model:'test-model',provider:'SYNTHETIC',maxCallCostUsd:0,admission:()=>({...syntheticModelAdmission(),reservationCostUsd:.03}),synthesize:async input=>{calls++;const evidence=input.stories[0].evidence[0];return {draft:{language:'en',stories:[{candidateId:input.stories[0].candidate.id,claims:[{text:evidence.body!,support:[{evidenceRevisionId:evidence.id,quote:evidence.body!}]}]}]},usage:{tokensIn:20,tokensOut:20,cost:.025,confirmed:true}}},verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),usage:{tokensIn:20,tokensOut:20,cost:.001,confirmed:true}})};
 await ctx.db.exec("CREATE TRIGGER fail_draft_commit BEFORE INSERT ON v1_feed_documents WHEN NEW.kind='drafts' BEGIN SELECT RAISE(ABORT,'simulated draft persistence outage'); END;");
 await expect(publishSelection(store,'feed-1',selection.id,{now:testPolicy.now,model})).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 expect((await store.list<any>('feed-1','semantic_settlements'))[0]).toMatchObject({status:'SUCCEEDED',usage:{reported:true,costUsd:.025}});expect((await store.list<any>('feed-1','synthesis_jobs'))[0]).toMatchObject({state:'PENDING',failure:'PAID_RESULT_AWAITING_CANONICAL_COMMIT'});
 await ctx.db.exec('DROP TRIGGER fail_draft_commit;');
 const edition=await publishSelection(new V1FeedStore(ctx.db),'feed-1',selection.id,{now:testPolicy.now,model});expect(calls).toBe(1);expect(edition.stories).toHaveLength(1);expect(edition.generation.cost).toBeCloseTo(.026);expect(await publishSelection(store,'feed-1',selection.id,{now:testPolicy.now,model})).toEqual(edition);
 const charges=await ctx.db.prepare('SELECT SUM(cost_usd) AS cost FROM v1_model_spending_settlements WHERE reported=1').first<{cost:number}>();expect(charges!.cost).toBeCloseTo(.026);
},30000);
it('cached verification packets resume after a later-clock restart without rebilling or rewriting immutable timestamps',async()=>{
 await seedIntelligence(store);const selection=await scoreAndSelect(store,'feed-1',window,ADAPTIVE_BRIEFING_PROCESSING,testPolicy.now());let calls=0;
 const usage={tokensIn:20,tokensOut:20,cost:.001,confirmed:true};
 const model:BriefingModelPort={model:'test-model',provider:'SYNTHETIC',maxCallCostUsd:0,admission:syntheticModelAdmission,synthesize:async input=>{calls++;const s=input.stories[0],e=s.evidence[0];return {draft:{language:'en',stories:[{candidateId:s.candidate.id,claims:[{text:e.body!,support:[{evidenceRevisionId:e.id,quote:e.body!}]}]}]},usage}},verify:async claims=>{calls++;return {supportedClaimIds:claims.map(c=>c.id),usage}}};
 await ctx.db.exec(`CREATE TRIGGER fail_merged_verification BEFORE INSERT ON v1_feed_documents WHEN NEW.kind='verification_results' AND NEW.id='${selection.id}' BEGIN SELECT RAISE(ABORT,'simulated merge persistence outage'); END;`);
 await expect(publishSelection(store,'feed-1',selection.id,{now:testPolicy.now,model})).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 const packet=(await store.list<any>('feed-1','verification_results'))[0];expect(packet).toBeDefined();expect(calls).toBe(2);
 await ctx.db.exec('DROP TRIGGER fail_merged_verification;');
 const edition=await publishSelection(new V1FeedStore(ctx.db),'feed-1',selection.id,{now:()=> '2026-10-03T12:10:00Z',model});
 expect(edition.stories).toHaveLength(1);expect(calls).toBe(2);expect(await store.read('feed-1','verification_results',packet.id)).toEqual(packet);
},30000);
it('missing account authorization remains an explicit durable wait, without a provider call or a false quiet edition',async()=>{
 await seedIntelligence(store);const selection=await scoreAndSelect(store,'feed-1',window,ADAPTIVE_BRIEFING_PROCESSING,testPolicy.now());await ctx.db.prepare('DELETE FROM v1_model_spending_authorizations').run();let calls=0;
 const model:BriefingModelPort={model:'test',provider:'SYNTHETIC',maxCallCostUsd:0,admission:syntheticModelAdmission,synthesize:async()=>{calls++;throw Error('not called')}};
 await expect(publishSelection(store,'feed-1',selection.id,{now:testPolicy.now,model})).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});expect(calls).toBe(0);expect(await store.list('feed-1','editions')).toHaveLength(0);expect((await store.list<any>('feed-1','synthesis_jobs'))[0]).toMatchObject({state:'PENDING',failure:'ACCOUNT_AUTHORIZATION_REQUIRED'});
},20000);
it('failed intent commit before provider execution remains recoverable without inventing an UNKNOWN charge',async()=>{
 await seedIntelligence(store);const selection=await scoreAndSelect(store,'feed-1',window,ADAPTIVE_BRIEFING_PROCESSING,testPolicy.now());let calls=0;
 const usage={tokensIn:20,tokensOut:20,cost:.001,confirmed:true};
 const model:BriefingModelPort={model:'test-model',provider:'SYNTHETIC',maxCallCostUsd:0,admission:syntheticModelAdmission,synthesize:async input=>{calls++;const s=input.stories[0],e=s.evidence[0];return {draft:{language:'en',stories:[{candidateId:s.candidate.id,claims:[{text:e.body!,support:[{evidenceRevisionId:e.id,quote:e.body!}]}]}]},usage}},verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),usage})};
 await ctx.db.exec("CREATE TRIGGER fail_unstarted_publication_intent BEFORE INSERT ON v1_feed_documents WHEN NEW.kind='semantic_intents' BEGIN SELECT RAISE(ABORT,'simulated intent commit outage'); END;");
 await expect(publishSelection(store,'feed-1',selection.id,{now:testPolicy.now,model})).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 expect(calls).toBe(0);expect(await store.list('feed-1','semantic_intents')).toHaveLength(0);
 expect((await store.list<any>('feed-1','synthesis_jobs'))[0]).toMatchObject({state:'PENDING'});
 expect((await store.list<any>('feed-1','model_executions')).some(e=>e.status==='OUTCOME_UNKNOWN')).toBe(false);
 expect((await ctx.db.prepare('SELECT COUNT(*) AS n FROM v1_model_spending_reservations').first<{n:number}>())!.n).toBe(0);
 await ctx.db.exec('DROP TRIGGER fail_unstarted_publication_intent;');
 const edition=await publishSelection(new V1FeedStore(ctx.db),'feed-1',selection.id,{now:testPolicy.now,model});expect(calls).toBe(1);expect(edition.stories).toHaveLength(1);
},30000);
it('a provider failure after committed intent retains UNKNOWN liability and cannot be reissued',async()=>{
 await seedIntelligence(store);const selection=await scoreAndSelect(store,'feed-1',window,ADAPTIVE_BRIEFING_PROCESSING,testPolicy.now());let calls=0;
 const model:BriefingModelPort={model:'test-model',provider:'SYNTHETIC',maxCallCostUsd:0,admission:syntheticModelAdmission,synthesize:async()=>{
  calls++;const job=(await store.list<any>('feed-1','synthesis_jobs'))[0];expect(typeof job.pendingCall).toBe('string');expect(await store.read('feed-1','semantic_intents',job.pendingCall)).toBeTruthy();throw Error('provider outcome unavailable');
 }};
 await expect(publishSelection(store,'feed-1',selection.id,{now:testPolicy.now,model})).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 expect((await store.list<any>('feed-1','synthesis_jobs'))[0]).toMatchObject({state:'FAILED',failure:'MODEL_OUTCOME_UNKNOWN'});
 expect((await ctx.db.prepare('SELECT SUM(reserved_cost_usd) AS exposure FROM v1_model_spending_reservations').first<{exposure:number}>())!.exposure).toBeCloseTo(.02);
 expect((await ctx.db.prepare('SELECT COUNT(*) AS n FROM v1_model_spending_settlements WHERE reported=1').first<{n:number}>())!.n).toBe(0);
 await expect(publishSelection(new V1FeedStore(ctx.db),'feed-1',selection.id,{now:testPolicy.now,model})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(calls).toBe(1);expect(await store.list('feed-1','editions')).toHaveLength(0);
},30000);
import {acceptEvidence} from './test-utils';
import {prepareSemanticMatch} from './semantic-preparation';
import {processEvidenceIntelligence} from './engine';
import {prepareSemanticShortlist} from './shortlist';
import {prepareAdaptiveEditorialPlan} from './editorial-continuation';
import {fallbackEditorialPlan,editorialPlannerState} from './editorial-plan';
import {compactEditorialInput} from './editorial-transport';
import {projectEditionLedger} from './ledger';
it.each([false,true])('source-bound Events publish without loss or rebilling; independent context wait=%s',async blocked=>{
 const sentences=['Parliament approved banking reform.','Beirut airport reopened its runway.','The education ministry announced exam results.','The electricity authority restored power in Beirut.','The army confirmed a border evacuation.','The health ministry opened a new hospital.'];
 await acceptEvidence(store,1,sentences.join(' '));const usage={calls:1,costUsd:.001,reported:true};
 const construction={model:'construction-fixture',admission:syntheticModelAdmission,usage:()=>usage,complete:async(_f:string,_p:string,state:any)=>({value:{groups:state.claimMentions.map((m:any)=>({claimMentionIds:[m.id],structuralRelation:'NEW_STORYLINE',eventId:null,storylineId:null,epistemicEffects:[],entities:[],slots:[]})),backgroundMentionIds:[],confidence:.99},usage})};
 const job=JSON.stringify(['REASSESS','observation-1','']),prepared=await prepareSemanticMatch(store,{} as any,job,testPolicy.now(),{strong:construction});await processEvidenceIntelligence(store,job,testPolicy.now(),prepared?.matchers);
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,testPolicy.now());expect(shortlist.candidates).toHaveLength(6);
 const transport=compactEditorialInput(editorialPlannerState(shortlist,ADAPTIVE_BRIEFING_PROCESSING,await store.getFeed('feed-1'),'CURRENT'));
 const proposal=fallbackEditorialPlan(shortlist);proposal.stories.forEach(s=>{s.feedFit='DIRECT';s.editorialImportance=.8});
 // One source-bound fact is required in two story occurrences, with separate verifier ownership.
 proposal.stories[0].disagreementFactIds=[proposal.stories[1].mustIncludeFactIds[0]];
 const planner={model:'planner-fixture',admission:syntheticModelAdmission,usage:()=>usage,complete:async()=>({value:transport.encodeKeyed(proposal),usage})};
 const plan=await prepareAdaptiveEditorialPlan(store,shortlist,testPolicy.now(),planner),selection=await scoreAndSelect(store,'feed-1',window,ADAPTIVE_BRIEFING_PROCESSING,testPolicy.now(),undefined,plan);expect(selection.selectedCandidateIds).toHaveLength(6);let writerCalls=0,verifierCalls=0;
 const model:BriefingModelPort={model:'writer-fixture',provider:'SYNTHETIC',requiresFullEntailment:true,maxCallCostUsd:0,admission:payload=>({...syntheticModelAdmission(),reservationCostUsd:.03,fits:(payload as any).kind!=='WRITE'||((payload as any).input.stories.length<=1&&(!blocked||!(payload as any).input.stories.some((s:any)=>s.approvedFacts.some((f:any)=>f.text.includes('Parliament approved')))))}),synthesisPayload:input=>({kind:'WRITE',input}),synthesize:async input=>{writerCalls++;return {draft:{language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:s.approvedFacts!.map(f=>({text:f.text,support:f.support,communicatedFactIds:[f.id]}))}))},usage:{tokensIn:100,tokensOut:100,cost:.025,confirmed:true}}},verify:async claims=>{verifierCalls++;return {supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>c.requiredFacts?.map(f=>f.id)??[]),novelFactIds:claims.flatMap(c=>c.newUnderstandingFacts?.map(f=>f.id)??[]),claimEntailment:claims.map(c=>({claimId:c.id,fullyEntailed:true,unsupportedMeaning:[],reason:'Exact approved source facts.'})),semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({candidateId:c.candidateId,factId:f.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,nonRepetitive:true,reason:'Exact supported reader-new fact.',readerSpans:[{claimId:c.id,text:c.text}],readerNovelty:{status:'NEW' as const,reason:'No equivalent communicated fact.',previousFactTexts:[]}}))),usage:{tokensIn:100,tokensOut:100,cost:.001,confirmed:true}}}};
 const edition=await publishSelection(store,'feed-1',selection.id,{now:testPolicy.now,model,requireModel:true});expect(writerCalls).toBe(blocked?5:6);expect(verifierCalls).toBe(1);expect(edition.stories).toHaveLength(blocked?5:6);expect(edition.generation.cost).toBeCloseTo(blocked?.126:.151);
 if(blocked){const pending=await store.list<any>('feed-1','publication_reconciliations');expect(pending.some(p=>p.state==='SELECTED_UNCOMMUNICATED'&&p.requiredFactIds?.length&&p.reason==='WRITER_MODEL_CONTEXT_WAIT')).toBe(true);expect((await store.list<any>('feed-1','editorial_deferred_work')).some(w=>w.continuationPolicy==='ADAPTIVE'&&!w.expiresAt)).toBe(true);}
 await projectEditionLedger(store,'feed-1',edition.id);expect(await store.list('feed-1','ledger_entries')).toHaveLength(blocked?5:7);
 if(!blocked){const verified=await store.list<any>('feed-1','verification_results');expect(verified[0].semanticChecks.filter((c:any)=>c.factId===proposal.stories[1].mustIncludeFactIds[0])).toHaveLength(2);}expect(await publishSelection(new V1FeedStore(ctx.db),'feed-1',selection.id,{now:testPolicy.now,model,requireModel:true})).toEqual(edition);expect(writerCalls).toBe(blocked?5:6);expect(await store.list('feed-1','editions')).toHaveLength(1);expect(await store.list('feed-1','delivery_jobs')).toHaveLength(1);
},60000);

it('a subsequent window publishes fifteen retained developments without resetting a terminal earlier request',async()=>{
 const window={start:'2026-10-03T13:00:00Z',end:'2026-10-03T14:00:00Z',kind:'HOURLY' as const},now=()=>window.end;
 const failed={id:'earlier-terminal-request',feedId:'feed-1',window:{start:'2026-10-03T12:00:00Z',end:window.start,kind:'HOURLY'},state:'FAILED',attempts:5,failure:'TEMPORARY_UNAVAILABLE'};
 await feedTransact(store,'feed-1',tx=>tx.write('briefing_requests',failed.id,failed));
 const sentences=Array.from({length:15},(_,i)=>`Laboratory${i} announced an independent research platform for industry teams that includes documented evaluation tools, model comparison workflows, deployment monitoring, data governance controls, configurable access management, reproducible experiments, audit records and support for collaboration across its customer research groups.`);
 await acceptEvidence(store,1,sentences.join(' '));const usage={calls:1,costUsd:.001,reported:true};
 const construction={model:'construction-fixture',admission:syntheticModelAdmission,usage:()=>usage,complete:async(_f:string,_p:string,state:any)=>({value:{groups:state.claimMentions.map((m:any)=>({claimMentionIds:[m.id],structuralRelation:'NEW_STORYLINE',eventId:null,storylineId:null,epistemicEffects:[],entities:[],slots:[]})),backgroundMentionIds:[],confidence:.99},usage})};
 const job=JSON.stringify(['REASSESS','observation-1','']),prepared=await prepareSemanticMatch(store,{} as any,job,now(),{strong:construction});await processEvidenceIntelligence(store,job,now(),prepared?.matchers);
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,now());expect(shortlist.candidates).toHaveLength(15);
 const transport=compactEditorialInput(editorialPlannerState(shortlist,ADAPTIVE_BRIEFING_PROCESSING,await store.getFeed('feed-1'),'CURRENT'));
 const proposal=fallbackEditorialPlan(shortlist);proposal.stories.forEach(s=>{s.feedFit='DIRECT';s.editorialImportance=.8});
 const planner={model:'planner-fixture',admission:syntheticModelAdmission,usage:()=>usage,complete:async()=>({value:transport.encodeKeyed(proposal),usage})};
 const plan=await prepareAdaptiveEditorialPlan(store,shortlist,now(),planner),selection=await scoreAndSelect(store,'feed-1',window,ADAPTIVE_BRIEFING_PROCESSING,now(),undefined,plan);expect(selection.selectedCandidateIds).toHaveLength(15);let writerCalls=0,verifierCalls=0;
 const model:BriefingModelPort={model:'writer-fixture',provider:'SYNTHETIC',requiresFullEntailment:true,maxCallCostUsd:0,admission:payload=>({...syntheticModelAdmission(),reservationCostUsd:.03,fits:true}),synthesisPayload:input=>({kind:'WRITE',input}),synthesize:async input=>{writerCalls++;return {draft:{language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:s.approvedFacts!.map(f=>({text:f.text,support:f.support,communicatedFactIds:[f.id]}))}))},usage:{tokensIn:100,tokensOut:100,cost:.025,confirmed:true}}},verify:async claims=>{verifierCalls++;return {supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>c.requiredFacts?.map(f=>f.id)??[]),novelFactIds:claims.flatMap(c=>c.newUnderstandingFacts?.map(f=>f.id)??[]),claimEntailment:claims.map(c=>({claimId:c.id,fullyEntailed:true,unsupportedMeaning:[],reason:'Exact approved source facts.'})),semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({candidateId:c.candidateId,factId:f.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,nonRepetitive:true,reason:'Exact supported reader-new fact.',readerSpans:[{claimId:c.id,text:c.text}],readerNovelty:{status:'NEW' as const,reason:'No equivalent communicated fact.',previousFactTexts:[]}}))),usage:{tokensIn:100,tokensOut:100,cost:.001,confirmed:true}}}};
 const edition=await publishSelection(store,'feed-1',selection.id,{now,model,requireModel:true});expect(writerCalls).toBe(1);expect(verifierCalls).toBe(1);expect(edition.stories).toHaveLength(15);expect(edition.stories.flatMap(s=>s.claims).map(c=>c.text).join(' ').split(/\s+/).length).toBeGreaterThan(500);expect(edition.generation.cost).toBeCloseTo(.026);
 await projectEditionLedger(store,'feed-1',edition.id);expect(await store.list('feed-1','ledger_entries')).toHaveLength(15);expect(await publishSelection(new V1FeedStore(ctx.db),'feed-1',selection.id,{now,model,requireModel:true})).toEqual(edition);expect(writerCalls).toBe(1);expect(await store.list('feed-1','editions')).toHaveLength(1);expect(await store.list('feed-1','delivery_jobs')).toHaveLength(1);expect(await store.read('feed-1','briefing_requests',failed.id)).toEqual(failed);
},60000);
