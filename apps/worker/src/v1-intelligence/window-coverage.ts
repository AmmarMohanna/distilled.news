import {windowHoldSql,type WindowHoldPolicy} from './window-hold';
/** Intake completion is operational coverage, never an editorial judgment.
 * Deferred jobs are unfinished but no longer hold the window (bounded hold). */
export interface WindowIntakeCoverage {state:'COMPLETE'|'PENDING'|'INCOMPLETE';pendingJobs:number;failedJobs:number;deferredJobs?:number;failures:{kind:string;code:string;count:number}[]}
export async function windowIntakeCoverage(db:D1Database,feedId:string,end:string,policy?:WindowHoldPolicy):Promise<WindowIntakeCoverage>{
 const hold=windowHoldSql(policy,end);
 const rows=await db.prepare(`SELECT json_extract(j.json,'$.kind') kind,json_extract(j.json,'$.state') state,COALESCE(json_extract(j.json,'$.exhausted'),0) exhausted,COALESCE(json_extract(j.json,'$.failureCode'),'UNSPECIFIED') code,(${hold.sql}) holds,COUNT(*) n FROM v1_jobs j JOIN v1_intake_scopes s ON s.id=j.feed_source_id LEFT JOIN v1_inputs i ON i.id=json_extract(j.json,'$.observationId') AND i.feed_source_id=j.feed_source_id WHERE s.feed_id=? AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL AND json_extract(j.json,'$.kind') IN ('ACQUIRE','REASSESS') AND json_extract(j.json,'$.state')!='DONE' AND (json_extract(i.json,'$.observation.observedAt') IS NULL OR julianday(json_extract(i.json,'$.observation.observedAt'))<julianday(?)) GROUP BY kind,state,exhausted,code,holds ORDER BY kind,state,exhausted,code,holds`).bind(...hold.args,feedId,end).all<{kind:string;state:string;exhausted:number;code:string;holds:number;n:number}>();
 let pendingJobs=0,failedJobs=0,deferredJobs=0,lastFailure='';const failures:WindowIntakeCoverage['failures']=[];
 for(const row of rows.results){if(row.exhausted||row.state==='FAILED'){
  // Rows split only by `holds` are one failure group, as before the bounded hold.
  const key=JSON.stringify([row.kind,row.state,row.exhausted,row.code]);failedJobs+=row.n;
  if(key===lastFailure)failures[failures.length-1].count+=row.n;else failures.push({kind:row.kind,code:row.code,count:row.n});lastFailure=key}else if(row.holds)pendingJobs+=row.n;else deferredJobs+=row.n}
 return {state:pendingJobs?'PENDING':failedJobs||deferredJobs?'INCOMPLETE':'COMPLETE',pendingJobs,failedJobs,...(policy?{deferredJobs}:{}),failures};
}
