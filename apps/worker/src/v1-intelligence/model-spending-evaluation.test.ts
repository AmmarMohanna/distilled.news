import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {authorizeModelSpending,reserveModelSpending,settleModelSpending} from './model-spending';
import {validateEvaluationScope} from './model-spending-evaluation';
it('fences evaluation requests, single-slot unknowns, total calls, new spending and lifetime exposure atomically',async()=>{
 const ctx=await createIntakeDatabase();try{
 await ctx.db.exec(readFileSync(new URL('../../migrations/0065_model_evaluation_scope.sql',import.meta.url),'utf8').replace(/^\s*--[^\n]*$/gm,'').replace(/\r?\n/g,' '));
 const now=new Date().toISOString(),end=new Date(Date.now()+3600000).toISOString();
 const scope={feedId:'eval-only',manifestHash:'frozen',operations:[{id:'eval:1',model:'m',requestHash:'one'},{id:'eval:2',model:'m',requestHash:'two'}],maxNewSpendingUsd:.2,maxNewOperations:2,maxConcurrentOperations:1,maxLifetimeExposureUsd:73};
 const grant:any={id:'evaluation-grant',accountId:'eval-account',modelIds:['m'],validFrom:now,validUntil:end,maxExposureUsd:73,maxConcurrentOperations:2,evaluationScope:scope};
 expect(()=>validateEvaluationScope({...grant,evaluationScope:{...scope,maxNewOperations:25}})).toThrow();
 await authorizeModelSpending(ctx.db,grant);
 const reserve=(id:string,requestHash:string,extra:any={})=>reserveModelSpending(ctx.db,{id,accountId:'eval-account',model:'m',feedId:'eval-only',token:id,reservedCostUsd:.1,leaseUntil:Date.now()-1,createdAt:new Date().toISOString(),evaluation:{manifestHash:'frozen',requestHash},...extra} as any);
 await expect(reserve('bad','one')).rejects.toThrow();await expect(reserve('eval:1','one',{feedId:'background-feed'})).rejects.toThrow();
 const raw=(id:string,requestHash:string,feedId='eval-only')=>{const r={id,accountId:'eval-account',model:'m',feedId,token:id,reservedCostUsd:.1,leaseUntil:0,createdAt:new Date().toISOString(),evaluation:{manifestHash:'frozen',requestHash}};return ctx.db.prepare('INSERT INTO v1_model_spending_reservations VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,r.accountId,grant.id,id,r.model,feedId,.1,0,r.createdAt,JSON.stringify(r)).run()};
 await expect(raw('eval:1','one','background-feed')).rejects.toThrow();
 await reserve('eval:1','one');await expect(raw('eval:2','two')).rejects.toThrow();await expect(reserve('eval:2','two')).rejects.toThrow();
 await settleModelSpending(ctx.db,'eval:1','eval:1',{costUsd:.1,reported:true});
 await expect(reserve('eval:2','wrong')).rejects.toThrow();await expect(reserve('eval:2','two',{reservedCostUsd:.125})).rejects.toThrow();
 await reserve('eval:2','two');expect((await ctx.db.prepare("SELECT COUNT(*) AS n FROM v1_model_spending_reservations WHERE account_id='eval-account'").first<any>())!.n).toBe(2);
 }finally{await ctx.dispose()}
},30000);
it('retains legacy per-call caps and atomically bounds an explicitly scoped multi-stage workflow',async()=>{
 const ctx=await createIntakeDatabase();try{
  const apply=async(name:string)=>ctx.db.exec(readFileSync(new URL('../../migrations/'+name,import.meta.url),'utf8').replace(/^\s*--[^\n]*$/gm,'').replace(/\r?\n/g,' '));
  await apply('0065_model_evaluation_scope.sql');await apply('0066_model_evaluation_workflow.sql');
  const now=new Date().toISOString(),end=new Date(Date.now()+3600000).toISOString();
  const make=(id:string,workflow:any,cap?:number)=>({id,accountId:'workflow-account',modelIds:['m'],validFrom:now,validUntil:end,maxExposureUsd:73,maxConcurrentOperations:2,evaluationScope:{feedId:'workflow-feed',manifestHash:'same-run',operations:[{id,model:'m',requestHash:id}],maxNewSpendingUsd:.3,maxNewOperations:1,maxConcurrentOperations:1 as const,maxLifetimeExposureUsd:73,...(cap?{maxPerOperationUsd:cap}:{}),...(workflow?{workflow}:{})}});
  const a=make('step-a',{id:'same-run',maxNewOperations:2,maxNewSpendingUsd:.3},.25);
  expect(()=>validateEvaluationScope(a)).not.toThrow();expect(()=>validateEvaluationScope(make('bad',null,.25))).toThrow();
  await authorizeModelSpending(ctx.db,a);
  const reserve=(id:string,usd:number)=>reserveModelSpending(ctx.db,{id,accountId:'workflow-account',model:'m',feedId:'workflow-feed',token:id,reservedCostUsd:usd,leaseUntil:Date.now()+60000,createdAt:new Date().toISOString(),evaluation:{manifestHash:'same-run',requestHash:id}});
  await reserve('step-a',.2);await settleModelSpending(ctx.db,'step-a','step-a',{costUsd:.01,reported:true});
  const b=make('step-b',a.evaluationScope.workflow,.25);
  // Adversarial raw overlapping authority tests the SQL cumulative guard even
  // if a privileged writer bypasses the normal no-overlap authorizer.
  await ctx.db.prepare('INSERT INTO v1_model_spending_authorizations VALUES(?,?,?,?,?)').bind(b.id,b.accountId,now,end,JSON.stringify(b)).run();
  const raw=(g:any,usd:number)=>{const r={id:g.id,accountId:g.accountId,model:'m',feedId:g.evaluationScope.feedId,token:g.id,reservedCostUsd:usd,leaseUntil:0,createdAt:now,evaluation:{manifestHash:'same-run',requestHash:g.id}};return ctx.db.prepare('INSERT INTO v1_model_spending_reservations VALUES(?,?,?,?,?,?,?,?,?,?)').bind(r.id,r.accountId,g.id,r.token,r.model,r.feedId,usd,0,now,JSON.stringify(r)).run()};
  await expect(raw(b,.2)).rejects.toThrow();await raw(b,.09);
  const c=make('step-c',a.evaluationScope.workflow,.25);await ctx.db.prepare('INSERT INTO v1_model_spending_authorizations VALUES(?,?,?,?,?)').bind(c.id,c.accountId,now,end,JSON.stringify(c)).run();await expect(raw(c,.001)).rejects.toThrow();
  const legacy=make('legacy',null);legacy.accountId='legacy-workflow-account';legacy.evaluationScope.feedId='legacy-feed';await authorizeModelSpending(ctx.db,legacy);await expect(raw(legacy,.2)).rejects.toThrow();
 }finally{await ctx.dispose()}
},30000);
