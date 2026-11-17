import type {FeedHttpPort} from '@distilled/connectors';
/** Respect the origin's rate limit across all feeds. A local cooldown is not
 * another network failure and must not consume a real HTTP retry attempt. */
export function rateLimitedPublicHttp(db:D1Database,http:FeedHttpPort,authorize:(url:string)=>Promise<void>,now=Date.now):FeedHttpPort {
 return {get:async(url,headers,bounds)=>{
  await authorize(url);const origin=new URL(url).origin;
  const prior=await db.prepare('SELECT retry_at FROM connector_http_cooldowns WHERE origin=?').bind(origin).first<{retry_at:number}>();
  if(prior&&prior.retry_at>now()){
   await authorize(url);return {status:429,headers:{'retry-after':String(Math.ceil((prior.retry_at-now())/1000))},bytes:new Uint8Array(),telemetry:{requests:0,latencyMs:0,providerCostUsd:0,status:429}};
  }
  const response=await http.get(url,headers,bounds);await authorize(url);
  if(response.status===429){
   const at=now(),raw=response.headers['retry-after'];
   const directed=raw?( /^\d+$/.test(raw)?at+Number(raw)*1000:Date.parse(raw)):NaN;
   const row=await db.prepare(`INSERT INTO connector_http_cooldowns(origin,failures,retry_at,observed_at) VALUES(?,1,?,?)
   ON CONFLICT(origin) DO UPDATE SET failures=failures+1,retry_at=MAX(retry_at,excluded.retry_at),observed_at=excluded.observed_at RETURNING failures`).bind(origin,Number.isFinite(directed)?Math.max(at+1000,directed):at+300000,at).first<{failures:number}>();
   const retry=Number.isFinite(directed)?Math.max(at+1000,directed):at+Math.min(3600000,300000*2**Math.min((row?.failures??1)-1,4));
   const saved=await db.prepare('UPDATE connector_http_cooldowns SET retry_at=MAX(retry_at,?) WHERE origin=? RETURNING retry_at').bind(retry,origin).first<{retry_at:number}>();
   return {...response,headers:{...response.headers,'retry-after':String(Math.ceil(((saved?.retry_at??retry)-at)/1000))}};
  }
  if([200,304].includes(response.status))await db.prepare('DELETE FROM connector_http_cooldowns WHERE origin=? AND retry_at<=?').bind(origin,now()).run();
  return response;
 }};
}
