import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {reserveConnectorWork,releaseConnectorWork} from './connector-work-admission';
import {coalescedProcessingQueue,completeConnectorDownstream,decodeConnectorDelivery} from './connector-scheduling';
import {enqueueV1} from './v1-queue-dispatch';
import type {Env,DistilledQueueMessage} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,env:Env;
beforeEach(async()=>{
 ctx=await createIntakeDatabase({product:true});
 const queue={send:vi.fn(async()=>{}),sendBatch:vi.fn(async()=>{})};
 env={DB:ctx.db,SOURCE_QUEUE_SCHEDULING_ENABLED:'true',SOURCE_COLLECTION_QUEUE:queue,V1_PROCESSING_QUEUE:queue,V1_ACQUISITION_QUEUE:queue,PROCESSING_QUEUE:queue} as unknown as Env;
 await ctx.db.exec("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner','slots@example.invalid','slots@example.invalid','slots','user','hash','2026-10-16','2026-10-16','2026-10-16'); INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,paused,created_at,updated_at) VALUES('feed','owner','slots','Slots','news',1,0,'2026-10-16','2026-10-16'),('other','owner','other','Other','news',1,0,'2026-10-16','2026-10-16'); INSERT INTO v1_intake_scopes(id,feed_id,source_id,json) VALUES('source','feed','identity','{}');");
 for(let i=0;i<8;i++)await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind('job-'+i,'source',JSON.stringify({id:'job-'+i,feedId:'feed',kind:'ACQUIRE',state:'PENDING',attempts:0})).run();
});
afterEach(async()=>{await ctx.dispose()});
it('bounds acquisition to four outstanding deliveries and intelligence to one per Feed, independently',async()=>{
 const results=await Promise.all(Array.from({length:8},(_,i)=>reserveConnectorWork(env,{type:'v1_acquisition',jobId:'job-'+i},'a'+i,1000)));
 expect(results.filter(Boolean)).toHaveLength(4);
 const review={type:'v1_reassess' as const,jobId:'job-0'};
 expect(await reserveConnectorWork(env,review,'review',1000)).toBe(true);
 expect(await reserveConnectorWork(env,review,'blocked',1000)).toBe(false);
 expect(await reserveConnectorWork(env,{type:'v1_rematch',feedId:'other',requestId:'other'},'other',1000)).toBe(true);
});
it('expired slots recover and stale tokens cannot release their replacements',async()=>{
 const body={type:'v1_reassess' as const,jobId:'job-0'};
 await reserveConnectorWork(env,body,'old',1000);
 expect(await reserveConnectorWork(env,body,'new',121001)).toBe(true);
 await releaseConnectorWork(env,'old');
 expect(await reserveConnectorWork(env,body,'third',121002)).toBe(false);
 await releaseConnectorWork(env,'new');
 expect(await reserveConnectorWork(env,body,'third',121002)).toBe(true);
});
it('a declined send leaves no phantom two-minute canonical dispatch reservation',async()=>{
 const body={type:'v1_reassess' as const,jobId:'job-0'},next={type:'v1_reassess' as const,jobId:'job-1'};
 const scoped={...env,PROCESSING_QUEUE:coalescedProcessingQueue(env)};
 expect(await enqueueV1(scoped,body.type,body.jobId,body)).toBe(true);
 expect(await enqueueV1(scoped,next.type,next.jobId,next)).toBe(false);
 expect(await ctx.db.prepare('SELECT lease_until FROM v1_queue_dispatches WHERE kind=? AND id=?').bind(next.type,next.jobId).first()).toEqual({lease_until:0});
 const sent=(env.V1_PROCESSING_QUEUE!.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as DistilledQueueMessage;
 const wire=decodeConnectorDelivery(sent);
 await completeConnectorDownstream(env,wire.body,wire.token);
 expect(await enqueueV1(scoped,next.type,next.jobId,next)).toBe(true);
 expect(JSON.parse((await ctx.db.prepare("SELECT json FROM v1_jobs WHERE id='job-1'").first<{json:string}>())!.json).attempts).toBe(0);
});
