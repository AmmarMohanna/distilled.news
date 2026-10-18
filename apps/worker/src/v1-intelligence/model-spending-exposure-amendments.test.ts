import {afterAll,beforeAll,expect,it} from 'vitest';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {readFileSync} from 'node:fs';
import {authorizeModelSpending,reserveModelSpending,settleModelSpending,spendingAuthorization,spendingExposure,modelSpendingStatements} from './model-spending';
import {amendModelExposure} from './model-spending-exposure-amendments';

let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
const at='2026-10-13T14:00:00.000Z';
const grant={id:'exposure-owner',accountId:'exposure-account',modelIds:['fixture'],validFrom:'2026-10-12T00:00:00.000Z',validUntil:'2026-10-19T00:00:00.000Z',maxExposureUsd:50,maxConcurrentOperations:100};
const reservation=(id:string,cost:number,createdAt=at)=>({id,accountId:grant.accountId,model:'fixture',feedId:'feed-'+id,token:'owner-'+id,reservedCostUsd:cost,leaseUntil:0,createdAt});

beforeAll(async()=>{
 ctx=await createIntakeDatabase({modelSpending:false});
 await ctx.db.exec(readFileSync(new URL('../../migrations/0062_model_spending_exposure_amendments.sql',import.meta.url),'utf8').replace(/^\s*--[^\n]*$/gm,'').replace(/\r?\n/g,' '));
});
afterAll(async()=>ctx?.dispose());

it('an append-only $51 cap admits required output while retaining original-period charges and unknown older-period money',async()=>{
 await authorizeModelSpending(ctx.db,{...grant,id:'previous-period',validFrom:'2026-10-11T00:00:00.000Z',validUntil:grant.validFrom});
 await reserveModelSpending(ctx.db,reservation('older-unknown',4.345092702,'2026-10-11T12:00:00.000Z'));
 await authorizeModelSpending(ctx.db,grant);
 await reserveModelSpending(ctx.db,reservation('reported-current',45.640232468));
 await settleModelSpending(ctx.db,'reported-current','owner-reported-current',{costUsd:45.640232468,reported:true});
 const required=reservation('required-output',.0524288);
 await expect(reserveModelSpending(ctx.db,required)).rejects.toMatchObject({reason:'ACCOUNT_RESOURCE_WAIT'});
 const before=await spendingExposure(ctx.db,grant.accountId,at);
 const amendment={id:'approved-exposure-51',authorizationId:grant.id,accountId:grant.accountId,sequence:1,previousMaxExposureUsd:50,maxExposureUsd:51,approvedBy:'fixture-owner',approvalId:'explicit-fixture-approval',createdAt:at};
 const approved={id:amendment.id,authorizationId:grant.id,accountId:grant.accountId,expectedSequence:0,expectedMaxExposureUsd:50,maxExposureUsd:51,approvedBy:amendment.approvedBy,approvalId:amendment.approvalId,createdAt:at};
 expect(await amendModelExposure(ctx.db,approved)).toEqual(amendment);
 expect(await amendModelExposure(ctx.db,approved)).toEqual(amendment);
 expect(await spendingExposure(ctx.db,grant.accountId,at)).toEqual(before);
 await expect(reserveModelSpending(ctx.db,required)).resolves.toBeUndefined();
 expect(await spendingAuthorization(ctx.db,required)).toMatchObject({id:grant.id,accountId:grant.accountId,validFrom:grant.validFrom,validUntil:grant.validUntil,modelIds:['fixture'],maxExposureUsd:51,maxConcurrentOperations:100,exposureRevision:1});
 expect(JSON.parse((await ctx.db.prepare('SELECT json FROM v1_model_spending_authorizations WHERE id=?').bind(grant.id).first<{json:string}>())!.json)).toEqual(grant);
 expect(await spendingExposure(ctx.db,grant.accountId,at)).toMatchObject({reportedCostUsd:45.640232468,unknown:2});
},30000);

