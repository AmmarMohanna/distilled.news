import type {FeedTransaction} from './store';
import type {ShortlistCandidate} from './shortlist';
export interface EditorialWork {id:string;feedId:string;stableTargetId:string;targetVersionId:string;storylineId?:string;protectedReasons:string[];reason:string;createdAt:string;factTexts?:string[];expiresAt?:string;planId?:string;windowEnd?:string}
export async function deferEditorialWork(tx:FeedTransaction,c:ShortlistCandidate,reason:string,now:string,origin:string,windowEnd?:string):Promise<void>{
 const resolved=new Set((await tx.list<{id:string;workId:string}>('editorial_work_resolutions')).map(r=>r.workId));
 const pending=(await tx.list<EditorialWork>('editorial_deferred_work')).filter(w=>!resolved.has(w.id)&&w.stableTargetId===c.stableTargetId);
 if(pending.some(w=>w.targetVersionId===c.targetVersionId&&w.reason===reason))return;
 const firstExpiry=pending.map(w=>w.expiresAt).filter((s):s is string=>Boolean(s)).sort()[0];
 const id=JSON.stringify([origin,c.stableTargetId,c.targetVersionId,reason]);
 if(!await tx.read('editorial_deferred_work',id))await tx.write('editorial_deferred_work',id,{id,feedId:tx.snapshot.feed.id,stableTargetId:c.stableTargetId,targetVersionId:c.targetVersionId,storylineId:c.storylineId,protectedReasons:c.protectedReasons,reason,createdAt:now,factTexts:c.facts.map(f=>f.text),expiresAt:c.correctionObligationIds.length||c.protectedReasons.length?undefined:firstExpiry??new Date(Date.parse(now)+7*86400000).toISOString(),planId:origin,windowEnd} satisfies EditorialWork);
}
export async function resolveEditorialWork(tx:FeedTransaction,work:EditorialWork,reason:string,now:string,origin:string):Promise<void>{
 const id=JSON.stringify([work.id,origin,reason]);if(!await tx.read('editorial_work_resolutions',id))await tx.write('editorial_work_resolutions',id,{id,feedId:tx.snapshot.feed.id,workId:work.id,reason,createdAt:now});
}
