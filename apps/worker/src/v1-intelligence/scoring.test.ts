import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
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
 expect(salience?.targetVersionId).toBe(candidate.targetVersionId);expect(score?.targetVersionId).toBe(candidate.targetVersionId);expect(score?.windowStart).toBe(window.start);
 expect(await store.list('feed-1','selections')).toHaveLength(1);
});
it('publication windows are distinct assessments and weekly selects storyline versions rather than multiplying daily',async()=>{
 await seedIntelligence(store);
 await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,testPolicy.now());
 const weekly=await scoreAndSelect(store,'feed-1',{start:'2026-09-28T00:00:00Z',end:'2026-10-05T00:00:00Z',kind:'WEEKLY'},DEFAULT_BRIEFING_BUDGET,testPolicy.now());
 const candidate=await store.read<BriefingCandidate>('feed-1','candidates',weekly.selectedCandidateIds[0]);expect(candidate?.targetType).toBe('STORYLINE');
 expect(await store.list('feed-1','window_scores')).toHaveLength(2);
});
