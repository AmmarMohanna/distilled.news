import {expect,it,vi} from 'vitest';
import {paidAssessmentArticles} from './source-assessment-paid';
import type {Env} from './types';
import type {ProviderHttpPort} from '@distilled/connectors';
const {request}=vi.hoisted(()=>({request:vi.fn<ProviderHttpPort['request']>()}));
vi.mock('./source-backend',()=>({createSourceBackend:()=>({paidHttp:{request}})}));
const env={SOURCE_PAID_VERIFICATION_ENABLED:'true',ZYTE_API_KEY:'test',SOURCE_PROVIDER_BUDGETS_JSON:'{"zyte":15}',SOURCE_OPERATION_CEILINGS_JSON:'{"zyte":0.05}'} as Env;
it('requires an explicit retrieval budget before any paid request',async()=>{
 request.mockClear();expect(await paidAssessmentArticles(env,'owner',{title:'Georges Khabbaz',description:'Film'},'https://lovin.co/',0,vi.fn())).toEqual([]);expect(request).not.toHaveBeenCalled();
});
it('bounds retrieval to a listing and one relevant same-publisher article while preserving its observed canonical URL',async()=>{
 request.mockReset();
 const requested='https://lovin.co/beirut/entertainment/interview/',observed='https://lovin.co/beirut/en/entertainment/interview/';
 const body='Georges Khabbaz discusses his film and theater projects in an interview with the publication. '.repeat(5);
 request.mockImplementation(async(_scope,_id,_provider,_ceiling,_endpoint,init)=>{
  const {url}=JSON.parse(String(init.body));
  const html=url==='https://lovin.co/'?`<main><h1>Featured stories</h1><a href="${requested}"><h3>Georges Khabbaz interview</h3></a><a href="https://lovin.co/dubai/news/other/"><h3>Other report</h3></a></main>`:`<html><head><meta property="og:type" content="article"><link rel="canonical" href="${observed}"></head><body><article><h1>Georges Khabbaz interview</h1><p>${body}</p></article></body></html>`;
  return {status:200,headers:{},bytes:new Uint8Array(),json:{statusCode:200,url:url==='https://lovin.co/'?url:observed,browserHtml:html}};
 });
 expect(await paidAssessmentArticles(env,'owner',{title:'Georges Khabbaz',description:'Film'},'https://lovin.co/',0.10,vi.fn())).toEqual([expect.objectContaining({url:observed,body:expect.stringContaining('Georges Khabbaz')})]);
 expect(request).toHaveBeenCalledTimes(2);expect(request.mock.calls.every(call=>call[2]==='zyte'&&call[3]===0.05)).toBe(true);
 expect(request.mock.calls[1][1]).toContain(requested);
});
it('does not accept another publisher returned by the provider',async()=>{
 request.mockReset();request.mockResolvedValue({status:200,headers:{},bytes:new Uint8Array(),json:{statusCode:200,url:'https://foreign.example/',browserHtml:'<article><h1>Unrelated</h1></article>'}});
 expect(await paidAssessmentArticles(env,'owner',{title:'Subject',description:'News'},'https://lovin.co/',0.10,vi.fn())).toEqual([]);expect(request).toHaveBeenCalledTimes(1);
});
