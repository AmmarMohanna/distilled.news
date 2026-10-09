import worker from './staging';
import {runScheduledMaintenance} from './index';
import {sha256} from '@distilled/contracts';
import type {SourceFetchRequest} from '@distilled/connectors';
import {configureConnectorBudgets,createConnectorRuntime} from './connector-runtime';
import {productConnectorSource} from './connector-source';
import {productRuntimeEnv} from './product-feeds';
import {V1IntakeStore} from './v1-intake/store';
import type {Env} from './types';

/** QA-only manual trigger for diagnosing the same maintenance path as Cron. */
export default {
  ...worker,
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response> {
    const url=new URL(request.url);
    if(!['/_qa/run-maintenance','/_qa/collect-provider'].includes(url.pathname))return worker.fetch(request,env,ctx);
    if(request.method!=='POST')return new Response('Not found',{status:404});
    const expected=env.SOURCE_QA_MAINTENANCE_TOKEN;
    const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'');
    if(!expected||!supplied||expected.length!==supplied.length)return new Response('Not found',{status:404});
    let mismatch=0;
    for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^supplied.charCodeAt(i);
    if(mismatch)return new Response('Not found',{status:404});
    if(url.pathname==='/_qa/run-maintenance'){
      await runScheduledMaintenance(env);
      return Response.json({ok:true});
    }
    const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
    const sourceId=body?.sourceId,providerId=body?.providerId,probeId=body?.probeId;
    if(typeof sourceId!=='string'||!/^[a-zA-Z0-9_:-]{1,100}$/.test(sourceId)||
      typeof probeId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(probeId)||
      !['website_http','website_zyte','telegram_telethon','telegram_public'].includes(String(providerId)))return Response.json({error:'INVALID_PROBE'}, {status:400});
    const runtimeEnv=await productRuntimeEnv(env);
    const row=await env.DB.prepare(`SELECT s.briefing_id,s.source_url,s.provider,s.kind,s.input,s.actor_id FROM sources s
      JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id
      WHERE s.id=? AND s.enabled=1 AND s.collection_owner='connector' AND b.paused=0 AND a.disabled_at IS NULL`)
      .bind(sourceId).first<{briefing_id:string;source_url:string;provider:string;kind:string;input:string|null;actor_id:string|null}>();
    const approved=row&&productConnectorSource(row),scope=await new V1IntakeStore(env.DB).getScope(sourceId);
    if(!row||!approved||!scope?.enabled||scope.deletedAt||scope.feedId!==row.briefing_id||
      (String(providerId).startsWith('website_')?approved.source.family!=='website':approved.source.family!=='telegram'))return Response.json({error:'SOURCE_NOT_APPROVED'}, {status:404});
    const backend=createConnectorRuntime(runtimeEnv);
    await configureConnectorBudgets(runtimeEnv,backend);
    const probe:SourceFetchRequest={scope:{feedId:scope.feedId,feedSourceId:sourceId,sourceId:scope.sourceId},
      configurationRevision:scope.feedRevision,runId:await sha256(JSON.stringify([sourceId,scope.feedRevision,providerId,probeId])),
      source:approved.source,requestedBounds:{},limit:approved.limit};
    try{
      const result=await backend.collect(probe,[providerId as string]);
      return Response.json(result.state==='FETCH_FAILED'?{state:result.state,attempts:result.attempts.map(a=>({providerId:a.providerId,failure:a.failure}))}:
        {state:result.state,providerId:result.providerId,observations:result.request.observations.length,
          proposals:result.request.proposals.length,checkpoint:result.checkpoint,telemetry:result.telemetry});
    }catch(error){return Response.json({error:error instanceof Error?error.name:'PROBE_FAILED'}, {status:502});}
  },
  scheduled:worker.scheduled,
  queue:worker.queue,
};
