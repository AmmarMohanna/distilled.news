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

it('uses the separately approved fifty-cent operation without changing previous identities',async()=>{
 const request=vi.fn<ProviderHttpPort['request']>(async()=>({status:200,headers:{},bytes:new Uint8Array(),json:[]}));
 await generalWebSearchProbe({request},'secret','minimum-budget');
 const [scope,id,provider,ceiling,url]=request.mock.calls[0];
 expect(id).toBe('general-web-search-2026-11-13-retry2');expect(scope.sourceId).toBe(id);expect(provider).toBe('web_search_trial_20261113_retry2');expect(ceiling).toBe(0.50);expect(new URL(url).searchParams.get('maxTotalChargeUsd')).toBe('0.50');expect(request).toHaveBeenCalledTimes(1);
});

it('fences the fifty-cent retry unless the second rejection is also confirmed',async()=>{
 const dispatch=vi.fn();
 const env={APIFY_API_TOKEN:'secret',DB:{prepare:()=>({bind:(provider:string)=>({all:async()=>({results:[provider==='web_search_trial_20261113'?{status:403,payload_ref:'original'}:{status:-1,payload_ref:null}]})})})},RAW_ARCHIVE:{get:async()=>({json:async()=>({error:{type:'platform-feature-disabled',message:'monthly usage limit'}})})}};
 await expect(runGeneralWebSearchProbe(env as unknown as Parameters<typeof runGeneralWebSearchProbe>[0],dispatch,'minimum-budget')).rejects.toThrow('PRIOR_REJECTION_NOT_CONFIRMED');expect(dispatch).not.toHaveBeenCalled();
});
