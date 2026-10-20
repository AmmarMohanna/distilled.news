import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {reserveModelSpending,settleModelSpending} from './model-spending';
it('atomically limits all accounts, retains uncertain slots and enforces the rolling request window',async()=>{
 const ctx=await createIntakeDatabase();try{
 const now=new Date().toISOString(),r=(id:string,createdAt=now)=>({id,accountId:'test-only-account',model:'openai/gpt-4.1',feedId:'feed-1',token:id,reservedCostUsd:.01,leaseUntil:Date.now()-1,createdAt,providerLimits:{provider:'openrouter' as const,maxConcurrent:2,requestsPerMinute:2}});
 const results=await Promise.allSettled(['a','b','c'].map(id=>reserveModelSpending(ctx.db,r(id))));expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(2);
 const rows=await ctx.db.prepare('SELECT id FROM v1_model_spending_reservations').all<{id:string}>();expect(rows.results).toHaveLength(2);
 await expect(reserveModelSpending(ctx.db,r('uncertain',new Date(Date.parse(now)+61000).toISOString()))).rejects.toThrow('PROVIDER_RESOURCE_WAIT');
 for(const row of rows.results)await settleModelSpending(ctx.db,row.id,row.id,{costUsd:0,reported:true});
 await expect(reserveModelSpending(ctx.db,r('rate-limited'))).rejects.toThrow('PROVIDER_RESOURCE_WAIT');
 await reserveModelSpending(ctx.db,r('later',new Date(Date.parse(now)+61000).toISOString()));
 expect((await ctx.db.prepare('SELECT id FROM v1_model_provider_guards').all()).results).toHaveLength(0);
 }finally{await ctx.dispose()}
},30000);

it('shares Cloudflare API capacity across native and unified routes without consuming OpenRouter slots',async()=>{const ctx=await createIntakeDatabase();try{const now=new Date().toISOString();for(const [i,provider,model] of [[0,'openrouter','openai/gpt-4.1'],[1,'workers_ai','workers_ai:@cf/qwen/qwen3-30b-a3b-fp8'],[2,'cloudflare','cloudflare:openai/gpt-4.1']] as const){await reserveModelSpending(ctx.db,{id:'route-'+i,accountId:'test-only-account',model,feedId:'f',token:'t'+i,reservedCostUsd:.01,leaseUntil:0,createdAt:now,providerLimits:{provider,maxConcurrent:provider==='openrouter'?1:2,requestsPerMinute:provider==='openrouter'?1:2}})}expect((await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first<any>())!.n).toBe(3);await expect(reserveModelSpending(ctx.db,{id:'extra-cf',accountId:'test-only-account',model:'cloudflare:openai/gpt-4.1',feedId:'f',token:'extra',reservedCostUsd:.01,leaseUntil:0,createdAt:now,providerLimits:{provider:'cloudflare',maxConcurrent:2,requestsPerMinute:2}})).rejects.toThrow('PROVIDER_RESOURCE_WAIT')}finally{await ctx.dispose()}},30000);
