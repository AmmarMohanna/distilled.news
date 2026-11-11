/** Intake completion is operational coverage, never an editorial judgment.
 * failedJobs includes unavailable acquisition-budget coverage without terminating
 * its recoverable job. Reconciliation dependencies retain their blockedJobs status. */
export interface WindowIntakeCoverage {state:'COMPLETE'|'PENDING'|'INCOMPLETE';pendingJobs:number;failedJobs:number;blockedJobs?:number;deferredJobs?:number;unavailableCollections?:{id:string;title:string;count:number}[];failures:{kind:string;code:string;count:number}[]}
/** Before verification, only confirmed capacity refusals yield at delivery.
 * Verified scheduled results can additionally defer acquisition; reassessment,
 * source ownership, immutable paid operations and publication CAS stay guarded. */
export interface IntakeDeadlineOptions {v3?:boolean;now?:string;deferAcquisition?:boolean}
export async function windowIntakeCoverage(db:D1Database,feedId:string,end:string,options:IntakeDeadlineOptions|boolean={}):Promise<WindowIntakeCoverage>{
 const settings=typeof options==='boolean'?{deferAcquisition:options}:options;
 return readWindowIntakeCoverage(db,feedId,end,settings,true);
}

export async function pendingWindowIntakeJobs(db:D1Database,feedId:string,end:string,settings:IntakeDeadlineOptions):Promise<number>{
 // Terminal failures inform publication coverage, but cannot make a window wait.
 return (await readWindowIntakeCoverage(db,feedId,end,settings,false)).pendingJobs;
}

async function readWindowIntakeCoverage(
 db:D1Database,feedId:string,end:string,settings:IntakeDeadlineOptions,includeFailedJobs:boolean,
):Promise<WindowIntakeCoverage>{
 const states=includeFailedJobs?"'PENDING','RUNNING','FAILED'":"'PENDING','RUNNING'";
 const rows=await db.prepare(`
  SELECT json_extract(j.json,'$.kind') kind,
   json_extract(j.json,'$.state') state,
   COALESCE(json_extract(j.json,'$.exhausted'),0) exhausted,
   COALESCE(json_extract(j.json,'$.failureCode'),'UNSPECIFIED') code,
   COALESCE(json_extract(j.json,'$.failureDetail'),'') detail,
   CASE WHEN json_extract(j.json,'$.kind')='ACQUIRE'
    AND json_extract(j.json,'$.state')='PENDING'
    AND json_extract(j.json,'$.failureCode')='BACKPRESSURE'
    AND json_extract(j.json,'$.failureDetail') IN ('HELPER_LOCAL_CAPACITY_BUSY','HELPER_GLOBAL_CAPACITY_BUSY','HELPER_HTTP_RATE_LIMIT')
    AND julianday(json_extract(i.json,'$.observation.observedAt')) IS NOT NULL
    AND (json_extract(j.json,'$.leaseUntil') IS NULL OR julianday(json_extract(j.json,'$.leaseUntil'))<=julianday(?))
   THEN 1 ELSE 0 END capacityWait,COUNT(*) n
  FROM v1_intake_scopes s
  CROSS JOIN v1_jobs j ON j.feed_source_id=s.id
  LEFT JOIN v1_inputs i ON i.id=json_extract(j.json,'$.observationId') AND i.feed_source_id=j.feed_source_id
  WHERE s.feed_id=? AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL
   AND json_extract(j.json,'$.kind') IN ('ACQUIRE','REASSESS')
   AND json_extract(j.json,'$.state') IN (${states})
   AND (json_extract(i.json,'$.observation.observedAt') IS NULL OR julianday(json_extract(i.json,'$.observation.observedAt'))<julianday(?))
  GROUP BY kind,state,exhausted,code,detail,capacityWait ORDER BY kind,state,exhausted,code
 `).bind(settings.now??end,feedId,end).all<{kind:string;state:string;exhausted:number;code:string;detail:string;capacityWait:number;n:number}>();
 let pendingJobs=0,failedJobs=0,blockedJobs=0,deferredJobs=0;
 const failures:WindowIntakeCoverage['failures']=[];
 const afterDeadline=settings.v3&&Date.parse(settings.now??'')>=Date.parse(end)+5*60000;
 for(const row of rows.results){
  if(afterDeadline&&row.capacityWait){
   failedJobs+=row.n;
   failures.push({kind:row.kind,code:'ACQUISITION_BACKPRESSURE_AT_DEADLINE',count:row.n});
  }else if(row.state==='PENDING'&&row.detail==='ARTICLE_PROVIDER_RECONCILIATION_WAIT'){
   blockedJobs+=row.n;
  }else if(row.exhausted||row.state==='FAILED'||row.kind==='ACQUIRE'&&row.state==='PENDING'&&row.code==='BUDGET_EXHAUSTED'){
   failedJobs+=row.n;
   failures.push({kind:row.kind,code:row.code,count:row.n});
  }else if(settings.deferAcquisition&&row.kind==='ACQUIRE'){
   deferredJobs+=row.n;
   failures.push({kind:row.kind,code:'ACQUISITION_DEFERRED_AFTER_VERIFICATION',count:row.n});
  }else{
   pendingJobs+=row.n;
  }
 }
 return {state:pendingJobs?'PENDING':failedJobs||blockedJobs||deferredJobs?'INCOMPLETE':'COMPLETE',pendingJobs,failedJobs,...(deferredJobs?{deferredJobs}:{}),...(blockedJobs?{blockedJobs}:{}),failures};
}

/** Readiness hint only: the final publication CAS still validates source scope,
 * immutable input, paid receipts, result projection and the current feed revision.
 * Never relax pre-inference readiness, manual windows or a retained V2 request. */
export async function preparedV3Delivery(db:D1Database,feedId:string,id:string,now:number):Promise<boolean>{
 return !!await db.prepare(`SELECT 1 FROM v1_feed_documents r
 JOIN v1_feed_documents i ON i.feed_id=r.feed_id AND i.kind='v3_window_inputs' AND i.id=COALESCE(json_extract(r.json,'$.v3InputId'),r.id)
 JOIN v1_feed_documents o ON o.feed_id=i.feed_id AND o.kind='v3_window_results' AND o.id=i.id
 JOIN v1_feeds f ON f.id=r.feed_id
 WHERE r.feed_id=? AND r.id=? AND r.kind='briefing_requests'
 AND json_extract(r.json,'$.engine')='v3' AND json_extract(r.json,'$.state')='PENDING'
 AND julianday(json_extract(r.json,'$.window.scheduledFor'))<=julianday(?/1000.0,'unixepoch')
 AND json_extract(o.json,'$.result.status')='published'
 AND json_extract(o.json,'$.inputId')=json_extract(i.json,'$.fingerprint')
 AND json_extract(i.json,'$.feedRevision')=json_extract(f.json,'$.revision')`).bind(feedId,id,now).first();
}
