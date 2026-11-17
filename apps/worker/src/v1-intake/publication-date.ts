/** Preserve a precise connector publication time when article extraction only
 * supplies the same calendar date. Different publication/update dates are not
 * interchangeable; retain both observations for diagnosis. */
import type {ArticleDateMetadata,ArticleDateCandidate} from '@distilled/connectors';
export interface PublicationDate {publishedAt?:string;timestampSource:string;articlePublishedAt?:string;connectorPublishedAt?:string;articleUpdatedAt?:string;extractedDate?:string;articleDateCandidates?:ArticleDateCandidate[];publicationConflict?:boolean}
/** Older helpers returned a heuristic date with no publication/update distinction.
 * Keep it for diagnosis, but only structured explicit fields establish origin time. */
export function helperArticleDates(raw:unknown):ArticleDateMetadata|undefined {
 if(!raw||typeof raw!=='object')return undefined;
 const r=raw as Record<string,unknown>;
 if(typeof r.publicationConflict!=='boolean'||!Array.isArray(r.candidates)||!r.candidates.every(c=>c&&typeof c==='object'&&typeof c.source==='string'&&typeof c.value==='string'&&Number.isFinite(Date.parse(c.value))))return undefined;
 const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():undefined;
 return {publishedAt:date(r.publishedAt),updatedAt:date(r.updatedAt),publicationConflict:r.publicationConflict,candidates:r.candidates};
}
export function resolvePublicationDate(article:unknown,hint?:string,metadata?:ArticleDateMetadata,genericDate?:unknown):PublicationDate{
 const valid=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v));
 const extracted=metadata?metadata.publishedAt:valid(article)?new Date(article).toISOString():undefined;
 const connector=valid(hint)?new Date(hint).toISOString():undefined;
 const sameDate=extracted&&connector&&extracted.slice(0,10)===connector.slice(0,10);
 const lostPrecision=sameDate&&extracted!.endsWith('T00:00:00.000Z')&&!connector!.endsWith('T00:00:00.000Z');
 const conflict=metadata?.publicationConflict===true;
 const publishedAt=conflict?undefined:lostPrecision?connector:extracted??connector;
 return {publishedAt,timestampSource:conflict?'conflicting_article_publication_metadata':lostPrecision?'connector_precision_same_article_date':extracted?'article_metadata':connector?'connector_publication_hint':'unavailable',articlePublishedAt:extracted,connectorPublishedAt:connector,
  ...(metadata?{articleUpdatedAt:metadata.updatedAt,articleDateCandidates:metadata.candidates,publicationConflict:conflict}:{}),
  ...(valid(genericDate)?{extractedDate:new Date(genericDate).toISOString()}:{} )};
}
