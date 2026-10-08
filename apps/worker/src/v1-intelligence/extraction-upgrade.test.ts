import {it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,acceptEvidence} from './test-utils';
import {processEvidenceIntelligence} from './engine';
import {scheduleExtractionUpgrades,hasUnscheduledExtractionUpgrade} from './extraction-upgrade';
import {CLAIM_EXTRACTOR} from './claims';
import {nextRematch} from './rematch';
import {prepareSemanticShortlist} from './shortlist';
import {fallbackEditorialPlan,editorialPlanWireSchemaFor} from './editorial-plan';
import {compactEditorialInput} from './editorial-transport';
it('retained body-only corpus upgrades through at most two ordinary rematches per invocation, without new evidence or duplicate requests',async()=>{
 const ctx=await createIntakeDatabase();try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);
  for(let i=1;i<=3;i++){await acceptEvidence(store,i,`Company ${i} announced a new computer.`,'publisher-1','2026-10-03T12:30:00Z','en','2026-10-03T12:20:00Z',`Company ${i} releases a new AI system.`);await processEvidenceIntelligence(store,JSON.stringify(['REASSESS',`observation-${i}`,'']),'2026-10-03T12:30:00Z')}
  expect(await hasUnscheduledExtractionUpgrade(store,'feed-1')).toBe(false);
  // Offline rollout fixture represents immutable documents from the old policy.
  await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='source_documents'").run();
  expect(await hasUnscheduledExtractionUpgrade(store,'feed-1')).toBe(true);
  const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const},before=await store.currentEvidence('feed-1');
  await feedTransact(store,'feed-1',tx=>scheduleExtractionUpgrades(tx,window,window.end));let requests=await store.list<any>('feed-1','rematch_requests');expect(requests.filter(r=>r.policyVersion.includes(CLAIM_EXTRACTOR))).toHaveLength(2);
  await feedTransact(store,'feed-1',tx=>scheduleExtractionUpgrades(tx,window,window.end));await feedTransact(store,'feed-1',tx=>scheduleExtractionUpgrades(tx,window,window.end));requests=await store.list<any>('feed-1','rematch_requests');expect(requests.filter(r=>r.policyVersion.includes(CLAIM_EXTRACTOR))).toHaveLength(3);expect(await store.currentEvidence('feed-1')).toEqual(before);expect(await hasUnscheduledExtractionUpgrade(store,'feed-1')).toBe(false);
  const upgrade=requests.find(r=>r.policyVersion.includes(CLAIM_EXTRACTOR));expect(nextRematch(upgrade,[{requestId:upgrade.id,state:'EXHAUSTED',attempt:3} as any],window.end)).toBeUndefined();expect(await store.read('feed-1','rematch_requests',upgrade.id)).toEqual(upgrade);
  const scope=await prepareSemanticShortlist(store,'feed-1',window,window.end);expect(scope.candidates.every(c=>c.flags.includes('TITLE_EXTRACTION_PENDING'))).toBe(true);expect(fallbackEditorialPlan(scope).stories.every(s=>s.decision==='DEFER')).toBe(true);
  const wire=editorialPlanWireSchemaFor(compactEditorialInput({candidates:scope.candidates,ledger:scope.ledger,obligations:scope.obligations} as any).state);expect(wire.properties.stories.items.anyOf.every(b=>b.properties.decision.enum.join(',')==='DEFER')).toBe(true);
  await processEvidenceIntelligence(store,upgrade.jobId,'2026-10-03T13:10:00Z',undefined,'title-policy-upgrade');expect((await store.list<any>('feed-1','claim_mentions')).some(m=>m.evidenceRevisionId===upgrade.evidenceRevisionId&&m.span.field==='title')).toBe(true);
 }finally{await ctx.dispose()}
},30000);
