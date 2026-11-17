import {it,expect,vi} from 'vitest';
import {BoundedFeedHttp} from '../src/source-runtime/http';
it('authorized same-origin feed slash redirects preserve the complete response and request accounting',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(null,{status:301,headers:{location:'/ai/feed/'}})).mockResolvedValueOnce(new Response('<rss>complete</rss>'));
 const response=await new BoundedFeedHttp(fetcher,{followSameOriginRedirects:true}).get('https://publisher.example/ai/feed',{});
 expect(fetcher.mock.calls[1][0]).toBe('https://publisher.example/ai/feed/');expect(response.status).toBe(200);expect(response.telemetry.requests).toBe(2);expect(new TextDecoder().decode(response.bytes)).toBe('<rss>complete</rss>');
});
it.each(['http://publisher.example/feed','https://unapproved.example/feed','https://user:pass@publisher.example/feed','https://publisher.example:444/feed','http://127.0.0.1/feed','https://publisher.example/feed'])('redirect cannot broaden source permission or loop: %s',location=>{
 const fetcher=vi.fn(async()=>new Response(null,{status:301,headers:{location}}));
 return new BoundedFeedHttp(fetcher,{followSameOriginRedirects:true}).get('https://publisher.example/feed',{}).then(r=>{expect(r.status).toBe(301);expect(fetcher).toHaveBeenCalledTimes(1)});
});
it('a rate limit without Retry-After yields to durable scheduling after one request',async()=>{
 const fetcher=vi.fn(async()=>new Response(null,{status:429})),sleep=vi.fn();
 const response=await new BoundedFeedHttp(fetcher,{sleep}).get('https://publisher.example/feed',{});expect(response.status).toBe(429);expect(fetcher).toHaveBeenCalledTimes(1);expect(sleep).not.toHaveBeenCalled();
});
