import {expect,it} from 'vitest';
import {fallbackEditorialPlan} from './editorial-plan';
const fact=(id:string,text:string)=>({id,text,evidenceRevisionIds:['r-'+id],claimMentionIds:[],selfContained:'YES' as const});
const cand=(id:string,over:any={})=>({targetType:'EVENT' as const,targetVersionId:id,stableTargetId:'s-'+id,eventVersionIds:[id],evidenceRevisionIds:['r-'+id],facts:[fact(id,`Fact ${id}.`)],stateSlotIds:[],effects:[],flags:[],protectedReasons:[],correctionObligationIds:[],priority:.6,fallbackEditorial:{decision:'INCLUDE',reasonCodes:['NEW_SUPPORTED_DEVELOPMENT'],newUnderstanding:[{text:`Fact ${id}.`,evidenceRevisionIds:['r-'+id]}],treatment:'BRIEF'},...over});
const shortlist=(candidates:any[])=>({candidates,ledger:[],obligations:[]}) as any;
it('fallback ordering ranks protected deltas first and old-source recaps last',()=>{
 const plan=fallbackEditorialPlan(shortlist([cand('old',{flags:['OLD_RECAP'],priority:.3}),cand('plain'),cand('retraction',{effects:['RETRACTS'],protectedReasons:['RETRACTS'],priority:1})]));
 const order=Object.fromEntries(plan.stories.map(s=>[s.targetVersionId,s.order]));
 expect(order.retraction).toBeLessThan(order.plain);expect(order.plain).toBeLessThan(order.old);
});
it('hard story capacity is allocated protected-first even when the planner ranked the protected story last',async()=>{
 const {prepareEditorialPlan}=await import('./editorial-plan');
 const {createIntakeDatabase,seedIntakeScope}=await import('../v1-intake/test-utils');const {V1IntakeStore}=await import('../v1-intake/store');const {V1FeedStore}=await import('./store');const {feedFixture,seedIntelligence}=await import('./test-utils');
 const ctx=await createIntakeDatabase();
 try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store,1);
  const real=(await store.currentEvidence('feed-1'))[0].revision.id,ids=['a','b','c'],withReal=(c:any)=>({...c,evidenceRevisionIds:[real],facts:c.facts.map((f:any)=>({...f,evidenceRevisionIds:[real]}))}),list=[cand('a'),cand('b'),cand('c',{effects:['CORRECTS'],protectedReasons:['CORRECTS'],priority:1})].map(withReal);
  const window={start:'2026-10-03T11:00:00Z',end:'2026-10-03T12:00:00Z',kind:'HOURLY' as const};
  const sl={id:'sl',feedId:'feed-1',feedRevision:1,window,communicationFingerprint:await (await import('./store')).feedTransact(store,'feed-1',tx=>import('./editorial').then(m=>m.communicationFingerprint(tx,window.end))),candidates:list,overflow:[],obligations:[],ledger:[],evidenceRevisionIds:[real],policyVersion:'p',createdAt:window.end} as any;
  // Strong planner stand-in ranks the protected story last.
  const strong={model:'fake',usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async()=>({value:{stories:ids.map((id,order)=>({targetType:'EVENT',targetVersionId:id,decision:'SELECT',order,treatment:'BRIEF',deltaType:id==='c'?'CORRECTION':'NEW',newUnderstandingFactIds:[id],contextFactIds:[],mustIncludeFactIds:[id],attributionFactIds:[],certaintyFactIds:[],disagreementFactIds:[],openQuestionFactIds:[],correctionObligationIds:[],previousLedgerEntryIds:[],rationale:'r',relevanceRationale:'r'})),obligations:[]},usage:{calls:1,costUsd:.001,reported:true}})};
  const plan=await prepareEditorialPlan(store,sl,{maxStories:2,maxReadingWords:500,maxEvidenceInspections:20,maxInputTokens:12000,maxOutputTokens:1500,maxModelCalls:4,maxCostUsd:.1,maxPerPublisher:2,maxWallClockMs:60000} as any,window.end,strong as any);
  const decision=Object.fromEntries(plan.stories.map(s=>[s.targetVersionId,s.decision]));
  expect(decision).toEqual({a:'SELECT',b:'DEFER',c:'SELECT'});
 }finally{await ctx.dispose()}
},60000);
