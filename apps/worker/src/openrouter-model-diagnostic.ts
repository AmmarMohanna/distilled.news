import {
  DEFAULT_SLICE_BUDGET,
  DEFAULT_WEB_OPERATOR_STABLE_INSTRUCTIONS,
  OPENROUTER_DIAGNOSTIC_STAGES,
  OpenRouterGateway,
  createContextManifestHash,
  makeId,
  projectPageState,
  runOpenRouterDiagnostic,
  type ModelCapability,
  type ModelRequest,
  type ModelRoute,
  type OpenRouterDiagnosticStage
} from "@distilled/agent-runtime";
import type { Env,OpenRouterModelDiagnosticMessage } from "./types";

interface DiagnosticRequestRow {
  request_id:string;
  idempotency_key:string;
  state:string;
}

export async function dispatchPendingOpenRouterModelDiagnostics(
  env:Pick<Env,"DB"|"WEB_OPERATOR_QUEUE"|"DISTILLED_OPENROUTER_DIAGNOSTIC_ENABLED">,
  now=new Date()
):Promise<number> {
  if (env.DISTILLED_OPENROUTER_DIAGNOSTIC_ENABLED!=="true") return 0;
  const row=await env.DB.prepare(`SELECT request_id FROM openrouter_model_diagnostic_requests
    WHERE state='pending' ORDER BY created_at,request_id LIMIT 1`).first<{request_id:string}>();
  if (!row) return 0;
  await env.WEB_OPERATOR_QUEUE.send({type:"openrouter_model_diagnostic",requestId:row.request_id} satisfies OpenRouterModelDiagnosticMessage);
  const updated=await env.DB.prepare(`UPDATE openrouter_model_diagnostic_requests SET state='queued',queued_at=?
    WHERE request_id=? AND state='pending'`).bind(now.toISOString(),row.request_id).run();
  return Number(updated.meta.changes)===1?1:0;
}

export async function processOpenRouterModelDiagnostic(
  env:Pick<Env,"DB"|"OPENROUTER_API_KEY"|"DISTILLED_OPENROUTER_DIAGNOSTIC_ENABLED"|
    "DISTILLED_LIVE_OPENROUTER_MODEL"|"DISTILLED_LIVE_OPENROUTER_PROVIDER"|"DISTILLED_OPENROUTER_DIAGNOSTIC_TIMEOUT_MS"|
    "DISTILLED_OPENROUTER_DIAGNOSTIC_START_STAGE"|
    "DISTILLED_LIVE_PUBLIC_CANDIDATE_URL">,
  message:OpenRouterModelDiagnosticMessage,
  now=new Date(),
  gateway?:OpenRouterGateway
) {
  const claimed=await env.DB.prepare(`UPDATE openrouter_model_diagnostic_requests
    SET state='running',started_at=?,attempt_count=attempt_count+1 WHERE request_id=? AND state IN ('pending','queued')`)
    .bind(now.toISOString(),message.requestId).run();
  if (Number(claimed.meta.changes)!==1) return {status:"ignored"} as const;
  const row=await env.DB.prepare(`SELECT request_id,idempotency_key,state FROM openrouter_model_diagnostic_requests WHERE request_id=?`)
    .bind(message.requestId).first<DiagnosticRequestRow>();
  if (!row) return {status:"ignored"} as const;
  try {
    if (env.DISTILLED_OPENROUTER_DIAGNOSTIC_ENABLED!=="true") return fail(env,row,"diagnostic_disabled",now);
    const apiKey=required(env.OPENROUTER_API_KEY,"OPENROUTER_API_KEY");
    const model=required(env.DISTILLED_LIVE_OPENROUTER_MODEL,"DISTILLED_LIVE_OPENROUTER_MODEL");
    const provider=required(env.DISTILLED_LIVE_OPENROUTER_PROVIDER,"DISTILLED_LIVE_OPENROUTER_PROVIDER");
    const target=required(env.DISTILLED_LIVE_PUBLIC_CANDIDATE_URL,"DISTILLED_LIVE_PUBLIC_CANDIDATE_URL");
    const timeoutMs=diagnosticTimeout(env.DISTILLED_OPENROUTER_DIAGNOSTIC_TIMEOUT_MS);
    const startAt=diagnosticStartStage(env.DISTILLED_OPENROUTER_DIAGNOSTIC_START_STAGE);
    const request=await productionFirstTurnRequest(row.idempotency_key,target,model,provider,timeoutMs);
    const report=await runOpenRouterDiagnostic({gateway:gateway??new OpenRouterGateway({apiKey}),productionRequest:request,timeoutMs,startAt});
    const failed=report.stoppedAt!==undefined;
    const completedAt=new Date().toISOString();
    await env.DB.prepare(`UPDATE openrouter_model_diagnostic_requests SET state=?,requested_model=?,requested_provider=?,
      stopped_at_stage=?,result_json=?,failure_class=?,completed_at=? WHERE request_id=? AND state='running'`).bind(
      failed?"failed":"completed",model,provider,report.stoppedAt??null,JSON.stringify(report),
      failed?report.stages.at(-1)?.failureClass??"diagnostic_stage_failure":null,completedAt,row.request_id
    ).run();
    return {status:failed?"failed":"completed",report} as const;
  } catch {
    return fail(env,row,"internal_diagnostic_failure",now);
  }
}

