import worker from './staging';
import {runScheduledMaintenance} from './index';
import {sha256,HandoffError} from '@distilled/contracts';
import {SourceProviderError,type SourceFetchRequest} from '@distilled/connectors';
import {synchronizeV1ProductSource} from './v1-intelligence/product';
import {recoverQaProviderBatch} from './qa-provider-recovery';
import {dispatchV1Acquisitions} from './v1-downstream-runtime';
import {dispatchV1Intelligence} from './v1-intelligence/runtime';
import {configureConnectorBudgets,createConnectorRuntime} from './connector-runtime';
import {productConnectorSource} from './connector-source';
import {productRuntimeEnv} from './product-feeds';
import {V1IntakeStore} from './v1-intake/store';
import type {Env} from './types';

const probeFailureCodes=new Set(['SOURCE_NOT_APPROVED','IDEMPOTENCY_CONFLICT','UNRESOLVED_SNAPSHOT_PREFIX','SNAPSHOT_MISSING','PAYLOAD_MISSING','PAYLOAD_INTEGRITY_FAILURE','INVALID_SNAPSHOT_OFFSET']);
function probeFailure(error:unknown):string {
  if(error instanceof HandoffError||error instanceof SourceProviderError)return error.code;
  return error instanceof Error&&probeFailureCodes.has(error.message)?error.message:'PROBE_FAILED';
}

