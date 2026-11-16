import {expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {windowHasHoldingJobs} from './runtime';
import {windowIntakeCoverage} from './window-coverage';

it('keeps an old failed article recoverable without deferring every later empty window',async()=>{
 const ctx=await createIntakeDatabase();
 try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));
  for(const [id,observedAt,state] of [['old','2026-10-03T12:10:00Z','FAILED'],['current','2026-10-03T13:10:00Z','PENDING']] as const){
   await ctx.db.prepare('INSERT INTO v1_inputs(id,feed_source_id,json) VALUES(?,?,?)').bind(id,'feed-source-1',JSON.stringify({observation:{observedAt}})).run();
   await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind(id,'feed-source-1',JSON.stringify({kind:'ACQUIRE',state,observationId:id,failureCode:state==='FAILED'?'EXTRACTION_FAILED':undefined})).run();
  }
  const first={start:'2026-10-03T12:00:00Z'};
  const second={start:'2026-10-03T12:30:00Z'};
  expect(await windowIntakeCoverage(ctx.db,'feed-1','2026-10-03T12:30:00Z',first)).toMatchObject({state:'INCOMPLETE',failedJobs:1,pendingJobs:0});
  expect(await windowIntakeCoverage(ctx.db,'feed-1','2026-10-03T13:00:00Z',second)).toMatchObject({state:'COMPLETE',failedJobs:0,pendingJobs:0});
  expect(await windowHasHoldingJobs(ctx.db,'feed-1','2026-10-03T13:00:00Z',second)).toBe(false);
  expect(await windowIntakeCoverage(ctx.db,'feed-1','2026-10-03T13:30:00Z',{start:'2026-10-03T13:00:00Z'})).toMatchObject({state:'PENDING',failedJobs:0,pendingJobs:1});
  expect(await windowHasHoldingJobs(ctx.db,'feed-1','2026-10-03T13:30:00Z',{start:'2026-10-03T13:00:00Z'})).toBe(true);
  expect((await ctx.db.prepare("SELECT json_extract(json,'$.state') state FROM v1_jobs WHERE id='old'").first<{state:string}>())?.state).toBe('FAILED');
 }finally{await ctx.dispose();}
},30000);

it('keeps unresolved earlier acquisition visible in a later window',async()=>{
 const ctx=await createIntakeDatabase();
 try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));
  await ctx.db.prepare('INSERT INTO v1_inputs(id,feed_source_id,json) VALUES(?,?,?)').bind('earlier','feed-source-1',JSON.stringify({observation:{observedAt:'2026-10-03T12:10:00Z'}})).run();
  await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind('earlier','feed-source-1',JSON.stringify({kind:'ACQUIRE',state:'PENDING',observationId:'earlier',failureCode:'BUDGET_EXHAUSTED'})).run();
  const window={start:'2026-10-03T12:30:00Z'};
  expect(await windowIntakeCoverage(ctx.db,'feed-1','2026-10-03T13:00:00Z',window)).toMatchObject({state:'INCOMPLETE',failedJobs:1});
 }finally{await ctx.dispose();}
},30000);

