import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy,scopeFixture,batchFixture} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {acceptAcquiredContent} from '../v1-intake/evidence';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET,targets} from './scoring';
import {acceptEvidence} from './test-utils';
import {processEvidenceIntelligence} from './engine';
import {FeedTransaction,feedTransact} from './store';
import {publishSelection} from './publication';
import {projectEditionLedger} from './ledger';
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

it('a later independent report must not hide the earlier eligible Event version at a closed cutoff',async()=>{
 await seedIntelligence(store,1,'Lebanon Parliament approved banking reform legislation after a debate on Tuesday.','publisher-one','2026-10-03T23:50:00Z');
 const early=(await store.list<import('@distilled/contracts').EventVersion>('feed-1','event_versions'))[0];
 const intake=new V1IntakeStore(ctx.db),late='2026-10-04T00:10:00Z',policy={...testPolicy,now:()=>late};
 await intake.registerScope({...scopeFixture,feedSourceId:'feed-source-2',sourceId:'source-2'});
 const batch=batchFixture(2);batch.coverage.feedSourceId='feed-source-2';
 batch.observations[0]={...batch.observations[0],feedSourceId:'feed-source-2',sourceId:'source-2',publisherId:'publisher-two',observedAt:late};
 batch.proposals[0]={...batch.proposals[0],feedSourceId:'feed-source-2',sourceId:'source-2'};
 const response=await createCandidateIntakePort(intake,policy).acceptBatch(batch);
 await acceptAcquiredContent(intake,{id:'content-2',feedId:'feed-1',candidateId:response.receipts[0].candidateItemId!,sourceObservationId:'observation-2',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',body:'Lebanon legislature passed banking reform law following negotiations.',language:'en',acquiredAt:late,acquisitionMethod:'supplied_payload'},policy);
 await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-2','']),late);
 expect(await store.list('feed-1','events')).toHaveLength(1);
 const result=await targets(new FeedTransaction(store,await store.snapshot('feed-1')),window);
 expect(result).toHaveLength(1);expect(result[0].id).toBe(early.id);
 expect(result[0].evidence.map(r=>r.sourceObservationId)).toEqual(['observation-1']);
 const selected=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,late);
 expect(selected.selectedCandidateIds).toHaveLength(1);
 const edition=await publishSelection(store,'feed-1',selected.id,{now:()=>late});
 expect(edition.eventVersionIds).toEqual([early.id]);
 expect(edition.evidenceRevisionIds).toEqual(result[0].evidence.map(e=>e.id));
 expect(await publishSelection(new V1FeedStore(ctx.db),'feed-1',selected.id,{now:()=>late})).toEqual(edition);
 expect(await store.list('feed-1','editions')).toHaveLength(1);
 await projectEditionLedger(store,'feed-1',edition.id);
 const ledger=await store.list<any>('feed-1','ledger_entries');
 expect(ledger.length).toBeGreaterThan(0);
 expect(ledger.every(entry=>entry.editionId===edition.id)).toBe(true);
 expect(ledger.flatMap(entry=>entry.evidenceRevisionIds)).not.toContain((await store.currentEvidence('feed-1')).find(e=>e.revision.sourceObservationId==='observation-2')!.revision.id);
},30000);

it('cutoff publication cannot resurrect a selected version after its live Event is withdrawn',async()=>{
 await seedIntelligence(store);
 const selected=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,testPolicy.now());
 await feedTransact(store,'feed-1',async tx=>{
  const root=(await tx.list<import('./types').EventRecord>('events'))[0];
  const prior=(await tx.read<import('@distilled/contracts').EventVersion>('event_versions',root.currentVersionId))!;
  const withdrawn={...prior,id:crypto.randomUUID(),version:prior.version+1,type:'WITHDRAWN' as const,state:'',confidence:0};
  await tx.write('event_versions',withdrawn.id,withdrawn);
  await tx.write('events',root.id,{...root,currentVersionId:withdrawn.id});
 });
 await expect(publishSelection(store,'feed-1',selected.id,{now:testPolicy.now})).rejects.toMatchObject({code:'SCOPE_DENIED'});
 expect(await store.list('feed-1','editions')).toHaveLength(0);
 expect(await store.list('feed-1','model_intents')).toHaveLength(0);
},30000);