async function productionFirstTurnRequest(
  idempotencyKey:string,target:string,model:string,provider:string,timeoutMs:number
):Promise<ModelRequest> {
  const candidateId=makeId("live_public_candidate",target);
  const capability:ModelCapability={
    modelRef:model,provider,toolCalling:true,vision:true,structuredOutput:true,reasoningClass:"fast",enabled:true,
    inputCostPerMillion:3,outputCostPerMillion:15,deployment:"api",externallyHosted:true,privacyEligibility:["public"],
    retentionClass:"zero_data_retention"
  };
  const route:ModelRoute={
    role:"NAVIGATION_FAST",routingReason:"routine navigation",requiredCapabilities:["toolCalling","structuredOutput"],
    configuredChain:[model],configuredTargets:[{deployment:"api",model}],deployment:"api",gateway:"openrouter",
    selectedModel:model,selectedProvider:provider,selectedCapability:capability,
    appliedPolicyConstraints:["live-public-read-policy","public_known_candidate"]
  };
  const pageState=projectPageState({
    url:"about:blank",title:"",pageRevision:"initial",challengeState:"NO_CHALLENGE",
    progress:{watermarkObserved:false,validatedListingBoundaryReached:false,articleExtracted:false,expectedCandidateId:candidateId},
    remainingBudget:DEFAULT_SLICE_BUDGET,
    policyVisibleCapabilities:["browser.navigate@1","browser.inspect_dom@1","browser.inspect_accessibility_tree@1",
      "browser.query_page_state@1","browser.follow_link@1","browser.extract@1","computer.screenshot@1","run.propose_completion@1"]
  });
  const dynamic={runId:makeId("diagnostic_run",idempotencyKey),objective:`Acquire the public article at ${target} and cite the accepted observation when complete.`,
    pageState,observationIds:[],completionDeficits:[]};
  const contextManifestHash=await createContextManifestHash({stable:DEFAULT_WEB_OPERATOR_STABLE_INSTRUCTIONS,dynamic,route});
  return {callId:makeId("diagnostic_call",idempotencyKey),role:"NAVIGATION_FAST",route,
    stable:DEFAULT_WEB_OPERATOR_STABLE_INSTRUCTIONS,dynamic,contextManifestHash,allowExactReuse:false,maxOutputTokens:500,timeoutMs};
}

async function fail(env:Pick<Env,"DB">,row:DiagnosticRequestRow,failureClass:string,now:Date) {
  await env.DB.prepare(`UPDATE openrouter_model_diagnostic_requests SET state='failed',failure_class=?,completed_at=?
    WHERE request_id=? AND state='running'`).bind(failureClass,new Date(Math.max(Date.now(),now.getTime())).toISOString(),row.request_id).run();
  return {status:"failed",failureClass} as const;
}

function required(value:string|undefined,name:string) {
  const normalized=value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function diagnosticTimeout(value:string|undefined) {
  const parsed=value===undefined?30_000:Number(value);
  if (!Number.isInteger(parsed)||parsed<1_000||parsed>75_000) {
    throw new Error("DISTILLED_OPENROUTER_DIAGNOSTIC_TIMEOUT_MS must be an integer from 1000 to 75000");
  }
  return parsed;
}

function diagnosticStartStage(value:string|undefined):OpenRouterDiagnosticStage {
  const stage=(value?.trim()||"A") as OpenRouterDiagnosticStage;
  if (!OPENROUTER_DIAGNOSTIC_STAGES.includes(stage)) {
    throw new Error("DISTILLED_OPENROUTER_DIAGNOSTIC_START_STAGE must be A, B, C, D, E, or F");
  }
  return stage;
}
