import type { Env, PublicAcquisitionRequestMessage } from "./types";

interface Row { request_id: string; request_json: string; state: string }

/** Queue consumer invokes the same protected acquisition route; no alternate acquisition path. */
export async function processPublicAcquisitionRequest(env: Pick<Env,"DB"|"WEB_OPERATOR_RUNTIME_TOKEN"|"DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE">, message: PublicAcquisitionRequestMessage, invoke: (request: Request) => Promise<Response>): Promise<void> {
  const claimed = await env.DB.prepare(`UPDATE public_acquisition_requests SET state='running',started_at=? WHERE request_id=? AND state IN ('pending','queued')`)
    .bind(new Date().toISOString(),message.requestId).run();
  if (Number(claimed.meta.changes) !== 1) return;
  const row = await env.DB.prepare("SELECT request_id,request_json,state FROM public_acquisition_requests WHERE request_id=?")
    .bind(message.requestId).first<Row>();
  if (!row) return;
  if (!env.WEB_OPERATOR_RUNTIME_TOKEN) {
    await finish(env.DB,row.request_id,"failed",null,"runtime_unconfigured"); return;
  }
  let leaseScope:string|undefined;
  try {
    const payload=JSON.parse(row.request_json);
    const evaluation=Boolean(payload.evaluationId || new URL(payload.sourceUrl).pathname.startsWith("/v1/live-smoke/"));
    if (evaluation && env.DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE !== "true") {
      await finish(env.DB,row.request_id,"failed",null,"smoke_disabled"); return;
    }
    leaseScope=`${payload.ownerAccountId}:${new URL(payload.sourceUrl).href}:${payload.evaluationId??""}`;
    const lease=await env.DB.prepare("INSERT INTO source_acquisition_leases(scope_key,request_id,expires_at) VALUES(?,?,?) ON CONFLICT(scope_key) DO UPDATE SET request_id=excluded.request_id,expires_at=excluded.expires_at WHERE source_acquisition_leases.expires_at<?")
      .bind(leaseScope,row.request_id,new Date(Date.now()+15*60000).toISOString(),new Date().toISOString()).run();
    if(Number(lease.meta.changes)!==1){await env.DB.prepare("UPDATE public_acquisition_requests SET state='pending',started_at=NULL WHERE request_id=? AND state='running'").bind(row.request_id).run();return}
    const executionStarted=Date.now();
    const response = await invoke(new Request(`https://worker.internal/v1/${evaluation?"live-smoke/public-acquisition":"sources/acquisition"}`,{
      method:"POST", headers:{authorization:`Bearer ${env.WEB_OPERATOR_RUNTIME_TOKEN}`,"content-type":"application/json"}, body:row.request_json
    }));
    if (!response.ok) { await finish(env.DB,row.request_id,"failed",null,`http_${response.status}`); return; }
    const result = await response.json<Record<string,unknown>>();
    // The route already returns a bounded read-only report. Store only typed counters,
    // IDs, temporal coverage, and item summaries; never model or browser transcripts.
    const bounded = {
      latencyMs: Date.now()-executionStarted,
      selectedStage: Array.isArray(result.stages)?safeString((result.stages as Record<string,unknown>[]).find(stage=>stage.status==="SUCCESS")?.stage,40):null,
      requestedWindow: result.requestedWindow ?? null,
      effectiveWindow: result.effectiveWindow ?? null,
      committedHighWater: result.committedHighWater ?? null,
      highWaterBefore:result.highWaterBefore??null,
      itemHandoff:result.itemHandoff??null,
      status: typeof result.status === "string" ? result.status.slice(0,40) : "UNKNOWN",
      stopReason: typeof result.stopReason === "string" ? result.stopReason.slice(0,40) : null,
      stages: Array.isArray(result.stages) ? result.stages.slice(0,5).map(stage=>{
        const value=stage as Record<string,unknown>;
        return {stage:safeString(value.stage,40),status:safeString(value.status,40),reason:safeString(value.reason,1500)};
      }) : [],
      upstreamResourceId: typeof result.upstreamResourceId === "string" ? result.upstreamResourceId.slice(0,100) : null,
      activeWorkflow: result.activeWorkflow ?? null,
      candidateWorkflow: result.candidateWorkflow ?? null,
      webOperatorRunId: safeString(result.webOperatorRunId,128),
      jevSuccessfulChoices: numberOrNull(result.jevSuccessfulChoices),
      jevExecutedActions: numberOrNull(result.jevExecutedActions),
      jevCostUsd: typeof result.jevCostUsd==="number"&&Number.isFinite(result.jevCostUsd)&&result.jevCostUsd>=0&&result.jevCostUsd<=5?result.jevCostUsd:null,
      webOperatorCalls: numberOrNull(result.webOperatorCalls),
      discoveryModelCalls: result.webOperatorCalls===0?0:numberOrNull(result.discoveryModelCalls),
      discoveryBrowserOperations: result.webOperatorCalls===0?0:numberOrNull(result.discoveryBrowserOperations),
      browserUseDiscoveryRuns: result.webOperatorCalls===0?0:numberOrNull(result.browserUseDiscoveryRuns),
      jevCalls: result.webOperatorCalls===0?0:numberOrNull(result.jevCalls),
      decisionFallbacks: result.webOperatorCalls===0?0:numberOrNull(result.decisionFallbacks),
      coverage: result.coverage ?? null,
      continuation: result.continuation ?? null,
      items: Array.isArray(result.items) ? result.items.slice(0,30).map((item) => {
        const value = item && typeof item === "object" ? item as Record<string,unknown> : {};
        return { canonicalItemUrl:safeString(value.canonicalItemUrl,2048),sourceItemId: safeString(value.sourceItemId,256), publishedAt:safeString(value.publishedAt,40), contentLength:numberOrNull(value.contentLength) };
      }) : []
    };
    await finish(env.DB,row.request_id,"completed",JSON.stringify(bounded),null,bounded.status);
  } catch {
    await finish(env.DB,row.request_id,"failed",null,"internal_execution_failure");
  } finally {if(leaseScope)await env.DB.prepare("DELETE FROM source_acquisition_leases WHERE scope_key=? AND request_id=?").bind(leaseScope,row.request_id).run();}
}

