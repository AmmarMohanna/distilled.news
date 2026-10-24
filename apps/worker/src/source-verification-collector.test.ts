import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Miniflare} from 'miniflare';
import {PROVIDER_BUDGET_SCHEMA} from '@distilled/connectors';
import {collectVerificationEvidence} from './source-verification-collector';
import {assessSource} from './source-assessment';
import type {Env} from './types';
let runtime:Miniflare,env:Env;
beforeEach(async()=>{
 runtime=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],r2Buckets:['RAW_ARCHIVE']});
 const DB=await runtime.getD1Database('DB');await DB.exec(PROVIDER_BUDGET_SCHEMA.replace(/\n/g,' '));
 env={DB,RAW_ARCHIVE:await runtime.getR2Bucket('RAW_ARCHIVE'),APIFY_API_TOKEN:'test-only',OPENROUTER_API_KEY:'test-only',SOURCE_CONNECTORS_ENABLED:'true',SOURCE_PAID_VERIFICATION_ENABLED:'true',SOURCE_DAILY_BUDGET_USD:'5',SOURCE_BUDGET_TIME_ZONE:'Asia/Beirut',SOURCE_PROVIDER_BUDGETS_JSON:JSON.stringify({google_apify:5,x_apify:5,linkedin_apify:5}),SOURCE_OPERATION_CEILINGS_JSON:'{"apify":0.05}',SOURCE_ASSESSMENT_MODEL:'openai/gpt-4.1-mini'} as unknown as Env;
});
afterEach(async()=>runtime.dispose());
it.each(['https://x.com/NASA','x: space exploration'])('uses funded TwitterAPI.io for %s without any Apify request',async input=>{
 env.TWITTERAPI_IO_API_KEY='test-twitter-only';env.APIFY_API_TOKEN=undefined;
 env.SOURCE_PROVIDER_BUDGETS_JSON=JSON.stringify({x_twitterapi_io:15,x_apify:0});env.SOURCE_OPERATION_CEILINGS_JSON='{"twitterApiIo":0.01,"apify":0.05}';
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
  expect(new URL(String(url)).hostname).toBe('api.twitterapi.io');expect(new Headers(init?.headers).get('X-API-Key')).toBe('test-twitter-only');
  return Response.json({tweets:[{id:'12345',text:'Space exploration mission updates from NASA.',createdAt:new Date().toISOString(),author:{id:'123',userName:'NASA'}}],has_next_page:false});
 });
 const scope={ownerAccountId:'owner',providerFetcher:fetcher};
 expect(await collectVerificationEvidence(env,input,scope)).toEqual([expect.objectContaining({body:expect.stringContaining('Space exploration')})]);
 await collectVerificationEvidence(env,input,scope);expect(fetcher).toHaveBeenCalledTimes(1);
 const rows=await env.DB.prepare('SELECT provider_id FROM connector_provider_operations').all();expect(rows.results).toEqual([{provider_id:'x_twitterapi_io'}]);
});

it('does not bypass an unknown Apify submission when switching X providers',async()=>{
 const lost=vi.fn<typeof fetch>(async()=>{throw Error('response lost')});
 await expect(collectVerificationEvidence(env,'https://x.com/NASA',{ownerAccountId:'owner',providerFetcher:lost})).rejects.toThrow('UNCERTAIN_PAID_SUBMISSION');
 env.TWITTERAPI_IO_API_KEY='test-twitter-only';env.SOURCE_PROVIDER_BUDGETS_JSON=JSON.stringify({x_twitterapi_io:15,x_apify:0});env.SOURCE_OPERATION_CEILINGS_JSON='{"twitterApiIo":0.01,"apify":0.05}';
 const replacement=vi.fn<typeof fetch>();
 await expect(collectVerificationEvidence(env,'https://x.com/NASA',{ownerAccountId:'owner',providerFetcher:replacement})).rejects.toThrow('UNCERTAIN_PAID_SUBMISSION');
 expect(replacement).not.toHaveBeenCalled();
});

function provider(){return vi.fn<typeof fetch>(async(url,init)=>{
 const value=String(url);
 if(value.includes('openrouter.ai'))return Response.json({choices:[{message:{content:JSON.stringify({realWorldInterest:'YES',exactTopic:'YES',concern:'NO',reason:'Fetched reporting directly covers space exploration.',evidenceId:'E1'})}}]});
 if(value.includes('/actors/')&&init?.method==='POST')return Response.json({data:{id:'testrun'}});
 if(value.includes('/actor-runs/'))return Response.json({data:{status:'SUCCEEDED',defaultDatasetId:'dataset'}});
 if(value.includes('/datasets/'))return Response.json([{id:'12345',url:'https://publisher.example/space',title:'Space exploration mission launches',text:'NASA launched a space exploration mission to study the Moon and prepare a new lunar landing.',publishedAt:new Date().toISOString(),author:{id:'123',userName:'NASA'}}]);
 throw Error('Direct social/Google page must never be fetched');
})}
it.each(['news: space exploration','https://x.com/NASA','https://www.linkedin.com/company/nasa/'])('verifies %s from real collector records without fetching a blocked public page',async(input)=>{
 const fetcher=provider(),scope={ownerAccountId:'owner',providerFetcher:fetcher};
 const result=await assessSource(env,{title:'Space',description:'Space exploration missions'},input,fetcher,scope);
 expect(result).toMatchObject({status:'accepted',coverage:'direct',evidenceQuote:expect.stringContaining('space exploration')});
 const starts=()=>fetcher.mock.calls.filter(([u,i])=>String(u).includes('/actors/')&&i?.method==='POST');
 expect(starts()).toHaveLength(1);
 await collectVerificationEvidence(env,input,scope);expect(starts()).toHaveLength(1);
 expect(await env.DB.prepare('SELECT reserved_usd FROM connector_daily_provider_budgets').first()).toMatchObject({reserved_usd:expect.any(Number)});
},15000);
it('denies paid verification before HTTP when the shared allowance is exhausted',async()=>{
 env.SOURCE_DAILY_BUDGET_USD='0';const fetcher=provider();
 await expect(collectVerificationEvidence(env,'news: space exploration',{ownerAccountId:'owner',providerFetcher:fetcher})).rejects.toThrow('BUDGET_EXCEEDED');
 expect(fetcher).not.toHaveBeenCalled();
});
it('keeps an uncertain actor submission fenced across retries',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>{throw Error('response lost')});
 for(let i=0;i<2;i++)await expect(collectVerificationEvidence(env,'news: space exploration',{ownerAccountId:'owner',providerFetcher:fetcher})).rejects.toThrow('UNCERTAIN_PAID_SUBMISSION');
 expect(fetcher).toHaveBeenCalledTimes(1);
});

it('keeps publisher discovery separate from retained verification and reuses both immutable executions',async()=>{
 const fetcher=provider(),scope={ownerAccountId:'owner',providerFetcher:fetcher};
 await collectVerificationEvidence(env,'news: space exploration',scope);
 await collectVerificationEvidence(env,'news: space exploration',scope,{purpose:'topic_publishers'});
 await collectVerificationEvidence(env,'news: space exploration',scope,{purpose:'topic_publishers'});
 const starts=fetcher.mock.calls.filter(([url,init])=>String(url).includes('/actors/')&&init?.method==='POST');
 expect(starts).toHaveLength(2);
 expect(starts.map(([,init])=>JSON.parse(init!.body as string).maxItemsPerQuery)).toEqual([10,60]);
},15000);
