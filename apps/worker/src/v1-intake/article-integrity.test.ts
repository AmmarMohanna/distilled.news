import {beforeEach,afterEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,batchFixture,testPolicy} from './test-utils';
import {V1IntakeStore} from './store';
import {createCandidateIntakePort} from './intake';
import {claimAcquisition,runAcquisitionJob,persistAcquisitionResult,completeAcquisition} from './acquisition';
import {createCandidateAcquisitionRouter} from './acquisition-router';
import type {AcceptedAcquiredContent,DownstreamJob} from './types';
import {readArticleDateMetadata} from '@distilled/connectors';

let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1IntakeStore;
const now='2026-10-22T12:00:00Z',policy={...testPolicy,now:()=>now},jobId=JSON.stringify(['ACQUIRE','observation-1','']);
const body='The spacecraft will study the moons of Mars using several instruments. '.repeat(12);
const corrupt=body+'QWxwaGEvYmV0YTEyMzQ1Njc4OTA='.repeat(100);
beforeEach(async()=>{ctx=await createIntakeDatabase();store=new V1IntakeStore(ctx.db);await seedIntakeScope(store);await createCandidateIntakePort(store,policy).acceptBatch(batchFixture());});
afterEach(async()=>ctx.dispose());

it('persists the original article date separately from its update, feed hint, extraction date and acquisition',async()=>{
 const claim=(await claimAcquisition(store,jobId,now))!;
 claim.input.observation.publishedAtHint='2026-10-21T12:00:00Z';
 const html='<meta property="article:modified_time" content="2026-10-21T12:00:00Z"><script type="application/ld+json">'+JSON.stringify({'@type':'NewsArticle',datePublished:'2026-08-31',dateModified:'2026-10-21T12:00:00Z'})+'</script>';
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response(html),extractHtml:async()=>({body,publishedAt:'2026-10-21'})});
 const result=await router(claim);
 expect(result).toMatchObject({publishedAt:'2026-08-31T00:00:00.000Z',acquiredAt:now,contentCompleteness:'UNKNOWN',quality:{extractionComplete:false},provenance:{publicationDate:{articlePublishedAt:'2026-08-31T00:00:00.000Z',articleUpdatedAt:'2026-10-21T12:00:00.000Z',connectorPublishedAt:'2026-10-21T12:00:00.000Z',extractedDate:'2026-10-21T00:00:00.000Z'}}});
 await persistAcquisitionResult(store,claim,result,now);await completeAcquisition(store,claim,policy);
 expect((await store.list<AcceptedAcquiredContent>('acquired','feed-source-1'))[0]).toEqual(result);
});
it('does not promote a heuristic update date to publication when no original date is available',async()=>{
 const claim=(await claimAcquisition(store,jobId,now))!;delete claim.input.observation.publishedAtHint;
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('<meta itemprop="dateModified" content="2026-10-21">'),extractHtml:async()=>({body,publishedAt:'2026-10-21'})});
 const result=await router(claim);
 expect(result.publishedAt).toBeUndefined();
 expect(result.provenance?.publicationDate).toMatchObject({timestampSource:'unavailable',articleUpdatedAt:'2026-10-21T00:00:00.000Z',extractedDate:'2026-10-21T00:00:00.000Z'});
});
it('does not resolve conflicting original dates by falling back to the newer feed hint',async()=>{
 const claim=(await claimAcquisition(store,jobId,now))!;claim.input.observation.publishedAtHint='2026-10-21T12:00:00Z';
 const html='<meta property="article:published_time" content="2026-10-21"><meta itemprop="datePublished" content="2026-08-31"><article>'+body+'</article>';
 const result=await createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response(html)})(claim);
 expect(result.publishedAt).toBeUndefined();expect(result.provenance?.publicationDate?.publicationConflict).toBe(true);
});
it.each(['structured','html-helper','private-helper'])('rejects an encoded tail through %s without publishing evidence or invoking a model',async route=>{
 const claim=(await claimAcquisition(store,jobId,now))!,url=claim.input.observation.canonicalUrl!;
 let modelCalls=0;
 const router=createCandidateAcquisitionRouter({now:()=>now,
  fetcher:async()=>route==='private-helper'?new Response('Forbidden',{status:403}):new Response(route==='structured'?'<meta property="article:published_time" content="2026-08-31"><article>'+corrupt+'</article>':'<main>Unstructured</main>'),
  extractHtml:route==='html-helper'?async()=>({body:corrupt,publishedAt:'2026-08-31'}):undefined,
  publicArticle:route==='private-helper'?async()=>({status:200,url,pageKind:'article',body:corrupt}):undefined,
  stages:{webOperator:async()=>{modelCalls++;throw Error('Must not ask a model to repair encoded source text');}}
 });
 await expect(router(claim)).rejects.toMatchObject({code:'EXTRACTION_FAILED',diagnostic:{detail:'ENCODED_ARTICLE_TEXT'}});
 expect(await store.list('revisions','feed-source-1')).toHaveLength(0);expect(modelCalls).toBe(0);
});
it('persists a terminal extraction diagnostic and no evidence revision for unreadable articles',async()=>{
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('<meta property="article:published_time" content="2026-08-31"><article>'+corrupt+'</article>')});
 expect(await runAcquisitionJob(store,jobId,policy,router)).toBe('FAILED');
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({failureCode:'EXTRACTION_FAILED',failureDetail:'ENCODED_ARTICLE_TEXT'});
 expect(await store.list('revisions','feed-source-1')).toHaveLength(0);
});
it('uses explicit original metadata from private extraction and never declares its completeness proved',async()=>{
 const claim=(await claimAcquisition(store,jobId,now))!,url=claim.input.observation.canonicalUrl!;
 const dates=readArticleDateMetadata('<meta property="article:published_time" content="2026-08-31"><meta property="article:modified_time" content="2026-10-21">',url);
 const result=await createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('Forbidden',{status:403}),publicArticle:async()=>({status:200,url,pageKind:'article',body,publishedAt:'2026-08-31',extractedDate:'2026-10-21',dateMetadata:dates})})(claim);
 expect(result).toMatchObject({publishedAt:'2026-08-31T00:00:00.000Z',contentCompleteness:'UNKNOWN',quality:{extractionComplete:false},provenance:{publicationDate:{articleUpdatedAt:'2026-10-21T00:00:00.000Z',extractedDate:'2026-10-21T00:00:00.000Z'}}});
});
it('keeps unclassified dates from older private helpers diagnostic only',async()=>{
 const claim=(await claimAcquisition(store,jobId,now))!,url=claim.input.observation.canonicalUrl!;delete claim.input.observation.publishedAtHint;
 const result=await createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('Forbidden',{status:403}),publicArticle:async()=>({status:200,url,pageKind:'article',body,publishedAt:'2026-10-21'})})(claim);
 expect(result.publishedAt).toBeUndefined();expect(result.provenance?.publicationDate?.extractedDate).toBe('2026-10-21T00:00:00.000Z');
});
it('checks supplied full articles rather than trusting a COMPLETE declaration',async()=>{
 const claim=(await claimAcquisition(store,jobId,now))!;
 claim.input.observation.representation='FULL_ARTICLE';claim.input.observation.contentCompleteness='COMPLETE';
 const router=createCandidateAcquisitionRouter({now:()=>now,readPayload:async()=>({body:corrupt})});
 await expect(router(claim)).rejects.toMatchObject({code:'EXTRACTION_FAILED',diagnostic:{detail:'ENCODED_ARTICLE_TEXT'}});
 expect(await store.list('revisions','feed-source-1')).toHaveLength(0);
});
