import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,scopeFixture} from './v1-intake/test-utils';
import {V1IntakeStore} from './v1-intake/store';
import {continueFeedReview} from './connector-review-continuation';
import type {Env} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,env:Env;
const now=new Date('2026-10-15T12:00:00Z');
async function job(id:string,state:string,source='feed-source-1',extra={}){
 await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind(id,source,JSON.stringify({id,kind:'REASSESS',state,attempts:0,...extra})).run();
}
beforeEach(async()=>{ctx=await createIntakeDatabase({product:true});await seedIntakeScope(new V1IntakeStore(ctx.db));env={DB:ctx.db,SOURCE_QUEUE_SCHEDULING_ENABLED:'true',V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',PROCESSING_QUEUE:{send:vi.fn(async()=>{})}} as unknown as Env;await job('completed','DONE')});
afterEach(async()=>ctx.dispose());
it('continues one due review immediately, with concurrent continuations sharing transport admission',async()=>{
 await job('next','PENDING');
 expect((await Promise.all([continueFeedReview(env,'completed',now),continueFeedReview(env,'completed',now)])).filter(Boolean)).toHaveLength(1);
 expect(env.PROCESSING_QUEUE.send).toHaveBeenCalledExactlyOnceWith({type:'v1_reassess',jobId:'next'});
 expect(JSON.parse((await ctx.db.prepare("SELECT json FROM v1_jobs WHERE id='next'").first<{json:string}>())!.json)).toMatchObject({state:'PENDING',attempts:0});
});
it('does not bypass retry times, terminal failures, source switch or feed isolation',async()=>{
 await job('later','PENDING','feed-source-1',{nextAttemptAt:'2026-10-15T13:00:00Z'});await job('failed','FAILED');
 const intake=new V1IntakeStore(ctx.db);await intake.registerScope({...scopeFixture,feedId:'other-feed',feedSourceId:'other'});await job('foreign','PENDING','other');
 expect(await continueFeedReview(env,'completed',now)).toBe(false);
 await job('due','PENDING');env.V1_DOWNSTREAM_FEED_SOURCE_IDS='other';
 expect(await continueFeedReview(env,'completed',now)).toBe(false);
 expect(env.PROCESSING_QUEUE.send).not.toHaveBeenCalled();
});
it('completed acquisition starts review; drained review refills acquisition',async()=>{
 await job('acquired','DONE','feed-source-1',{kind:'ACQUIRE'});await job('review','PENDING');await job('acquire-next','PENDING','feed-source-1',{kind:'ACQUIRE'});
 expect(await continueFeedReview(env,'acquired',now)).toBe(true);
 expect(env.PROCESSING_QUEUE.send).toHaveBeenLastCalledWith({type:'v1_reassess',jobId:'review'});
 await ctx.db.prepare("UPDATE v1_jobs SET json=json_set(json,'$.state','DONE') WHERE id='review'").run();
 expect(await continueFeedReview(env,'review',now)).toBe(true);
 expect(env.PROCESSING_QUEUE.send).toHaveBeenLastCalledWith({type:'v1_acquisition',jobId:'acquire-next'});
});
it('does not chain from unfinished work or when queue scheduling is disabled',async()=>{
 await job('unfinished','PENDING');expect(await continueFeedReview(env,'unfinished',now)).toBe(false);
 env.SOURCE_QUEUE_SCHEDULING_ENABLED='false';expect(await continueFeedReview(env,'completed',now)).toBe(false);
 expect(env.PROCESSING_QUEUE.send).not.toHaveBeenCalled();
});
it('rotates to another approved source instead of draining the same source first',async()=>{
 await new V1IntakeStore(ctx.db).registerScope({...scopeFixture,feedSourceId:'feed-source-2',sourceId:'source-2'});
 env.V1_DOWNSTREAM_FEED_SOURCE_IDS='feed-source-1,feed-source-2';
 await job('same-source','PENDING');await job('other-source','PENDING','feed-source-2');
 expect(await continueFeedReview(env,'completed',now)).toBe(true);
 expect(env.PROCESSING_QUEUE.send).toHaveBeenCalledExactlyOnceWith({type:'v1_reassess',jobId:'other-source'});
});
