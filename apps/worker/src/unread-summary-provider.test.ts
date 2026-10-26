import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {unreadSummaryPort} from './unread-summary-provider';
import {generateUnreadSummary,unreadSummaryRequest} from './unread-summary';
import type {Env} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
beforeAll(async()=>{ctx=await createIntakeDatabase({product:true});await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('summary-test',JSON.stringify({revision:1,paused:true})).run();});
afterAll(async()=>ctx?.dispose());
const input={language:'en',briefings:[{id:'one',publishedAt:'2026-10-26T12:00:00Z',text:'Officials proposed a change, subject to approval.'}]};
const config=()=>({DB:ctx.db,OPENROUTER_API_KEY:'test-only'} as Env);
it('reserves before inference, settles reported cost and reuses its immutable receipt',async()=>{
 const fetcher=vi.fn(async()=>{const held=await ctx.db.prepare("SELECT COUNT(*) AS n FROM v1_model_spending_reservations WHERE feed_id='summary-test'").first<{n:number}>();expect(held!.n).toBe(1);return Response.json({choices:[{message:{content:'{"summary":"Officials proposed a change, subject to approval."}'},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:20,cost:.0001}});});
 const port=unreadSummaryPort(config(),'summary-test','reader',fetcher);
 const first=await port.complete(unreadSummaryRequest(input));expect(first.costUsd).toBe(.0001);
 expect(await port.complete(unreadSummaryRequest(input))).toEqual(first);expect(fetcher).toHaveBeenCalledOnce();
 const result=await generateUnreadSummary({db:ctx.db,feedId:'summary-test',accountId:'reader',input,port});expect(result.status).toBe('ready');
 expect(await generateUnreadSummary({db:ctx.db,feedId:'summary-test',accountId:'reader',input,port})).toEqual(result);expect(fetcher).toHaveBeenCalledOnce();
});
it('does not resubmit an uncertain provider request',async()=>{
 const fetcher=vi.fn(async()=>{throw new TypeError('connection lost');});const port=unreadSummaryPort(config(),'summary-test','uncertain-reader',fetcher);
 await expect(port.complete(unreadSummaryRequest(input))).rejects.toThrow();await expect(port.complete(unreadSummaryRequest(input))).rejects.toThrow('could not be confirmed');expect(fetcher).toHaveBeenCalledOnce();
});
it('blocks unknown-cost responses without releasing or retrying the operation',async()=>{
 const fetcher=vi.fn(async()=>Response.json({choices:[{message:{content:'{"summary":"A change was proposed."}'},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:20}}));const port=unreadSummaryPort(config(),'summary-test','missing-cost',fetcher);
 await expect(port.complete(unreadSummaryRequest(input))).rejects.toThrow('usage could not be confirmed');await expect(port.complete(unreadSummaryRequest(input))).rejects.toThrow('could not be confirmed');expect(fetcher).toHaveBeenCalledOnce();
});
