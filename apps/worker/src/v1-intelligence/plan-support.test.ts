import {it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {prepareSemanticShortlist} from './shortlist';
import {prepareEditorialPlan} from './editorial-plan';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection} from './publication';
import {projectEditionLedger} from './ledger';
it('semantic plan retains old attribution support when new-understanding-only acquisition would omit it',async()=>{
 const context=await createIntakeDatabase();try{
 await seedIntakeScope(new V1IntakeStore(context.db));const store=new V1FeedStore(context.db);await store.registerFeed(feedFixture);
 await seedIntelligence(store,1,'The president said Parliament approved banking reform. Officials described the allegations as deeply disturbing.');
 const first={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const},short1=await prepareSemanticShortlist(store,'feed-1',first,first.end),plan1=await prepareEditorialPlan(store,short1,DEFAULT_BRIEFING_BUDGET,first.end),sel1=await scoreAndSelect(store,'feed-1',first,DEFAULT_BRIEFING_BUDGET,first.end,undefined,plan1),edition=await publishSelection(store,'feed-1',sel1.id,{now:()=>first.end});await projectEditionLedger(store,'feed-1',edition.id);
 const old=(await store.currentEvidence('feed-1'))[0].revision.id;
 await seedIntelligence(store,2,'The president said Parliament approved banking reform after amendments.','publisher-b','2026-10-03T13:30:00Z');
 const later={start:'2026-10-03T13:00:00Z',end:'2026-10-03T14:00:00Z',kind:'HOURLY' as const},short2=await prepareSemanticShortlist(store,'feed-1',later,later.end),plan2=await prepareEditorialPlan(store,short2,DEFAULT_BRIEFING_BUDGET,later.end);
 expect(short2.candidates).toHaveLength(1);expect(short2.candidates[0].facts.some(f=>f.attribution&&f.evidenceRevisionIds.includes(old))).toBe(true);
 const sel2=await scoreAndSelect(store,'feed-1',later,DEFAULT_BRIEFING_BUDGET,later.end,undefined,plan2);expect(sel2.selectedCandidateIds).toHaveLength(1);expect(sel2.evidenceByCandidate[sel2.selectedCandidateIds[0]]).toContain(old);
 }finally{await context.dispose()}
},45000);
