import {detectSourceInput,TESTED_ACTORS,SourceProviderError} from '@distilled/connectors';
import {telegramExecution} from './telegram-execution';
import type {Env,Repository} from './types';
import type {BriefingConfig,BriefingEdition} from '@distilled/core';
import {WorkerPublicSourceFetch} from './public-source-fetch';
import {enrollV1Source} from './v1-intelligence/product';
import {publicV1Editions} from './v1-intelligence/public-read';
import {productConnectorSource} from './connector-source';
import {discoverPublicRssFeed} from './product-feed-discovery';
import {pendingWindowCollections} from './connector-publication-coverage';

export async function productPublicationState(env:Env,feedId:string):Promise<'waiting'|'checking'|'quiet'|'failed'|'published'|'correction_pending'|'setup_required'|'service_blocked'> {
 const pending=await env.DB.prepare("SELECT o.id FROM v1_feed_documents o WHERE o.feed_id=? AND o.kind='correction_obligations' AND NOT EXISTS(SELECT 1 FROM v1_feed_documents r WHERE r.feed_id=o.feed_id AND r.kind='correction_resolutions' AND json_extract(r.json,'$.obligationId')=o.id) LIMIT 1").bind(feedId).first();
 if(pending)return 'correction_pending';
 const setup=await env.DB.prepare("SELECT id FROM v1_feed_documents WHERE feed_id=? AND kind='briefing_requests' AND json_extract(json,'$.state')='PENDING' AND json_extract(json,'$.reason')='MODEL_SETUP_REQUIRED' LIMIT 1").bind(feedId).first();
 if(setup)return 'setup_required';
 const request=await env.DB.prepare("SELECT id,json_extract(json,'$.state') AS state,json_extract(json,'$.result') AS result,json_extract(json,'$.reason') AS reason,json_extract(json,'$.coverage.state') AS coverage FROM v1_feed_documents WHERE feed_id=? AND kind='briefing_requests' ORDER BY json_extract(json,'$.createdAt') DESC,id DESC LIMIT 1").bind(feedId).first<{id:string;state:string;result?:string;reason?:string;coverage?:string}>();
 if(!request)return 'waiting';
 if(request.state==='PENDING'&&/^ACCOUNT_(?:AUTHORIZATION|RECOVERY_SCOPE|RESOURCE)/.test(request.reason??''))return 'service_blocked';
 if(request.state==='FAILED')return 'failed';
 if(request.state!=='DONE')return 'checking';
 const edition=await env.DB.prepare("SELECT id FROM v1_feed_documents WHERE feed_id=? AND kind='editions' AND id=?").bind(feedId,request.id).first();
 return edition?'published':request.coverage==='INCOMPLETE'?'failed':request.result==='QUIET'?'quiet':'checking';
}

export interface PublicationProgress {stage:'COLLECTING'|'PROCESSING'|'PUBLISHING';collection?:{pending:number;sources:string[]};acquisition:{completed:number;total:number;failed:number;deferred?:number};review:{completed:number;total:number;failed:number};pending:number}
/** Read-only progress for the same closed boundary used by publication admission.
 * Later polling arrivals cannot continually enlarge this request's displayed backlog. */
export async function productPublicationProgress(env:Env,feedId:string):Promise<PublicationProgress|undefined> {
 const request=await env.DB.prepare("SELECT json_extract(json,'$.window.end') AS window_end FROM v1_feed_documents WHERE feed_id=? AND kind='briefing_requests' AND json_extract(json,'$.state')='PENDING' ORDER BY json_extract(json,'$.window.end'),id LIMIT 1").bind(feedId).first<{window_end:string|null}>();
 const end=request?.window_end??undefined;
 if(!end)return undefined;
 const rows=await env.DB.prepare("SELECT json_extract(j.json,'$.kind') AS kind,json_extract(j.json,'$.state') AS state,COALESCE(json_extract(j.json,'$.exhausted'),0) AS exhausted,COUNT(*) AS n FROM v1_jobs j JOIN v1_intake_scopes s ON s.id=j.feed_source_id LEFT JOIN v1_inputs i ON i.id=json_extract(j.json,'$.observationId') AND i.feed_source_id=j.feed_source_id WHERE s.feed_id=? AND json_extract(s.json,'$.enabled')=1 AND json_extract(j.json,'$.kind') IN ('ACQUIRE','REASSESS') AND (json_extract(i.json,'$.observation.observedAt') IS NULL OR julianday(json_extract(i.json,'$.observation.observedAt'))<julianday(?)) GROUP BY 1,2,3").bind(feedId,end).all<{kind:string;state:string;exhausted:number;n:number}>();
 const acquisition:PublicationProgress['acquisition']={completed:0,total:0,failed:0},review={completed:0,total:0,failed:0};let pending=0;
 for(const row of rows.results){if(row.kind==='ACQUIRE'&&row.state==='DEFERRED'){acquisition.deferred=(acquisition.deferred??0)+row.n;continue;}const counts=row.kind==='ACQUIRE'?acquisition:review;counts.total+=row.n;if(row.state==='DONE')counts.completed+=row.n;else if(row.state==='FAILED'||row.exhausted)counts.failed+=row.n;else if(row.state==='PENDING'||row.state==='RUNNING')pending+=row.n;}
 const collection=env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'?await pendingWindowCollections(env.DB,feedId,end,env.BRIEFING_ENGINE==='v3'):undefined;
 return {stage:collection?.pending?'COLLECTING':pending?'PROCESSING':'PUBLISHING',...(collection?.pending?{collection}:{}),acquisition,review,pending};
}

