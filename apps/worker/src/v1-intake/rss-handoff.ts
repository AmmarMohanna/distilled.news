import {connectorHandoffRequestSchema,hashContent,sha256,HandoffError,type CollectionCoverage,type ConnectorHandoffRequest} from '@distilled/contracts';
import type {ConnectorBatch} from '@distilled/connectors';
import type {IntakeScope} from './types';
import {resolveLanguage} from '../v1-intelligence/language';
export function rssLanguageHint(xml:string):string|undefined {
 const declared=xml.match(/<language\b[^>]*>([\s\S]*?)<\/language>/i)?.[1]?.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/,'$1').trim();
 return declared && /^[a-z]{2,3}(?:[-_][a-z0-9]+)*$/i.test(declared)?declared.split(/[-_]/)[0].toLowerCase():undefined;
}
/** Format adapter only: the connector owner supplies its durably allocated run,
 * coverage and checkpoint proof. This adapter never polls, allocates or advances cursors. */
export async function prepareRssHandoff(batch:ConnectorBatch,context:{scope:IntakeScope;coverage:CollectionCoverage;languageHint?:string;itemLanguages?:Readonly<Record<string,string>>;trustedSourceLanguage?:{language:string;metadataRef:string}},bucket:Pick<R2Bucket,'put'>):Promise<ConnectorHandoffRequest> {
 if(batch.connector!=='rss' || batch.retry.kind!=='none' || batch.observations.length>500 || context.coverage.feedId!==context.scope.feedId || context.coverage.feedSourceId!==context.scope.feedSourceId) throw new HandoffError('INVALID_REQUEST');
 const request:ConnectorHandoffRequest={contractVersion:'distilled-v1',handoffId:JSON.stringify(['rss',context.coverage.feedSourceId,context.coverage.fetchRunId]),coverage:context.coverage,observations:[],proposals:[]},seen=new Map<string,string>();
 for(const row of batch.observations) {
  if(row.operation!=='upsert' || row.representation!=='feed_text') throw new HandoffError('INVALID_REQUEST');
  const hash=await hashContent({representation:'ARTICLE_EXCERPT',title:row.title,body:row.text});
  if(seen.has(row.upstreamId)) {if(seen.get(row.upstreamId)!==hash) throw new HandoffError('IDEMPOTENCY_CONFLICT');continue}seen.set(row.upstreamId,hash);
  const id=await sha256(JSON.stringify([context.scope.feedSourceId,context.coverage.fetchRunId,row.upstreamId,'UPSERT']));
  const languageResolution=resolveLanguage({item:context.itemLanguages?.[row.upstreamId],feed:context.languageHint,trustedSource:context.trustedSourceLanguage});
  const languageHint=languageResolution.language;
  const payload=JSON.stringify({sourceObservationId:id,title:row.title,body:row.text,language:languageHint,languageResolution,publishedAt:row.timestampKind==='published'?row.publishedAt:undefined});
  const payloadHash=await sha256(payload),ref=`v1/payloads/${encodeURIComponent(context.scope.feedSourceId)}/${id}/${payloadHash}.json`;
  await bucket.put(ref,payload,{httpMetadata:{contentType:'application/json'}});
  const publishedAt=row.timestampKind==='published'?row.publishedAt:undefined;
  const observation={id,feedId:context.scope.feedId,feedSourceId:context.scope.feedSourceId,sourceId:context.scope.sourceId,fetchRunId:context.coverage.fetchRunId,fetchStartSequence:context.coverage.fetchStartSequence,sourceItemKey:row.upstreamId,operation:'UPSERT' as const,representation:'ARTICLE_EXCERPT' as const,contentCompleteness:row.contentCompleteness.toUpperCase() as 'COMPLETE'|'PARTIAL'|'UNKNOWN',contentHash:hash,authoritativeCurrentState:false,upstreamId:row.upstreamId,canonicalUrl:row.url,publisherId:row.url?new URL(row.url).hostname.toLowerCase().replace(/^www\./,''):undefined,titleHint:row.title,publishedAtHint:publishedAt,languageHint,suppliedPayloadRef:ref,observedAt:context.coverage.createdAt};
  request.observations.push(observation);
  request.proposals.push({observationId:id,feedId:observation.feedId,feedSourceId:observation.feedSourceId,sourceId:observation.sourceId,sourceItemKey:row.upstreamId,connectorType:'rss',upstreamId:row.upstreamId,url:row.url,titleHint:row.title,publishedAtHint:publishedAt,languageHint,representation:observation.representation,contentCompleteness:observation.contentCompleteness,suppliedPayloadRef:ref,payloadHash,discoveredAt:observation.observedAt,discoveryRunId:context.coverage.fetchRunId});
 }
 return connectorHandoffRequestSchema.parse(request);
}