/** QA-only manual trigger for diagnosing the same maintenance path as Cron. */
export default {
  ...worker,
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response> {
    const url=new URL(request.url);
    if(!['/_qa/run-maintenance','/_qa/collect-provider','/_qa/drain-feed'].includes(url.pathname))return worker.fetch(request,env,ctx);
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
    if(url.pathname==='/_qa/drain-feed'){
      const feedId=body?.feedId;
      if(typeof feedId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(feedId))return Response.json({error:'INVALID_PROBE'},{status:400});
      const current=await productRuntimeEnv(env),allowed=new Set((current.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(','));
      const sources=await env.DB.prepare(`SELECT s.id FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id
        WHERE s.briefing_id=? AND s.enabled=1 AND s.collection_owner='connector' AND b.paused=0 AND a.disabled_at IS NULL`).bind(feedId).all<{id:string}>();
      const ids=sources.results.map(s=>s.id).filter(id=>allowed.has(id));
      if(!ids.length)return Response.json({error:'SOURCE_NOT_APPROVED'},{status:404});
      const scoped={...current,V1_DOWNSTREAM_FEED_SOURCE_IDS:ids.join(',')};
      // Use the ordinary bounded queue relay without collecting another source
      // snapshot or creating another paid-provider operation.
      return Response.json({acquisitions:await dispatchV1Acquisitions(scoped),intelligence:await dispatchV1Intelligence(scoped)});
    }
    const sourceId=body?.sourceId,providerId=body?.providerId,probeId=body?.probeId;
    const recheckItemKeys=body?.recheckItemKeys,replayBatchKey=body?.replayBatchKey;
    const pageIndex=body?.pageIndex??0,snapshotOffset=body?.snapshotOffset??0,continuation=body?.continuation as {providerId?:unknown;token?:unknown}|undefined;
    if(typeof sourceId!=='string'||!/^[a-zA-Z0-9_:-]{1,100}$/.test(sourceId)||
      typeof probeId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(probeId)||
      !['website_http','website_playwright','website_zyte','telegram_telethon','telegram_public','google_rss','linkedin_apify','x_twitterapi_io','x_apify'].includes(String(providerId))||
      !Number.isSafeInteger(pageIndex)||Number(pageIndex)<0||Number(pageIndex)>10||
      !Number.isSafeInteger(snapshotOffset)||Number(snapshotOffset)<0||Number(snapshotOffset)>10000||
      (continuation&&(continuation.providerId!==providerId||typeof continuation.token!=='string'||!continuation.token||continuation.token.length>4096))||
      (replayBatchKey!==undefined&&(typeof replayBatchKey!=='string'||!/^[a-f0-9]{64}$/.test(replayBatchKey)||Number(pageIndex)>0||Number(snapshotOffset)>0||recheckItemKeys!==undefined))||
      (Number(pageIndex)>0&&!continuation))return Response.json({error:'INVALID_PROBE'}, {status:400});
    const runtimeEnv=await productRuntimeEnv(env);
    const row=await env.DB.prepare(`SELECT s.briefing_id,s.source_url,s.provider,s.kind,s.input,s.actor_id FROM sources s
      JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id
      WHERE s.id=? AND s.enabled=1 AND s.collection_owner='connector' AND b.paused=0 AND a.disabled_at IS NULL`)
      .bind(sourceId).first<{briefing_id:string;source_url:string;provider:string;kind:string;input:string|null;actor_id:string|null}>();
    const approved=row&&productConnectorSource(row);
    if(approved)await synchronizeV1ProductSource(env.DB,sourceId,new Date().toISOString());
    const scope=await new V1IntakeStore(env.DB).getScope(sourceId);
    const family=String(providerId).startsWith('website_')?'website':String(providerId).startsWith('telegram_')?'telegram':String(providerId).startsWith('x_')?'x':providerId==='google_rss'?'google_news':'linkedin';
    const matchesFamily=approved&&(family==='linkedin'?['linkedin_company','linkedin_profile'].includes(approved.source.family):family==='x'?['x_profile','x_search'].includes(approved.source.family):approved.source.family===family);
    if(!row||!approved||!scope?.enabled||scope.deletedAt||scope.feedId!==row.briefing_id||
      !matchesFamily)return Response.json({error:'SOURCE_NOT_APPROVED'}, {status:404});
    if(recheckItemKeys!==undefined&&(providerId!=='telegram_telethon'||!Array.isArray(recheckItemKeys)||
      !recheckItemKeys.length||recheckItemKeys.length>approved.limit||new Set(recheckItemKeys).size!==recheckItemKeys.length||
      recheckItemKeys.some(key=>typeof key!=='string'||!key.startsWith(`telegram:${approved.source.channelId}:`)||
        !/^telegram:-[1-9]\d*:[1-9]\d{0,14}$/.test(key))||Number(pageIndex)>0||Number(snapshotOffset)>0))
      return Response.json({error:'INVALID_PROBE'}, {status:400});
    if(Number(snapshotOffset)%approved.limit!==0)return Response.json({error:'INVALID_PROBE'}, {status:400});
    const backend=createConnectorRuntime(runtimeEnv);
    await configureConnectorBudgets(runtimeEnv,backend);
    const probe:SourceFetchRequest={scope:{feedId:scope.feedId,feedSourceId:sourceId,sourceId:scope.sourceId},
      configurationRevision:scope.feedRevision,runId:await sha256(JSON.stringify([sourceId,scope.feedRevision,providerId,probeId,pageIndex])),
      source:approved.source,requestedBounds:{},limit:approved.limit,
      ...(recheckItemKeys?{recheckItemKeys:recheckItemKeys as string[]}:{}),
      ...(continuation?{continuation:continuation as {providerId:string;token:string}}:{})};
    try{
      if(replayBatchKey){
        const response=await recoverQaProviderBatch(runtimeEnv,probe,String(providerId),String(replayBatchKey));
        return Response.json({state:'HANDED_OFF',providerId,receipts:response.receipts.length,decisions:response.receipts.map(r=>r.decision),recovered:true});
      }
      const result=await backend.collect(probe,[providerId as string],Number(snapshotOffset));
      return Response.json(result.state==='FETCH_FAILED'?{state:result.state,attempts:result.attempts.map(a=>({providerId:a.providerId,failure:a.failure}))}:
        {state:result.state,providerId:result.providerId,observations:result.request.observations.length,
          proposals:result.request.proposals.length,checkpoint:result.checkpoint,telemetry:result.telemetry,nextOffset:result.nextOffset,continuation:result.continuation});
    }catch(error){
      console.error(JSON.stringify({event:'QA_PROBE_FAILURE',code:probeFailure(error)}));
      return Response.json({error:probeFailure(error)}, {status:502});
    }
  },
  scheduled:worker.scheduled,
  queue:worker.queue,
};
