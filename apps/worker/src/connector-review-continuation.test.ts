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

it('continues a tail source without a round trip for each empty active source',async()=>{
 const ids=Array.from({length:80},(_,i)=>`source-empty-${String(i).padStart(3,'0')}`),tail='zz-source-pending';
 await ctx.db.batch([...ids,tail].map(id=>ctx.db.prepare('INSERT INTO v1_intake_scopes(id,feed_id,source_id,json) VALUES(?,?,?,?)').bind(id,'feed-1',id,JSON.stringify({...scopeFixture,feedSourceId:id,sourceId:id}))));
 env.V1_DOWNSTREAM_FEED_SOURCE_IDS=['feed-source-1',...ids,tail].join(',');
 await job('tail-review','PENDING',tail);
 let queries=0;
 const db=new Proxy(ctx.db,{get(target,key){if(key==='prepare')return (sql:string)=>{queries++;return target.prepare(sql)};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 expect(await continueFeedReview({...env,DB:db},'completed',now)).toBe(true);
 expect(env.PROCESSING_QUEUE.send).toHaveBeenCalledExactlyOnceWith({type:'v1_reassess',jobId:'tail-review'});
 console.info(JSON.stringify({reviewContinuationQueries:queries,emptySources:80}));
 expect(queries).toBeLessThan(8);
});

async function priorityWindowFixture(){
 await ctx.db.exec("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('priority-owner','priority@example.invalid','priority@example.invalid','priority','user','hash','2026-10-14','2026-10-14','2026-10-14'); INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,paused,created_at,updated_at) VALUES('feed-1','priority-owner','priority','Priority','news',1,0,'2026-10-14','2026-10-14');");
 await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('feed-1',JSON.stringify({id:'feed-1',ownerId:'priority-owner',revision:1})).run();
 const window={start:'2026-10-15T10:30:00.000Z',end:'2026-10-15T11:00:00.000Z',kind:'30M'};
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests','ready-old-window','feed-1',?)").bind(JSON.stringify({id:'ready-old-window',engine:'v3',state:'PENDING',window})).run();
 await ctx.db.prepare("INSERT INTO v1_inputs(id,feed_source_id,json) VALUES('newer-observation','feed-source-1',?)").bind(JSON.stringify({observation:{observedAt:'2026-10-15T11:30:00Z'}})).run();
 await job('newer-review','PENDING','feed-source-1',{observationId:'newer-observation'});
 return window;
}
it('offers a ready older window the released intelligence lane before chaining newer review work',async()=>{
 const window=await priorityWindowFixture();
 expect(await continueFeedReview(env,'completed',now)).toBe(true);
 expect(env.PROCESSING_QUEUE.send).toHaveBeenCalledExactlyOnceWith({type:'v1_briefing',feedId:'feed-1',window});
 expect(JSON.parse((await ctx.db.prepare("SELECT json FROM v1_jobs WHERE id='newer-review'").first<{json:string}>())!.json).state).toBe('PENDING');
});
it('keeps an older window blocked by unfinished evidence and continues its required review',async()=>{
 await priorityWindowFixture();
 await ctx.db.prepare("INSERT INTO v1_inputs(id,feed_source_id,json) VALUES('older-observation','feed-source-1',?)").bind(JSON.stringify({observation:{observedAt:'2026-10-15T10:45:00Z'}})).run();
 await job('required-review','PENDING','feed-source-1',{observationId:'older-observation'});
 expect(await continueFeedReview(env,'completed',now)).toBe(true);
 expect(env.PROCESSING_QUEUE.send).toHaveBeenCalledExactlyOnceWith({type:'v1_reassess',jobId:'required-review'});
});
