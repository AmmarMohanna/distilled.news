import {afterAll,beforeAll,expect,it} from 'vitest';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {createApp} from '../app';
import {D1Repository} from '../repository';
import {createSession} from '../auth';
import type {Env} from '../types';
import {profileD1,planFindings,summarize,type ProfiledStatement} from './d1-profile';
import {seedQaShape,feedId,feedSlug,OWNER} from './qa-shape';

let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
const report:Record<string,unknown>={};
beforeAll(async()=>{ctx=await createIntakeDatabase({product:true});await seedQaShape(ctx.db);});
afterAll(async()=>{
 const out=process.env.PERF_REPORT;if(out){mkdirSync(new URL('.',`file://${out}`).pathname,{recursive:true});writeFileSync(out,JSON.stringify(report,null,1));}
 await ctx?.dispose();
});

const baseEnv=(db:D1Database)=>({DB:db,ADMIN_SESSION_SECRET:'perf-secret',PRODUCT_FEEDS_ENABLED:'true',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',BRIEFING_ENGINE:'v3',
 FEED_READ_CACHE_ENABLED:process.env.PERF_CACHE??'false'}) as unknown as Env;

type App=ReturnType<typeof createApp>;
/** Each scenario gets an app whose repository and env.DB both go through the profiler,
 * so statements issued by D1Repository are counted as well as direct env.DB reads. */
async function scenario(name:string,run:(app:App,env:Env)=>Response|Promise<Response>,repeat=1){
 const profiler=profileD1(ctx.db),env=baseEnv(profiler.db),app=createApp({repository:new D1Repository(profiler.db)});const runs:ReturnType<typeof summarize>[]=[];let first:ProfiledStatement[]=[];
 for(let i=0;i<repeat;i++){profiler.reset();const response=await run(app,env);expect(response.status,name).toBe(200);await response.arrayBuffer();runs.push(summarize(profiler.log));if(!i)first=[...profiler.log];}
 const findings=await planFindings(ctx.db,first);
 const heaviest=[...first].sort((a,b)=>b.rowsRead-a.rowsRead).slice(0,6).map(s=>({rowsRead:s.rowsRead,sql:s.sql.replace(/\s+/g,' ').slice(0,160)}));
 report[name]={cold:runs[0],warm:runs.at(-1),heaviest,planFindings:findings};
 console.log(JSON.stringify({scenario:name,cold:runs[0],warm:runs.at(-1)}));
 return runs;
}

it('profiles the public feed page for the heaviest and a typical feed',async()=>{
 await scenario('feed-page-heavy',(app,env)=>app.request(`/api/feed/${OWNER}/${feedSlug(0)}`,{},env),3);
 await scenario('feed-page-typical',(app,env)=>app.request(`/api/feed/${OWNER}/${feedSlug(5)}`,{},env),3);
 await scenario('edition-detail',(app,env)=>app.request(`/api/feed/${OWNER}/${feedSlug(0)}/editions/${feedId(0)}_ed_050`,{},env),2);
});

it('profiles the admin pipeline trace',async()=>{
 const repo=new D1Repository(ctx.db);
 const admin=await repo.createAccount({email:'perf-admin@example.invalid',username:'perf-admin',role:'admin',passwordHash:'unused',emailVerifiedAt:new Date().toISOString()});
 const cookie=`dn_session=${await createSession('perf-secret',admin)}`;
 await scenario('admin-trace-overview',(app,env)=>app.request(`/api/admin/briefings/${feedId(0)}/pipeline-trace`,{headers:{cookie}},env),2);
});
