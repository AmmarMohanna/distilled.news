import {it,expect,vi} from 'vitest';import {sourceExecutionStatus}from'./source-execution-status';
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
