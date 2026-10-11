import {HandoffError} from '@distilled/contracts';
import {feedTransact,V1FeedStore} from './store';
export interface SemanticWorkLease {id:string;feedId:string;token:string;leaseUntil:number;createdAt:string}
export class SemanticLeaseError extends HandoffError {constructor(){super('TEMPORARY_UNAVAILABLE')}}
export const SEMANTIC_WORK_LEASE_MS=90000;
export async function acquireSemanticWorkLease(store:V1FeedStore,feedId:string):Promise<SemanticWorkLease>{
 return feedTransact(store,feedId,async tx=>{
  const active=await store.db.prepare("SELECT id FROM v1_feed_documents l WHERE l.kind='semantic_work_leases' AND l.feed_id=? AND json_extract(l.json,'$.leaseUntil')>? AND NOT EXISTS(SELECT 1 FROM v1_feed_documents r WHERE r.kind='semantic_work_releases' AND r.id=l.id AND json_extract(r.json,'$.token')=json_extract(l.json,'$.token')) LIMIT 1").bind(feedId,Date.now()).first();
  if(active)throw new SemanticLeaseError();
  const lease={id:crypto.randomUUID(),feedId,token:crypto.randomUUID(),leaseUntil:Date.now()+SEMANTIC_WORK_LEASE_MS,createdAt:new Date().toISOString()};await tx.write('semantic_work_leases',lease.id,lease);return lease;
 });
}
export async function releaseSemanticWorkLease(store:V1FeedStore,lease:SemanticWorkLease):Promise<void>{
 await store.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) SELECT 'semantic_work_releases',?,?,? WHERE EXISTS(SELECT 1 FROM v1_feed_documents WHERE kind='semantic_work_leases' AND id=? AND feed_id=? AND json_extract(json,'$.token')=?) ON CONFLICT(kind,id) DO NOTHING").bind(lease.id,lease.feedId,JSON.stringify({id:lease.id,feedId:lease.feedId,token:lease.token,createdAt:new Date().toISOString()}),lease.id,lease.feedId,lease.token).run();
}
export async function withSemanticWorkLease<T>(db:D1Database,feedId:string,run:(store:V1FeedStore)=>Promise<T>):Promise<T>{
 const store=new V1FeedStore(db),lease=await acquireSemanticWorkLease(store,feedId);
 try{return await run(new V1FeedStore(db,lease))}finally{await releaseSemanticWorkLease(store,lease)}
}
