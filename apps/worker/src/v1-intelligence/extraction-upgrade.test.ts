import {it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,acceptEvidence} from './test-utils';
import {processEvidenceIntelligence} from './engine';
import {scheduleExtractionUpgrades,hasUnscheduledExtractionUpgrade} from './extraction-upgrade';
import {processV1Briefing} from './runtime';
import type {Env} from '../types';
import {CLAIM_EXTRACTOR} from './claims';
import {nextRematch} from './rematch';
import {prepareSemanticShortlist} from './shortlist';
import {fallbackEditorialPlan,editorialPlanWireSchemaFor} from './editorial-plan';
import {compactEditorialInput} from './editorial-transport';
it('retained body-only corpus upgrades through at most two ordinary rematches per invocation, without new evidence or duplicate requests',async()=>{
 const ctx=await createIntakeDatabase();try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);
  for(let i=1;i<=3;i++){await acceptEvidence(store,i,`Company ${i} announced a new computer.`,'publisher-1','2026-10-03T12:30:00Z','en','2026-10-03T12:20:00Z',`Company ${i} releases a new AI system.`);await processEvidenceIntelligence(store,JSON.stringify(['REASSESS',`observation-${i}`,'']),'2026-10-03T12:30:00Z')}
  expect(await hasUnscheduledExtractionUpgrade(store,'feed-1',{start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY'})).toBe(false);
  // Offline rollout fixture represents immutable documents from the old policy.
  await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='source_documents'").run();
  expect(await hasUnscheduledExtractionUpgrade(store,'feed-1',{start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY'})).toBe(true);
  const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const},before=await store.currentEvidence('feed-1');
  await feedTransact(store,'feed-1',tx=>scheduleExtractionUpgrades(tx,window,window.end));let requests=await store.list<any>('feed-1','rematch_requests');expect(requests.filter(r=>r.policyVersion.includes(CLAIM_EXTRACTOR))).toHaveLength(2);
  await feedTransact(store,'feed-1',tx=>scheduleExtractionUpgrades(tx,window,window.end));await feedTransact(store,'feed-1',tx=>scheduleExtractionUpgrades(tx,window,window.end));requests=await store.list<any>('feed-1','rematch_requests');expect(requests.filter(r=>r.policyVersion.includes(CLAIM_EXTRACTOR))).toHaveLength(3);expect(await store.currentEvidence('feed-1')).toEqual(before);expect(await hasUnscheduledExtractionUpgrade(store,'feed-1',{start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY'})).toBe(false);
  const upgrade=requests.find(r=>r.policyVersion.includes(CLAIM_EXTRACTOR));expect(nextRematch(upgrade,[{requestId:upgrade.id,state:'EXHAUSTED',attempt:3} as any],window.end)).toBeUndefined();expect(await store.read('feed-1','rematch_requests',upgrade.id)).toEqual(upgrade);
  const scope=await prepareSemanticShortlist(store,'feed-1',window,window.end);expect(scope.candidates.every(c=>c.flags.includes('TITLE_EXTRACTION_PENDING'))).toBe(true);expect(fallbackEditorialPlan(scope).stories.every(s=>s.decision==='DEFER')).toBe(true);
  const wire=editorialPlanWireSchemaFor(compactEditorialInput({candidates:scope.candidates,ledger:scope.ledger,obligations:scope.obligations} as any).state);expect(wire.properties.stories.items.anyOf.every(b=>b.properties.decision.enum.join(',')==='DEFER')).toBe(true);
  const env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',V1_EDITORIAL_PLAN_ENABLED:'true'} as Env;
  expect(await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end)).toBeUndefined();
  expect(await store.list('feed-1','briefing_requests')).toMatchObject([{state:'DONE',result:'DEFERRED',reason:'EDITORIAL_WORK_DEFERRED'}]);
  expect(await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end)).toBeUndefined();expect(await store.list('feed-1','editions')).toHaveLength(0);
  await processEvidenceIntelligence(store,upgrade.jobId,'2026-10-03T13:10:00Z',undefined,'title-policy-upgrade');expect((await store.list<any>('feed-1','claim_mentions')).some(m=>m.evidenceRevisionId===upgrade.evidenceRevisionId&&m.span.field==='title')).toBe(true);
 }finally{await ctx.dispose()}
},30000);

const later={start:'2026-10-08T12:00:00Z',end:'2026-10-08T13:00:00Z',kind:'HOURLY' as const};
async function historicalCorpus(ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,count:number){
 await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);
 for(let i=1;i<=count;i++){await acceptEvidence(store,i,`Company ${i} announced a new computer.`,'publisher-1','2026-10-03T12:30:00Z','en','2026-10-03T12:20:00Z',`Company ${i} releases a new AI system.`);await processEvidenceIntelligence(store,JSON.stringify(['REASSESS',`observation-${i}`,'']),'2026-10-03T12:30:00Z')}
 await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='source_documents'").run();return store;
}
const upgrades=async(store:V1FeedStore)=>(await store.list<any>('feed-1','rematch_requests')).filter(r=>r.policyVersion.includes(CLAIM_EXTRACTOR));
it('historical title evidence outside the publication window stays eligible and detection agrees with scheduling',async()=>{
 const ctx=await createIntakeDatabase();try{
  const store=await historicalCorpus(ctx,1);
  expect(await store.list('feed-1','editorial_deferred_work')).toHaveLength(0);
  expect(await hasUnscheduledExtractionUpgrade(store,'feed-1',later)).toBe(true);
  await feedTransact(store,'feed-1',tx=>scheduleExtractionUpgrades(tx,later,later.end));expect(await upgrades(store)).toHaveLength(1);
  // Once scheduled the state is truthful, and duplicate dispatches add nothing.
  expect(await hasUnscheduledExtractionUpgrade(store,'feed-1',later)).toBe(false);
  await feedTransact(store,'feed-1',tx=>scheduleExtractionUpgrades(tx,later,later.end));expect(await upgrades(store)).toHaveLength(1);
 }finally{await ctx.dispose()}
},30000);
it('a historical corpus drains at a bounded rate behind outstanding work, survives restart and never re-upgrades processed revisions',async()=>{
 const ctx=await createIntakeDatabase();try{
  const store=await historicalCorpus(ctx,4);
  await feedTransact(store,'feed-1',tx=>scheduleExtractionUpgrades(tx,later,later.end));expect(await upgrades(store)).toHaveLength(2);
  // Two requests are outstanding: nothing is detected or scheduled (no busy loop), also after a restart.
  const restarted=new V1FeedStore(ctx.db);
  expect(await hasUnscheduledExtractionUpgrade(restarted,'feed-1',later)).toBe(false);
  await feedTransact(restarted,'feed-1',tx=>scheduleExtractionUpgrades(tx,later,later.end));expect(await upgrades(restarted)).toHaveLength(2);
  // A pre-call budget wait keeps the request outstanding: it consumed no attempt but still blocks new historical work.
  const [first,second]=await upgrades(restarted);
  await feedTransact(restarted,'feed-1',tx=>tx.write('rematch_attempts','wait-1',{id:'wait-1',feedId:'feed-1',requestId:first.id,attempt:1,state:'WAITING_BUDGET',nextAttemptAt:'2026-10-09T00:00:00Z',createdAt:later.end,reason:'SEMANTIC_BUDGET_EXHAUSTED'}));
  expect(await hasUnscheduledExtractionUpgrade(restarted,'feed-1',later)).toBe(false);
  // Completed requests free capacity for exactly the next bounded batch; earlier revisions are untouched.
  for(const r of [first,second])await feedTransact(restarted,'feed-1',tx=>tx.write('rematch_attempts',`ok-${r.id}`,{id:`ok-${r.id}`,feedId:'feed-1',requestId:r.id,attempt:2,state:'SUCCEEDED',createdAt:later.end}));
  expect(await hasUnscheduledExtractionUpgrade(restarted,'feed-1',later)).toBe(true);
  await feedTransact(restarted,'feed-1',tx=>scheduleExtractionUpgrades(tx,later,later.end));
  const all=await upgrades(restarted);expect(all).toHaveLength(4);expect(new Set(all.map(r=>r.evidenceRevisionId)).size).toBe(4);
  expect(await hasUnscheduledExtractionUpgrade(restarted,'feed-1',later)).toBe(false);
 }finally{await ctx.dispose()}
},60000);
it('revisions already extracted by the current policy are not scheduled again and an upgraded historical title reaches editorial consideration',async()=>{
 const ctx=await createIntakeDatabase();try{
  const store=await historicalCorpus(ctx,2);
  // Revision 1 was already processed by the current extractor.
  await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),'2026-10-03T12:31:00Z',undefined,'title-policy-upgrade');
  const done=(await store.currentEvidence('feed-1')).find(r=>r.revision.sourceObservationId==='observation-1')!.revision.id;
  await feedTransact(store,'feed-1',tx=>scheduleExtractionUpgrades(tx,later,later.end));
  const requests=await upgrades(store);expect(requests).toHaveLength(1);expect(requests.some(r=>r.evidenceRevisionId===done)).toBe(false);
  const pendingFlag=async()=>(await prepareSemanticShortlist(store,'feed-1',later,later.end)).candidates.filter(c=>c.flags.includes('TITLE_EXTRACTION_PENDING')).length;
  expect(await pendingFlag()).toBe(1);
  await processEvidenceIntelligence(store,requests[0].jobId,'2026-10-08T12:30:00Z',undefined,'title-policy-upgrade');
  expect(await pendingFlag()).toBe(0);expect(await hasUnscheduledExtractionUpgrade(store,'feed-1',later)).toBe(false);
 }finally{await ctx.dispose()}
},60000);
