import { sha256, HandoffError } from '@distilled/contracts';
import type { SqlDatabase } from './storage';
import { FallbackSourceCollector } from './provider-collector';
import { DEFAULT_SOURCE_ORDER, SourceProviderError, type SourceFetchRequest } from './provider-types';

export const PROVIDER_POLL_SCHEMA=`CREATE TABLE IF NOT EXISTS connector_provider_poll_jobs(
 job_id TEXT PRIMARY KEY, request TEXT NOT NULL, initial_hash TEXT NOT NULL, provider_order TEXT NOT NULL,
 due_at TEXT NOT NULL, lease_until TEXT, lease_version INTEGER NOT NULL DEFAULT 0,
 offset INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, pages INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'PENDING', result TEXT, last_error TEXT);`;
interface Job {job_id:string;request:string;provider_order:string;lease_version:number;offset:number;attempts:number;pages:number}
/** Explicit backend runner; does not register production cron, migrate a source, or
 * create an endpoint. Authorization must also ensure legacy polling is disabled. */
export class D1ProviderPollScheduler {
  constructor(private db:SqlDatabase,private collector:Pick<FallbackSourceCollector,'collect'>,
    private authorize:(request:SourceFetchRequest)=>Promise<boolean>,private now=Date.now,private maxPages=100){}
  async schedule(id:string,request:SourceFetchRequest,dueAt:string,order=DEFAULT_SOURCE_ORDER[request.source.family]) {
    if(!id||!Number.isFinite(Date.parse(dueAt)))throw new Error('INVALID_SCHEDULE');
    const data=JSON.stringify(request),providers=JSON.stringify(order),hash=await sha256(JSON.stringify([data,providers]));
    await this.db.prepare('INSERT INTO connector_provider_poll_jobs(job_id,request,initial_hash,provider_order,due_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING')
      .bind(id,data,hash,providers,new Date(dueAt).toISOString()).run();
    const row=await this.db.prepare('SELECT initial_hash FROM connector_provider_poll_jobs WHERE job_id=?').bind(id).first<{initial_hash:string}>();
    if(row?.initial_hash!==hash)throw new HandoffError('IDEMPOTENCY_CONFLICT');
  }
  async runOne(leaseMs=300000):Promise<'IDLE'|'DONE'|'RETRY'|'BLOCKED'|'CANCELLED'|'LEASE_LOST'> {
    if(!Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>600000)throw new Error('INVALID_LEASE');
    const now=new Date(this.now()).toISOString();
    const job=await this.db.prepare(`UPDATE connector_provider_poll_jobs SET lease_until=?,lease_version=lease_version+1,attempts=attempts+1
      WHERE job_id=(SELECT job_id FROM connector_provider_poll_jobs WHERE state='PENDING' AND due_at<=? AND (lease_until IS NULL OR lease_until<=?) ORDER BY due_at,job_id LIMIT 1)
      RETURNING job_id,request,provider_order,lease_version,offset,attempts,pages`)
      .bind(new Date(this.now()+leaseMs).toISOString(),now,now).first<Job>();
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
    const update=async(state:string,result:unknown,error:string|null=null,next=request,offset=job.offset,pages=job.pages,delay=1000,reset=false)=>{
      if(renewing)await renewing;
      if(leaseLost)return false;
      const changed=await this.db.prepare(`UPDATE connector_provider_poll_jobs SET state=?,result=?,last_error=?,request=?,offset=?,pages=?,
        attempts=?,due_at=?,lease_until=NULL WHERE job_id=? AND lease_version=? AND lease_until>? RETURNING job_id`)
        .bind(state,JSON.stringify(result),error,JSON.stringify(next),offset,pages,reset?0:job.attempts,new Date(this.now()+delay).toISOString(),job.job_id,job.lease_version,new Date(this.now()).toISOString()).first();
      return !!changed;
    };
    const finish=async(state:'DONE'|'BLOCKED'|'CANCELLED',result:unknown,error?:string)=>await update(state,result,error??null)?state:'LEASE_LOST' as const;
    const retry=async(result:unknown,next=request,offset=job.offset,pages=job.pages,delay=Math.min(300000,1000*2**job.attempts),reset=false)=>
      await update('PENDING',result,null,next,offset,pages,delay,reset)?'RETRY' as const:'LEASE_LOST' as const;
    try {
      if(job.attempts>8||job.pages>=this.maxPages)return await finish('BLOCKED',null,'BOUNDED_LIMIT');
      if(!await this.authorize(request))return await finish('CANCELLED',null);
      const result=await this.collector.collect(request,JSON.parse(job.provider_order),job.offset);
      if(result.state==='FETCH_FAILED'){
        if(result.attempts.every(a=>['AUTH_REQUIRED','UNAVAILABLE','MALFORMED'].includes(a.failure??'')))return await finish('BLOCKED',result,'PROVIDER_REPAIR_REQUIRED');
        const retryAt=Math.max(0,...result.attempts.map(a=>Date.parse(a.retryNotBefore??'')||0));
        return await retry(result,{...request,runId:request.runId+':retry:'+job.attempts},0,job.pages,Math.max(1000*2**job.attempts,retryAt-this.now()));
      }
      if(result.checkpoint==='CAS_CONFLICT')return await finish('BLOCKED',result,'CHECKPOINT_CONFLICT');
      if(result.checkpoint==='BLOCKED')return await retry(result);
      if(result.nextOffset!==undefined)return await retry(result,request,result.nextOffset,job.pages+1,0,true);
      if(result.continuation)return await retry(result,{...request,runId:await sha256(request.runId+':page'),continuation:result.continuation},0,job.pages+1,1000,true);
      return await finish('DONE',result);
    }catch(error){
      if(error instanceof SourceProviderError)return await finish('BLOCKED',null,error.code);
      if(error instanceof HandoffError&&!error.retryable)return await finish('BLOCKED',null,error.code);
      // Unknown intake response: immutable saved batch is retried under its original identity.
      return await retry(null);
    }finally{clearInterval(heartbeat);if(renewing)await renewing;}
  }
}
