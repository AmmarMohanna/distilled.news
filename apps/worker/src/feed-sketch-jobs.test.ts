import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {queueInitialFeedSketch,dispatchDueFeedSketches,processFeedSketchJob} from './feed-sketch-jobs';
import type {Env} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,env:Env;
const subject={id:'feed-1',title:'Coconuts',interestProfile:'Coconuts in Australia'};
beforeEach(async()=>{
 ctx=await createIntakeDatabase();
 await ctx.db.exec('CREATE TABLE briefings(id TEXT PRIMARY KEY)');
 await ctx.db.exec(readFileSync(new URL('../migrations/0059_feed_sketch_jobs.sql',import.meta.url),'utf8').replace(/^\s*--[^\n]*$/gm,'').replace(/\r?\n/g,' '));
 await ctx.db.prepare('INSERT INTO briefings(id) VALUES(?)').bind(subject.id).run();
 env={DB:ctx.db,RAW_ARCHIVE:{head:vi.fn(async()=>null),put:vi.fn(async()=>{})},PROCESSING_QUEUE:{send:vi.fn(async()=>{})},IMAGE_QUEUE:{send:vi.fn(async()=>{})}} as unknown as Env;
});
afterEach(async()=>{vi.unstubAllGlobals();await ctx.dispose()});
it('sends one initial image job to its isolated queue instead of the source backlog',async()=>{
 await queueInitialFeedSketch(env,subject);await queueInitialFeedSketch(env,subject);
 expect(env.IMAGE_QUEUE!.send).toHaveBeenCalledTimes(1);expect(env.PROCESSING_QUEUE.send).not.toHaveBeenCalled();
});
it('preserves the existing queue for deployments without an image binding',async()=>{
 delete env.IMAGE_QUEUE;await queueInitialFeedSketch(env,subject);
 expect(env.PROCESSING_QUEUE.send).toHaveBeenCalledWith({type:'generate_feed_sketch',feedId:subject.id});
});
it('recovers a lost delivery on the image queue and atomically fences concurrent redispatches',async()=>{
 vi.mocked(env.IMAGE_QUEUE!.send).mockRejectedValueOnce(Error('temporary queue failure'));
 await queueInitialFeedSketch(env,subject);
 const due=new Date(Date.now()+180000);
 const counts=await Promise.all([dispatchDueFeedSketches(env,due),dispatchDueFeedSketches(env,due)]);
 expect(counts.reduce((a,b)=>a+b,0)).toBe(1);expect(env.IMAGE_QUEUE!.send).toHaveBeenCalledTimes(2);
 expect(env.PROCESSING_QUEUE.send).not.toHaveBeenCalled();
});
it('duplicate deliveries across old and new queues generate and save only one illustration',async()=>{
 await queueInitialFeedSketch(env,subject);
 env.CLOUDFLARE_IMAGE_ACCOUNT_ID='fixture';env.CLOUDFLARE_IMAGE_API_TOKEN='test-only';
 const fetcher=vi.fn(async()=>Response.json({result:{image:btoa(String.fromCharCode(255,216,255,217))}}));vi.stubGlobal('fetch',fetcher);
 await Promise.all([processFeedSketchJob(env,subject.id),processFeedSketchJob(env,subject.id)]);
 expect(fetcher).toHaveBeenCalledTimes(1);expect(env.RAW_ARCHIVE.put).toHaveBeenCalledTimes(1);
 expect(await ctx.db.prepare('SELECT state,attempts,last_error FROM feed_sketch_jobs').first()).toEqual({state:'ready',attempts:1,last_error:null});
});
