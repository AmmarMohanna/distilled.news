import { sha256 } from '@distilled/contracts';
import type { SqlDatabase } from './storage';
import type { ImmutablePayloadStore, SourceScope } from './ports';
import { SourceProviderError } from './provider-types';

export const PROVIDER_BUDGET_SCHEMA=`
CREATE TABLE IF NOT EXISTS connector_daily_provider_budgets(day TEXT PRIMARY KEY,limit_usd REAL NOT NULL CHECK(limit_usd>=0),reserved_usd REAL NOT NULL DEFAULT 0 CHECK(reserved_usd>=0));
CREATE TABLE IF NOT EXISTS connector_provider_budgets(provider_id TEXT PRIMARY KEY, limit_usd REAL NOT NULL, reserved_usd REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS connector_provider_operations(
 provider_id TEXT NOT NULL, operation_id TEXT NOT NULL, request_hash TEXT NOT NULL, ceiling_usd REAL NOT NULL,
 payload_ref TEXT, status INTEGER, headers TEXT, feed_id TEXT, feed_source_id TEXT, PRIMARY KEY(provider_id,operation_id));
CREATE TABLE IF NOT EXISTS connector_source_provider_budgets(
 feed_id TEXT NOT NULL,feed_source_id TEXT NOT NULL,provider_id TEXT NOT NULL,reserved_usd REAL NOT NULL DEFAULT 0,
 PRIMARY KEY(feed_id,feed_source_id,provider_id));`;