it('classifies only confirmed pending acquisition-budget waits as unavailable coverage without changing recoverable jobs',async()=>{
 const ctx=await createIntakeDatabase();
 try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));
  await ctx.db.prepare('INSERT INTO v1_inputs(id,feed_source_id,json) VALUES(?,?,?)').bind('observation','feed-source-1',JSON.stringify({observation:{observedAt:'2026-10-03T12:20:00Z'}})).run();
  const cases=[
   {kind:'ACQUIRE',state:'PENDING',code:'BUDGET_EXHAUSTED',pending:0,failed:1},
   {kind:'ACQUIRE',state:'RUNNING',code:'BUDGET_EXHAUSTED',pending:1,failed:0},
   {kind:'REASSESS',state:'PENDING',code:'BUDGET_EXHAUSTED',pending:1,failed:0},
   {kind:'ACQUIRE',state:'PENDING',code:'BACKPRESSURE',pending:1,failed:0},
   {kind:'ACQUIRE',state:'PENDING',code:'RATE_LIMIT',pending:1,failed:0},
   {kind:'ACQUIRE',state:'PENDING',code:'UNCERTAIN_PAID_SUBMISSION',pending:1,failed:0},
   {kind:'ACQUIRE',state:'PENDING',code:undefined,pending:1,failed:0},
   {kind:'ACQUIRE',state:'FAILED',code:'BUDGET_EXHAUSTED',pending:0,failed:1},
   {kind:'ACQUIRE',state:'DONE',code:'BUDGET_EXHAUSTED',pending:0,failed:0}
  ];
  for(const c of cases){
   const job=JSON.stringify({id:'budget-job',feedId:'feed-1',feedSourceId:'feed-source-1',observationId:'observation',kind:c.kind,state:c.state,exhausted:c.state==='FAILED',failureCode:c.code,resourceWaits:288,nextAttemptAt:'2026-10-04T12:00:00Z'});
   await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').bind('budget-job','feed-source-1',job).run();
   expect(await windowHasHoldingJobs(ctx.db,'feed-1','2026-10-03T13:00:00Z'),JSON.stringify(c)).toBe(Boolean(c.pending));
   expect(await windowIntakeCoverage(ctx.db,'feed-1','2026-10-03T13:00:00Z'),JSON.stringify(c)).toMatchObject({state:c.pending?'PENDING':c.failed?'INCOMPLETE':'COMPLETE',pendingJobs:c.pending,failedJobs:c.failed,failures:c.failed?[{kind:c.kind,code:c.code,count:1}]:[]});
   expect((await ctx.db.prepare("SELECT json FROM v1_jobs WHERE id='budget-job'").first<{json:string}>())?.json).toBe(job);
   expect(await windowHasHoldingJobs(ctx.db,'feed-1','2026-10-03T12:00:00Z')).toBe(false);
   expect(await windowIntakeCoverage(ctx.db,'feed-1','2026-10-03T12:00:00Z')).toMatchObject({state:'COMPLETE',pendingJobs:0,failedJobs:0});
  }
 }finally{await ctx.dispose();}
},30000);

it('releases the two retained Bitcoin-shaped budget waits without releasing a separate backpressure job',async()=>{
 const ctx=await createIntakeDatabase();
 try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));
  for(const [id,observedAt,code,waits]of [['first','2026-10-28T11:15:59.974Z','BUDGET_EXHAUSTED',280],['second','2026-10-28T11:30:43.854Z','BUDGET_EXHAUSTED',288],['active','2026-10-29T15:00:00Z','BACKPRESSURE',1]] as const){
   await ctx.db.prepare('INSERT INTO v1_inputs(id,feed_source_id,json) VALUES(?,?,?)').bind(id,'feed-source-1',JSON.stringify({observation:{observedAt}})).run();
   await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind(id,'feed-source-1',JSON.stringify({id,observationId:id,kind:'ACQUIRE',state:'PENDING',exhausted:false,failureCode:code,resourceWaits:waits})).run();
  }
  expect(await windowHasHoldingJobs(ctx.db,'feed-1','2026-10-28T12:00:00Z')).toBe(false);
  expect(await windowIntakeCoverage(ctx.db,'feed-1','2026-10-28T12:00:00Z')).toMatchObject({state:'INCOMPLETE',pendingJobs:0,failedJobs:2,failures:[{kind:'ACQUIRE',code:'BUDGET_EXHAUSTED',count:2}]});
  expect(await windowHasHoldingJobs(ctx.db,'feed-1','2026-10-29T16:00:00Z')).toBe(true);
  expect(await windowIntakeCoverage(ctx.db,'feed-1','2026-10-29T16:00:00Z')).toMatchObject({state:'PENDING',pendingJobs:1,failedJobs:2});
 }finally{await ctx.dispose();}
},30000);
