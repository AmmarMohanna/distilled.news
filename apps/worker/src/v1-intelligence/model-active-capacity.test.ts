import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {applyTestMigration} from '../test-migrations';
import {reserveModelSpending,settleModelSpending} from './model-spending';
import {isolateExpiredModelExecutions} from './model-capacity-recovery';
it('backfills only genuine occupancy and uses an indexed rate window without rewriting financial history',async()=>{
 const ctx=await createIntakeDatabase();try{
  for(const name of ['v1_model_active_reservation','v1_model_active_settled_insert','v1_model_active_settled_update','v1_model_active_quarantined'])await ctx.db.exec('DROP TRIGGER '+name);
  await ctx.db.exec('DROP TABLE v1_model_active_operations');await ctx.db.exec('DROP INDEX v1_model_reservation_rate_window');
  await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('feed',JSON.stringify({revision:1})).run();
  const r=(id:string,model='openai/gpt-4.1')=>({id,accountId:'test-only-account',feedId:'feed',model,token:id,reservedCostUsd:.01,leaseUntil:0,createdAt:new Date().toISOString()});
  for(const id of ['unsettled','confirmed','quarantined','foreign-quarantine'])await reserveModelSpending(ctx.db,r(id));
  await reserveModelSpending(ctx.db,r('native','workers_ai:fixture'));
  await settleModelSpending(ctx.db,'confirmed','confirmed',{costUsd:.002,reported:true});
  await settleModelSpending(ctx.db,'unsettled','unsettled',{costUsd:.001,reported:false});
  for(const id of ['quarantined','foreign-quarantine'])await ctx.db.prepare("INSERT INTO v1_feed_documents VALUES('model_execution_quarantines',?,'feed',?)").bind(id,JSON.stringify({accountId:id==='quarantined'?'test-only-account':'foreign',reservationToken:id})).run();
  const before={r:(await ctx.db.prepare('SELECT * FROM v1_model_spending_reservations ORDER BY id').all()).results,s:(await ctx.db.prepare('SELECT * FROM v1_model_spending_settlements ORDER BY id').all()).results};
  await applyTestMigration(ctx.db,readFileSync(new URL('../../migrations/0088_model_active_capacity.sql',import.meta.url),'utf8'));
  expect((await ctx.db.prepare('SELECT id,provider FROM v1_model_active_operations ORDER BY id').all()).results).toEqual([{id:'foreign-quarantine',provider:'openrouter'},{id:'native',provider:'cloudflare'},{id:'unsettled',provider:'openrouter'}]);
  expect((await ctx.db.prepare('SELECT * FROM v1_model_spending_reservations ORDER BY id').all()).results).toEqual(before.r);
  expect((await ctx.db.prepare('SELECT * FROM v1_model_spending_settlements ORDER BY id').all()).results).toEqual(before.s);
  const plan=await ctx.db.prepare("EXPLAIN QUERY PLAN SELECT COUNT(*) FROM v1_model_spending_reservations WHERE (CASE WHEN model LIKE 'cloudflare:%' OR model LIKE 'workers_ai:%' THEN 'cloudflare' ELSE 'openrouter' END)=? AND created_at>=?").bind('openrouter',new Date().toISOString()).all();
  expect(JSON.stringify(plan.results)).toContain('v1_model_reservation_rate_window');
  await settleModelSpending(ctx.db,'unsettled','unsettled',{costUsd:.003,reported:true});
  expect(await ctx.db.prepare("SELECT id FROM v1_model_active_operations WHERE id='unsettled'").first()).toBeNull();
 }finally{await ctx.dispose()}
},30000);
it('retains isolation and existing provider admission during a rolling upgrade before the projection exists',async()=>{
 const ctx=await createIntakeDatabase();try{
  for(const name of ['v1_model_active_reservation','v1_model_active_settled_insert','v1_model_active_settled_update','v1_model_active_quarantined'])await ctx.db.exec('DROP TRIGGER '+name);
  await ctx.db.exec('DROP TABLE v1_model_active_operations');
  for(const id of ['f','other'])await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(id,JSON.stringify({revision:1})).run();
  const r=(id:string,feedId='f',leaseUntil=0)=>({id,feedId,accountId:'test-only-account',token:id,model:'openai/gpt-4.1',reservedCostUsd:.01,createdAt:new Date().toISOString(),leaseUntil,providerLimits:{provider:'openrouter' as const,maxConcurrent:3,requestsPerMinute:50}});
  const old=r('old-1');await reserveModelSpending(ctx.db,old);await reserveModelSpending(ctx.db,r('old-2'));
  await reserveModelSpending(ctx.db,r('independent','other',Date.now()+60000));
  await expect(reserveModelSpending(ctx.db,r('blocked'))).rejects.toThrow('PROVIDER_RESOURCE_WAIT');
  expect(await isolateExpiredModelExecutions(ctx.db,'isolate-after-5m-v1')).toBe(2);
  await expect(reserveModelSpending(ctx.db,old)).rejects.toThrow('OPERATION_EXECUTION_QUARANTINED');
  await reserveModelSpending(ctx.db,r('new-work'));
  expect((await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first())?.n).toBe(4);
 }finally{await ctx.dispose()}
},30000);
