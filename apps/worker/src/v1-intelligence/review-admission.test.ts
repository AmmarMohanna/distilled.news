import {it,expect} from 'vitest';
import {backlogRevisionIds} from './review-admission';
import type {FeedTransaction,V1FeedStore} from './store';
// Publication metadata retained from the actual AI News4 acquisition snapshot.
const published=['2026-10-20T23:01:23Z','2026-10-20T22:24:02Z','2026-10-20T21:25:22Z','2026-10-20T20:35:10Z','2026-10-20T16:20:06Z','2026-10-20T18:38:24Z','2026-10-20T17:55:12Z','2026-10-20T18:36:53Z','2026-10-20T20:40:41Z','2026-10-20T17:12:48Z','2026-10-19T22:49:27Z','2026-10-20T13:00:00Z','2026-10-20T13:07:24Z','2026-10-19T23:39:38Z','2026-10-20T11:00:00Z','2026-10-20T01:27:03Z','2026-10-20T16:00:00Z','2026-10-19T22:04:28Z','2026-10-20T14:13:32Z','2026-10-20T11:00:00Z'];
it('replays all 20 AI News4 articles as retained backlog rather than semantic work',async()=>{
 const active=published.map((publishedAt,i)=>({revision:{id:'r'+i,evidenceId:'e'+i,publishedAt,acceptedAt:'2026-10-21T07:56:50Z'}}));
 const store={currentEvidence:async()=>active} as unknown as V1FeedStore;
 const tx={snapshot:{feed:{id:'feed',createdAt:'2026-10-21T07:52:38.665Z'}},list:async()=>[]} as unknown as FeedTransaction;
 expect(await backlogRevisionIds(store,tx)).toEqual(new Set(active.map(e=>e.revision.id)));
});
it('retains publication memory and source revisions, without converting missing dates into backlog',async()=>{
 const active=[{revision:{id:'old',evidenceId:'e1',publishedAt:'2026-10-20T00:00:00Z'}},{revision:{id:'updated',evidenceId:'e2',publishedAt:'2026-10-20T00:00:00Z'}},{revision:{id:'unknown',evidenceId:'e3'}},{revision:{id:'late',evidenceId:'e4',publishedAt:'2026-10-21T08:00:00Z'}}];
 const store={currentEvidence:async()=>active} as unknown as V1FeedStore;
 const tx={snapshot:{feed:{id:'feed',createdAt:'2026-10-21T07:52:38.665Z'}},list:async(kind:string)=>kind==='ledger_entries'?[{evidenceRevisionIds:['old']}]:[{evidenceRevisionId:'previous'}],preloadRevisions:async()=>{},revision:async()=>({id:'previous',evidenceId:'e2'})} as unknown as FeedTransaction;
 expect(await backlogRevisionIds(store,tx)).toEqual(new Set());
});
