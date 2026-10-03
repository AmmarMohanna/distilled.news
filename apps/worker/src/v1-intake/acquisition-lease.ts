import { HandoffError } from '@distilled/contracts';
import type { IntakeTransaction } from './transaction';
import type { DownstreamJob } from './types';
export async function requireAcquisitionLease(tx:IntakeTransaction,id:string,token:string,now:string):Promise<DownstreamJob> {
 const job=await tx.read<DownstreamJob>('jobs',id);
 if(!job || job.kind!=='ACQUIRE' || job.state!=='RUNNING' || job.leaseToken!==token || !job.leaseUntil || Date.parse(job.leaseUntil)<=Date.parse(now)) throw new HandoffError('TEMPORARY_UNAVAILABLE');
 return job;
}
