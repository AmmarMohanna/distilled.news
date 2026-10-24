import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,testPolicy} from '../v1-intake/test-utils';
import {V1FeedStore} from './store';
import {feedFixture} from './test-utils';
import {authorizeModelSpending,reserveModelSpending,spendingExposure} from './model-spending';
import {recoverProviderGeneration,recoverPendingProviderGenerations} from './provider-recovery';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
const model='openai/gpt-4.1-mini',reservationId='semantic_intents:unknown-operation',generationId='gen-exact-operation';
beforeEach(async()=>{
 ctx=await createIntakeDatabase({modelSpending:false});await new V1FeedStore(ctx.db).registerFeed(feedFixture);
 await authorizeModelSpending(ctx.db,{id:'grant',accountId:'account',modelIds:[model],validFrom:'2026-10-03T00:00:00Z',validUntil:'2026-10-04T00:00:00Z',maxExposureUsd:50,maxConcurrentOperations:25});
 await reserveModelSpending(ctx.db,{id:reservationId,accountId:'account',model,feedId:'feed-1',token:'owner',reservedCostUsd:.2,leaseUntil:0,createdAt:testPolicy.now()});
 for(const [kind,id,value] of [
  ['semantic_intents','unknown-operation',{id:'unknown-operation',feedId:'feed-1',token:'owner',input:{model}}],
  ['semantic_results','unknown-operation',{id:'unknown-operation',status:'DEFERRED',failure:'SEMANTIC_OUTCOME_UNKNOWN',usage:{calls:1,costUsd:.2,reported:false}}],
  ['model_provider_receipts','header',{id:'header',feedId:'feed-1',reservationId,generationId,provider:'OPENROUTER',model,stage:'HEADERS',httpStatus:200}]
 ] as const)await ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind(kind,id,'feed-1',JSON.stringify(value)).run();
});
afterEach(async()=>ctx.dispose());
const metadata=(changes:Record<string,unknown>={})=>({id:generationId,model,total_cost:.014,finish_reason:'stop',created_at:testPolicy.now(),...changes});
it('settles exact completed generation metadata without altering the UNKNOWN question or reissuing inference',async()=>{
 const before=await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='semantic_results' AND id='unknown-operation'").first();
 const fetcher=vi.fn(async(url:any,init:any)=>{expect(String(url)).toBe('https://openrouter.ai/api/v1/generation?id='+generationId);expect(init.method).toBe('GET');return Response.json({data:metadata()})});
 expect(await recoverProviderGeneration(ctx.db,reservationId,'fixture-key',fetcher as typeof fetch)).toMatchObject({state:'SETTLED',costUsd:.014});
 expect(await spendingExposure(ctx.db,'account',testPolicy.now())).toMatchObject({heldCostUsd:0,reportedCostUsd:.014,unsettledConcurrencySlots:0});
 expect(await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='semantic_results' AND id='unknown-operation'").first()).toEqual(before);
 await recoverProviderGeneration(ctx.db,reservationId,'fixture-key',fetcher as typeof fetch);expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([{id:'gen-wrong'},{model:'another-model'},{finish_reason:null},{total_cost:-1},{total_cost:undefined}])('never releases exposure for incomplete or mismatched generation evidence %j',async changes=>{
 expect(await recoverProviderGeneration(ctx.db,reservationId,'fixture-key',async()=>Response.json({data:metadata(changes)}))).toMatchObject({state:'WAITING'});
 expect(await spendingExposure(ctx.db,'account',testPolicy.now())).toMatchObject({heldCostUsd:.2,reportedCostUsd:0,unsettledConcurrencySlots:1});
});
it.each([403,404,429,500])('keeps liability held after provider lookup HTTP %s',async status=>{
 expect(await recoverProviderGeneration(ctx.db,reservationId,'fixture-key',async()=>Response.json({error:{message:'private-fixture-secret'}},{status}))).toMatchObject({state:'WAITING',reason:'PROVIDER_LOOKUP_HTTP_'+status});
 expect(await spendingExposure(ctx.db,'account',testPolicy.now())).toMatchObject({heldCostUsd:.2});
});
it('cannot recover a legacy operation without a durably bound generation handle',async()=>{
 await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='model_provider_receipts'").run();const fetcher=vi.fn();
 expect(await recoverProviderGeneration(ctx.db,reservationId,'fixture-key',fetcher)).toMatchObject({state:'WAITING',reason:'GENERATION_HANDLE_UNAVAILABLE'});expect(fetcher).not.toHaveBeenCalled();
});
it('concurrent recovery is idempotent and never converts the canonical result to success',async()=>{
 const fetcher:typeof fetch=async()=>Response.json({data:metadata()});
 await Promise.all([recoverProviderGeneration(ctx.db,reservationId,'fixture-key',fetcher),recoverProviderGeneration(ctx.db,reservationId,'fixture-key',fetcher)]);
 expect(await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_settlements WHERE id=?').bind(reservationId).first()).toMatchObject({n:1});
 expect(JSON.parse((await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='semantic_results' AND id='unknown-operation'").first<{json:string}>())!.json).failure).toBe('SEMANTIC_OUTCOME_UNKNOWN');
});
it('scheduled metadata recovery backoffs unavailable lookups without consuming model attempts',async()=>{
 const fetcher=vi.fn(async()=>Response.json({error:{}},{status:404})),now=new Date(testPolicy.now());
 await recoverPendingProviderGenerations(ctx.db,'fixture-key',now,fetcher);await recoverPendingProviderGenerations(ctx.db,'fixture-key',new Date(now.getTime()+1000),fetcher);
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(await ctx.db.prepare("SELECT COUNT(*) n FROM v1_feed_documents WHERE kind='model_provider_recovery_attempts'").first()).toMatchObject({n:1});
 expect(await spendingExposure(ctx.db,'account',testPolicy.now())).toMatchObject({heldCostUsd:.2});
 await recoverPendingProviderGenerations(ctx.db,'fixture-key',new Date(now.getTime()+180000),async()=>Response.json({data:metadata()}));
 expect(await spendingExposure(ctx.db,'account',testPolicy.now())).toMatchObject({heldCostUsd:0,reportedCostUsd:.014});
});
it('foreign or mismatched receipt identity never authorizes a provider lookup',async()=>{
 await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='model_provider_receipts'").run();
 await ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('model_provider_receipts','foreign-header','feed-1',JSON.stringify({id:'foreign-header',feedId:'foreign',reservationId,generationId,provider:'OPENROUTER',model,stage:'HEADERS'})).run();const fetcher=vi.fn();
 expect(await recoverProviderGeneration(ctx.db,reservationId,'fixture-key',fetcher)).toMatchObject({state:'WAITING',reason:'GENERATION_BINDING_INVALID'});expect(fetcher).not.toHaveBeenCalled();
});

it('settles a provider-confirmed cancellation under the exact catalog canonical alias without retrying inference',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>Response.json({data:metadata({model:'openai/gpt-4.1-mini-2025-04-14',cancelled:true,finish_reason:null,total_cost:.007682})}));
 expect(await recoverProviderGeneration(ctx.db,reservationId,'fixture-key',fetcher)).toEqual({state:'SETTLED',costUsd:.007682});
 expect(await spendingExposure(ctx.db,'account',testPolicy.now())).toMatchObject({heldCostUsd:0,reportedCostUsd:.007682,unsettledConcurrencySlots:0});
 const result=await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='semantic_results' AND id='unknown-operation'").first<{json:string}>();
 expect(JSON.parse(result!.json).failure).toBe('SEMANTIC_OUTCOME_UNKNOWN');
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([{model:'openai/gpt-4.1-mini-unknown-version',cancelled:true},{cancelled:'true',finish_reason:null},{cancelled:false,finish_reason:null},{id:'gen-unrelated',cancelled:true}])('retains holds for unproven cancellation or unrecognized aliases %j',async changes=>{
 expect(await recoverProviderGeneration(ctx.db,reservationId,'fixture-key',async()=>Response.json({data:metadata(changes)}))).toMatchObject({state:'WAITING'});
 expect(await spendingExposure(ctx.db,'account',testPolicy.now())).toMatchObject({heldCostUsd:.2,unsettledConcurrencySlots:1});
});
