import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {windowIntakeCoverage} from './window-coverage';
import {windowHasHoldingJobs} from './runtime';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
const end='2026-10-03T13:00:00Z',deadline='2026-10-03T13:05:00Z';
beforeEach(async()=>{ctx=await createIntakeDatabase({product:true});await seedIntakeScope(new V1IntakeStore(ctx.db));});
afterEach(async()=>ctx.dispose());
it.each([
 {name:'confirmed helper refusal at equality',now:deadline,v3:true,detail:'HELPER_LOCAL_CAPACITY_BUSY',expected:0},
 {name:'global helper capacity',now:deadline,v3:true,detail:'HELPER_GLOBAL_CAPACITY_BUSY',expected:0},
 {name:'before deadline',now:'2026-10-03T13:04:59.999Z',v3:true,expected:1},
 {name:'retained V2',now:deadline,v3:false,expected:1},
 {name:'live lease',now:deadline,v3:true,leaseUntil:'2026-10-03T13:06:00Z',expected:1},
 {name:'running acquisition',now:deadline,v3:true,state:'RUNNING',expected:1},
 {name:'unknown observation time',now:deadline,v3:true,observedAt:null,expected:1},
 {name:'unknown lease time',now:deadline,v3:true,leaseUntil:'invalid',expected:1},
 {name:'provider request in flight',now:deadline,v3:true,detail:'ARTICLE_PROVIDER_IN_FLIGHT',expected:1},
 {name:'unclassified capacity',now:deadline,v3:true,detail:'HELPER_CAPACITY_WAIT',expected:1},
 {name:'pending reassessment',now:deadline,v3:true,kind:'REASSESS',expected:1},
] as const)('deadline coverage and dispatch agree: $name',async test=>{
 const c=test as {now:string;v3:boolean;detail?:string;leaseUntil?:string;state?:string;observedAt?:string|null;kind?:string;expected:number};
 const observedAt=c.observedAt===null?undefined:'2026-10-03T12:30:00Z';
 await ctx.db.prepare('INSERT INTO v1_inputs(id,feed_source_id,json) VALUES(?,?,?)').bind('observation','feed-source-1',JSON.stringify({observation:{observedAt}})).run();
 const job=JSON.stringify({id:'waiting',feedSourceId:'feed-source-1',observationId:'observation',kind:c.kind??'ACQUIRE',state:c.state??'PENDING',exhausted:false,attempts:0,resourceWaits:288,failureCode:'BACKPRESSURE',failureDetail:c.detail??'HELPER_LOCAL_CAPACITY_BUSY',leaseUntil:c.leaseUntil});
 await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind('waiting','feed-source-1',job).run();
 const options={v3:c.v3,now:c.now},coverage=await windowIntakeCoverage(ctx.db,'feed-1',end,options);
 expect(coverage.pendingJobs).toBe(c.expected);expect(await windowHasHoldingJobs(ctx.db,'feed-1',end,options)).toBe(Boolean(c.expected));
 if(!c.expected)expect(coverage).toMatchObject({state:'INCOMPLETE',failedJobs:1,failures:[{kind:'ACQUIRE',code:'ACQUISITION_BACKPRESSURE_AT_DEADLINE',count:1}]});
 expect((await ctx.db.prepare('SELECT json FROM v1_jobs WHERE id=?').bind('waiting').first())!.json).toBe(job);
});

it('keeps terminal history in publication coverage without scanning it for scheduling',async()=>{
 const {db}=ctx;
 await db.prepare(`WITH RECURSIVE history(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM history WHERE n<2000)
  INSERT INTO v1_jobs(id,feed_source_id,json)
  SELECT 'failed-'||n,'feed-source-1',json_object('kind','ACQUIRE','state','FAILED',
    'exhausted',1,'failureCode','NETWORK')
  FROM history`).run();
 await db.prepare(`INSERT INTO v1_jobs(id,feed_source_id,json)
  VALUES ('current','feed-source-1',json_object('kind','ACQUIRE','state','RUNNING'))`).run();

 const reads:number[]=[];
 const measuredDb={
  prepare:(sql:string)=>({
   bind:(...args:unknown[])=>({
    all:async()=>{
     const result=await db.prepare(sql).bind(...args).all();
     reads.push(result.meta.rows_read);
     return result;
    },
    first:async()=>{
     const result=await db.prepare(sql).bind(...args).all();
     reads.push(result.meta.rows_read);
     return result.results[0]??null;
    },
   }),
  }),
 } as unknown as D1Database;
 const settings={v3:true,now:deadline};
 const coverage=await windowIntakeCoverage(measuredDb,'feed-1',end,settings);
 expect(coverage).toMatchObject({state:'PENDING',pendingJobs:1,failedJobs:2000,
  failures:[{kind:'ACQUIRE',code:'NETWORK',count:2000}]});
 expect(await windowHasHoldingJobs(measuredDb,'feed-1',end,settings)).toBe(Boolean(coverage.pendingJobs));
 const [coverageRows,schedulingRows]=reads;
 expect(coverageRows).toBeGreaterThanOrEqual(2000);
 expect(schedulingRows).toBeLessThan(50);
 console.info(JSON.stringify({coverageRows,schedulingRows}));
});

it.each([false,true])('stops the readiness check at the first qualifying job in a busy window (V3=%s)',async v3=>{
 const {db}=ctx;
 await db.prepare(`WITH RECURSIVE jobs(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM jobs WHERE n<2000)
  INSERT INTO v1_jobs(id,feed_source_id,json)
  SELECT 'pending-'||n,'feed-source-1',json_object('kind','ACQUIRE','state','PENDING') FROM jobs`).run();
 let reads=0,sql='';
 const measuredDb={prepare:(query:string)=>({
  bind:(...args:unknown[])=>({
   first:async()=>{
    sql=query;
    const result=await db.prepare(query).bind(...args).all();
    reads=result.meta.rows_read;
    return result.results[0]??null;
   },
  }),
 })} as unknown as D1Database;
 expect(await windowHasHoldingJobs(measuredDb,'feed-1',end,{v3,now:end})).toBe(true);
 const count=await db.prepare(sql.replace('SELECT 1','SELECT COUNT(*) AS n').replace('LIMIT 1',''))
  .bind('feed-1',end).all<{n:number}>();
 expect(count.results).toEqual([{n:2000}]);
 expect(reads).toBeLessThan(count.meta.rows_read/100);
 console.info(JSON.stringify({v3,countRows:count.meta.rows_read,readinessRows:reads}));
});
