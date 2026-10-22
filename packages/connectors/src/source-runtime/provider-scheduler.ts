import { sha256, HandoffError } from '@distilled/contracts';
import type { SqlDatabase } from './storage';
import { FallbackSourceCollector } from './provider-collector';
import { DEFAULT_SOURCE_ORDER, SourceProviderError, type SourceFetchRequest } from './provider-types';
import {SourceHandoffWait} from './handoff-wait';
import {D1ProviderSourceRepository} from './provider-storage';

export const PROVIDER_POLL_SCHEMA=`CREATE TABLE IF NOT EXISTS connector_provider_poll_jobs(
 job_id TEXT PRIMARY KEY, request TEXT NOT NULL, initial_hash TEXT NOT NULL, provider_order TEXT NOT NULL,
 due_at TEXT NOT NULL, scheduled_at TEXT NOT NULL DEFAULT '', lease_until TEXT, lease_version INTEGER NOT NULL DEFAULT 0,
 offset INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, pages INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'PENDING', result TEXT, last_error TEXT);`;
interface Job {job_id:string;request:string;provider_order:string;lease_version:number;offset:number;attempts:number;pages:number;last_error:string|null}
/** Explicit backend runner; does not register production cron, migrate a source, or
 * create an endpoint. Authorization must also ensure legacy polling is disabled. */