const fixtureGrant=(id:string)=>({...grant,id,accountId:id});
const approval=(g:typeof grant,extra:Record<string,unknown>={})=>({id:g.id+'-51',authorizationId:g.id,accountId:g.accountId,expectedSequence:0,expectedMaxExposureUsd:50,maxExposureUsd:51,approvedBy:'fixture-owner',approvalId:'explicit-fixture-approval',createdAt:at,...extra});
it('rejects stale, conflicting, decreasing, foreign, missing or out-of-period approvals',async()=>{
 const g=fixtureGrant('validation');await authorizeModelSpending(ctx.db,g);
 for(const invalid of [{approvedBy:''},{approvalId:''},{maxExposureUsd:50},{maxExposureUsd:Infinity},{expectedSequence:-1},{createdAt:'invalid'}])await expect(amendModelExposure(ctx.db,approval(g,invalid))).rejects.toThrow('INVALID_EXPOSURE_APPROVAL');
 await expect(amendModelExposure(ctx.db,approval(g,{accountId:'foreign'}))).rejects.toThrow('SCOPE_MISMATCH');
 await expect(amendModelExposure(ctx.db,approval(g,{createdAt:'2026-10-11T00:00:00.000Z'}))).rejects.toThrow('OUTSIDE_GRANT');
 await expect(amendModelExposure(ctx.db,approval(g,{expectedSequence:1}))).rejects.toThrow('STALE');
 await amendModelExposure(ctx.db,approval(g));
 await expect(amendModelExposure(ctx.db,approval(g,{maxExposureUsd:52}))).rejects.toThrow('IDENTITY_CONFLICT');
 expect(await spendingExposure(ctx.db,g.accountId,at)).toMatchObject({reportedCostUsd:0,heldCostUsd:0});
});
it('admits only one same-parent amendment and fences reservation statements prepared before it',async()=>{
 const g=fixtureGrant('amend-race');await authorizeModelSpending(ctx.db,g);
 const r={...reservation('stale-call',.01),accountId:g.accountId},statements=await modelSpendingStatements(ctx.db,r);
 const results=await Promise.allSettled([amendModelExposure(ctx.db,approval(g)),amendModelExposure(ctx.db,approval(g,{id:g.id+'-other',maxExposureUsd:52}))]);
 expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
 await expect(ctx.db.batch(statements)).rejects.toThrow();
 expect(await spendingExposure(ctx.db,g.accountId,at)).toMatchObject({heldCostUsd:0});
});
it('keeps amendment and base-grant rows immutable including replacement and raw invalid scope',async()=>{
 const g=fixtureGrant('ddl');await authorizeModelSpending(ctx.db,g);const value=await amendModelExposure(ctx.db,approval(g));
 await expect(ctx.db.prepare('UPDATE v1_model_spending_exposure_amendments SET max_exposure_usd=52 WHERE id=?').bind(value.id).run()).rejects.toThrow();
 await expect(ctx.db.prepare('DELETE FROM v1_model_spending_exposure_amendments WHERE id=?').bind(value.id).run()).rejects.toThrow();
 await expect(ctx.db.prepare('INSERT OR REPLACE INTO v1_model_spending_exposure_amendments SELECT * FROM v1_model_spending_exposure_amendments WHERE id=?').bind(value.id).run()).rejects.toThrow();
 await expect(ctx.db.prepare('DELETE FROM v1_model_spending_authorizations WHERE id=?').bind(g.id).run()).rejects.toThrow();
 await expect(ctx.db.prepare('INSERT OR REPLACE INTO v1_model_spending_authorizations SELECT * FROM v1_model_spending_authorizations WHERE id=?').bind(g.id).run()).rejects.toThrow();
 const forged={...value,id:'forged',sequence:2,accountId:'foreign',previousMaxExposureUsd:51,maxExposureUsd:52};
 await expect(ctx.db.prepare('INSERT INTO v1_model_spending_exposure_amendments VALUES(?,?,?,?,?,?,?,?)').bind(forged.id,g.id,'foreign',2,51,52,at,JSON.stringify(forged)).run()).rejects.toThrow();
});
it('reserves atomically within the amended cap while retaining the original model and concurrency rules',async()=>{
 const g={...fixtureGrant('reserve-race'),maxExposureUsd:1,maxConcurrentOperations:100};await authorizeModelSpending(ctx.db,g);
 await amendModelExposure(ctx.db,{...approval(g),expectedMaxExposureUsd:1,maxExposureUsd:2});
 const attempts=await Promise.allSettled(Array.from({length:4},(_,i)=>reserveModelSpending(ctx.db,{...reservation('cap-race-'+i,.8),accountId:g.accountId})));
 expect(attempts.filter(x=>x.status==='fulfilled')).toHaveLength(2);
 expect(await spendingExposure(ctx.db,g.accountId,at)).toMatchObject({heldCostUsd:1.6,unsettledConcurrencySlots:2});
 await expect(reserveModelSpending(ctx.db,{...reservation('foreign-model',0),accountId:g.accountId,model:'unauthorized'})).rejects.toMatchObject({reason:'ACCOUNT_AUTHORIZATION_REQUIRED'});
});
it('retains the immutable base cap and ordinary admission before the additive migration',async()=>{
 const legacy=await createIntakeDatabase({modelSpending:false});try{
  const g=fixtureGrant('legacy');await authorizeModelSpending(legacy.db,g);
  expect(await spendingAuthorization(legacy.db,{...reservation('legacy-query',.01),accountId:g.accountId})).toMatchObject({maxExposureUsd:50,exposureSchemaAvailable:false,exposureRevision:0});
  await reserveModelSpending(legacy.db,{...reservation('legacy-call',.01),accountId:g.accountId});
  await expect(amendModelExposure(legacy.db,approval(g))).rejects.toThrow('MIGRATION_REQUIRED');
 }finally{await legacy.dispose()}
},30000);