// This deployment opt-in admits only sources explicitly approved by an owner.
// Owner approval controls source admission; paid-provider ceilings still apply.
export async function productRuntimeEnv(env:Env):Promise<Env> {
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true')return env;
 if(env.PRODUCT_FEEDS_ENABLED!=='true')return env;
 const staticIds=(env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean);
 const rows=await env.DB.prepare("SELECT s.id FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id WHERE s.collection_owner='connector' AND s.enabled=1 AND b.paused=0 AND a.disabled_at IS NULL ORDER BY s.id").all<{id:string}>();
 const ids=[...new Set([...staticIds,...rows.results.map(r=>r.id)])];
 return {...env,V1_DOWNSTREAM_FEED_SOURCE_IDS:ids.join(',')};
}

export function prepareProductSourceInput(input:string) {
 const detected=detectSourceInput(input.trim());
 if(detected.kind==='google_news'&&new URL(detected.sourceUrl).searchParams.get('q')!.length>256)throw new Error('Google News query is too long.');
 if(detected.kind==='apify_actor')throw new Error('This source type is not available in the feed editor yet.');
 // Telegram identity is resolved by the authenticated private execution service
 // during approval. Parsing a username alone must never count as verification.
 if(detected.kind==='telegram_channel')return {detected,actorId:undefined,sourceUrl:detected.sourceUrl,input:detected.input,canonicalUrl:detected.sourceUrl};
 const actorId=detected.provider==='apify'?(detected.kind==='x_profile'||detected.kind==='x_search'?TESTED_ACTORS.x:TESTED_ACTORS[detected.kind]):undefined;
 const sourceUrl=detected.sourceUrl?new URL(detected.sourceUrl).href:undefined;
 if(detected.kind==='rss_feed'||detected.kind==='web_page')new WorkerPublicSourceFetch(sourceUrl!);
 const normalizedInput=detected.kind==='rss_feed'?`rss: ${sourceUrl}`:detected.kind==='web_page'?sourceUrl!:detected.input;
 const definition=productConnectorSource({provider:detected.provider,kind:detected.kind,source_url:sourceUrl??null,input:normalizedInput,actor_id:actorId});
 if(!definition)throw new Error('This source configuration is not supported by the connector runtime.');
 return {detected,actorId,sourceUrl,input:normalizedInput,canonicalUrl:definition.canonicalUrl};
}

/** Resolve a website to an advertised RSS feed before persisting its approval. */
export class ProductSourceApprovalError extends Error {
 constructor(message:string,readonly status:400|503=503){super(message);}
}
async function verifyTelegramApproval(env:Env,username:string){
 if(!env.SOURCE_EXECUTION_SERVICE||!env.SOURCE_EXECUTION_URL||!env.SOURCE_EXECUTION_TOKEN)throw new ProductSourceApprovalError('Telegram collection requires the private source execution service.',400);
 let raw:unknown;
 try{raw=await telegramExecution(env).execute('telegram_resolve',{username});}
 catch(error){throw new ProductSourceApprovalError(error instanceof Error&&error.message==='TELEGRAM_RATE_LIMIT'?'Telegram is rate limiting channel verification. Wait before trying again.':error instanceof SourceProviderError&&error.code==='BACKPRESSURE'?'Telegram is busy. Try again shortly.':'Telegram is temporarily unavailable. Try again shortly.');}
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ProductSourceApprovalError('Could not verify this Telegram channel.');
 const result=raw as Record<string,unknown>;
 if(result.error)throw new ProductSourceApprovalError(result.error==='AUTH_REQUIRED'?'Telegram account authorization is unavailable.':result.error==='RATE_LIMIT'?'Telegram is rate limiting channel verification. Try again shortly.':'Could not verify this Telegram channel.');
 if(typeof result.channelId!=='string'||!/^-[1-9]\d*$/.test(result.channelId)||typeof result.username!=='string'||result.username.toLowerCase()!==username.toLowerCase())throw new ProductSourceApprovalError('Could not verify this Telegram channel.',400);
 return {channelId:result.channelId,username:result.username,public:true as const};
}
export async function resolveProductSourceInput(input:string,fetcher:typeof fetch=fetch,env?:Env):Promise<ReturnType<typeof prepareProductSourceInput>&{verifiedTelegram?:Awaited<ReturnType<typeof verifyTelegramApproval>>}> {
 const plan=prepareProductSourceInput(input);
 if(plan.detected.kind==='telegram_channel'&&env)return {...plan,verifiedTelegram:await verifyTelegramApproval(env,plan.detected.username)};
 if(plan.detected.kind!=='web_page')return plan;
 const feedUrl=await discoverPublicRssFeed(plan.sourceUrl!,fetcher);
 if(!feedUrl)return plan;
 const detected=detectSourceInput(`rss: ${feedUrl}`);
 if(detected.kind!=='rss_feed')return plan;
 return {detected,actorId:undefined,sourceUrl:feedUrl,input,canonicalUrl:feedUrl};
}

