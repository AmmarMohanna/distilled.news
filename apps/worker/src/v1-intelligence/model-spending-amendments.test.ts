import {beforeAll,afterAll,it,expect} from 'vitest';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {authorizeModelSpending,reserveModelSpending,spendingAuthorization,spendingExposure,modelSpendingStatements} from './model-spending';
import {amendModelConcurrency} from './model-spending-amendments';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
beforeAll(async()=>ctx=await createIntakeDatabase({modelSpending:false}));afterAll(async()=>ctx.dispose());
const at='2026-10-13T14:00:00Z';
const grant=(id:string)=>({id,accountId:id,modelIds:['fixture'],validFrom:'2026-10-12T00:00:00Z',validUntil:'2026-10-19T00:00:00Z',maxExposureUsd:50,maxConcurrentOperations:21});
const r=(id:string,n:string)=>({id:id+':'+n,accountId:id,model:'fixture',feedId:'feed-'+n,token:'owner-'+n,reservedCostUsd:.02,leaseUntil:0,createdAt:at});
const approval=(id:string,previous=21,next=25)=>({id:id+'-amend-'+next,authorizationId:id,expectedConcurrentOperations:previous,maxConcurrentOperations:next,approvedBy:'fixture-operator',approvalId:'explicit-fixture-approval',createdAt:at});
it('25-slot amendment preserves the immutable $50 grant and all 21 liabilities, admitting exactly four independent calls',async()=>{
 const g=grant('capacity');await authorizeModelSpending(ctx.db,g);
 for(let i=0;i<21;i++)await reserveModelSpending(ctx.db,r(g.id,String(i)));
 await expect(reserveModelSpending(ctx.db,r(g.id,'new'))).rejects.toMatchObject({reason:'ACCOUNT_RESOURCE_WAIT'});
 const before=await spendingExposure(ctx.db,g.accountId,at);const amendment=await amendModelConcurrency(ctx.db,approval(g.id));
 expect(await amendModelConcurrency(ctx.db,approval(g.id))).toEqual(amendment);
 expect(await spendingExposure(ctx.db,g.accountId,at)).toEqual(before);
 const attempts=await Promise.allSettled(Array.from({length:5},(_,i)=>reserveModelSpending(ctx.db,r(g.id,'next-'+i))));
 expect(attempts.filter(x=>x.status==='fulfilled')).toHaveLength(4);
 expect(await spendingExposure(ctx.db,g.accountId,at)).toMatchObject({unsettledConcurrencySlots:25});
 expect(JSON.parse((await ctx.db.prepare('SELECT json FROM v1_model_spending_authorizations WHERE id=?').bind(g.id).first<{json:string}>())!.json)).toEqual(g);
 expect(await spendingAuthorization(ctx.db,r(g.id,'query'))).toMatchObject({maxExposureUsd:50,validUntil:g.validUntil,maxConcurrentOperations:25});
 await expect(ctx.db.prepare('UPDATE v1_model_spending_concurrency_amendments SET json=? WHERE id=?').bind('{}',amendment.id).run()).rejects.toThrow();
 await expect(ctx.db.prepare('DELETE FROM v1_model_spending_concurrency_amendments WHERE id=?').bind(amendment.id).run()).rejects.toThrow();
},30000);
it('a concurrent amendment fences admission computed against a stale larger limit',async()=>{
 const g=grant('stale');await authorizeModelSpending(ctx.db,g);await amendModelConcurrency(ctx.db,approval(g.id));
 const statements=await modelSpendingStatements(ctx.db,r(g.id,'stale-owner'));
 await amendModelConcurrency(ctx.db,approval(g.id,25,23));
 await expect(ctx.db.batch(statements)).rejects.toThrow();
 expect(await spendingExposure(ctx.db,g.accountId,at)).toMatchObject({heldCostUsd:0,unsettledConcurrencySlots:0});
});
it('amendment identity, expected limit and approval are enforced without altering money or expiry',async()=>{
 const g=grant('approval');await authorizeModelSpending(ctx.db,g);
 await expect(amendModelConcurrency(ctx.db,{...approval(g.id),approvedBy:''})).rejects.toThrow();
 await expect(amendModelConcurrency(ctx.db,approval(g.id,20,25))).rejects.toThrow('CONCURRENCY_AMENDMENT_STALE');
 await amendModelConcurrency(ctx.db,approval(g.id));
 await expect(amendModelConcurrency(ctx.db,{...approval(g.id),maxConcurrentOperations:26})).rejects.toThrow('CONCURRENCY_AMENDMENT_IDENTITY_CONFLICT');
 await expect(amendModelConcurrency(ctx.db,{...approval(g.id,25,20),id:g.id+'-below-base'})).rejects.toThrow('CONCURRENCY_DECREASE_BELOW_BASE_REQUIRES_DRAIN');
});
it('concurrent operator changes cannot both amend the same parent revision',async()=>{
 const g=grant('operators');await authorizeModelSpending(ctx.db,g);
 const results=await Promise.allSettled([amendModelConcurrency(ctx.db,approval(g.id)),amendModelConcurrency(ctx.db,{...approval(g.id),id:g.id+'-second',maxConcurrentOperations:24})]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect((await ctx.db.prepare('SELECT sequence FROM v1_model_spending_concurrency_amendments WHERE authorization_id=?').bind(g.id).all()).results).toHaveLength(1);
});
it('pre-migration databases retain their base limit and cannot activate an amendment',async()=>{
 await ctx.db.exec('DROP TABLE v1_model_spending_concurrency_amendments');
 const g=grant('legacy-schema');await authorizeModelSpending(ctx.db,g);
 expect(await spendingAuthorization(ctx.db,r(g.id,'query'))).toMatchObject({maxConcurrentOperations:21,concurrencySchemaAvailable:false});
 await reserveModelSpending(ctx.db,r(g.id,'independent'));
 await expect(amendModelConcurrency(ctx.db,approval(g.id))).rejects.toThrow('CONCURRENCY_AMENDMENT_MIGRATION_REQUIRED');
});
