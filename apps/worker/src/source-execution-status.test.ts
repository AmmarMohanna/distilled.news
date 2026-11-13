import {it,expect,vi} from 'vitest';import {sourceExecutionStatus,sourceExecutionProbe}from'./source-execution-status';
import type {Env} from './types';
it('probes only admitted anonymous operations and exposes no returned article text or credentials',async()=>{
 const dispatch=vi.fn(async(_url:unknown,init:RequestInit)=>{expect(JSON.parse(init.body as string)).toEqual({kind:'public_article',input:{url:'https://lovin.co/'}});return Response.json({status:403,body:'private response text',token:'secret-token'});});
 const env={SOURCE_EXECUTION_URL:'http://127.0.0.1:8791/v1/source-execution',SOURCE_EXECUTION_TOKEN:'test-only-token-'.repeat(3),SOURCE_EXECUTION_SERVICE:{fetch:dispatch},DB:{prepare:()=>({bind:()=>({first:async()=>({slot:0}),run:async()=>({})})})}} as unknown as Env;
 const result=await sourceExecutionProbe(env,'https://lovin.co/','public_article');
 expect(result).toMatchObject({state:'RESPONDED',transportStatus:200,upstreamStatus:403,bodyCharacters:21});
 expect(JSON.stringify(result)).not.toMatch(/private response text|secret-token/);
 await expect(sourceExecutionProbe(env,'https://127.0.0.1/','public_article')).rejects.toThrow();
 await expect(sourceExecutionProbe(env,'https://lovin.co/','google_feed')).rejects.toThrow('INVALID_GOOGLE_PROBE');
 expect(dispatch).toHaveBeenCalledTimes(1);
});
it('returns only authenticated helper capacity fields and excludes targets and secrets',async()=>{
 const fetcher=vi.fn(async(url:string,init:RequestInit)=>{expect(url).toBe('http://127.0.0.1:8790/v1/source-execution/status');expect(init.method).toBe('GET');expect(new Headers(init.headers).get('authorization')).toBe('Bearer secret');return Response.json({active:1,maxConcurrent:2,activeTelegram:0,telegramWaiting:0,token:'secret',requests:[{kind:'google_resolve',phase:'EXECUTING',elapsedMs:123,url:'https://private.example'}]});});
 const result=await sourceExecutionStatus({SOURCE_EXECUTION_URL:'http://127.0.0.1:8790/v1/source-execution',SOURCE_EXECUTION_TOKEN:'secret',SOURCE_EXECUTION_SERVICE:{fetch:fetcher}as unknown as Fetcher});
 expect(result).toEqual({state:'AVAILABLE',active:1,maxConcurrent:2,activeTelegram:0,telegramWaiting:0,requests:[{kind:'google_resolve',phase:'EXECUTING',elapsedMs:123}]});expect(JSON.stringify(result)).not.toMatch(/secret|private/);
});
it('keeps missing, unsupported or malformed helper status distinct from usable capacity',async()=>{
 expect(await sourceExecutionStatus({})).toEqual({state:'NOT_CONFIGURED'});
 const env={SOURCE_EXECUTION_URL:'http://localhost/v1/source-execution',SOURCE_EXECUTION_TOKEN:'secret',SOURCE_EXECUTION_SERVICE:{fetch:vi.fn(async()=>Response.json({error:'detail'},{status:404}))}as unknown as Fetcher};
 expect(await sourceExecutionStatus(env)).toEqual({state:'UNAVAILABLE',httpStatus:404});
 env.SOURCE_EXECUTION_SERVICE={fetch:vi.fn(async()=>new Response('x'.repeat(16001)))}as unknown as Fetcher;
 expect(await sourceExecutionStatus(env)).toEqual({state:'INVALID_STATUS'});
});
