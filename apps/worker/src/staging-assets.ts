/** Staging-only static files share the private bucket under an immutable, manifest-scoped prefix. */
export function createStagingAssets(bucket:R2Bucket,prefix:string):Fetcher {
 if(!/^staging-assets\/[a-f0-9]{40}\/$/.test(prefix))throw new Error('INVALID_STAGING_ASSET_PREFIX');
 return {fetch:async(input:RequestInfo|URL)=>{
  const request=input instanceof Request?input:new Request(input);
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  const manifest=await bucket.get(prefix+'manifest.json');
  if(!manifest||manifest.size>64000)return new Response('Staging assets unavailable',{status:503});
  const entries=await manifest.json<Record<string,{hash:string;type:string}>>();
  const path=new URL(request.url).pathname,entry=Object.hasOwn(entries,path)?entries[path]:entries['/index.html'];
  if(!entry||!/^[a-f0-9]{32}$/.test(entry.hash)||!/^[-\w.+]+\/[-\w.+]+$/.test(entry.type))return new Response('Staging assets unavailable',{status:503});
  const object=await bucket.get(prefix+entry.hash);
  if(!object)return new Response('Staging assets unavailable',{status:503});
  return new Response(request.method==='HEAD'?null:object.body,{headers:{'content-type':entry.type,'cache-control':entry.type==='text/html'?'no-cache':'public, max-age=3600','etag':'"'+entry.hash+'"'}});
 }} as unknown as Fetcher;
}
