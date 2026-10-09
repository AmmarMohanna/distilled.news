import {HandoffError} from '@distilled/contracts';
import {detectSourceInput,TESTED_ACTORS,HttpSourceExecution} from '@distilled/connectors';
import type {Env,Repository} from './types';
import type {BriefingConfig,BriefingEdition} from '@distilled/core';
import {WorkerPublicSourceFetch} from './public-source-fetch';
import {enrollV1Source} from './v1-intelligence/product';
import {publicV1Edition} from './v1-intelligence/public-read';
import {productConnectorSource} from './connector-source';
import {discoverPublicRssFeed} from './product-feed-discovery';

export async function productPublicationState(env:Env,feedId:string):Promise<'waiting'|'checking'|'quiet'|'failed'|'published'|'correction_pending'> {
 const pending=await env.DB.prepare("SELECT o.id FROM v1_feed_documents o WHERE o.feed_id=? AND o.kind='correction_obligations' AND NOT EXISTS(SELECT 1 FROM v1_feed_documents r WHERE r.feed_id=o.feed_id AND r.kind='correction_resolutions' AND json_extract(r.json,'$.obligationId')=o.id) LIMIT 1").bind(feedId).first();
 if(pending)return 'correction_pending';
 const request=await env.DB.prepare("SELECT id,json_extract(json,'$.state') AS state FROM v1_feed_documents WHERE feed_id=? AND kind='briefing_requests' ORDER BY json_extract(json,'$.createdAt') DESC,id DESC LIMIT 1").bind(feedId).first<{id:string;state:string}>();
 if(!request)return 'waiting';
 if(request.state==='FAILED')return 'failed';
 if(request.state!=='DONE')return 'checking';
 const edition=await env.DB.prepare("SELECT id FROM v1_feed_documents WHERE feed_id=? AND kind='editions' AND id=?").bind(feedId,request.id).first();
 return edition?'published':'quiet';
}

