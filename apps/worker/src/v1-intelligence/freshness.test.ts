import {afterEach,beforeEach,expect,it} from 'vitest';
import {assessFreshness} from './freshness';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection} from './publication';
import {prepareSemanticShortlist} from './shortlist';
const win={start:'2026-10-06T11:00:00Z',end:'2026-10-06T12:00:00Z'};
it('distinguishes source publication time from observation time',()=>{
 const old=assessFreshness([{publishedAt:'2026-10-02T09:00:00Z',acceptedAt:'2026-10-06T11:30:00Z'}],win);
 expect(old.state).toBe('STALE');expect(old.developmentAt).toBe('2026-10-02T09:00:00.000Z');expect(old.firstSeenByFeedAt).toBe('2026-10-06T11:30:00.000Z');
 expect(assessFreshness([{publishedAt:'2026-10-06T10:30:00Z',acceptedAt:'2026-10-06T11:30:00Z'}],win).state).toBe('CURRENT');
 expect(assessFreshness([{acceptedAt:'2026-10-06T11:30:00Z'}],win).state).toBe('UNKNOWN');
 expect(assessFreshness([{publishedAt:'2026-10-02T09:00:00Z',acceptedAt:'x'},{publishedAt:'2026-10-06T10:59:00Z',acceptedAt:'x'}],win).state).toBe('CURRENT');
});
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
const first={start:'2026-10-03T11:00:00Z',end:'2026-10-03T12:01:00Z',kind:'HOURLY' as const};
const later={start:'2026-10-06T11:00:00Z',end:'2026-10-06T12:00:00Z',kind:'HOURLY' as const};
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>ctx?.dispose());
it('an old article newly ingested is labelled and demoted but never silently suppressed',async()=>{
 await seedIntelligence(store,1,'Lebanon Parliament approved banking reform legislation.');
 await publishSelection(store,'feed-1',(await scoreAndSelect(store,'feed-1',first,DEFAULT_BRIEFING_BUDGET,testPolicy.now())).id,{now:testPolicy.now});
 await seedIntelligence(store,2,'Ukraine opened a new grain corridor on Monday.','publisher-2','2026-10-06T11:30:00Z','en','2026-10-02T09:00:00Z');
 const shortlist=await prepareSemanticShortlist(store,'feed-1',later,later.end);
 const c=shortlist.candidates.find(c=>c.evidenceRevisionIds.length)!;
 expect(c.fallbackEditorial.decision).toBe('INCLUDE');expect(c.fallbackEditorial.reasonCodes).toEqual(['OLD_RECAP']);expect(c.flags).toContain('OLD_RECAP');expect(c.priority).toBeLessThan(.6);
 expect(c.facts.every(f=>f.reportTime==='2026-10-02T09:00:00Z')).toBe(true);
 const selected=await scoreAndSelect(store,'feed-1',later,DEFAULT_BRIEFING_BUDGET,later.end);
 expect(selected.selectedCandidateIds).toHaveLength(1);
},30000);
it('the same article with an unknown or current publication time is still reported, and a first edition is not emptied',async()=>{
 await seedIntelligence(store,1,'Ukraine opened a new grain corridor on Monday.','publisher-1','2026-10-06T11:30:00Z','en',null);
 expect((await scoreAndSelect(store,'feed-1',later,DEFAULT_BRIEFING_BUDGET,later.end)).selectedCandidateIds).toHaveLength(1);
},30000);
it('a stale-dated first edition is kept because the reader was told nothing before',async()=>{
 await seedIntelligence(store,1,'Ukraine opened a new grain corridor on Monday.','publisher-1','2026-10-06T11:30:00Z','en','2026-10-02T09:00:00Z');
 expect((await scoreAndSelect(store,'feed-1',later,DEFAULT_BRIEFING_BUDGET,later.end)).selectedCandidateIds).toHaveLength(1);
},30000);
it('an old-dated article that changes a previously communicated value is still a meaningful update',async()=>{
 await seedIntelligence(store,1,'Officials said 12 people died in the flood.');
 await publishSelection(store,'feed-1',(await scoreAndSelect(store,'feed-1',first,DEFAULT_BRIEFING_BUDGET,testPolicy.now())).id,{now:testPolicy.now});
 await seedIntelligence(store,2,'Officials said 40 people died in the flood.','publisher-2','2026-10-06T11:30:00Z','en','2026-10-02T09:00:00Z');
 const c=(await prepareSemanticShortlist(store,'feed-1',later,later.end)).candidates.flatMap(c=>c);
 expect(c.some(x=>x.novelty==='OLD_RECAP')).toBe(false);
},30000);
it('noveltyClass lets epistemic effects outrank lexical reasons',async()=>{
 const {noveltyClass}=await import('./editorial');
 expect(noveltyClass('ALREADY_COMMUNICATED',['RETRACTS'])).toBe('RETRACTS');
 expect(noveltyClass('CORROBORATION_ONLY')).toBe('CORROBORATION_ONLY');
 expect(noveltyClass('MAJOR_STATE_CHANGE')).toBe('CHANGES_STATE');
});
