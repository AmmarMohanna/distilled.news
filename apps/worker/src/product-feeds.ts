import {HandoffError} from '@distilled/contracts';
import {detectSourceInput} from '@distilled/connectors';
import type {Env,Repository} from './types';
import type {BriefingConfig,BriefingEdition} from '@distilled/core';
import {WorkerPublicSourceFetch} from './public-source-fetch';
import {enrollV1Source} from './v1-intelligence/product';
import {publicV1Edition} from './v1-intelligence/public-read';

export async function productPublicationState(env:Env,feedId:string):Promise<'waiting'|'checking'|'quiet'|'failed'|'published'> {
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

export async function approveProductSource(env:Env,repo:Repository,feed:BriefingConfig,input:string) {
 const detected=detectSourceInput(input.trim());
 if(detected.provider!=='rss'||detected.kind!=='rss_feed')throw new Error('Add a public RSS feed URL. This deployment cannot configure this source type yet.');
 const url=new URL(detected.sourceUrl).href;
 new WorkerPublicSourceFetch(url);
 const source=await repo.upsertConfiguredSource({briefingId:feed.id,title:new URL(url).hostname,provider:'rss',kind:'rss_feed',sourceUrl:url,input:url,enabled:true});
 const admission=await env.DB.prepare("UPDATE sources SET collection_owner='connector' WHERE id=? AND (collection_owner='connector' OR (SELECT COUNT(*) FROM sources WHERE collection_owner='connector')<10)").bind(source.id).run();
 if(!admission.meta.changes)throw new Error('This deployment has reached its ten-source collection limit.');
 if(!feed.paused)await enrollV1Source(env.DB,source.id,feed.ownerAccountId,new Date().toISOString());
 return {sourceId:source.id,url,title:source.title,fetched:0,imported:0,queued:0,skipped:0};
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