export async function dispatchPendingPublicAcquisitionRequests(env: Pick<Env,"DB"|"WEB_OPERATOR_QUEUE"|"DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE">): Promise<number> {
  await env.DB.prepare(`UPDATE public_acquisition_requests SET state='failed',failure_class='execution_deadline_exceeded',completed_at=?
    WHERE state='running' AND started_at<?`)
    .bind(new Date().toISOString(),new Date(Date.now()-15*60_000).toISOString()).run();
  // Queue termination can prevent finally from recording the discovery outcome.
  // Browser authority is already expired at this deadline; retain bounded failure.
  await env.DB.prepare("UPDATE browser_use_discovery_runs SET state='FAILED',outcome='STRUCTURAL_FAILURE',completed_at=? WHERE completed_at IS NULL AND started_at<?")
    .bind(new Date().toISOString(),new Date(Date.now()-15*60000).toISOString()).run();
  const rows = await env.DB.prepare("SELECT request_id FROM public_acquisition_requests WHERE state='pending' ORDER BY created_at LIMIT 5").all<{request_id:string}>();
  for (const row of rows.results) {
    await env.WEB_OPERATOR_QUEUE.send({type:"public_acquisition_request",requestId:row.request_id} satisfies PublicAcquisitionRequestMessage);
    await env.DB.prepare("UPDATE public_acquisition_requests SET state='queued' WHERE request_id=? AND state='pending'").bind(row.request_id).run();
  }
  return rows.results.length;
}

async function finish(db:Env["DB"],requestId:string,state:"completed"|"failed",resultJson:string|null,failureClass:string|null,outcome:string|null=null):Promise<void>{
  await db.prepare("UPDATE public_acquisition_requests SET state=?,result_json=?,failure_class=?,outcome=?,completed_at=? WHERE request_id=? AND state='running'")
    .bind(state,resultJson,failureClass,outcome,new Date().toISOString(),requestId).run();
}
function safeString(value:unknown,max:number):string|null{return typeof value==="string"?value.slice(0,max):null}
function numberOrNull(value:unknown):number|null{return typeof value==="number"&&Number.isInteger(value)&&value>=0&&value<=100000?value:null}
