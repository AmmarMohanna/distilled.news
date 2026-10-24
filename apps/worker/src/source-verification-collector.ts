import {ApifySourceProvider,TwitterApiIoProvider,DurableProviderHttp,R2SourcePayloadStore,sourceSqlFromD1,type ProviderItem} from '@distilled/connectors';
import {sha256} from '@distilled/contracts';
import type {Env} from './types';
import {prepareProductSourceInput} from './product-feeds';
import {productConnectorSource} from './connector-source';

export interface SourceVerificationScope {ownerAccountId:string;providerFetcher?:typeof fetch;minimumAssessmentValidityMs?:number;telegramTimeoutMs?:number}
/** Verification uses the same actor adapter, durable reservations, private R2
 * payloads and uncertain-submission fences as ingestion. Owner-scoped hourly
 * identities let the final save reuse a recommendation's provider evidence. */
export async function collectVerificationEvidence(env:Env,input:string,scope:SourceVerificationScope,options?:{purpose:'topic_publishers'}):Promise<ProviderItem[]> {
 if(!scope.ownerAccountId||!env.SOURCE_DAILY_BUDGET_USD)throw Error('PAID_VERIFICATION_NOT_AUTHORIZED');
 const plan=prepareProductSourceInput(input),definition=productConnectorSource({provider:plan.detected.provider,kind:plan.detected.kind,source_url:plan.sourceUrl??null,input:plan.input,actor_id:plan.actorId});
 if(!definition)throw Error('UNSUPPORTED_SOURCE');
 const family=definition.source.family;
 if(options&&family!=='google_news')throw Error('UNSUPPORTED_VERIFICATION_PURPOSE');
 const limit=options?60:10;
 const limits=JSON.parse(env.SOURCE_PROVIDER_BUDGETS_JSON??'{}'),ceilings=JSON.parse(env.SOURCE_OPERATION_CEILINGS_JSON??'{}');
 const twitterFunded=!!env.TWITTERAPI_IO_API_KEY&&limits.x_twitterapi_io>0&&ceilings.twitterApiIo>0;
 const provider=family==='google_news'?'google_apify':family.startsWith('x_')?(twitterFunded?'x_twitterapi_io':'x_apify'):family.startsWith('linkedin_')?'linkedin_apify':undefined;
 if(!provider||(provider==='x_twitterapi_io'?!env.TWITTERAPI_IO_API_KEY:!env.APIFY_API_TOKEN))throw Error('COLLECTOR_UNAVAILABLE');
 const ceiling=provider==='x_twitterapi_io'?ceilings.twitterApiIo:ceilings.apify;
 if(!(limits[provider]>0&&ceiling>0))throw Error('BUDGET_EXCEEDED');
 const sourceId=await sha256(JSON.stringify(definition.source));
 const owner=await sha256(scope.ownerAccountId),sourceScope={feedId:`verification:${owner}`,feedSourceId:`verification:${owner}:${sourceId}`,sourceId};
 const hour=Math.floor(Date.now()/3600000),runId=await sha256(JSON.stringify([sourceScope,hour,options?'topic-publisher-discovery-v1-limit60':'source-verification-v2-detached-fetch']));
 const paid=new DurableProviderHttp(sourceSqlFromD1(env.DB),new R2SourcePayloadStore(env.RAW_ARCHIVE),scope.providerFetcher??fetch,4_000_000,15_000,undefined,limits,{limitUsd:Number(env.SOURCE_DAILY_BUDGET_USD),timeZone:env.SOURCE_BUDGET_TIME_ZONE??'UTC'});
 await paid.configureLimits(limits);
 const adapter=provider==='x_twitterapi_io'?new TwitterApiIoProvider(paid,async()=>env.TWITTERAPI_IO_API_KEY,ceiling):new ApifySourceProvider(provider,[family],paid,async()=>env.APIFY_API_TOKEN,ceiling);
 let continuation: {providerId:string;token:string}|undefined;
 // Actor status reads get distinct durable request IDs, while every request
 // reuses the one immutable actor start. No restart on an uncertain outcome.
 const deadline=Date.now()+35_000;
 for(let page=0;page<12&&Date.now()<deadline;page++){
  const result=await adapter.fetch({scope:sourceScope,runId,source:definition.source,requestedBounds:{},limit,continuation},
   {...sourceScope,id:continuation?`${runId}:read:${Math.floor(Date.now()/2000)}`:runId,sequence:page+1,startedAt:new Date(hour*3600000).toISOString(),configurationKey:'verification-v1'});
  const items=result.items.filter(item=>item.identityValid&&(item.body||item.title));
  if(items.length)return items;
  if(!result.continuationToken)return [];
  continuation={providerId:provider,token:result.continuationToken};
  await new Promise(resolve=>setTimeout(resolve,1500));
 }
 throw Error('COLLECTOR_STILL_RUNNING');
}
