import { sha256, HandoffError } from '@distilled/contracts';
import type { RssRequest } from './ports';
import type { SqlDatabase } from './storage';
import type { RssCollectionResult, RssSourceCollector } from './rss';

/** Separate schema proposal; install with the source schema only after migration coordination. */
export const RSS_POLL_SCHEMA = `CREATE TABLE IF NOT EXISTS connector_rss_poll_jobs (
 job_id TEXT PRIMARY KEY, request TEXT NOT NULL, request_hash TEXT NOT NULL,
 due_at TEXT NOT NULL, lease_until TEXT, lease_version INTEGER NOT NULL DEFAULT 0,
 offset INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'PENDING', result TEXT, last_error TEXT);`;
interface PollJob {
  job_id: string; request: string; lease_version: number; offset: number; attempts: number;
}

/** Backend service, not a deployed cron or queue consumer. Enqueue each periodic poll
 * with a new stable job/run identity; retries/continuations preserve the saved request. */
export class D1RssPollScheduler {
  constructor(private readonly db: SqlDatabase, private readonly collector: RssSourceCollector,
    private readonly authorize: (request:RssRequest)=>Promise<boolean>,
    private readonly now:()=>number = Date.now) {}

  async schedule(jobId:string,request:RssRequest,dueAt:string):Promise<void> {
    if (!jobId || !Number.isFinite(Date.parse(dueAt))) throw new Error('INVALID_SCHEDULE');
    const data=JSON.stringify(request), hash=await sha256(data);
    await this.db.prepare('INSERT INTO connector_rss_poll_jobs(job_id,request,request_hash,due_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING')
      .bind(jobId,data,hash,new Date(dueAt).toISOString()).run();
    const existing=await this.db.prepare('SELECT request_hash FROM connector_rss_poll_jobs WHERE job_id=?').bind(jobId).first<{request_hash:string}>();
    if (existing?.request_hash !== hash) throw new HandoffError('IDEMPOTENCY_CONFLICT');
  }

  async runOne(leaseMs=120_000):Promise<'IDLE'|'DONE'|'RETRY'|'BLOCKED'|'CANCELLED'|'LEASE_LOST'> {
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 600_000) throw new Error('INVALID_LEASE');
    const now=new Date(this.now()).toISOString(), until=new Date(this.now()+leaseMs).toISOString();
    const job=await this.db.prepare(`UPDATE connector_rss_poll_jobs SET lease_until=?,lease_version=lease_version+1,attempts=attempts+1
      WHERE job_id=(SELECT job_id FROM connector_rss_poll_jobs WHERE state='PENDING' AND due_at<=? AND (lease_until IS NULL OR lease_until<=?) ORDER BY due_at,job_id LIMIT 1)
      RETURNING job_id,request,lease_version,offset,attempts`).bind(until,now,now).first<PollJob>();
    if (!job) return 'IDLE';
    if (job.attempts > 8) return await this.finish(job,'BLOCKED',null,'RETRY_LIMIT') ? 'BLOCKED' : 'LEASE_LOST';
    const request:RssRequest=JSON.parse(job.request);
    try {
      // Caller checks current FeedSource approval/config revision AND that old polling is disabled.
      if (!await this.authorize(request)) return await this.finish(job,'CANCELLED',null) ? 'CANCELLED' : 'LEASE_LOST';
      const result=await this.collector.collect(request,job.offset);
      if (result.checkpoint === 'CAS_CONFLICT') return await this.finish(job,'BLOCKED',result) ? 'BLOCKED' : 'LEASE_LOST';
      if (result.checkpoint === 'BLOCKED' || result.coverage.failureReason !== 'NONE') {
        // Auth/invalid feeds need operator/config repair; rate limits/transient failures are rescheduled.
        if (['AUTH_REQUIRED','UNKNOWN'].includes(result.coverage.failureReason ?? 'NONE')) return await this.finish(job,'BLOCKED',result) ? 'BLOCKED' : 'LEASE_LOST';
        const next={...request,runId:result.checkpoint === 'BLOCKED' ? request.runId : `${request.runId}:retry:${job.attempts}`};
        return await this.retry(job,next,job.offset,result) ? 'RETRY' : 'LEASE_LOST';
      }
      if (result.nextOffset !== undefined) return await this.retry(job,request,result.nextOffset,result,0) ? 'RETRY' : 'LEASE_LOST';
      return await this.finish(job,'DONE',result) ? 'DONE' : 'LEASE_LOST';
    } catch (error) {
      // An invalid boundary response/identity conflict must be investigated, never auto-accepted.
      if (error instanceof HandoffError && !error.retryable) return await this.finish(job,'BLOCKED',null,error.code) ? 'BLOCKED' : 'LEASE_LOST';
      const unknown=error instanceof Error && /FETCH_OUTCOME_UNKNOWN|FETCH_ALREADY_CLAIMED/.test(error.message);
      const next=unknown ? {...request,runId:`${request.runId}:retry:${job.attempts}`} : request;
      return await this.retry(job,next,unknown ? 0 : job.offset,null) ? 'RETRY' : 'LEASE_LOST';
    }
  }
  private async finish(job:PollJob,state:string,result:RssCollectionResult|null,error?:string) {
    return await this.db.prepare('UPDATE connector_rss_poll_jobs SET state=?,result=?,last_error=?,lease_until=NULL WHERE job_id=? AND lease_version=? RETURNING job_id')
      .bind(state,JSON.stringify(result),error ?? null,job.job_id,job.lease_version).first() !== null;
  }
  private async retry(job:PollJob,request:RssRequest,offset:number,result:RssCollectionResult|null,delay?:number) {
    const due=new Date(Math.max(this.now()+(delay ?? Math.min(300_000,1000*2**Math.min(job.attempts,8))),
      result?.retryNotBefore ? Date.parse(result.retryNotBefore) : 0)).toISOString();
    return await this.db.prepare('UPDATE connector_rss_poll_jobs SET request=?,offset=?,due_at=?,result=?,lease_until=NULL WHERE job_id=? AND lease_version=? RETURNING job_id')
      .bind(JSON.stringify(request),offset,due,JSON.stringify(result),job.job_id,job.lease_version).first() !== null;
  }
}
