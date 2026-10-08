import worker from './staging';
import {runScheduledMaintenance} from './index';
import type {Env} from './types';

/** QA-only manual trigger for diagnosing the same maintenance path as Cron. */
export default {
  ...worker,
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response> {
    const url=new URL(request.url);
    if(url.pathname!=='/_qa/run-maintenance')return worker.fetch(request,env,ctx);
    if(request.method!=='POST')return new Response('Not found',{status:404});
    const expected=env.SOURCE_QA_MAINTENANCE_TOKEN;
    const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'');
    if(!expected||!supplied||expected.length!==supplied.length)return new Response('Not found',{status:404});
    let mismatch=0;
    for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^supplied.charCodeAt(i);
    if(mismatch)return new Response('Not found',{status:404});
    await runScheduledMaintenance(env);
    return Response.json({ok:true});
  },
  scheduled:worker.scheduled,
  queue:worker.queue,
};
