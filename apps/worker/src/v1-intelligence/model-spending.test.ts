import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {authorizeModelSpending,reserveModelSpending,settleModelSpending,spendingExposure,reconcileLegacyModelSpending,modelSpendingAccount} from './model-spending';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
beforeEach(async()=>ctx=await createIntakeDatabase({modelSpending:false}));afterEach(async()=>ctx.dispose());
const grant={id:'owner-approved',accountId:'test-provider-account',modelIds:['test-model'],validFrom:'2026-10-12T00:00:00Z',validUntil:'2026-10-13T00:00:00Z',maxExposureUsd:3,maxConcurrentOperations:2};
const request=(id:string,costUsd:number)=>({id,accountId:grant.accountId,model:'test-model',feedId:'feed-'+id,token:'owner-'+id,reservedCostUsd:costUsd,leaseUntil:Date.now()+60000,createdAt:'2026-10-12T12:00:00Z'});
it('missing account approval never defaults to a historical wallet or unlimited spend',async()=>{await expect(reserveModelSpending(ctx.db,request('a',.03))).rejects.toMatchObject({reason:'ACCOUNT_AUTHORIZATION_REQUIRED'});expect(await spendingExposure(ctx.db,grant.accountId,'2026-10-12T12:00:00Z')).toMatchObject({heldCostUsd:0})});
it('operator exposure, not per-call or daily Feed constants, admits legitimate work',async()=>{await authorizeModelSpending(ctx.db,grant);await reserveModelSpending(ctx.db,request('a',.4));await settleModelSpending(ctx.db,'a','owner-a',{costUsd:.2,reported:true});await reserveModelSpending(ctx.db,request('b',.4));expect(await spendingExposure(ctx.db,grant.accountId,'2026-10-12T12:00:00Z')).toMatchObject({reportedCostUsd:.2,heldCostUsd:.4})});
it('concurrent Feeds cannot both reserve beyond the same account grant',async()=>{await authorizeModelSpending(ctx.db,{...grant,maxExposureUsd:1});const outcomes=await Promise.allSettled([reserveModelSpending(ctx.db,request('a',.7)),reserveModelSpending(ctx.db,request('b',.7))]);expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await spendingExposure(ctx.db,grant.accountId,'2026-10-12T12:00:00Z')).toMatchObject({heldCostUsd:.7})});
it('expired owners remain financially held, late responses settle, and retries preserve the exact reservation',async()=>{await authorizeModelSpending(ctx.db,grant);const r={...request('a',.8),leaseUntil:0};await reserveModelSpending(ctx.db,r);await reserveModelSpending(ctx.db,r);expect(await spendingExposure(ctx.db,grant.accountId,'2026-10-12T12:00:00Z')).toMatchObject({heldCostUsd:.8,unknown:1});await expect(settleModelSpending(ctx.db,'a','wrong',{costUsd:.1,reported:true})).rejects.toMatchObject({reason:'RESERVATION_OWNER_MISMATCH'});await settleModelSpending(ctx.db,'a','owner-a',{costUsd:.12,reported:true});expect(await spendingExposure(ctx.db,grant.accountId,'2026-10-12T12:00:00Z')).toMatchObject({heldCostUsd:0,reportedCostUsd:.12})});
it('unknown liabilities cross grant boundaries and cannot be erased by a new day',async()=>{await authorizeModelSpending(ctx.db,grant);await reserveModelSpending(ctx.db,{...request('a',2),leaseUntil:0});await authorizeModelSpending(ctx.db,{...grant,id:'next-day',validFrom:grant.validUntil,validUntil:'2026-10-14T00:00:00Z',maxExposureUsd:1});await expect(reserveModelSpending(ctx.db,{...request('b',.1),createdAt:'2026-10-13T12:00:00Z'})).rejects.toMatchObject({reason:'ACCOUNT_RESOURCE_WAIT'})});
it('known actual overrun is recorded completely instead of capped or changed into a semantic rejection',async()=>{await authorizeModelSpending(ctx.db,grant);await reserveModelSpending(ctx.db,request('a',.1));await settleModelSpending(ctx.db,'a','owner-a',{costUsd:4,reported:true});expect(await spendingExposure(ctx.db,grant.accountId,'2026-10-12T12:00:00Z')).toMatchObject({reportedCostUsd:4});await expect(reserveModelSpending(ctx.db,request('b',.01))).rejects.toMatchObject({reason:'ACCOUNT_RESOURCE_WAIT'})});
it('historical paid work needs explicit account reconciliation before approval',async()=>{await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('historical',JSON.stringify({revision:1})).run();await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('semantic_intents','old','historical',?)").bind(JSON.stringify({id:'old',reservedCostUsd:.02})).run();await expect(authorizeModelSpending(ctx.db,grant)).rejects.toMatchObject({reason:'LEGACY_LIABILITIES_UNRECONCILED'})});

it('explicit historical account mapping imports UNKNOWN liability without rewriting its paid identity',async()=>{await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('historical',JSON.stringify({revision:1})).run();const intent={id:'old',input:{model:'test-model'},token:'legacy-owner',reservedCostUsd:.7,leaseUntil:0,createdAt:'2026-10-11T12:00:00Z'};await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('semantic_intents','old','historical',?)").bind(JSON.stringify(intent)).run();await reconcileLegacyModelSpending(ctx.db,'semantic_intents','old',grant.accountId);await reconcileLegacyModelSpending(ctx.db,'semantic_intents','old',grant.accountId);await authorizeModelSpending(ctx.db,grant);expect(await spendingExposure(ctx.db,grant.accountId,'2026-10-12T12:00:00Z')).toMatchObject({heldCostUsd:.7,unknown:1});expect(JSON.parse((await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='semantic_intents' AND id='old'").first<{json:string}>())!.json)).toEqual(intent)});