// This deployment opt-in admits only sources explicitly approved by an owner.
// The existing ten-source runtime ceiling and paid-provider ceilings still apply.
export async function productRuntimeEnv(env:Env):Promise<Env> {
 if(env.PRODUCT_FEEDS_ENABLED!=='true')return env;
 const staticIds=(env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean);
 const rows=await env.DB.prepare("SELECT s.id FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id WHERE s.collection_owner='connector' AND s.enabled=1 AND b.paused=0 AND a.disabled_at IS NULL ORDER BY s.id LIMIT 11").all<{id:string}>();
 const ids=[...new Set([...staticIds,...rows.results.map(r=>r.id)])];
 if(ids.length>10)throw new HandoffError('SCOPE_DENIED');
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
export async function resolveProductSourceInput(input:string,fetcher:typeof fetch=fetch) {
 const plan=prepareProductSourceInput(input);
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
  if(!env.SOURCE_EXECUTION_SERVICE||!env.SOURCE_EXECUTION_URL||!env.SOURCE_EXECUTION_TOKEN)throw new Error('Telegram collection requires the private source execution service.');
  const execution=new HttpSourceExecution(env.SOURCE_EXECUTION_URL,env.SOURCE_EXECUTION_TOKEN,
   (value,init)=>env.SOURCE_EXECUTION_SERVICE!.fetch(value,init),true);
  const raw=await execution.execute('telegram_resolve',{username:plan.detected.username});
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Could not verify this Telegram channel.');
  const result=raw as Record<string,unknown>;
  if(result.error)throw new Error(result.error==='AUTH_REQUIRED'?'Telegram account authorization is unavailable.':
   result.error==='RATE_LIMIT'?'Telegram is rate limiting channel verification.':'Could not verify this Telegram channel.');
  if(typeof result.channelId!=='string'||!/^-[1-9]\d*$/.test(result.channelId)||
   typeof result.username!=='string'||result.username.toLowerCase()!==plan.detected.username.toLowerCase())
   throw new Error('Could not verify this Telegram channel.');
  const verifiedInput=JSON.stringify({channelId:result.channelId,username:result.username,public:true});
  const source=await repo.upsertConfiguredSource({briefingId:feed.id,title:`@${result.username}`,provider:'telegram',kind:'telegram_channel',
   identityKey:result.channelId,username:result.username,sourceUrl:`https://t.me/${result.username}`,input:verifiedInput,enabled:true});
  const admission=await env.DB.prepare("UPDATE sources SET collection_owner='connector' WHERE id=? AND (collection_owner='connector' OR (SELECT COUNT(*) FROM sources WHERE collection_owner='connector')<10)").bind(source.id).run();
  if(!admission.meta.changes)throw new Error('This deployment has reached its ten-source collection limit.');
  if(!feed.paused)await enrollV1Source(env.DB,source.id,feed.ownerAccountId,new Date().toISOString());
  return {sourceId:source.id,url:`https://t.me/${result.username}`,title:source.title,fetched:0,imported:0,queued:0,skipped:0};
 }
 if(plan.detected.kind==='web_page'&&(!env.SOURCE_EXECUTION_SERVICE||!env.SOURCE_EXECUTION_TOKEN))throw new Error('Website extraction requires the source execution service.');
 const source=await repo.upsertConfiguredSource({briefingId:feed.id,title:plan.detected.title,provider:plan.detected.provider,kind:plan.detected.kind,username:'username' in plan.detected?plan.detected.username:undefined,sourceUrl:plan.sourceUrl,input:plan.input,actorId:plan.actorId,actorInput:'actorInput' in plan.detected?plan.detected.actorInput:undefined,enabled:true});
 const admission=await env.DB.prepare("UPDATE sources SET collection_owner='connector' WHERE id=? AND (collection_owner='connector' OR (SELECT COUNT(*) FROM sources WHERE collection_owner='connector')<10)").bind(source.id).run();
 if(!admission.meta.changes)throw new Error('This deployment has reached its ten-source collection limit.');
 if(!feed.paused)await enrollV1Source(env.DB,source.id,feed.ownerAccountId,new Date().toISOString());
 return {sourceId:source.id,url:plan.canonicalUrl,title:source.title,fetched:0,imported:0,queued:0,skipped:0};
}

/** Presentation adapter: copies immutable published prose and exact provenance.
 * It never runs editorial selection or reads current Event/Storyline state. */
export async function publishedProductEditions(env:Env,feed:BriefingConfig,editionId?:string):Promise<BriefingEdition[]> {
 const rows=await env.DB.prepare("SELECT id FROM v1_feed_documents WHERE feed_id=? AND kind='editions' ORDER BY json_extract(json,'$.createdAt') DESC,id DESC LIMIT 100").bind(feed.id).all<{id:string}>();
 const editions:BriefingEdition[]=[];
 for(const row of rows.results) {
  if(editionId&&row.id!==editionId)continue;
  const published=await publicV1Edition(env.DB,row.id);if(!published)continue;
  const sections=published.stories.map(story=>({title:'',summary:story.claims.map(c=>c.text).join(' '),evidence:published.citations.filter(c=>story.claims.some(claim=>claim.support.some(ref=>ref.evidenceRevisionId===c.evidenceRevisionId))).map(c=>({messageId:c.evidenceRevisionId,sourceId:c.publisherId,sourceTitle:c.title||'Source',sourceType:'channel' as const,sourceUrl:c.url,postedAt:c.publishedAt??published.createdAt,text:story.claims.flatMap(claim=>claim.support.filter(ref=>ref.evidenceRevisionId===c.evidenceRevisionId).map(ref=>ref.quote)).join('\n'),links:c.url?[c.url]:[],media:[]}))}));
  editions.push({id:published.id,briefingId:feed.id,cadence:feed.briefingCadence,windowStart:published.windowStart,windowEnd:published.windowEnd,title:published.title,summary:sections.map((s,i)=>`${s.summary} [${i+1}]`).join('\n\n'),sections,status:'published',publishedAt:published.publishedAt,createdAt:published.createdAt,updatedAt:published.createdAt});
 }
 return editions;
}
