/** Preserve a precise connector publication time when article extraction only
 * supplies the same calendar date. Different publication/update dates are not
 * interchangeable; retain both observations for diagnosis. */
export interface PublicationDate {publishedAt?:string;timestampSource:string;articlePublishedAt?:string;connectorPublishedAt?:string}
export function resolvePublicationDate(article:unknown,hint?:string):PublicationDate{
 const valid=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v));
 const extracted=valid(article)?new Date(article).toISOString():undefined;
 const connector=valid(hint)?new Date(hint).toISOString():undefined;
 const sameDate=extracted&&connector&&extracted.slice(0,10)===connector.slice(0,10);
 const lostPrecision=sameDate&&extracted!.endsWith('T00:00:00.000Z')&&!connector!.endsWith('T00:00:00.000Z');
 const publishedAt=lostPrecision?connector:extracted??connector;
 return {publishedAt,timestampSource:lostPrecision?'connector_precision_same_article_date':extracted?'article_metadata':connector?'connector_publication_hint':'unavailable',articlePublishedAt:extracted,connectorPublishedAt:connector};
}
