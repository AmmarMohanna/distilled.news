import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {V1FeedStore} from './v1-intelligence/store';
import {feedFixture} from './v1-intelligence/test-utils';
import {dispatchConnectorPolls} from './connector-scheduling';
import type {Env} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
const sendBatch=vi.fn(),at=Date.parse('2026-10-31T12:31:00Z');
beforeAll(async()=>{ctx=await createIntakeDatabase({product:true});await new V1FeedStore(ctx.db).registerFeed(feedFixture);});
afterAll(async()=>ctx.dispose());
beforeEach(async()=>{sendBatch.mockReset().mockResolvedValue(undefined);await ctx.db.exec('DELETE FROM connector_provider_poll_jobs; DELETE FROM connector_rss_poll_jobs; DELETE FROM v1_feed_documents;');});
function env(){return {DB:ctx.db,SOURCE_QUEUE_SCHEDULING_ENABLED:'true',SOURCE_COLLECTION_QUEUE:{sendBatch},V1_PROCESSING_QUEUE:{},V1_ACQUISITION_QUEUE:{}} as unknown as Env;}
async function poll(id:string,scheduled:string,due='2026-10-31T12:00:00Z',feedId='feed-1'){
 await ctx.db.prepare('INSERT INTO connector_provider_poll_jobs(job_id,request,initial_hash,provider_order,due_at,scheduled_at) VALUES(?,?,?,?,?,?)').bind(id,JSON.stringify({scope:{feedId,feedSourceId:id},source:{family:'x_profile'}}),'hash','[]',due,scheduled).run();
}
it('serves a poll holding a closed window before a newer-window poll, without changing either identity',async()=>{
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests','window','feed-1',?)").bind(JSON.stringify({state:'PENDING',window:{end:'2026-10-31T12:25:00Z'}})).run();
 await poll('later-window','2026-10-31T12:26:00Z');await poll('closing-window','2026-10-31T12:20:00Z','2026-10-31T12:20:00Z');
 expect(await dispatchConnectorPolls(env(),'feed-1',at,1)).toBe(1);
 expect(sendBatch.mock.calls[0][0][0].body).toMatchObject({jobId:'closing-window'});
 expect(await dispatchConnectorPolls(env(),'feed-1',at+1,1)).toBe(0);
 expect(await ctx.db.prepare("SELECT attempts,state,scheduled_at FROM connector_provider_poll_jobs WHERE job_id='closing-window'").first()).toEqual({attempts:0,state:'PENDING',scheduled_at:'2026-10-31T12:20:00Z'});
});
it('caps concurrent same-feed refills and immediately replaces only a completed slot',async()=>{
 for(let n=0;n<8;n++)await poll('job-'+n,'2026-10-31T12:20:00Z');
 const counts=await Promise.all([dispatchConnectorPolls(env(),'feed-1',at),dispatchConnectorPolls(env(),'feed-1',at)]);
 expect(counts.reduce((n,x)=>n+x,0)).toBe(2);
 const original=sendBatch.mock.calls.flatMap(c=>c[0]).map(m=>m.body.jobId);
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET state='DONE',dispatch_until=0 WHERE job_id=?").bind(original[0]).run();
 expect(await dispatchConnectorPolls(env(),'feed-1',at+1,2,'provider')).toBe(1);
 expect(sendBatch.mock.calls.at(-1)![0][0].body.jobId).not.toBe(original[0]);
 expect(await dispatchConnectorPolls(env(),'feed-1',at+360001,2,'provider')).toBe(2);
});
it('retains periodic oldest-due fairness and isolates other feeds',async()=>{
 await poll('oldest','2026-10-31T12:26:00Z');await poll('other-feed','2026-10-31T12:20:00Z','2026-10-31T11:00:00Z','feed-2');
 expect(await dispatchConnectorPolls(env(),'feed-1',Date.parse('2026-10-31T12:35:00Z'),1)).toBe(1);
 expect(sendBatch.mock.calls[0][0][0].body.jobId).toBe('oldest');
 expect(await ctx.db.prepare("SELECT dispatch_until FROM connector_provider_poll_jobs WHERE job_id='other-feed'").first()).toEqual({dispatch_until:0});
});
