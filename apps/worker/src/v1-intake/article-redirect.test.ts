import {expect,it,vi} from 'vitest';
import {verifyArticleRedirect,validArticleRedirect} from './article-redirect';
it('verifies publisher redirects across public origins without forwarding authentication',async()=>{
 const from='https://publisher.example/old',to='https://learn.publisher.example/docs/topic';
 const fetcher=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(null,{status:301,headers:{location:to}}));
 const proof=await verifyArticleRedirect(from,to,fetcher,async()=>{});
 expect(validArticleRedirect(proof,from,to)).toBe(true);
 expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:'manual',headers:{accept:'text/html'}});
});
it.each(['https://127.0.0.1/private','https://publisher.example/login','http://publisher.example/topic','https://publisher.example/old'])('rejects unsafe, login or looping redirects: %s',async to=>{
 const fetcher=vi.fn(async()=>new Response(null,{status:302,headers:{location:to}}));
 expect(await verifyArticleRedirect('https://publisher.example/old',to,fetcher,async()=>{})).toBeUndefined();
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it('never treats a provider final URL or a different observed destination as redirect proof',async()=>{
 const fetcher=vi.fn(async()=>new Response(null,{status:200}));
 expect(await verifyArticleRedirect('https://publisher.example/old','https://publisher.example/new',fetcher,async()=>{})).toBeUndefined();
 expect(validArticleRedirect({requestedUrl:'https://publisher.example/old',resolvedUrl:'https://publisher.example/new',hops:[{from:'https://publisher.example/old',to:'https://publisher.example/other',status:301}]},'https://publisher.example/old','https://publisher.example/new')).toBe(false);
});
