/** Existing retry deadlines remain the bypass mechanism: a failed/backed-off
 * window cannot indefinitely hold newer work. No separate scheduler state. */
export function orderedPendingWindows<T extends {state:string;window:{end:string};nextAttemptAt?:string}>(requests:T[],now:string):T[] {
 return requests.filter(r=>r.state==='PENDING'&&Date.parse(r.window.end)<=Date.parse(now)&&(!r.nextAttemptAt||Date.parse(r.nextAttemptAt)<=Date.parse(now)))
  .sort((a,b)=>Date.parse(a.window.end)-Date.parse(b.window.end));
}
export type NewsWindowEligibility='IN_WINDOW'|'LATE_DISCOVERY'|'BACKLOG'|'AFTER_WINDOW'|'UNKNOWN_PUBLICATION_TIME';
/** A cached failed/unknown editorial operation cannot progress by resending
 * the same window. Recovery remains independent; until resolution later windows
 * may run without releasing its reservation or changing its identity. */
export async function editorialWindowAwaitingRecovery(db:D1Database,feedId:string,window:{start:string;end:string},reason?:string):Promise<boolean> {
 // Cross-window reuse can return the original UNKNOWN operation without
 // creating an intent under this window's key. That wait must not seize every
 // subsequent relay turn either. Explicit recovery can still invoke the window.
 if(reason==='SEMANTIC_OUTCOME_UNKNOWN')return true;
 const row=await db.prepare(`SELECT 1 blocked FROM v1_feed_documents i
 LEFT JOIN v1_feed_documents r ON r.feed_id=i.feed_id AND r.kind='semantic_results' AND r.id=i.id
 WHERE i.feed_id=? AND i.kind='semantic_intents'
 AND json_extract(i.json,'$.input.kind')='COMPARATIVE_EDITORIAL_PLAN'
 AND json_extract(i.json,'$.input.budgetKey')=?
 AND json_extract(r.json,'$.status')='DEFERRED'
 AND json_extract(r.json,'$.failure') IN ('SEMANTIC_OUTCOME_UNKNOWN','SEMANTIC_MODEL_TIMEOUT') LIMIT 1`)
 .bind(feedId,`editorial:${window.start}:${window.end}`).first();
 return Boolean(row);
}
/** Acquisition never changes a source's publication date. Retain the full
 * evidence catalog; this classification controls ordinary editorial admission. */
export function newsWindowEligibility(evidence:{publishedAt?:string|null;acceptedAt:string}[],window:{start:string;end:string},feedCreatedAt:string):NewsWindowEligibility {
 const start=Date.parse(window.start),end=Date.parse(window.end),created=Date.parse(feedCreatedAt);
 const published=evidence.map(e=>e.publishedAt?Date.parse(e.publishedAt):NaN).filter(Number.isFinite);
 if(!published.length)return 'UNKNOWN_PUBLICATION_TIME';
 if(published.some(t=>t>=end))return 'AFTER_WINDOW';
 if(published.some(t=>t>=start))return 'IN_WINDOW';
 // Late discoveries since subscription are offered once in their discovery
 // interval with original temporal context. Pre-subscription backlog stays
 // retained, and can re-enter through explicit correction/deferred obligations.
 if(evidence.some(e=>e.publishedAt&&Date.parse(e.publishedAt)>=created&&Date.parse(e.acceptedAt)>=start&&Date.parse(e.acceptedAt)<end))return 'LATE_DISCOVERY';
 return 'BACKLOG';
}
