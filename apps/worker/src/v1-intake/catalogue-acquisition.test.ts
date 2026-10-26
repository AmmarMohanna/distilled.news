import {expect,it,vi} from 'vitest';
import {extractPublicHtml,type ProviderHttpPort} from '@distilled/connectors';
import {WebsiteSourceProvider} from '../../../../packages/connectors/src/source-runtime/website-providers';
import {createArticleFallback} from './article-fallback';
import {createCandidateAcquisitionRouter} from './acquisition-router';
import {runAcquisitionJob,type AcquisitionClaim} from './acquisition';
import {createIntakeDatabase,seedIntakeScope,batchFixture,testPolicy} from './test-utils';
import {createCandidateIntakePort} from './intake';
import {V1IntakeStore} from './store';
import {V1FeedStore} from '../v1-intelligence/store';
import {feedFixture} from '../v1-intelligence/test-utils';
import {prepareV3Window} from '../v1-intelligence/v3-window';
const url='https://publisher.example/products/camera-123/';
const description='The camera has a weather-resistant body and a removable battery. The publisher lists several professional reviews, with mixed ratings for battery life and image processing. These are descriptions and excerpts rather than the full reviews.';
const product=`<link rel="canonical" href="${url}"><div itemscope itemtype="https://schema.org/Product"><header><h1>Camera 123</h1><p>Listed price: $499</p></header><div itemprop="description">${description}</div><p>As reviewed by Example Reviews</p><section><h2>Review excerpts</h2><p>Rating: 8/10. Good image quality; battery life remains limited.</p></section></div>`;
it('extracts a product catalogue including its header, attribution and ratings without inventing dates',()=>{
 const result=extractPublicHtml(product+'<nav>Unrelated navigation</nav>',url);
 expect(result).toMatchObject({pageKind:'catalogue',contentKind:'PRODUCT_DETAIL',canonicalUrl:url,publishedAt:undefined});
 expect(result.body).toContain('Listed price: $499');expect(result.body).toContain(description);expect(result.body).toContain('Example Reviews');expect(result.body).toContain('8/10');expect(result.body).not.toContain('Unrelated navigation');
});
it('supports an explicitly page-owned product catalogue but keeps news indexes as discovery',()=>{
 const metadata={'@type':'CollectionPage',url,mainEntity:{'@type':'ItemList',itemListElement:[{'@type':'ListItem',item:{'@type':'Product',name:'Camera A'}}]}};
 const html='<script type="application/ld+json">'+JSON.stringify(metadata)+'</script><main><h1>Camera catalogue</h1><h2><a href="/products/a">Camera A</a></h2><p>'+description+'</p><h2><a href="/products/b">Camera B</a></h2></main>';
 expect(extractPublicHtml(html,url)).toMatchObject({pageKind:'catalogue',contentKind:'CATALOGUE'});
 expect(extractPublicHtml(html.replace('"Product"','"NewsArticle"'),url).pageKind).toBe('listing');
 expect(extractPublicHtml(html.replace(url,'https://publisher.example/other'),url).pageKind).toBe('listing');
});
it('does not promote a product card beneath an unrelated page heading as the primary product',()=>{
 const page='<main><h1>Latest news</h1><div itemscope itemtype="https://schema.org/Product"><h2>Unrelated camera</h2><p itemprop="description">'+description+'</p></div></main>';
 expect(extractPublicHtml(page,url).pageKind).not.toBe('catalogue');
});
it('the website collector retains the product snapshot rather than fetching linked reviews',async()=>{
 const execute=vi.fn();const bytes=new TextEncoder().encode(product);
 const provider=new WebsiteSourceProvider('website_http',{get:async()=>({status:200,headers:{},bytes,telemetry:{requests:1,latencyMs:0,providerCostUsd:0,status:200}})},{execute} as never);
 const result=await provider.fetch({scope:{feedId:'f',feedSourceId:'s',sourceId:'p'},runId:'r',source:{family:'website',locator:url},requestedBounds:{},limit:1} as never,{id:'run'} as never);
 expect(result.items).toHaveLength(1);expect(result.items[0]).toMatchObject({url,representation:'LISTING_RESULT',contentCompleteness:'UNKNOWN'});expect(result.items[0].body).toContain('Example Reviews');expect(execute).not.toHaveBeenCalled();
});
it('Zyte fallback admits a product snapshot without calling it a full news article',async()=>{
 const request=vi.fn().mockResolvedValue({status:200,headers:{},json:{statusCode:200,url,httpResponseBody:btoa(product)}});
 const fallback=createArticleFallback({authorize:async()=>{},zyte:{http:{request} as unknown as ProviderHttpPort,key:'test',ceilingUsd:.05,initialize:async()=>{}}});
 const claim={job:{id:'job'},candidate:{id:'candidate'},input:{observation:{id:'obs',feedId:'feed',feedSourceId:'source',sourceId:'publisher',canonicalUrl:url,representation:'ARTICLE_EXCERPT',contentCompleteness:'PARTIAL'}}} as AcquisitionClaim;
 const acquired=await createCandidateAcquisitionRouter({now:()=>testPolicy.now(),preferFullArticle:true,publicGet:async()=>({url,status:403,body:'',contentType:'text/html'}),articleFallback:fallback})(claim);
 expect(acquired).toMatchObject({representation:'LISTING_RESULT',contentCompleteness:'UNKNOWN',acquisitionProvider:'website_zyte',provenance:{contentKind:'PRODUCT_DETAIL'}});expect(request).toHaveBeenCalledTimes(1);
});
it('persists the listing representation and gives V3 labelled evidence without altering retained text',async()=>{
 const ctx=await createIntakeDatabase();try{
  const store=new V1IntakeStore(ctx.db);await seedIntakeScope(store);const batch=batchFixture();
  Object.assign(batch.observations[0],{canonicalUrl:url,representation:'LISTING_RESULT',contentCompleteness:'UNKNOWN',publishedAtHint:'2026-10-03T11:55:00Z',observedAt:'2026-10-03T11:59:00Z'});
  Object.assign(batch.proposals[0],{url,representation:'LISTING_RESULT',contentCompleteness:'UNKNOWN',publishedAtHint:'2026-10-03T11:55:00Z'});
  await createCandidateIntakePort(store,testPolicy).acceptBatch(batch);
  const jobId=JSON.stringify(['ACQUIRE','observation-1','']);
  const router=createCandidateAcquisitionRouter({now:testPolicy.now,preferFullArticle:true,publicGet:async()=>({url,status:200,body:product,contentType:'text/html'})});
  expect(await runAcquisitionJob(store,jobId,testPolicy,router)).toBe('DONE');
  const saved=(await store.read<any>('acquisition_results',jobId))!.value;
  expect(saved).toMatchObject({representation:'LISTING_RESULT',contentCompleteness:'UNKNOWN',publishedAt:'2026-10-03T11:55:00.000Z',provenance:{contentKind:'PRODUCT_DETAIL'},quality:{extractionComplete:false}});
  const feeds=new V1FeedStore(ctx.db);await feeds.registerFeed({...feedFixture,createdAt:'2026-10-03T11:00:00Z',briefingFrequency:'30M'});
  const prepared=await prepareV3Window(feeds,'feed-1',{start:'2026-10-03T11:30:00Z',end:'2026-10-03T12:00:00Z',kind:'30M'},testPolicy.now());
  expect(prepared.input.articles).toHaveLength(1);expect(prepared.input.articles[0].text).toContain('catalogue/listing snapshot');expect(prepared.input.articles[0].text).toContain(saved.body);
  expect((await store.read<any>('acquisition_results',jobId))!.value.body).toBe(saved.body);
 }finally{await ctx.dispose()}
},30000);
