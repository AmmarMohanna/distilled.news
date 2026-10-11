import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET,targets} from './scoring';
import {acceptEvidence} from './test-utils';
import {processEvidenceIntelligence} from './engine';
import {FeedTransaction} from './store';
import type {BriefingCandidate,WindowScore,EventSalienceAssessment} from '@distilled/contracts';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
const window={start:'2026-10-03T00:00:00Z',end:'2026-10-04T00:00:00Z',kind:'DAILY' as const};
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>ctx.dispose());
it('persists exact referenced assessments and reproducible bounded selection across fresh stores',async()=>{
 await seedIntelligence(store);
 const a=await scoreAndSelect(store,feedFixture.id,window,DEFAULT_BRIEFING_BUDGET,testPolicy.now());
 const b=await scoreAndSelect(new V1FeedStore(ctx.db),feedFixture.id,window,DEFAULT_BRIEFING_BUDGET,testPolicy.now());expect(a).toEqual(b);expect(a.selectedCandidateIds).toHaveLength(1);
 const candidate=(await store.list<BriefingCandidate>('feed-1','candidates'))[0];
 const salience=await store.read<EventSalienceAssessment>('feed-1','salience',candidate.salienceAssessmentId),score=await store.read<WindowScore>('feed-1','window_scores',candidate.windowScoreId);
 expect(salience?.targetVersionId).toBe(candidate.targetVersionId);expect(score?.targetVersionId).toBe(candidate.targetVersionId);expect(score?.windowStart).toBe(new Date(window.start).toISOString());
 expect((await scoreAndSelect(store,feedFixture.id,{...window,start:new Date(window.start).toISOString(),end:new Date(window.end).toISOString()},DEFAULT_BRIEFING_BUDGET,testPolicy.now())).id).toBe(a.id);
 expect(await store.list('feed-1','selections')).toHaveLength(1);
});
it('publication windows are distinct assessments and weekly selects storyline versions rather than multiplying daily',async()=>{
 await seedIntelligence(store);
 await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,testPolicy.now());
 const weekly=await scoreAndSelect(store,'feed-1',{start:'2026-09-28T00:00:00Z',end:'2026-10-05T00:00:00Z',kind:'WEEKLY'},DEFAULT_BRIEFING_BUDGET,testPolicy.now());
 const candidate=await store.read<BriefingCandidate>('feed-1','candidates',weekly.selectedCandidateIds[0]);expect(candidate?.targetType).toBe('STORYLINE');
 expect(await store.list('feed-1','window_scores')).toHaveLength(2);
});

it('late canonical review does not move admitted evidence out of its closed window',async()=>{
 const admitted='2026-10-03T23:59:59Z',processed='2026-10-04T00:01:00Z';
 await acceptEvidence(store,1,'Lebanon Parliament approved banking reform legislation.','publisher-1',admitted);
 await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),processed);
 const result=await targets(new FeedTransaction(store,await store.snapshot('feed-1')),window);
 expect(result).toHaveLength(1);expect(result[0].updatedAt).toBe(processed);
},30000);
it('evidence admitted at the cutoff cannot leak in through an earlier canonical timestamp',async()=>{
 await acceptEvidence(store,1,'Lebanon Parliament approved banking reform legislation.','publisher-1',window.end);
 await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),'2026-10-03T23:59:59Z');
 expect(await targets(new FeedTransaction(store,await store.snapshot('feed-1')),window,true)).toHaveLength(0);
},30000);
