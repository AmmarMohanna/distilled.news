import {beforeEach,afterEach,it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence,syntheticModelAdmission} from './test-utils';
import {prepareSemanticShortlist,SHORTLIST_POLICY} from './shortlist';
import {fallbackEditorialPlan,prepareEditorialPlan} from './editorial-plan';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection} from './publication';
import {projectEditionLedger} from './ledger';
import {deferEditorialWork,resolveEditorialWork} from './editorial-work';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const},next={...window,start:window.end,end:'2026-10-03T14:00:00Z'},reportTime='2026-09-01T10:00:00Z';
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed({...feedFixture,title:'AI Industry',interests:['AI companies, research, governance and industry developments']});await seedIntelligence(store,1,"Fired OpenAI researchers say they were dismissed for prioritising safety.",'publisher-1',testPolicy.now(),'en',reportTime)});afterEach(async()=>ctx.dispose());
it('older reader-unseen reporting has reader-new novelty while its original report time and freshness remain explicit',async()=>{
 const scope=await prepareSemanticShortlist(store,'feed-1',window,window.end);expect(scope.candidates).toHaveLength(1);expect(scope.candidates[0]).toMatchObject({readerState:'UNSEEN',novelty:'NEW_EVENT'});expect(scope.candidates[0].flags).toContain('OLD_RECAP');expect(scope.candidates[0].facts.every(f=>f.reportTime===reportTime&&!f.eventTime)).toBe(true);expect(scope.candidates[0].protectedReasons).toEqual([]);
},15000);
async function omit(policy:string){
 const original=await prepareSemanticShortlist(store,'feed-1',window,window.end),scope={...original,id:original.id+':omission-fixture',policyVersion:policy},id='retained-editorial-omission';
 await feedTransact(store,'feed-1',async tx=>{await tx.write('shortlists',scope.id,scope);await tx.write('editorial_plans',id,{...fallbackEditorialPlan(scope),stories:fallbackEditorialPlan(scope).stories.map(s=>({...s,decision:'SUPPRESS',treatment:'OMIT',rationale:'Prior editorial omission under this reasoning context.'})),id,feedId:'feed-1',feedRevision:1,shortlistId:scope.id,route:'GPT',window,communicationFingerprint:scope.communicationFingerprint,policyVersion:'fixture',createdAt:window.end});await deferEditorialWork(tx,scope.candidates[0],'OMITTED_BY_EDITOR',window.end,id,window.end,{adaptive:true});const work=(await tx.list<any>('editorial_deferred_work'))[0];await resolveEditorialWork(tx,work,'OMITTED_BY_EDITOR',window.end,id)});
 return {scope,id};
}
it('an omission based on the retired age-as-novelty policy is reconsidered without changing its historical records',async()=>{
 const {scope,id}=await omit('high-recall-semantic-shortlist-v14'),planBefore=await store.read('feed-1','editorial_plans',id),resolutions=await store.list('feed-1','editorial_work_resolutions');
 const later=await prepareSemanticShortlist(store,'feed-1',next,next.end);expect(later.candidates).toHaveLength(1);expect(later.candidates[0].flags).toContain('EDITORIAL_CONTEXT_CHANGED');expect(await store.read('feed-1','editorial_plans',id)).toEqual(planBefore);expect(await store.read('feed-1','shortlists',scope.id)).toEqual(scope);expect(await store.list('feed-1','editorial_work_resolutions')).toEqual(resolutions);
},20000);
it('a compatible current editorial omission still retires unchanged ordinary news',async()=>{
 await omit(SHORTLIST_POLICY);expect((await prepareSemanticShortlist(store,'feed-1',next,next.end)).candidates).toHaveLength(0);
},20000);
it('changed Feed interests invalidate old omission reuse while source ownership remains unchanged',async()=>{
 await omit(SHORTLIST_POLICY);await store.registerFeed({...feedFixture,title:'AI governance',interests:['AI research safety and company governance'],revision:2});const intake=new V1IntakeStore(ctx.db),scope=(await intake.getScope('feed-source-1'))!;await intake.registerScope({...scope,feedRevision:2});const later=await prepareSemanticShortlist(store,'feed-1',next,next.end);expect(later.candidates).toHaveLength(1);expect(later.feedRevision).toBe(2);expect(later.candidates[0].readerState).toBe('UNSEEN');
},20000);

it('previously communicated older facts stay suppressed rather than becoming new through the corrected metadata',async()=>{
 const scope=await prepareSemanticShortlist(store,'feed-1',window,window.end),plan=await prepareEditorialPlan(store,scope,DEFAULT_BRIEFING_BUDGET,window.end),selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan),edition=await publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model:{model:'source-bound-fixture',provider:'TEST',maxCallCostUsd:0,admission:syntheticModelAdmission,synthesize:async input=>({draft:{language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:s.approvedFacts!.map(f=>({text:'An earlier report from September 1, 2026 states: '+f.text,support:f.support,communicatedFactIds:[f.id]}))}))},usage:{tokensIn:1,tokensOut:1,cost:0,confirmed:true}}),verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>c.requiredFacts?.map(f=>f.id)??[]),novelFactIds:claims.flatMap(c=>c.newUnderstandingFacts?.map(f=>f.id)??[]),semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({candidateId:c.candidateId,factId:f.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,readerSpans:[{claimId:c.id,text:c.text}],readerNovelty:{status:'NEW' as const,reason:'No equivalent fact was previously communicated.',previousFactTexts:[]},reason:'Exact source fact with explicitly attributed historical report date.'}))),usage:{tokensIn:1,tokensOut:1,cost:0,confirmed:true}})}});await projectEditionLedger(store,'feed-1',edition.id);expect((await prepareSemanticShortlist(store,'feed-1',next,next.end)).candidates).toHaveLength(0);expect(await store.list('feed-1','editions')).toHaveLength(1);
},20000);
