import {beforeEach,afterEach,it,expect} from 'vitest';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {authorizeModelSpending,reserveModelSpending,settleModelSpending,spendingExposure,modelSpendingStatements,executionCapacityDiagnostic} from './model-spending';
import {quarantineModelExecutions} from './model-quarantine';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
beforeEach(async()=>{ctx=await createIntakeDatabase({modelSpending:false});await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('old',JSON.stringify({revision:1,paused:true})).run()});afterEach(async()=>ctx.dispose());
const at='2026-10-13T14:00:00Z',g={id:'grant',accountId:'account',modelIds:['fixture'],validFrom:'2026-10-12T00:00:00Z',validUntil:'2026-10-19T00:00:00Z',maxExposureUsd:50,maxConcurrentOperations:25};
const r=(id:string,feedId='old',cost=.02)=>({id,accountId:g.accountId,model:'fixture',feedId,token:id+'-owner',reservedCostUsd:cost,leaseUntil:0,createdAt:at});
const a=(ids:string[])=>({id:'approval',accountId:g.accountId,feedIds:['old'],reservationIds:ids,approvedBy:'operator',approvalId:'explicit-risk-acceptance',createdAt:at,acceptUnprovenRemoteOverlap:true as const});
it('25 held historical operations remain financially held while exactly 25 independent new operations can enter',async()=>{
 await authorizeModelSpending(ctx.db,g);const ids=Array.from({length:25},(_,i)=>'old-'+i);for(const id of ids)await reserveModelSpending(ctx.db,r(id));
 await expect(reserveModelSpending(ctx.db,r('blocked','new'))).rejects.toMatchObject({reason:'ACCOUNT_RESOURCE_WAIT'});
 const before=(await ctx.db.prepare('SELECT id,json FROM v1_model_spending_reservations ORDER BY id').all()).results;
 await quarantineModelExecutions(ctx.db,a(ids));await quarantineModelExecutions(ctx.db,a(ids));
 expect((await ctx.db.prepare('SELECT id,json FROM v1_model_spending_reservations ORDER BY id').all()).results).toEqual(before);
 expect(await spendingExposure(ctx.db,g.accountId,at)).toMatchObject({heldCostUsd:expect.closeTo(.5),unsettledConcurrencySlots:25,activeConcurrencySlots:0,quarantinedConcurrencySlots:25});
 const outcomes=await Promise.allSettled(Array.from({length:26},(_,i)=>reserveModelSpending(ctx.db,r('new-'+i,'new'))));expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(25);
 await expect(reserveModelSpending(ctx.db,r('old-retry'))).rejects.toMatchObject({reason:'FEED_EXECUTION_RETIRED'});
 await settleModelSpending(ctx.db,ids[0],ids[0]+'-owner',{costUsd:.01,reported:true});expect(await spendingExposure(ctx.db,g.accountId,at)).toMatchObject({quarantinedConcurrencySlots:24,activeConcurrencySlots:25,reportedCostUsd:.01});
},30000);
it('expiry without explicit approval never releases capacity and unsupported approval is refused',async()=>{
 await authorizeModelSpending(ctx.db,g);await reserveModelSpending(ctx.db,r('held'));
 await expect(quarantineModelExecutions(ctx.db,{...a(['held']),acceptUnprovenRemoteOverlap:false as true})).rejects.toThrow('INVALID_EXECUTION_QUARANTINE_APPROVAL');
 expect(await spendingExposure(ctx.db,g.accountId,at)).toMatchObject({activeConcurrencySlots:1,quarantinedConcurrencySlots:0});
 expect(executionCapacityDiagnostic({accountMapped:true,leaseUntil:0,quarantine:{approvedBy:'operator',approvalId:'approval'}})).toMatchObject({countedAgainstConcurrency:false,remoteExecutionState:'TERMINATION_UNPROVEN'});
});
it('missing snapshot, foreign ownership and unpaused feeds cannot be quarantined',async()=>{
 await authorizeModelSpending(ctx.db,g);await reserveModelSpending(ctx.db,r('held'));await reserveModelSpending(ctx.db,r('other'));
 await expect(quarantineModelExecutions(ctx.db,a(['held']))).rejects.toThrow('QUARANTINE_SNAPSHOT_STALE');
 await expect(quarantineModelExecutions(ctx.db,{...a(['held','other']),accountId:'foreign'})).rejects.toThrow('QUARANTINE_SCOPE_MISMATCH');
 await ctx.db.prepare("UPDATE v1_feeds SET json=? WHERE id='old'").bind(JSON.stringify({revision:2,paused:false})).run();
 await expect(quarantineModelExecutions(ctx.db,a(['held','other']))).rejects.toThrow('QUARANTINE_FEED_MUST_BE_PAUSED');
});
it('stale pre-retirement admission cannot commit after retirement',async()=>{
 await authorizeModelSpending(ctx.db,g);await reserveModelSpending(ctx.db,r('held'));const statements=await modelSpendingStatements(ctx.db,r('stale'));
 await quarantineModelExecutions(ctx.db,a(['held']));await expect(ctx.db.batch(statements)).rejects.toThrow();
});
it('quarantined exposure still prevents spending beyond the unchanged grant',async()=>{
 await authorizeModelSpending(ctx.db,{...g,maxExposureUsd:1});await reserveModelSpending(ctx.db,r('held','old',.9));await quarantineModelExecutions(ctx.db,a(['held']));
 await expect(reserveModelSpending(ctx.db,r('new','new',.2))).rejects.toMatchObject({reason:'ACCOUNT_RESOURCE_WAIT'});
});
it('operator pause and quarantine commit together, leaving unrelated feeds unchanged',async()=>{
 await ctx.db.exec('CREATE TABLE briefings(id TEXT PRIMARY KEY,paused INTEGER,updated_at TEXT)');
 await ctx.db.exec("INSERT INTO briefings VALUES('old',0,'before'),('unrelated',0,'before')");
 await ctx.db.prepare("UPDATE v1_feeds SET json=? WHERE id='old'").bind(JSON.stringify({revision:2,paused:false})).run();
 await authorizeModelSpending(ctx.db,g);await reserveModelSpending(ctx.db,r('held'));
 const approval={...a(['held']),pauseExistingFeeds:true as const};
 // A deliberately conflicting immutable retirement forces the whole batch to roll back.
 await ctx.db.prepare("INSERT INTO v1_feed_documents VALUES('model_execution_retirements','old','old','{}')").run();
 await expect(quarantineModelExecutions(ctx.db,approval)).rejects.toThrow();
 expect((await ctx.db.prepare("SELECT json FROM v1_feeds WHERE id='old'").first<{json:string}>())!.json).toContain('"paused":false');
 expect((await ctx.db.prepare("SELECT paused FROM briefings WHERE id='old'").first<{paused:number}>())!.paused).toBe(0);
 await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='model_execution_retirements' AND id='old'").run();
 await quarantineModelExecutions(ctx.db,approval);
 expect((await ctx.db.prepare("SELECT paused FROM briefings WHERE id='old'").first<{paused:number}>())!.paused).toBe(1);
 expect((await ctx.db.prepare("SELECT paused FROM briefings WHERE id='unrelated'").first<{paused:number}>())!.paused).toBe(0);
});
