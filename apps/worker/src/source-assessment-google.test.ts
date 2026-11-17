import {it,expect,vi} from 'vitest';
import {PublicSourceFetchFailure} from '@distilled/agent-runtime';
import {assessSource} from './source-assessment';
import {collectVerificationEvidence} from './source-verification-collector';
import type {Env} from './types';
vi.mock('./source-verification-collector',()=>({collectVerificationEvidence:vi.fn()}));
it('falls back to the configured collector when Google native RSS times out',async()=>{
 vi.mocked(collectVerificationEvidence).mockResolvedValue([{body:'New artificial intelligence research improves models and computing efficiency.',url:'https://publisher.example/story',publishedAt:new Date().toISOString()}] as Awaited<ReturnType<typeof collectVerificationEvidence>>);
 const fetcher=vi.fn<typeof fetch>(async url=>{
  if(!String(url).includes('openrouter.ai'))throw new PublicSourceFetchFailure('FETCH_TIMEOUT');
  return Response.json({choices:[{message:{content:JSON.stringify({realWorldInterest:'YES',exactTopic:'YES',concern:'NO',reason:'Relevant artificial intelligence research.',evidenceId:'E1'})}}]});
 });
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_PAID_VERIFICATION_ENABLED:'true',SOURCE_ASSESSMENT_MODEL:'openai/gpt-4.1-mini',OPENROUTER_API_KEY:'test',APIFY_API_TOKEN:'test',SOURCE_PROVIDER_BUDGETS_JSON:'{"google_apify":1}',SOURCE_OPERATION_CEILINGS_JSON:'{"apify":0.05}'} as Env;
 const scope={ownerAccountId:'account',providerFetcher:fetcher};
 const result=await assessSource(env,{title:'Technology',description:'Artificial intelligence research'},'news: Technology',fetcher,scope);
 expect(result.status).toBe('accepted');expect(collectVerificationEvidence).toHaveBeenCalledWith(env,'news: Technology',scope);
 // Native RSS failure, source assessment, then the existing cited-passage audit.
 expect(fetcher).toHaveBeenCalledTimes(3);
 expect(fetcher.mock.calls.filter(([url])=>String(url).includes('openrouter.ai'))).toHaveLength(2);
});
