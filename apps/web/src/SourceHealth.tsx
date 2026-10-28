import React from 'react';
import {FeedNotice} from './FeedNotice';
import type {FeedPayload} from './types';
import {sourceAcquisitionMessage} from './source-acquisition-messages';

type Source=NonNullable<FeedPayload['sourceAvailability']>[number];
const retrying=new Set(['TRANSIENT','RATE_LIMIT','INTAKE_BUSY','BACKPRESSURE','TEMPORARY_UNAVAILABLE']);
function collectionMessage(source:Source,t:(key:string)=>string){
 if(source.state==='UNAVAILABLE')return t(source.reason==='PAID_PROVIDER_NOT_AUTHORIZED_OR_CONFIGURED'?'Paid collection is not authorized or configured.':source.reason==='PAID_OPERATION_UNCERTAIN'?'A previous paid request needs reconciliation before collection can continue.':source.reason==='BUDGET_EXHAUSTED'?'The authorized collection budget is exhausted.':'Source collection is unavailable.');
 return t(source.collectionError==='RATE_LIMIT'?'Collection is waiting for the provider rate limit.':source.collectionError&&retrying.has(source.collectionError)?'Collection is waiting for processing capacity.':source.collectionError==='MALFORMED'?'The publisher response could not be read as a supported article or listing.':'The latest collection attempt failed.');
}
function itemMessages(source:Source,t:(key:string)=>string){
 if(source.acquisition?.issues?.length)return source.acquisition.issues.map(issue=>`${issue.count} ${t(sourceAcquisitionMessage(issue.reason,issue.count))}`).join(' ');
 return `${source.acquisition?.failed??0} ${t(source.warning==='ARTICLE_AUTH_REQUIRED'?'article acquisition jobs failed with an authentication requirement.':source.warning==='ARTICLE_CHALLENGE_REQUIRED'?'article acquisition jobs were blocked by the publisher.':'article acquisition jobs failed.')}`;
}
/** Collection admission and retained item outcomes are separate facts. A failed
 * item never marks a working source unavailable; current blocks remain visible. */
export function SourceHealth({sources,language,t}:{sources:FeedPayload['sourceAvailability'];language:'en'|'fr'|'ar';t:(key:string)=>string}){
 const collection=(sources??[]).filter(source=>source.state==='UNAVAILABLE'||source.collectionError);
 const blocked=collection.filter(source=>source.state==='UNAVAILABLE'||!retrying.has(source.collectionError??''));
 const items=(sources??[]).filter(source=>(source.acquisition?.failed??0)>0||source.warning);
 if(!collection.length&&!items.length)return null;
 return <>
  {blocked.length>0?<FeedNotice severity="warning" language={language} heading={t('Source collection needs attention')} message={t('Some sources cannot collect right now. See source details.')} />:null}
  <details className="source-diagnostics">
   <summary>{t('Source details')}</summary>
   {collection.length>0?<section><h3>{t('Collection status')}</h3><ul>{collection.map(source=><li key={source.sourceId}><bdi>{source.title}</bdi>: {collectionMessage(source,t)}</li>)}</ul></section>:null}
   {items.length>0?<section><h3>{t('Saved item diagnostics')}</h3><p>{t('These records include earlier failed attempts and skipped pages. They do not necessarily mean a source is unavailable now.')}</p><ul>{items.map(source=><li key={source.sourceId}><bdi>{source.title}</bdi>: {itemMessages(source,t)}</li>)}</ul></section>:null}
  </details>
 </>;
}
