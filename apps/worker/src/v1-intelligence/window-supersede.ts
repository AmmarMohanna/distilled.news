import {feedTransact,type V1FeedStore} from './store';
import {windowDeadlinePassed,type WindowHoldPolicy} from './window-hold';
export const SUPERSEDED_REASON='SUPERSEDED_BY_LATER_WINDOW';
interface PendingRequest {id:string;state:string;window:{end:string};reason?:string;completedAt?:string;nextAttemptAt?:string;result?:string;supersededBy?:string}
/** Under a bounded hold, a backlog of closed windows must not all publish at
 * once once their deadlines pass. Only the newest past-deadline window of a
 * Feed stays pending; older ones that have not started synthesis are settled
 * as deferred and carried into it. Nothing is reported as delivered. */
export async function supersedeExpiredWindows(store:V1FeedStore,feedId:string,policy:WindowHoldPolicy|undefined,now:string):Promise<string[]>{
 if(!policy)return [];
 const expired=(await store.list<PendingRequest>(feedId,'briefing_requests')).filter(r=>r.state==='PENDING'&&windowDeadlinePassed(policy,r.window.end));
 if(expired.length<2)return [];
 const newest=expired.reduce((a,b)=>Date.parse(b.window.end)>Date.parse(a.window.end)||b.window.end===a.window.end&&b.id>a.id?b:a);
 // Bounded per pass; the next relay settles any remainder.
 const older=expired.filter(r=>r.id!==newest.id).sort((a,b)=>a.window.end.localeCompare(b.window.end)).slice(0,50).map(r=>r.id);
 return feedTransact(store,feedId,async tx=>{
  const settled:string[]=[];
  for(const id of older){
   const current=await tx.read<PendingRequest>('briefing_requests',id);
   // A window whose synthesis already started finishes through its own job.
   if(current?.state!=='PENDING'||await tx.read('synthesis_jobs',id))continue;
   await tx.write('briefing_requests',id,{...current,state:'DONE',result:'DEFERRED',reason:SUPERSEDED_REASON,supersededBy:newest.id,completedAt:now,nextAttemptAt:undefined});
   settled.push(id);
  }
  return settled;
 });
}
