import {expect,it} from 'vitest';
import {firstFullLiveBriefingAt,livePublicationWindow,preparingLiveWindow} from './schedule';
import {orderedPendingWindows,newsWindowEligibility,editorialWindowAwaitingRecovery} from './window-delivery';
const schedule={durationMinutes:30 as const,timezone:'Asia/Beirut'};
it('a reused UNKNOWN without a new window intent does not monopolize dispatch',async()=>{
 const db={prepare:()=>{throw Error('No new intent exists for a reused operation')}} as unknown as D1Database;
 expect(await editorialWindowAwaitingRecovery(db,'feed', {start:'2026-10-20T22:00:00Z',end:'2026-10-20T22:30:00Z'},'SEMANTIC_OUTCOME_UNKNOWN')).toBe(true);
});
it.each([['00:20','01:00'],['00:35','01:30'],['00:50','01:30'],['00:59','01:30'],['01:05','02:00'],['00:30','01:00']])('first complete interval for creation at %s closes %s',(created,end)=>{
 expect(firstFullLiveBriefingAt(schedule,new Date(`2026-10-21T${created}:00+03:00`))).toBe(new Date(`2026-10-21T${end}:00+03:00`).toISOString());
});
it('prepares a fixed future interval near close, never changes its boundaries when late',()=>{
 const window=preparingLiveWindow(schedule,new Date('2026-10-21T00:55:00+03:00'))!;
 expect(window).toMatchObject({start:'2026-10-20T21:30:00.000Z',end:'2026-10-20T22:00:00.000Z'});
 expect(preparingLiveWindow(schedule,new Date('2026-10-21T00:54:00+03:00'))).toBeUndefined();
 expect(livePublicationWindow(schedule,new Date('2026-10-21T01:04:00+03:00'))).toEqual(window);
});
it('orders older runnable windows first and bypasses a failed or backed-off previous window',()=>{
 const now='2026-10-20T22:34:00Z',old={id:'old',state:'PENDING',window:{end:'2026-10-20T22:00:00Z'}},next={id:'next',state:'PENDING',window:{end:'2026-10-20T22:30:00Z'}};
 expect(orderedPendingWindows([next,old],now).map(r=>r.id)).toEqual(['old','next']);
 expect(orderedPendingWindows([next,{...old,nextAttemptAt:'2026-10-20T22:35:00Z'}],now).map(r=>r.id)).toEqual(['next']);
 expect(orderedPendingWindows([next,{...old,state:'FAILED'}],now).map(r=>r.id)).toEqual(['next']);
});
const window={start:'2026-10-20T22:00:00Z',end:'2026-10-20T22:30:00Z'},created='2026-10-20T21:35:00Z';
it('separates initial backlog, fresh reporting, late discovery and unknown dates',()=>{
 const classify=(publishedAt:string|undefined,acceptedAt:string)=>newsWindowEligibility([{publishedAt,acceptedAt}],window,created);
 expect(classify('2026-10-19T12:00:00Z','2026-10-20T22:10:00Z')).toBe('BACKLOG');
 expect(classify('2026-10-20T22:24:02Z','2026-10-20T22:28:57Z')).toBe('IN_WINDOW');
 expect(classify('2026-10-20T21:55:00Z','2026-10-20T22:10:00Z')).toBe('LATE_DISCOVERY');
 expect(classify(undefined,'2026-10-20T22:10:00Z')).toBe('UNKNOWN_PUBLICATION_TIME');
 expect(classify('2026-10-20T22:31:00Z','2026-10-20T22:10:00Z')).toBe('AFTER_WINDOW');
});
