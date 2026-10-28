import{it,expect}from'vitest';import{createCandidateAcquisitionRouter}from'./acquisition-router';import{createArticleFallback}from'./article-fallback';import type{AcquisitionClaim}from'./acquisition';
const url='https://publisher.example/journals/test/article/PIIS1473-3099(26)00373-7/fulltext',abstract=url.replace('/fulltext','/abstract'),body='The published abstract describes surveillance methods and their stated limitations. '.repeat(5),claim={job:{id:'job'},candidate:{id:'candidate'},token:'token',input:{observation:{id:'observation',feedId:'feed',feedSourceId:'source',sourceId:'publisher',canonicalUrl:url,representation:'LINK_ONLY',contentCompleteness:'UNKNOWN'}}} as unknown as AcquisitionClaim;
it('retains an exact public abstract as PARTIAL ARTICLE_EXCERPT with its resolved source',async()=>{
 const fallback=createArticleFallback({authorize:async()=>{},zyte:{key:'test',ceilingUsd:.05,initialize:async()=>{},http:{request:async()=>({status:200,headers:{},bytes:new Uint8Array(),json:{url:abstract,statusCode:200,httpResponseBody:btoa('<article><h1>Paper</h1><p>'+body+'</p></article>')}})}}});
 const router=createCandidateAcquisitionRouter({now:()=>new Date().toISOString(),publicGet:async url=>({url,body:'',contentType:'text/html',status:403}),articleFallback:fallback});
 expect(await router(claim)).toMatchObject({representation:'ARTICLE_EXCERPT',contentCompleteness:'PARTIAL',resolvedUrl:abstract,canonicalUrl:url,quality:{extractionComplete:false}});
});
it('rejects a forged partial result for another paper or origin',async()=>{
 const router=createCandidateAcquisitionRouter({now:()=>new Date().toISOString(),publicGet:async url=>({url,body:'',contentType:'text/html',status:403}),articleFallback:async()=>({provider:'website_zyte',status:200,url,canonicalUrl:url,pageKind:'article',body,partial:true,resolvedUrl:'https://other.example/abstract'})});
 await expect(router(claim)).rejects.toMatchObject({code:'INVALID_RESULT',diagnostic:{detail:'PARTIAL_IDENTITY_MISMATCH'}});
});
it('retains a source-owned collection description directly as UNKNOWN LISTING_RESULT',async()=>{
 const source='https://publisher.example/topics/collection',html='<h1>Collection</h1><script type="application/ld+json">'+JSON.stringify({'@type':'Collection','@id':source,about:body})+'</script><main></main>';
 const router=createCandidateAcquisitionRouter({now:()=>new Date().toISOString(),publicGet:async url=>({url,body:html,contentType:'text/html',status:200})});
 expect(await router({...claim,input:{observation:{...claim.input.observation,canonicalUrl:source+'/magazine'}}})).toMatchObject({representation:'LISTING_RESULT',contentCompleteness:'UNKNOWN',body});
});
it('records browser acquisition when rendered Zyte HTML supplies the article',async()=>{
 const router=createCandidateAcquisitionRouter({now:()=>new Date().toISOString(),publicGet:async url=>({url,body:'',contentType:'text/html',status:403}),articleFallback:async()=>({provider:'website_zyte',status:200,url,canonicalUrl:url,pageKind:'article',body,browserRendered:true})});
 expect(await router(claim)).toMatchObject({acquisitionMethod:'browser',acquisitionProvider:'website_zyte'});
});