export interface ProviderHttpResult {status:number;headers:Record<string,string>;bytes:Uint8Array;json:unknown}
export interface ProviderHttpPort {
  request(scope:SourceScope,operationId:string,providerId:string,ceilingUsd:number,url:string,init:RequestInit):Promise<ProviderHttpResult>;
}
export interface DailyCollectorBudget {limitUsd:number;timeZone:string;now?:()=>Date}
// A confirmed completion with a lost body stays charged conservatively and may
// never be dispatched again. It is distinct from an unknown provider outcome.
export const unresolvedProviderOperationSql="payload_ref IS NULL AND COALESCE(status=200 AND json_extract(headers,'$.reconciliation.kind')='COMPLETED_RESPONSE_LOST' AND json_extract(headers,'$.reconciliation.requestId') IS NOT NULL,0)=0";
function pendingProviderError(headers:string|null|undefined):SourceProviderError {
 try{
  const claim=JSON.parse(headers??'{}'),until=Date.parse(claim.claimExpiresAt),now=Date.now();
  if(!claim.failure&&typeof claim.claimToken==='string'&&until>now&&until<=now+180_000)
   return new SourceProviderError('BACKPRESSURE',new Date(Math.min(until,now+5000)).toISOString(),{detail:'PROVIDER_REQUEST_IN_FLIGHT'});
 }catch{/* Legacy or malformed claims remain uncertain, never redispatched. */}
 return new SourceProviderError('UNCERTAIN_PAID_SUBMISSION');
}
export async function reconcileCompletedZyteResponse(db:SqlDatabase,scope:SourceScope,operationId:string,evidence:{targetUrl:string;requestId:string;providerTimestamp:string;latencyMs:number;evidenceUrl:string;confirmedBy:string;confirmedAt:string}){
 const link=new URL(evidence.evidenceUrl);
 if(!/^[a-f0-9]{32}$/.test(evidence.requestId)||link.protocol!=='https:'||link.hostname!=='app.zyte.com'||link.searchParams.get('requestId')!==evidence.requestId||link.searchParams.get('timestamp')!==evidence.providerTimestamp||!Number.isFinite(Date.parse(evidence.providerTimestamp))||!Number.isFinite(Date.parse(evidence.confirmedAt))||!evidence.confirmedBy||!Number.isSafeInteger(evidence.latencyMs)||evidence.latencyMs<1||evidence.latencyMs>600_000)throw Error('INVALID_COMPLETION_EVIDENCE');
 const hash=await sha256(JSON.stringify(['https://api.zyte.com/v1/extract','POST',JSON.stringify({url:evidence.targetUrl,httpResponseBody:true,httpResponseHeaders:true})]));
 const row=await db.prepare('SELECT request_hash,status,headers,payload_ref FROM connector_provider_operations WHERE provider_id=\'zyte\' AND operation_id=? AND feed_id=? AND feed_source_id=?').bind(operationId,scope.feedId,scope.feedSourceId).first<{request_hash:string;status:number;headers:string;payload_ref:string|null}>();
 if(!row||row.request_hash!==hash)throw Error('COMPLETION_IDENTITY_MISMATCH');
 const headers=JSON.parse(row.headers??'{}');
 if(headers.reconciliation?.kind==='COMPLETED_RESPONSE_LOST'&&headers.reconciliation.requestId===evidence.requestId)return;
 if(row.status!==-1||row.payload_ref)throw Error('COMPLETION_NOT_UNCERTAIN');
 const next=JSON.stringify({...headers,reconciliation:{kind:'COMPLETED_RESPONSE_LOST',...evidence}});
 await db.prepare("UPDATE connector_provider_operations SET status=200,headers=? WHERE provider_id='zyte' AND operation_id=? AND feed_id=? AND feed_source_id=? AND request_hash=? AND status=-1 AND payload_ref IS NULL AND headers=?").bind(next,operationId,scope.feedId,scope.feedSourceId,hash,row.headers).run();
 const verified=await db.prepare("SELECT headers FROM connector_provider_operations WHERE provider_id='zyte' AND operation_id=?").bind(operationId).first<{headers:string}>();
 if(verified?.headers!==next)throw Error('COMPLETION_STATE_CHANGED');
}
export function collectorBudgetDay(date:Date,timeZone:string):string {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part=(kind:string)=>parts.find(p=>p.type===kind)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
/** Paid requests are never blindly resubmitted. Reservations remain conservative bounds,
 * not reported actual costs. Caps are configured by deployment, not by source input. */
export class DurableProviderHttp implements ProviderHttpPort {
  constructor(private readonly db:SqlDatabase,private readonly payloads:ImmutablePayloadStore,
    private readonly dispatch:(url:string,init:RequestInit)=>Promise<Response>,private readonly maxBytes=4_000_000,private readonly deadlineMs=20_000,
    private readonly sourceProviderLimitUsd?:number,private readonly deploymentLimits?:Readonly<Record<string,number>>,
    private readonly dailyBudget?:DailyCollectorBudget,private readonly providerDeadlines:Readonly<Record<string,number>>={},private readonly enforceBudgetLimits=true) {
    if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>10_000_000||!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>60_000)throw new Error('INVALID_PROVIDER_LIMITS');
    if(sourceProviderLimitUsd!==undefined&&(!Number.isFinite(sourceProviderLimitUsd)||sourceProviderLimitUsd<0))throw new Error('INVALID_SOURCE_PROVIDER_BUDGET');
    if(deploymentLimits!==undefined&&(!deploymentLimits||typeof deploymentLimits!=='object'||Array.isArray(deploymentLimits)||Object.values(deploymentLimits).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0)))throw new Error('INVALID_BUDGET');
    if(dailyBudget){if(!Number.isFinite(dailyBudget.limitUsd)||dailyBudget.limitUsd<0)throw Error('INVALID_DAILY_BUDGET');collectorBudgetDay(new Date(),dailyBudget.timeZone);}
    if(Object.values(providerDeadlines).some(ms=>!Number.isSafeInteger(ms)||ms<1||ms>60_000))throw Error('INVALID_PROVIDER_LIMITS');
  }
  async configureLimit(providerId:string,limitUsd:number) {
    if(!Number.isFinite(limitUsd)||limitUsd<0)throw new Error('INVALID_BUDGET');
    await this.db.prepare('INSERT INTO connector_provider_budgets(provider_id,limit_usd) VALUES(?,?) ON CONFLICT(provider_id) DO UPDATE SET limit_usd=excluded.limit_usd WHERE limit_usd<>excluded.limit_usd')
      .bind(providerId,limitUsd).run();
  }
  async configureLimits(limits:Readonly<Record<string,number>>,initializeOnly=false){
    if(Object.values(limits).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))throw new Error('INVALID_BUDGET');
    if(!Object.keys(limits).length)return;
    await this.db.batch(Object.entries(limits).map(([id,value])=>this.db.prepare(`INSERT INTO connector_provider_budgets(provider_id,limit_usd) VALUES(?,?) ON CONFLICT(provider_id) ${initializeOnly?'DO NOTHING':'DO UPDATE SET limit_usd=excluded.limit_usd WHERE limit_usd<>excluded.limit_usd'}`).bind(id,value)));
  }
  async request(scope:SourceScope,operationId:string,providerId:string,ceilingUsd:number,url:string,init:RequestInit):Promise<ProviderHttpResult> {
    if(!Number.isFinite(ceilingUsd)||ceilingUsd<=0)throw new SourceProviderError('BUDGET_EXCEEDED');
    const u=new URL(url);
    if(u.protocol!=='https:'||!['api.twitterapi.io','api.apify.com','api.zyte.com'].includes(u.hostname)||u.username||u.password)throw new Error('INVALID_PROVIDER_URL');
    const scoped=await sha256(JSON.stringify([scope,operationId]));
    // Authentication stays outside stored request hashes and logs. Endpoint/body remain immutable.
    const hash=await sha256(JSON.stringify([url,init.method??'GET',init.body??null]));
    const load=()=>this.db.prepare('SELECT request_hash,payload_ref,status,headers FROM connector_provider_operations WHERE provider_id=? AND operation_id=?')
      .bind(providerId,scoped).first<{request_hash:string;payload_ref:string|null;status:number|null;headers:string|null}>();
    const previous=await load();
    if(previous) {
      if(previous.request_hash!==hash)throw new Error('IDEMPOTENCY_CONFLICT');
      if(JSON.parse(previous.headers??'{}').reconciliation?.kind==='COMPLETED_RESPONSE_LOST')throw new SourceProviderError('RESULT_LOST');
      if(!previous.payload_ref)throw pendingProviderError(previous.headers);
      return this.decode(previous.status!,JSON.parse(previous.headers!),await this.payloads.get(scope,previous.payload_ref));
    }
    const deploymentLimit=this.enforceBudgetLimits?(this.deploymentLimits?.[providerId]??(this.deploymentLimits?0:undefined)):undefined;
    if(deploymentLimit!==undefined&&deploymentLimit<ceilingUsd)throw new SourceProviderError('BUDGET_EXCEEDED');
    // Atomic reserve + insertion. Update only if no prior operation exists. The insertion
    // observes the same transaction, preventing two workers claiming the same request.
    // Preserve reservations made before per-provider source accounting existed.
    // Legacy completed payload paths encode the immutable source scope. An
    // unattributed uncertain legacy charge must be reconciled, never ignored.
    const legacyPending=await this.db.prepare(`SELECT headers FROM connector_provider_operations WHERE provider_id=? AND ${unresolvedProviderOperationSql} AND feed_source_id IS NULL LIMIT 1`).bind(providerId).first<{headers:string|null}>();
    if(legacyPending)throw pendingProviderError(legacyPending.headers);
    const sourcePending=await this.db.prepare(`SELECT headers FROM connector_provider_operations WHERE feed_id=? AND feed_source_id=? AND ${unresolvedProviderOperationSql} LIMIT 1`).bind(scope.feedId,scope.feedSourceId).first<{headers:string|null}>();
    if(sourcePending)throw pendingProviderError(sourcePending.headers);
    const prefix='source-payloads/'+await sha256(JSON.stringify([scope.feedId,scope.feedSourceId,scope.sourceId]))+'/';
    const sourceBudget=this.sourceProviderLimitUsd===undefined?[]:[this.db.prepare(`INSERT INTO connector_source_provider_budgets(feed_id,feed_source_id,provider_id,reserved_usd)
      SELECT ?,?,?,COALESCE(SUM(ceiling_usd),0) FROM connector_provider_operations WHERE provider_id=? AND payload_ref>=? AND payload_ref<? ON CONFLICT DO NOTHING`).bind(scope.feedId,scope.feedSourceId,providerId,providerId,prefix,prefix+'\uffff')];
    const sourceCapped=this.enforceBudgetLimits&&this.sourceProviderLimitUsd!==undefined;
    const sourceGuard=!sourceCapped?'':` AND EXISTS(SELECT 1 FROM connector_source_provider_budgets WHERE feed_id=? AND feed_source_id=? AND provider_id=? AND reserved_usd+?<=?)`;
    const deploymentGuard=deploymentLimit===undefined?'':this.dailyBudget?' AND ?<=?':' AND reserved_usd+?<=?';
    const day=this.dailyBudget?collectorBudgetDay(this.dailyBudget.now?.()??new Date(),this.dailyBudget.timeZone):undefined;
    const dailyGuard=this.enforceBudgetLimits&&this.dailyBudget?' AND EXISTS(SELECT 1 FROM connector_daily_provider_budgets WHERE day=? AND reserved_usd+?<=limit_usd)':'';
    // A later polling window or funded fallback cannot bypass an unresolved
    // submission for this FeedSource, even with no configured source cap.
    // Include both scoped and unattributed legacy fences in the reservation
    // transaction so two different run IDs cannot race past the read above.
    const unresolvedGuard=` AND NOT EXISTS(SELECT 1 FROM connector_provider_operations WHERE ${unresolvedProviderOperationSql} AND ((feed_id=? AND feed_source_id=?) OR (provider_id=? AND feed_source_id IS NULL)))`;
    const token=crypto.randomUUID(),claimHeaders=JSON.stringify({claimToken:token,claimExpiresAt:new Date(Date.now()+(this.providerDeadlines[providerId]??this.deadlineMs)+60_000).toISOString()});
    await this.db.batch([
      ...(this.dailyBudget?[this.db.prepare('INSERT INTO connector_daily_provider_budgets(day,limit_usd,reserved_usd) VALUES(?,?,0) ON CONFLICT(day) DO UPDATE SET limit_usd=excluded.limit_usd').bind(day,this.dailyBudget.limitUsd)]:[]),
      ...sourceBudget,
      this.db.prepare(`INSERT INTO connector_provider_operations(provider_id,operation_id,request_hash,ceiling_usd,feed_id,feed_source_id,headers)
        SELECT ?,?,?,?,?,?,? FROM connector_provider_budgets WHERE provider_id=? AND ${this.enforceBudgetLimits?(this.dailyBudget?'?':'reserved_usd+?')+'<=limit_usd':'1=1'}${sourceGuard}${deploymentGuard}${dailyGuard}${unresolvedGuard} ON CONFLICT DO NOTHING`)
        .bind(providerId,scoped,hash,ceilingUsd,scope.feedId,scope.feedSourceId,claimHeaders,providerId,...(this.enforceBudgetLimits?[ceilingUsd]:[]),...(!sourceCapped?[]:[scope.feedId,scope.feedSourceId,providerId,ceilingUsd,this.sourceProviderLimitUsd]),...(deploymentLimit===undefined?[]:[ceilingUsd,deploymentLimit]),...(this.enforceBudgetLimits&&this.dailyBudget?[day,ceilingUsd]:[]),scope.feedId,scope.feedSourceId,providerId),
      ...(this.dailyBudget?[this.db.prepare(`UPDATE connector_daily_provider_budgets SET reserved_usd=reserved_usd+? WHERE day=? AND EXISTS(SELECT 1 FROM connector_provider_operations WHERE provider_id=? AND operation_id=? AND status IS NULL AND payload_ref IS NULL)`).bind(ceilingUsd,day,providerId,scoped)]:[]),
      this.db.prepare(`UPDATE connector_provider_budgets SET reserved_usd=reserved_usd+? WHERE provider_id=? AND EXISTS
        (SELECT 1 FROM connector_provider_operations WHERE provider_id=? AND operation_id=? AND status IS NULL AND payload_ref IS NULL)`)
        .bind(ceilingUsd,providerId,providerId,scoped),
      ...(this.sourceProviderLimitUsd===undefined?[]:[this.db.prepare(`UPDATE connector_source_provider_budgets SET reserved_usd=reserved_usd+? WHERE feed_id=? AND feed_source_id=? AND provider_id=? AND EXISTS(SELECT 1 FROM connector_provider_operations WHERE provider_id=? AND operation_id=? AND status IS NULL AND payload_ref IS NULL)`).bind(ceilingUsd,scope.feedId,scope.feedSourceId,providerId,providerId,scoped)]),
      // -1 is the durable claim fence; a second caller cannot reserve/dispatch the same operation.
      this.db.prepare('UPDATE connector_provider_operations SET status=-1 WHERE provider_id=? AND operation_id=? AND status IS NULL').bind(providerId,scoped)
    ]);
    const claimed=await load();
    if(!claimed){
      const pending=await this.db.prepare(`SELECT headers FROM connector_provider_operations WHERE feed_id=? AND feed_source_id=? AND ${unresolvedProviderOperationSql} LIMIT 1`).bind(scope.feedId,scope.feedSourceId).first<{headers:string|null}>();
      if(pending)throw pendingProviderError(pending.headers);
      throw new SourceProviderError('BUDGET_EXCEEDED');
    }
    if(claimed.request_hash!==hash)throw new Error('IDEMPOTENCY_CONFLICT');
    // The insertion atomically records the dispatch owner and its finite active
    // lifetime. Only that owner can dispatch; competitors wait or replay.
    const mine=await this.db.prepare('UPDATE connector_provider_operations SET headers=? WHERE provider_id=? AND operation_id=? AND status=-1 AND headers=? RETURNING operation_id')
      .bind(claimHeaders,providerId,scoped,claimHeaders).first();
    if(!mine){const owner=await load();if(owner?.payload_ref)return this.decode(owner.status!,JSON.parse(owner.headers!),await this.payloads.get(scope,owner.payload_ref));throw pendingProviderError(owner?.headers);}
    const abort=new AbortController();
    let timer:ReturnType<typeof setTimeout>;
    const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new SourceProviderError('UNCERTAIN_PAID_SUBMISSION'));},this.providerDeadlines[providerId]??this.deadlineMs);});
    const uncertain=async(phase:string,reason:string,response?:Response)=>{
      // Diagnostic metadata never settles an operation or releases its fence.
      const requestId=response?.headers.get('zyte-request-id');
      const diagnostic={claimToken:token,failure:{phase,reason,at:new Date().toISOString(),...(response?{httpStatus:response.status}:{}),...(requestId&&/^[\w-]{1,200}$/.test(requestId)?{requestId}:{})}};
      await this.db.prepare('UPDATE connector_provider_operations SET headers=? WHERE provider_id=? AND operation_id=? AND payload_ref IS NULL AND headers=?')
        .bind(JSON.stringify(diagnostic),providerId,scoped,claimHeaders).run();
      throw new SourceProviderError('UNCERTAIN_PAID_SUBMISSION');
    };
    let response:Response;
    const dispatch=this.dispatch;
    try {response=await Promise.race([dispatch(url,{...init,redirect:'manual',signal:abort.signal}),timeout]);}
    catch {clearTimeout(timer!);return uncertain('RESPONSE_HEADERS',abort.signal.aborted?'TIMEOUT':'TRANSPORT');}
    const reader=response.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
    try {if(reader)while(true){const part=await Promise.race([reader.read(),timeout]);if(part.done)break;size+=part.value.length;if(size>this.maxBytes)throw new Error('TOO_LARGE');chunks.push(part.value);}}
    catch {void reader?.cancel().catch(()=>{});return uncertain('RESPONSE_BODY',size>this.maxBytes?'BODY_TOO_LARGE':abort.signal.aborted?'TIMEOUT':'TRANSPORT',response);}
    finally {clearTimeout(timer!);reader?.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    const payload=await this.payloads.put(scope,bytes,'application/json');
    const headers:Record<string,string>={};for(const name of ['retry-after','content-type','zyte-request-id']){const v=response.headers.get(name);if(v)headers[name]=v;}
    await this.db.prepare('UPDATE connector_provider_operations SET payload_ref=?,status=?,headers=? WHERE provider_id=? AND operation_id=? AND headers=?')
      .bind(payload.ref,response.status,JSON.stringify(headers),providerId,scoped,claimHeaders).run();
    return this.decode(response.status,headers,bytes);
  }
  private decode(status:number,headers:Record<string,string>,bytes:Uint8Array):ProviderHttpResult {
    let json:unknown;try{json=JSON.parse(new TextDecoder().decode(bytes));}catch{json=undefined;}
    return {status,headers,bytes,json};
  }
}
export function requireProviderSuccess(result:ProviderHttpResult) {
  if(result.status===451)throw new SourceProviderError('POLICY_REFUSAL');
  if(result.status===429){
    const v=result.headers['retry-after'];const seconds=v?Number(v):NaN;
    const retry=Number.isFinite(seconds)?Date.now()+Math.max(0,seconds)*1000:Date.parse(v??'');
    throw new SourceProviderError('RATE_LIMIT',Number.isFinite(retry)?new Date(retry).toISOString():undefined);
  }
  if([401,403].includes(result.status))throw new SourceProviderError('AUTH_REQUIRED');
  if(result.status>=500)throw new SourceProviderError('TRANSIENT');
  if(result.status<200||result.status>=300||result.json===undefined)throw new SourceProviderError('MALFORMED');
}