it('explicit tracking-only mode admits above the old ceiling without grants and preserves settlement ownership',async()=>{
 await ctx.db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
 await ctx.db.prepare('INSERT INTO settings VALUES(?,?,?)').bind('model-spending:tracking-only:'+grant.accountId,JSON.stringify({mode:'TRACK_ONLY',modelIds:['test-model'],enabledAt:'2026-10-12T00:00:00Z'}),'2026-10-12').run();
 expect(await modelSpendingAccount(ctx.db,'test-model','2026-10-12T12:00:00Z')).toBe(grant.accountId);
 const r=request('uncapped',100);await reserveModelSpending(ctx.db,r);await reserveModelSpending(ctx.db,r);
 expect(await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first('n')).toBe(1);
 expect(await ctx.db.prepare('SELECT authorization_id FROM v1_model_spending_reservations').first('authorization_id')).toBeNull();
 await expect(settleModelSpending(ctx.db,r.id,'foreign',{costUsd:80,reported:true})).rejects.toMatchObject({reason:'RESERVATION_OWNER_MISMATCH'});
 await settleModelSpending(ctx.db,r.id,r.token,{costUsd:80,reported:true});expect(await spendingExposure(ctx.db,grant.accountId,r.createdAt)).toMatchObject({heldCostUsd:0});
 await expect(modelSpendingAccount(ctx.db,'other-model',r.createdAt)).rejects.toMatchObject({reason:'ACCOUNT_AUTHORIZATION_REQUIRED'});
});

it('tracking-only mode retains old uncertain money while coordinating new provider operations',async()=>{
 await ctx.db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
 await authorizeModelSpending(ctx.db,grant);const old={...request('historical',2),leaseUntil:0};await reserveModelSpending(ctx.db,old);
 const oldRow=await ctx.db.prepare('SELECT * FROM v1_model_spending_reservations WHERE id=?').bind(old.id).first();
 await ctx.db.prepare('INSERT INTO settings VALUES(?,?,?)').bind('model-spending:tracking-only:'+grant.accountId,JSON.stringify({mode:'TRACK_ONLY',modelIds:['test-model'],enabledAt:'2026-10-12T12:01:00Z'}),'2026-10-12').run();
 const current={...request('live',100),createdAt:'2026-10-12T12:02:00Z',providerLimits:{provider:'openrouter' as const,maxConcurrent:1,requestsPerMinute:100}};
 await reserveModelSpending(ctx.db,current);
 await expect(reserveModelSpending(ctx.db,{...current,id:'second',token:'second'})).rejects.toMatchObject({reason:'PROVIDER_RESOURCE_WAIT'});
 expect(await ctx.db.prepare('SELECT * FROM v1_model_spending_reservations WHERE id=?').bind(old.id).first()).toEqual(oldRow);
 expect(await spendingExposure(ctx.db,grant.accountId,current.createdAt)).toMatchObject({heldCostUsd:102});
 await settleModelSpending(ctx.db,current.id,current.token,{costUsd:4,reported:true});await reserveModelSpending(ctx.db,{...current,id:'next',token:'next'});
 expect(await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_authorizations').first('n')).toBe(1);
});
