import {isGoogleNewsRssUrl,retryAfterTime,type FeedHttpPort} from '@distilled/connectors';
/** Respect the origin's rate limit across all feeds. A local cooldown is not
 * another network failure and must not consume a real HTTP retry attempt. */
export function rateLimitedPublicHttp(db:D1Database,http:FeedHttpPort,authorize:(url:string)=>Promise<void>,now=Date.now):FeedHttpPort {
 return {get:async(url,headers,bounds)=>{
  await authorize(url);
  const target=new URL(url),google=isGoogleNewsRssUrl(target);
  target.hash='';target.searchParams.sort();
  // Keep origin-wide throttling for existing sources. Google RSS duplicates
  // share the canonical request URL, independently of feed and tenant.
  const key=google?target.href:target.origin;
  const prior=await db.prepare('SELECT retry_at FROM connector_http_cooldowns WHERE origin=?').bind(key).first<{retry_at:number}>();
  const checkedAt=now();
  if(prior&&prior.retry_at>checkedAt){
   await authorize(url);return {status:429,headers:{'retry-after':String(Math.ceil((prior.retry_at-checkedAt)/1000))},bytes:new Uint8Array(),telemetry:{requests:0,latencyMs:0,providerCostUsd:0,status:429}};
  }
  const response=await http.get(url,headers,bounds);await authorize(url);
  if(response.status===429){
   const at=now(),directed=retryAfterTime(response.headers,at);
   const jitter=google&&directed===undefined?0.75+Math.random()/4:1;
   const retry=directed===undefined?at+Math.ceil(300_000*jitter):Math.max(at+1000,directed);
   const row=await db.prepare(`INSERT INTO connector_http_cooldowns(origin,failures,retry_at,observed_at) VALUES(?,1,?,?)
   ON CONFLICT(origin) DO UPDATE SET failures=failures+1,retry_at=MAX(retry_at,CASE WHEN ? THEN excluded.retry_at
    ELSE excluded.observed_at+CAST(MIN(3600000,300000*(1 << MIN(failures,4)))*?+0.999 AS INTEGER) END),
   observed_at=excluded.observed_at RETURNING retry_at`).bind(key,retry,at,directed!==undefined?1:0,jitter).first<{retry_at:number}>();
   const headers=new Headers(response.headers);
   headers.set('retry-after',String(Math.ceil(((row?.retry_at??retry)-at)/1000)));
   return {...response,headers:Object.fromEntries(headers)};
  }
  if([200,304].includes(response.status))await db.prepare('DELETE FROM connector_http_cooldowns WHERE origin=? AND retry_at<=?').bind(key,now()).run();
  return response;
 }};
}
