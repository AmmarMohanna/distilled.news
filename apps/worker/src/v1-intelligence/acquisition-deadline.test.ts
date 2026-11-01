import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {windowIntakeCoverage} from './window-coverage';
import {jobsHoldingWindow} from './runtime';
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
 expect(coverage.pendingJobs).toBe(c.expected);expect(await jobsHoldingWindow(ctx.db,'feed-1',end,options)).toBe(c.expected);
 if(!c.expected)expect(coverage).toMatchObject({state:'INCOMPLETE',failedJobs:1,failures:[{kind:'ACQUIRE',code:'ACQUISITION_BACKPRESSURE_AT_DEADLINE',count:1}]});
 expect((await ctx.db.prepare('SELECT json FROM v1_jobs WHERE id=?').bind('waiting').first())!.json).toBe(job);
});
