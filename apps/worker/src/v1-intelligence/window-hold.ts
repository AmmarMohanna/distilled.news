/** Bounded publication hold. Without a configured grace the original rule is
 * unchanged: every pending intake job observed before a window closes holds it.
 * With a grace, a window stops waiting once it is that long past its end, and
 * backlog published long before the window never holds it. Jobs that stop
 * holding are still processed; coverage reports them as deferred, not complete. */
export interface WindowHoldPolicy {now:number;graceMs:number;staleMs:number}
const STALE_HOURS=48;
export function windowHoldPolicy(env:{V1_PUBLICATION_GRACE_MINUTES?:string},now=Date.now()):WindowHoldPolicy|undefined{
 const raw=env.V1_PUBLICATION_GRACE_MINUTES;if(raw===undefined||raw==='')return undefined;
 const minutes=Number(raw);
 if(!Number.isInteger(minutes)||minutes<0||minutes>1440)throw new Error('INVALID_PUBLICATION_GRACE');
 return {now,graceMs:minutes*60000,staleMs:STALE_HOURS*3600000};
}
export function windowDeadlinePassed(policy:WindowHoldPolicy|undefined,end:string):boolean{
 return !!policy&&policy.now>=Date.parse(end)+policy.graceMs;
}
/** SQL condition over job `j` and input `i`: true when this unfinished job holds the window. */
export function windowHoldSql(policy:WindowHoldPolicy|undefined,end:string):{sql:string;args:string[]}{
 if(!policy)return {sql:'1',args:[]};
 if(windowDeadlinePassed(policy,end))return {sql:'0',args:[]};
 return {sql:"NOT(json_extract(i.json,'$.observation.publishedAtHint') IS NOT NULL AND julianday(json_extract(i.json,'$.observation.publishedAtHint'))<julianday(?))",
  args:[new Date(Date.parse(end)-policy.staleMs).toISOString()]};
}
