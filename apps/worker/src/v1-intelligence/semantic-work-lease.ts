import {ASYNC_OPERATION_LEASE_MS,ASYNC_PROCESSING_SLICE_MS} from './operation-timing';
import {HandoffError} from '@distilled/contracts';
import {feedTransact,V1FeedStore} from './store';
import {measureLatency,countLatency} from './latency';
export interface SemanticWorkLease {id:string;feedId:string;token:string;leaseUntil:number;createdAt:string;executionDeadlineMs?:number;workId?:string}
export class SemanticLeaseError extends HandoffError {constructor(){super('TEMPORARY_UNAVAILABLE')}}
export const SEMANTIC_WORK_LEASE_MS=ASYNC_OPERATION_LEASE_MS;
export async function acquireSemanticWorkLease(store:V1FeedStore,feedId:string,workId?:string):Promise<SemanticWorkLease>{
 return feedTransact(store,feedId,async tx=>{
  const active=await store.db.prepare(`SELECT id FROM v1_feed_documents l WHERE l.kind='semantic_work_leases' AND l.feed_id=? AND json_extract(l.json,'$.leaseUntil')>? ${workId===undefined?'':"AND (json_extract(l.json,'$.workId') IS NULL OR json_extract(l.json,'$.workId')=?)"} AND NOT EXISTS(SELECT 1 FROM v1_feed_documents r WHERE r.kind='semantic_work_releases' AND r.id=l.id AND json_extract(r.json,'$.token')=json_extract(l.json,'$.token')) LIMIT 1`).bind(feedId,Date.now(),...(workId===undefined?[]:[workId])).first();
  if(active){countLatency('semanticLeaseBusy');throw new SemanticLeaseError();}
  const lease={id:crypto.randomUUID(),feedId,token:crypto.randomUUID(),leaseUntil:Date.now()+SEMANTIC_WORK_LEASE_MS,createdAt:new Date().toISOString(),...(workId===undefined?{}:{workId})};await tx.write('semantic_work_leases',lease.id,lease);return lease;
 });
}
/** Append a new lease in the same owner chain; older runtimes also see its
 * active expiry. Historical lease rows are never updated. Renew only live ownership. An expired/released token can never resurrect
 * itself; provider settlement remains independent from canonical ownership. */
export async function renewSemanticWorkLease(store:V1FeedStore,lease:SemanticWorkLease):Promise<void>{
 const time=Date.now(),until=time+SEMANTIC_WORK_LEASE_MS;
 const id=crypto.randomUUID(),value={id,feedId:lease.feedId,parentLeaseId:lease.id,token:lease.token,leaseUntil:until,createdAt:new Date(time).toISOString(),...(lease.workId===undefined?{}:{workId:lease.workId})};
 const row=await store.db.prepare(`INSERT INTO v1_feed_documents(kind,id,feed_id,json) SELECT 'semantic_work_leases',?,?,? WHERE EXISTS(SELECT 1 FROM v1_feed_documents l WHERE l.kind='semantic_work_leases' AND l.id=? AND l.feed_id=? AND json_extract(l.json,'$.token')=? AND json_extract(l.json,'$.leaseUntil')>? AND NOT EXISTS(SELECT 1 FROM v1_feed_documents r WHERE r.kind='semantic_work_releases' AND r.id=l.id AND json_extract(r.json,'$.token')=json_extract(l.json,'$.token'))) RETURNING id`).bind(id,lease.feedId,JSON.stringify(value),lease.id,lease.feedId,lease.token,time).first();
 if(!row)throw new SemanticLeaseError();lease.id=id;lease.leaseUntil=until;
}
export async function releaseSemanticWorkLease(store:V1FeedStore,lease:SemanticWorkLease):Promise<void>{
 // Release the complete immutable renewal chain by its unguessable owner token.
 await store.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) SELECT 'semantic_work_releases',l.id,l.feed_id,json_object('id',l.id,'feedId',l.feed_id,'token',json_extract(l.json,'$.token'),'createdAt',?) FROM v1_feed_documents l WHERE l.kind='semantic_work_leases' AND l.feed_id=? AND json_extract(l.json,'$.token')=? ON CONFLICT(kind,id) DO NOTHING").bind(new Date().toISOString(),lease.feedId,lease.token).run();
}
export async function withSemanticWorkLease<T>(db:D1Database,feedId:string,run:(store:V1FeedStore)=>Promise<T>,workId?:string):Promise<T>{
 const store=new V1FeedStore(db),lease=await measureLatency('SEMANTIC_LEASE_ADMISSION',()=>acquireSemanticWorkLease(store,feedId,workId));
 try{return await run(new V1FeedStore(db,{...lease,executionDeadlineMs:Date.now()+ASYNC_PROCESSING_SLICE_MS}))}finally{await releaseSemanticWorkLease(store,lease)}
}
