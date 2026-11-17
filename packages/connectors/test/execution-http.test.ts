import {describe,it,expect,vi} from 'vitest';
import {HttpSourceExecution} from '../src/source-runtime/execution-http';
const token='test-only-credential-'.repeat(3);
describe('private source execution transport',()=>{
  it('distinguishes confirmed helper occupancy, throttling and generic service failures',async()=>{
    for(const [status,body,detail,code] of [[503,{error:'BUSY'},'HELPER_GLOBAL_CAPACITY_BUSY','BACKPRESSURE'],[429,{error:'throttled'},'HELPER_HTTP_RATE_LIMIT','BACKPRESSURE'],[503,{error:'service down'},'HELPER_SERVICE_UNAVAILABLE','TRANSIENT']] as const){
      const client=new HttpSourceExecution('https://runtime.example/v1/source-execution',token,async()=>Response.json(body,{status,headers:{'retry-after':'30'}}));
      await expect(client.execute('public_article',{})).rejects.toMatchObject({code,diagnostic:{detail,httpStatus:status}});
    }
  });
  it('requires HTTPS and a dedicated credential',()=>{
    expect(()=>new HttpSourceExecution('http://runtime.example/v1/source-execution',token)).toThrow();
    expect(()=>new HttpSourceExecution('https://runtime.example/v1/source-execution','short')).toThrow();
    expect(()=>new HttpSourceExecution('http://127.0.0.1:8790/v1/source-execution',token,fetch,true)).not.toThrow();
  });
  it('sends structured input with authentication and refuses redirects',async()=>{
    const dispatch=vi.fn<typeof fetch>().mockResolvedValue(Response.json({body:'article'}));
    const client=new HttpSourceExecution('https://runtime.example/v1/source-execution',token,dispatch);
    expect(await client.execute('extract',{html:'<article>text</article>'})).toEqual({body:'article'});
    expect(dispatch.mock.calls[0][1]).toMatchObject({method:'POST',redirect:'manual',headers:{authorization:`Bearer ${token}`}});
    dispatch.mockResolvedValue(new Response(null,{status:302,headers:{location:'https://other.example'}}));
    await expect(client.execute('extract',{})).rejects.toThrow('SOURCE_EXECUTION_UNAVAILABLE');
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
  it('honors a shorter extraction deadline even if a dispatcher ignores abort',async()=>{
    const client=new HttpSourceExecution('https://runtime.example/v1/source-execution',token,()=>new Promise(()=>{}),false,1000);
    await expect(client.execute('extract',{html:'<article>text</article>'},{timeoutMs:10})).rejects.toThrow('SOURCE_EXECUTION_TIMEOUT');
    await expect(client.execute('extract',{}, {timeoutMs:1001})).rejects.toThrow('INVALID_SOURCE_EXECUTION_TIMEOUT');
  });
  it('does not hang when the private runtime stops sending its response body',async()=>{
    const dispatch=vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({pull:()=>new Promise(()=>{})})));
    const client=new HttpSourceExecution('https://runtime.example/v1/source-execution',token,dispatch,false,1000);
    await expect(client.execute('extract',{}, {timeoutMs:10})).rejects.toThrow('SOURCE_EXECUTION_TIMEOUT');
  });
});
