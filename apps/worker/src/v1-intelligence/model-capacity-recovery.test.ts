import {beforeEach,afterEach,it,expect} from 'vitest';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {reserveModelSpending,settleModelSpending,spendingExposure} from './model-spending';
import {isolateExpiredModelExecutions} from './model-capacity-recovery';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
const now=new Date(),policy='isolate-after-5m-v1' as const;
const reservation=(id:string,feedId='feed-a',leaseUntil=now.getTime()-300001)=>({id,accountId:'test-only-account',feedId,model:'openai/gpt-4.1',token:id+'-owner',reservedCostUsd:.1,leaseUntil,createdAt:now.toISOString(),providerLimits:{provider:'openrouter' as const,maxConcurrent:3,requestsPerMinute:50}});
beforeEach(async()=>{ctx=await createIntakeDatabase();for(const id of ['feed-a','feed-b'])await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(id,JSON.stringify({revision:1,paused:false})).run()});
afterEach(async()=>ctx.dispose());
it('requires an explicit deployment policy and does not confuse lease expiry with completion',async()=>{
 await reserveModelSpending(ctx.db,reservation('old'));
 expect(await isolateExpiredModelExecutions(ctx.db,undefined,now)).toBe(0);
 expect((await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_active_operations').first())?.n).toBe(1);
 await expect(isolateExpiredModelExecutions(ctx.db,'other' as typeof policy,now)).rejects.toThrow('INVALID_UNCERTAIN_EXECUTION_POLICY');
});
it('parks exact expired identities without settling money, pausing feeds or allowing replay; late cost still settles',async()=>{
 const old=reservation('old');await reserveModelSpending(ctx.db,old);
 const before=await ctx.db.prepare('SELECT json FROM v1_model_spending_reservations').first();
 expect(await isolateExpiredModelExecutions(ctx.db,policy,now)).toBe(1);
 expect(await isolateExpiredModelExecutions(ctx.db,policy,now)).toBe(0);
 expect(await ctx.db.prepare('SELECT json FROM v1_model_spending_reservations').first()).toEqual(before);
 expect(await ctx.db.prepare('SELECT id FROM v1_model_spending_settlements').first()).toBeNull();
 expect(await spendingExposure(ctx.db,old.accountId,now.toISOString())).toMatchObject({heldCostUsd:.1,activeConcurrencySlots:0,quarantinedConcurrencySlots:1});
 const q=await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='model_execution_quarantines' AND id='old'").first<{json:string}>();
 expect(JSON.parse(q!.json)).toMatchObject({remoteExecutionState:'TERMINATION_UNPROVEN',financialExposureRetained:true,reservationToken:old.token});
 expect(JSON.parse((await ctx.db.prepare("SELECT json FROM v1_feeds WHERE id='feed-a'").first<{json:string}>())!.json).paused).toBe(false);
 await expect(reserveModelSpending(ctx.db,old)).rejects.toThrow('OPERATION_EXECUTION_QUARANTINED');
 await reserveModelSpending(ctx.db,reservation('independent','feed-b',now.getTime()+60000));
 await settleModelSpending(ctx.db,old.id,old.token,{costUsd:.03,reported:true});
 expect(await spendingExposure(ctx.db,old.accountId,now.toISOString())).toMatchObject({heldCostUsd:.1,quarantinedConcurrencySlots:0,activeConcurrencySlots:1});
});
it('keeps live leases and the complete five-minute recovery grace, and skips confirmed settlements',async()=>{
 await reserveModelSpending(ctx.db,reservation('live','feed-a',now.getTime()+60000));
 await reserveModelSpending(ctx.db,reservation('grace','feed-b',now.getTime()-299999));
 await reserveModelSpending(ctx.db,reservation('settled'));await settleModelSpending(ctx.db,'settled','settled-owner',{costUsd:.01,reported:true});
 expect(await isolateExpiredModelExecutions(ctx.db,policy,now)).toBe(0);
 expect(await isolateExpiredModelExecutions(ctx.db,policy,new Date(now.getTime()+2))).toBe(1);
 expect((await ctx.db.prepare('SELECT id FROM v1_model_active_operations').all()).results).toEqual([{id:'live'}]);
});
it('limits each sweep to three identities and eventually drains a larger expired backlog',async()=>{
 for(let i=0;i<6;i++)await reserveModelSpending(ctx.db,{...reservation('old-'+i),providerLimits:undefined});
 expect(await isolateExpiredModelExecutions(ctx.db,policy,now)).toBe(3);
 expect(await isolateExpiredModelExecutions(ctx.db,policy,now)).toBe(3);
 expect(await isolateExpiredModelExecutions(ctx.db,policy,now)).toBe(0);
});
it('atomically prevents one feed from taking the whole provider pool',async()=>{
 const outcomes=await Promise.allSettled([0,1,2,3].map(i=>reserveModelSpending(ctx.db,{...reservation('same-'+i),providerLimits:{provider:'openrouter',maxConcurrent:3,requestsPerMinute:50,maxConcurrentPerFeed:2}})));
 expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(2);
 await reserveModelSpending(ctx.db,{...reservation('other','feed-b'),providerLimits:{provider:'openrouter',maxConcurrent:3,requestsPerMinute:50,maxConcurrentPerFeed:2}});
 expect((await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_active_operations').first())?.n).toBe(3);
});
it('does not release projection occupancy for a foreign quarantine token or account',async()=>{
 await reserveModelSpending(ctx.db,reservation('protected'));
 await ctx.db.prepare("INSERT INTO v1_feed_documents VALUES('model_execution_quarantines','protected','feed-a',?)").bind(JSON.stringify({accountId:'foreign',reservationToken:'protected-owner'})).run();
 expect((await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_active_operations').first())?.n).toBe(1);
});