export class D1ProviderPollScheduler {
  constructor(private db:SqlDatabase,private collector:Pick<FallbackSourceCollector,'collect'>,
    private authorize:(request:SourceFetchRequest)=>Promise<boolean>,private now=Date.now,private maxPages=100,private coalescePending=false,private retireUnboundedX=false){}
  async schedule(id:string,request:SourceFetchRequest,dueAt:string,order=DEFAULT_SOURCE_ORDER[request.source.family]) {
    if(!id||!Number.isFinite(Date.parse(dueAt)))throw new Error('INVALID_SCHEDULE');
    const data=JSON.stringify(request),providers=JSON.stringify(order),hash=await sha256(JSON.stringify([data,providers]));
    await this.db.prepare(`INSERT INTO connector_provider_poll_jobs(job_id,request,initial_hash,provider_order,due_at,scheduled_at)
      SELECT ?,?,?,?,?,? ${this.coalescePending?`WHERE NOT EXISTS(SELECT 1 FROM connector_provider_poll_jobs WHERE state='PENDING'
      AND json_extract(request,'$.scope.feedSourceId')=? AND json_extract(request,'$.configurationRevision') IS ? AND job_id<>?
      AND (json_type(request,'$.recheckItemKeys') IS NULL)=?)`:''} ON CONFLICT DO NOTHING`)
      .bind(id,data,hash,providers,new Date(dueAt).toISOString(),new Date(dueAt).toISOString(),...(this.coalescePending?[request.scope.feedSourceId,request.configurationRevision??null,id,request.recheckItemKeys?0:1]:[])).run();
    const row=await this.db.prepare('SELECT initial_hash FROM connector_provider_poll_jobs WHERE job_id=?').bind(id).first<{initial_hash:string}>();
    if(!row&&this.coalescePending)return;
    if(row?.initial_hash!==hash)throw new HandoffError('IDEMPOTENCY_CONFLICT');
  }
  async runOne(leaseMs=300000,jobId?:string|readonly string[]):Promise<'IDLE'|'DONE'|'RETRY'|'BLOCKED'|'CANCELLED'|'LEASE_LOST'> {
    if(!Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>600000)throw new Error('INVALID_LEASE');
    const now=new Date(this.now()).toISOString();
    const job=await this.db.prepare(`UPDATE connector_provider_poll_jobs SET lease_until=?,lease_version=lease_version+1,attempts=attempts+1
      WHERE job_id=(SELECT j.job_id FROM connector_provider_poll_jobs j WHERE j.state='PENDING' AND j.due_at<=? AND (j.lease_until IS NULL OR j.lease_until<=?)
        AND NOT EXISTS(SELECT 1 FROM connector_provider_poll_jobs active WHERE active.state='PENDING' AND active.lease_until>?
          AND json_extract(active.request,'$.scope.feedSourceId')=json_extract(j.request,'$.scope.feedSourceId'))
        AND (json_extract(j.request,'$.source.family')<>'telegram' OR NOT EXISTS(
          SELECT 1 FROM connector_provider_poll_jobs active WHERE active.state='PENDING' AND active.lease_until>?
          AND json_extract(active.request,'$.source.family')='telegram'))
        ${typeof jobId==='string'?'AND j.job_id=?':''} ORDER BY CASE WHEN j.job_id IN (SELECT value FROM json_each(?)) THEN 0 ELSE 1 END,CASE WHEN CAST(strftime('%M',?) AS INTEGER)%4=0 OR (j.pages=0 AND j.offset=0) THEN 0 ELSE 1 END,j.due_at,j.job_id LIMIT 1)
      RETURNING job_id,request,provider_order,lease_version,offset,attempts,pages,last_error`)
      .bind(new Date(this.now()+leaseMs).toISOString(),now,now,now,now,...(typeof jobId==='string'?[jobId]:[]),JSON.stringify(Array.isArray(jobId)?jobId:[]),now).first<Job>();
    if(!job)return 'IDLE';
    const request:SourceFetchRequest=JSON.parse(job.request);
    let leaseLost=false,renewing:Promise<void>|undefined;
    const renew=()=>{
      if(renewing||leaseLost)return;
      const at=this.now();
      renewing=(async()=>{
        try{
          const changed=await this.db.prepare(`UPDATE connector_provider_poll_jobs SET lease_until=?
            WHERE job_id=? AND lease_version=? AND state='PENDING' AND lease_until>? RETURNING job_id`)
            .bind(new Date(at+leaseMs).toISOString(),job.job_id,job.lease_version,new Date(at).toISOString()).first();
          if(!changed)leaseLost=true;
        }catch{leaseLost=true;} // Never commit job state after an unverified lease renewal.
      })().finally(()=>{renewing=undefined;});
    };
    const heartbeat=setInterval(renew,Math.max(250,Math.floor(leaseMs/3)));
    const update=async(state:string,result:unknown,error:string|null=null,next=request,offset=job.offset,pages=job.pages,delay=1000,reset=false,wait=false)=>{
      if(renewing)await renewing;
      if(leaseLost)return false;
      const changed=await this.db.prepare(`UPDATE connector_provider_poll_jobs SET state=?,result=COALESCE(?,result),last_error=?,request=?,offset=?,pages=?,
        attempts=?,due_at=?,lease_until=NULL WHERE job_id=? AND lease_version=? AND lease_until>? RETURNING job_id`)
        .bind(state,result===null?null:JSON.stringify(result),error,JSON.stringify(next),offset,pages,reset?0:wait?Math.max(0,job.attempts-1):job.attempts,new Date(this.now()+delay).toISOString(),job.job_id,job.lease_version,new Date(this.now()).toISOString()).first();
      return !!changed;
    };
    const finish=async(state:'DONE'|'BLOCKED'|'CANCELLED',result:unknown,error?:string)=>await update(state,result,error??null)?state:'LEASE_LOST' as const;
    const retry=async(result:unknown,next=request,offset=job.offset,pages=job.pages,delay=Math.min(300000,1000*2**job.attempts),reset=false,error:string|null=null,wait=false)=>
      await update('PENDING',result,error,next,offset,pages,delay,reset,wait)?'RETRY' as const:'LEASE_LOST' as const;
    try {
      if(job.attempts>8)return await finish('BLOCKED',null,'RETRY_LIMIT'+(job.last_error?':'+job.last_error:''));
      if(job.pages>=this.maxPages)return await finish('BLOCKED',null,'PAGE_LIMIT');
      if(!await this.authorize(request))return await finish('CANCELLED',null);
      // Legacy unbounded X scans must not keep opening historical pages. Drain
      // already captured data under its original identity first. Actor dataset
      // continuations retain their existing recovery path and paid actor ID.
      const retiring=this.retireUnboundedX&&['x_profile','x_search'].includes(request.source.family)
        &&!request.recheckItemKeys&&!request.requestedBounds.startTime&&!request.requestedBounds.endTime
        &&(!request.continuation||request.continuation.providerId==='x_twitterapi_io');
      if(retiring){
        const repository=new D1ProviderSourceRepository(this.db);
        const key=(n:number)=>sha256(JSON.stringify([request.scope,request.runId,'provider-batch',n]));
        const saved=await repository.loadProviderBatch(request.scope,await key(job.offset))
          ??await repository.loadSnapshot(request.scope,await key(-1));
        // A started run without a durable page is not safe to re-fetch or send
        // to another paid provider. Keep it for explicit reconciliation.
        let started=false;
        if(!saved)for(const providerId of JSON.parse(job.provider_order) as string[]){
          if(await repository.loadRun(request.scope,await sha256(JSON.stringify([request.scope,request.runId,providerId])))){started=true;break;}
        }
        if(!saved)return await finish('BLOCKED',null,started?'UNBOUNDED_RECOVERY_REQUIRED':'UNBOUNDED_SCOPE_RETIRED');
      }
      const result=await this.collector.collect(request,JSON.parse(job.provider_order),job.offset);
      if(result.state==='FETCH_FAILED'){
        if(result.attempts.length&&result.attempts.every(a=>a.failure==='BUDGET_EXCEEDED'))return await finish('BLOCKED',result,'BUDGET_EXCEEDED');
        if(result.attempts.every(a=>['AUTH_REQUIRED','UNAVAILABLE','MALFORMED'].includes(a.failure??'')))return await finish('BLOCKED',result,'PROVIDER_REPAIR_REQUIRED');
        const retryAt=Math.max(0,...result.attempts.map(a=>Date.parse(a.retryNotBefore??'')||0));
        return await retry(result,{...request,runId:request.runId+':retry:'+job.attempts},0,job.pages,Math.max(1000*2**job.attempts,retryAt-this.now()),false,result.attempts.at(-1)?.failure??'TRANSIENT');
      }
      if(result.checkpoint==='CAS_CONFLICT')return await finish('BLOCKED',result,'CHECKPOINT_CONFLICT');
      if(result.checkpoint==='BLOCKED')return await retry(result);
      if(result.nextOffset!==undefined)return await retry(result,request,result.nextOffset,job.pages,0,true);
      if(retiring&&result.providerId!=='x_apify')return await finish('BLOCKED',result,'UNBOUNDED_SCOPE_RETIRED');
      if(result.continuation)return await retry(result,{...request,runId:await sha256(request.runId+':page'),continuation:result.continuation},0,job.pages+1,1000,true);
      return await finish('DONE',result);
    }catch(error){
      if(error instanceof SourceHandoffWait)return await retry(null,request,job.offset,job.pages,5000,false,error.code,true);
      console.warn(JSON.stringify({type:'CONNECTOR_POLL_FAILURE',family:'provider',jobId:job.job_id,attempt:job.attempts,cause:error instanceof HandoffError||error instanceof SourceProviderError?error.code:'INTERNAL_FAILURE'}));
      if(error instanceof SourceProviderError&&error.code==='BACKPRESSURE')return await retry(null,request,job.offset,job.pages,Math.max(5000,Date.parse(error.retryNotBefore??'')-this.now()||0),false,'BACKPRESSURE',true);
      if(error instanceof SourceProviderError)return await finish('BLOCKED',null,error.code);
      if(error instanceof HandoffError&&!error.retryable)return await finish('BLOCKED',null,error.code);
      // Unknown intake response: immutable saved batch is retried under its original identity.
      return await retry(null,request,job.offset,job.pages,undefined,false,error instanceof HandoffError?error.code:'INTERNAL_FAILURE');
    }finally{clearInterval(heartbeat);if(renewing)await renewing;}
  }
}
