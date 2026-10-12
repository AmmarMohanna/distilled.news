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

export const syntheticModelAdmission=()=>({fits:true,requestBytes:0,inputTokenUpperBound:0,maxOutputTokens:32768,reservationCostUsd:.02});
export async function testDurableSemanticOperation<T>(...args:Parameters<typeof import('./semantic-operations').durableSemanticOperation<T>>){
 const {durableSemanticOperation}=await import('./semantic-operations');
 const {reconcileLegacyModelSpending}=await import('./model-spending');
 const store=args[0],rows=await store.db.prepare("SELECT kind,id FROM v1_feed_documents WHERE kind IN ('semantic_intents','salience_intents','model_intents') AND NOT EXISTS(SELECT 1 FROM v1_model_spending_reservations r WHERE r.id=v1_feed_documents.kind||':'||v1_feed_documents.id)").all<{kind:'semantic_intents'|'salience_intents'|'model_intents';id:string}>();
 for(const row of rows.results)await reconcileLegacyModelSpending(store.db,row.kind,row.id,'test-only-account');
 args[5]={reservationCostUsd:.02,...args[5]};return durableSemanticOperation<T>(...args);
}
