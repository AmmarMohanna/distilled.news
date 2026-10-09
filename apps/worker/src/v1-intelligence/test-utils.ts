import {createCandidateIntakePort} from '../v1-intake/intake';
import {acceptAcquiredContent} from '../v1-intake/evidence';
import {V1IntakeStore} from '../v1-intake/store';
import {batchFixture,testPolicy} from '../v1-intake/test-utils';
import {processEvidenceIntelligence} from './engine';
import {V1FeedStore} from './store';
import type {FeedRecord} from './types';
export const feedFixture:FeedRecord={id:'feed-1',ownerId:'owner-1',title:'Lebanon news',interests:['banking reform'],geography:['Lebanon'],outputLanguage:'en',briefingFrequency:'DAILY',paused:false,revision:1,createdAt:testPolicy.now(),updatedAt:testPolicy.now()};
export async function acceptEvidence(store:V1FeedStore,sequence=1,body='Lebanon Parliament approved banking reform legislation.',publisherId='publisher-1',acceptedAt=testPolicy.now(),language:string|null='en',publishedAt:string|null='2026-10-03T10:00:00Z',title?:string) {
 const policy={...testPolicy,now:()=>acceptedAt};
 const intake=new V1IntakeStore(store.db),batch=batchFixture(sequence),key=`item-${sequence}`;
 batch.observations[0]={...batch.observations[0],sourceItemKey:key,publisherId};batch.proposals[0]={...batch.proposals[0],sourceItemKey:key};
 const result=await createCandidateIntakePort(intake,policy).acceptBatch(batch);
 await acceptAcquiredContent(intake,{id:`content-${sequence}`,feedId:'feed-1',candidateId:result.receipts[0].candidateItemId!,sourceObservationId:`observation-${sequence}`,representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',title,body,language:language??undefined,publishedAt:publishedAt??undefined,acquiredAt:acceptedAt,acquisitionMethod:'supplied_payload'},policy);
}
export async function seedIntelligence(store:V1FeedStore,sequence=1,body='Lebanon Parliament approved banking reform legislation.',publisherId='publisher-1',acceptedAt=testPolicy.now(),language:string|null='en',publishedAt:string|null='2026-10-03T10:00:00Z') {
 await acceptEvidence(store,sequence,body,publisherId,acceptedAt,language,publishedAt);
 return processEvidenceIntelligence(store,JSON.stringify(['REASSESS',`observation-${sequence}`,'']),acceptedAt);
}
