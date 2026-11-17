import {hashContent} from '../packages/contracts/src/index';
import {batchFixture,testPolicy} from '../apps/worker/src/v1-intake/test-utils';
import {createCandidateIntakePort} from '../apps/worker/src/v1-intake/intake';
import {acceptAcquiredContent} from '../apps/worker/src/v1-intake/evidence';
import {V1IntakeStore} from '../apps/worker/src/v1-intake/store';
import type {V1FeedStore} from '../apps/worker/src/v1-intelligence/store';

/** Original article bytes and URL are immutable. Observation/import time is
 * explicitly this local replay, not a fabricated new publication/event time. */
export async function importSavedNews(store:V1FeedStore,source:{id:string;title:string;body:string},sequence:number,importedAt:string,metadata:{canonicalUrl:string;publishedAt?:string}){
 if(!/^https:\/\/techcrunch\.com\//.test(metadata.canonicalUrl))throw Error('SAVED_NEWS_CANONICAL_SOURCE_REQUIRED');
 const policy={...testPolicy,now:()=>importedAt},batch=batchFixture(sequence),intake=new V1IntakeStore(store.db),sourceItemKey='saved:'+source.id;
 const hash=await hashContent({representation:'FULL_ARTICLE',title:source.title,body:source.body});
 batch.coverage={...batch.coverage,createdAt:importedAt,status:'COMPLETE',continuationState:'EXHAUSTED',continuationToken:undefined};
 batch.observations[0]={...batch.observations[0],sourceItemKey,representation:'FULL_ARTICLE',contentHash:hash,canonicalUrl:metadata.canonicalUrl,publisherId:'techcrunch.com',titleHint:source.title,publishedAtHint:metadata.publishedAt,languageHint:'en',observedAt:importedAt};
 batch.proposals[0]={...batch.proposals[0],sourceItemKey,representation:'FULL_ARTICLE',url:metadata.canonicalUrl,titleHint:source.title,publishedAtHint:metadata.publishedAt,languageHint:'en',discoveredAt:importedAt};
 const result=await createCandidateIntakePort(intake,policy).acceptBatch(batch);
 await acceptAcquiredContent(intake,{id:'saved-content-'+sequence,feedId:'feed-1',candidateId:result.receipts[0].candidateItemId!,sourceObservationId:'observation-'+sequence,representation:'FULL_ARTICLE',contentCompleteness:'COMPLETE',title:source.title,body:source.body,language:'en',publishedAt:metadata.publishedAt,canonicalUrl:metadata.canonicalUrl,acquiredAt:importedAt,acquisitionMethod:'supplied_payload'},policy);
}
