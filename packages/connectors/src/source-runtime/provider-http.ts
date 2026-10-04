import { sha256 } from '@distilled/contracts';
import type { SqlDatabase } from './storage';
import type { ImmutablePayloadStore, SourceScope } from './ports';
import { SourceProviderError } from './provider-types';

export const PROVIDER_BUDGET_SCHEMA=`
CREATE TABLE IF NOT EXISTS connector_provider_budgets(provider_id TEXT PRIMARY KEY, limit_usd REAL NOT NULL, reserved_usd REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS connector_provider_operations(
 provider_id TEXT NOT NULL, operation_id TEXT NOT NULL, request_hash TEXT NOT NULL, ceiling_usd REAL NOT NULL,
 payload_ref TEXT, status INTEGER, headers TEXT, PRIMARY KEY(provider_id,operation_id));`;

export interface ProviderHttpResult {status:number;headers:Record<string,string>;bytes:Uint8Array;json:unknown}
export interface ProviderHttpPort {
  request(scope:SourceScope,operationId:string,providerId:string,ceilingUsd:number,url:string,init:RequestInit):Promise<ProviderHttpResult>;
}
/** Paid requests are never blindly resubmitted. Reservations remain conservative bounds,
 * not reported actual costs. Caps are configured by deployment, not by source input. */
export class DurableProviderHttp implements ProviderHttpPort {
  constructor(private readonly db:SqlDatabase,private readonly payloads:ImmutablePayloadStore,
    private readonly dispatch:(url:string,init:RequestInit)=>Promise<Response>,private readonly maxBytes=4_000_000,private readonly deadlineMs=20_000) {
    if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>10_000_000||!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>60_000)throw new Error('INVALID_PROVIDER_LIMITS');
  }
  async configureLimit(providerId:string,limitUsd:number) {
    if(!Number.isFinite(limitUsd)||limitUsd<0)throw new Error('INVALID_BUDGET');
    await this.db.prepare('INSERT INTO connector_provider_budgets(provider_id,limit_usd) VALUES(?,?) ON CONFLICT(provider_id) DO UPDATE SET limit_usd=excluded.limit_usd')
      .bind(providerId,limitUsd).run();
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
      if(!previous.payload_ref)throw new SourceProviderError('UNCERTAIN_PAID_SUBMISSION');
      return this.decode(previous.status!,JSON.parse(previous.headers!),await this.payloads.get(scope,previous.payload_ref));
    }
    // Atomic reserve + insertion. Update only if no prior operation exists. The insertion
    // observes the same transaction, preventing two workers claiming the same request.
    await this.db.batch([
      this.db.prepare(`INSERT INTO connector_provider_operations(provider_id,operation_id,request_hash,ceiling_usd)
        SELECT ?,?,?,? FROM connector_provider_budgets WHERE provider_id=? AND reserved_usd+?<=limit_usd ON CONFLICT DO NOTHING`)
        .bind(providerId,scoped,hash,ceilingUsd,providerId,ceilingUsd),
      this.db.prepare(`UPDATE connector_provider_budgets SET reserved_usd=reserved_usd+? WHERE provider_id=? AND EXISTS
        (SELECT 1 FROM connector_provider_operations WHERE provider_id=? AND operation_id=? AND status IS NULL AND payload_ref IS NULL)`)
        .bind(ceilingUsd,providerId,providerId,scoped),
      // -1 is the durable claim fence; a second caller cannot reserve/dispatch the same operation.
      this.db.prepare('UPDATE connector_provider_operations SET status=-1 WHERE provider_id=? AND operation_id=? AND status IS NULL').bind(providerId,scoped)
    ]);
    const claimed=await load();
    if(!claimed)throw new SourceProviderError('BUDGET_EXCEEDED');
    if(claimed.request_hash!==hash)throw new Error('IDEMPOTENCY_CONFLICT');
    // Readback alone cannot tell who inserted the operation. Acquire a unique dispatch token.
    const token=crypto.randomUUID();
    const mine=await this.db.prepare('UPDATE connector_provider_operations SET headers=? WHERE provider_id=? AND operation_id=? AND status=-1 AND headers IS NULL RETURNING operation_id')
      .bind(JSON.stringify({claimToken:token}),providerId,scoped).first();
    if(!mine)throw new SourceProviderError('UNCERTAIN_PAID_SUBMISSION');
    const abort=new AbortController();
    let timer:ReturnType<typeof setTimeout>;
    const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new SourceProviderError('UNCERTAIN_PAID_SUBMISSION'));},this.deadlineMs);});
    let response:Response;
    try {response=await Promise.race([this.dispatch(url,{...init,redirect:'manual',signal:abort.signal}),timeout]);}
    catch {clearTimeout(timer!);throw new SourceProviderError('UNCERTAIN_PAID_SUBMISSION');}
    const reader=response.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
    try {if(reader)while(true){const part=await Promise.race([reader.read(),timeout]);if(part.done)break;size+=part.value.length;if(size>this.maxBytes)throw new Error('TOO_LARGE');chunks.push(part.value);}}
    catch {void reader?.cancel().catch(()=>{});throw new SourceProviderError('UNCERTAIN_PAID_SUBMISSION');}
    finally {clearTimeout(timer!);reader?.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    const payload=await this.payloads.put(scope,bytes,'application/json');
    const headers:Record<string,string>={};for(const name of ['retry-after','content-type']){const v=response.headers.get(name);if(v)headers[name]=v;}
    await this.db.prepare('UPDATE connector_provider_operations SET payload_ref=?,status=?,headers=? WHERE provider_id=? AND operation_id=? AND headers=?')
      .bind(payload.ref,response.status,JSON.stringify(headers),providerId,scoped,JSON.stringify({claimToken:token})).run();
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
