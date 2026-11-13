import {expect,it,vi} from 'vitest';
import {generalWebSearchProbe,GENERAL_WEB_PROBE_ID,GENERAL_WEB_PROBE_QUERIES,GENERAL_WEB_RETRY_ID,runGeneralWebSearchProbe} from './general-web-search-probe';
import type {ProviderHttpPort} from '@distilled/connectors';

it('uses one stable capped operation for three general queries with paid extras disabled',async()=>{
 const request=vi.fn<ProviderHttpPort['request']>(async()=>({status:200,headers:{},bytes:new Uint8Array(),json:[]}));
 await generalWebSearchProbe({request},'secret');
 expect(request).toHaveBeenCalledTimes(1);
 const [scope,id,,ceiling,url,init]=request.mock.calls[0];
 expect(id).toBe(GENERAL_WEB_PROBE_ID);expect(scope.feedSourceId).toContain(GENERAL_WEB_PROBE_ID);expect(ceiling).toBe(0.1);
 const target=new URL(url);expect(target.searchParams.get('maxTotalChargeUsd')).toBe('0.10');expect(target.searchParams.get('restartOnError')).toBe('false');expect(target.searchParams.get('timeout')).toBe('50');
 const input=JSON.parse(String(init.body));expect(input.queries.split('\n')).toEqual(GENERAL_WEB_PROBE_QUERIES);expect(input.maxPagesPerQuery).toBe(1);
 expect(input.websiteContentScraper.enable).toBe(false);expect(input.maximumLeadsEnrichmentRecords).toBe(0);
 for(const key of ['aiOverview','aiModeSearch','geminiSearch','perplexitySearch','chatGptSearch','copilotSearch'])expect(Object.values(input[key]).every(value=>value===false)).toBe(true);
});

it('does not treat ads or unsafe links as organic results',async()=>{
 const request:ProviderHttpPort['request']=async()=>({status:200,headers:{},bytes:new Uint8Array(),json:[{searchQuery:{term:'test'},paidResults:[{url:'https://ads.example'}],organicResults:[{url:'javascript:alert(1)'},{url:'https://example.com/article',title:'Result'}]}]});
 const result=await generalWebSearchProbe({request},'secret');expect(result.pages[0].results).toEqual([{url:'https://example.com/article',title:'Result',description:''}]);
});

it('keeps the approved retry distinct and caps it at five cents',async()=>{
 const request=vi.fn<ProviderHttpPort['request']>(async()=>({status:200,headers:{},bytes:new Uint8Array(),json:[]}));
 await generalWebSearchProbe({request},'secret',true);
 const [scope,id,provider,ceiling,url]=request.mock.calls[0];
 expect(id).toBe(GENERAL_WEB_RETRY_ID);expect(scope.sourceId).toBe(id);expect(provider).toBe('web_search_trial_20261113_retry1');expect(ceiling).toBe(0.05);expect(new URL(url).searchParams.get('maxTotalChargeUsd')).toBe('0.05');
});

it('does not permit a retry for an uncertain or successful prior operation',async()=>{
 const dispatch=vi.fn();const all=vi.fn(async()=>({results:[{status:-1,payload_ref:null}]}));
 const env={APIFY_API_TOKEN:'secret',DB:{prepare:()=>({bind:()=>({all})})},RAW_ARCHIVE:{get:vi.fn()}};
 await expect(runGeneralWebSearchProbe(env as unknown as Parameters<typeof runGeneralWebSearchProbe>[0],dispatch,true)).rejects.toThrow('PRIOR_REJECTION_NOT_CONFIRMED');expect(dispatch).not.toHaveBeenCalled();
});
