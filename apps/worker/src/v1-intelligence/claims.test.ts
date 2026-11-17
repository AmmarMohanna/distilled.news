import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,batchFixture,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {acceptAcquiredContent} from '../v1-intake/evidence';
import {V1FeedStore} from './store';
import {processEvidenceIntelligence} from './engine';
import {feedFixture} from './test-utils';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,intake:V1IntakeStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();intake=new V1IntakeStore(ctx.db);await seedIntakeScope(intake);store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>ctx.dispose());
async function acquired(body:string){const batch=batchFixture(1),result=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batch);await acceptAcquiredContent(intake,{id:'acquired',feedId:'feed-1',candidateId:result.receipts[0].candidateItemId!,sourceObservationId:'observation-1',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',body,publishedAt:testPolicy.now(),acquiredAt:testPolicy.now(),acquisitionMethod:'supplied_payload'},testPolicy);return JSON.stringify(['REASSESS','observation-1',''])}
it('persists idempotent exact source spans with decimal quantities, attribution and uncertainty',async()=>{
 const body='Previously, officials expected a decision. Officials said “12.5 million people may be affected.” The team won 3–2.';
 const job=await acquired(body);await processEvidenceIntelligence(store,job,testPolicy.now());
 const mentions=await store.list<any>('feed-1','claim_mentions' as any);expect(mentions.length).toBeGreaterThanOrEqual(3);
 for(const mention of mentions){expect(body.slice(mention.span.start,mention.span.end)).toBe(mention.sourceText);expect(mention.evidenceRevisionId).toBeDefined();expect(mention.extractorVersion).toBeDefined();expect(mention.extractionPolicyVersion).toBeDefined();expect(mention.reportTime).toBe(testPolicy.now())}
 const quoted=mentions.find(m=>m.sourceText.includes('12.5'));expect(quoted.quantities.some((q:any)=>q.text==='12.5 million')).toBe(true);expect(quoted.certainty.hedges).toContain('may');expect(quoted.attribution).toContain('Officials');expect(quoted.reportingRole).toBe('QUOTED_CLAIM');
 expect(mentions.some(m=>m.reportingRole==='BACKGROUND_RECAP')).toBe(true);
 await processEvidenceIntelligence(new V1FeedStore(ctx.db),job,testPolicy.now());expect(await store.list('feed-1','claim_mentions' as any)).toEqual(mentions);
 expect(await store.list('feed-1','source_documents' as any)).toHaveLength(1);
 await expect(store.read('foreign','claim_mentions' as any,mentions[0].id)).rejects.toMatchObject({code:'SCOPE_DENIED'});
});