export async function approveProductSource(env:Env,repo:Repository,feed:BriefingConfig,input:string,
 preResolved?:Awaited<ReturnType<typeof resolveProductSourceInput>>) {
 const plan=preResolved??await resolveProductSourceInput(input);
 if(plan.detected.kind==='telegram_channel'){
  const result=plan.verifiedTelegram??await verifyTelegramApproval(env,plan.detected.username);
  const verifiedInput=JSON.stringify(result);
  const source=await repo.upsertConfiguredSource({briefingId:feed.id,title:`@${result.username}`,provider:'telegram',kind:'telegram_channel',
   identityKey:result.channelId,username:result.username,sourceUrl:`https://t.me/${result.username}`,input:verifiedInput,enabled:true});
  await env.DB.prepare("UPDATE sources SET collection_owner='connector' WHERE id=?").bind(source.id).run();
  if(!feed.paused)await enrollV1Source(env.DB,source.id,feed.ownerAccountId,new Date().toISOString());
  return {sourceId:source.id,url:`https://t.me/${result.username}`,title:source.title,fetched:0,imported:0,queued:0,skipped:0};
 }
 if(plan.detected.kind==='web_page'&&(!env.SOURCE_EXECUTION_SERVICE||!env.SOURCE_EXECUTION_TOKEN))throw new Error('Website extraction requires the source execution service.');
 const source=await repo.upsertConfiguredSource({briefingId:feed.id,title:plan.detected.title,provider:plan.detected.provider,kind:plan.detected.kind,username:'username' in plan.detected?plan.detected.username:undefined,sourceUrl:plan.sourceUrl,input:plan.input,actorId:plan.actorId,actorInput:'actorInput' in plan.detected?plan.detected.actorInput:undefined,enabled:true});
 await env.DB.prepare("UPDATE sources SET collection_owner='connector' WHERE id=?").bind(source.id).run();
 if(!feed.paused)await enrollV1Source(env.DB,source.id,feed.ownerAccountId,new Date().toISOString());
 return {sourceId:source.id,url:plan.canonicalUrl,title:source.title,fetched:0,imported:0,queued:0,skipped:0};
}

/** Presentation adapter: copies immutable published prose and exact provenance.
 * It never runs editorial selection or reads current Event/Storyline state. */
export async function publishedProductEditions(env:Env,feed:BriefingConfig,editionId?:string):Promise<BriefingEdition[]> {
 const publishedEditions=await publicV1Editions(env.DB,feed.id,editionId);
 const editions:BriefingEdition[]=[];
 for(const published of publishedEditions) {
  const sections=published.stories.map(story=>({title:'',summary:story.claims.map(c=>c.text).join(' '),evidence:published.citations.filter(c=>story.claims.some(claim=>claim.support.some(ref=>ref.evidenceRevisionId===c.evidenceRevisionId))).map(c=>({messageId:c.evidenceRevisionId,sourceId:c.publisherId,sourceTitle:c.title||'Source',sourceType:'channel' as const,sourceUrl:c.url,postedAt:c.publishedAt??published.createdAt,text:story.claims.flatMap(claim=>claim.support.filter(ref=>ref.evidenceRevisionId===c.evidenceRevisionId).map(ref=>ref.quote)).join('\n'),links:c.url?[c.url]:[],media:[]}))}));
  editions.push({id:published.id,briefingId:feed.id,cadence:feed.briefingCadence,windowStart:published.windowStart,windowEnd:published.windowEnd,...(published.scheduledFor?{scheduledFor:published.scheduledFor}:{}),title:published.title,summary:sections.map((s,i)=>`${s.summary} [${i+1}]`).join('\n\n'),sections,status:'published',publishedAt:published.publishedAt,createdAt:published.createdAt,updatedAt:published.createdAt});
 }
 return editions;
}
