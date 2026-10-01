import {
  DeterministicAuthenticatedSourceWorkflowExecutor,makeId,validateAuthenticatedSourceWorkflowPlan,
  AuthenticatedBootstrapError,AuthenticatedBrowserBridgeError,AuthenticatedProfileError,BrowserAllocationError,BrowserPreDispatchError,
  type AcquisitionStageOutcome,type AuthenticatedSourceTimelineObservation,type AuthenticatedSourceWorkflowPlan,
  type BrowserUseDiscoveryProposal,type SourceAcquisitionRequest,type WebOperatorDiscovery,
  type WorkflowCandidate,type WorkflowCaptureBundle,type ProductionSourceAcquisitionDependencies
} from "@distilled/agent-runtime";
import { ContainerXTimelinePort } from "./container-x-timeline-port";
import { D1BrowserUseRunTelemetry } from "./browser-use-run-telemetry";
import { D1WorkflowRepository } from "./web-operator-workflow-store";
import { createWorkerProductionSourceAcquisitionService } from "./web-operator-runtime";
import type { Env } from "./types";

type Context={tenantId:string;ownerId:string;profileId:string;resourceId:string;runId:string;idempotencyKey:string};
type XPort=Pick<ContainerXTimelinePort,"open"|"observe"|"scrollAndObserve"|"close"|"discoverWithBrowserUse">;
type Ports={agent?:XPort;verifier?:XPort;replay?:XPort;persistItems?:ProductionSourceAcquisitionDependencies["persistItems"]};

export function createWorkerXAcquisitionService(env:Env,context:Context,ports:Ports={}){
  return createWorkerProductionSourceAcquisitionService(env,{
    tenantId:context.tenantId,ownerId:context.ownerId,
    persistItems:ports.persistItems,
    structured:async()=>({stage:"STRUCTURED",status:"UNSUPPORTED",reason:"authenticated X requires browser session"}),
    http:async()=>({stage:"HTTP",status:"UNSUPPORTED",reason:"authenticated X requires browser session"}),
    executeActiveWorkflow:async({request,workflow})=>executeXWorkflow(env,context,request,workflow,ports.replay),
    webOperator:async(request)=>discoverXWorkflow(env,context,request,ports)
  });
}

export async function executeXWorkflow(env:Env,context:Context,request:SourceAcquisitionRequest,workflow:WorkflowCandidate,port?:XPort,createPort:(attempt:number,provider?:"self_hosted"|"cloudflare")=>XPort=(attempt,provider)=>new ContainerXTimelinePort(env,{...context,runId:makeId("x_replay",context.runId,workflow.id,attempt)},provider)):Promise<AcquisitionStageOutcome>{
  if(!workflow.authenticatedSourceAcquisition)return{stage:"BROWSER_WORKFLOW",status:"STRUCTURAL_FAILURE",reason:"authenticated workflow plan missing"};
  const deadline=Date.now()+request.limits.maxExecutionMs;
  const primary=(env.DISTILLED_BROWSER_PROVIDER??env.DISTILLED_BROWSER_BACKEND??"").trim().toLowerCase();
  const alternateProvider=eligibleXAlternateProvider(env,primary);
  const canFailover=!port&&Boolean(alternateProvider);
  const maxAttempts=Math.max(1,Math.min(request.limits.maxPhysicalAttempts,canFailover?3:2));
  let last:AcquisitionStageOutcome={stage:"BROWSER_WORKFLOW",status:"TRANSIENT_FAILURE",reason:"authenticated replay unavailable"};
  let challenged=false;
  for(let attempt=0;attempt<maxAttempts&&Date.now()<deadline;attempt++){
    const failover=canFailover&&attempt===maxAttempts-1&&attempt>0;
    if(attempt>0){
      if(challenged)await recordXRecovery(env,context,"CHALLENGE_HANDLING",attempt);
      if(failover)await recordXRecovery(env,context,"EXECUTOR_FAILOVER",attempt);
      await recordXRecovery(env,context,"SESSION_RESTORE",attempt);
      await new Promise(resolve=>setTimeout(resolve,Math.min(750,Math.max(0,deadline-Date.now()))));
    }
    const browser=port??createPort(attempt,failover?alternateProvider:undefined);
    try{
      const result=await new DeterministicAuthenticatedSourceWorkflowExecutor(browser).execute(request,workflow.authenticatedSourceAcquisition);
      const reason=result.coverage.stopReason;
      if(reason!=="AUTH_REQUIRED"&&reason!=="CHALLENGE_REQUIRED"){
        if(challenged)await recordXRecovery(env,context,"CHALLENGE_CLEARED",attempt);
        if(attempt>0)await recordXRecovery(env,context,"ACQUISITION_RESUMED",attempt);
        return{stage:"BROWSER_WORKFLOW",status:"SUCCESS",result:{...result,provenance:{...result.provenance,workflowId:workflow.id,workflowVersion:workflow.version}}};
      }
      last={stage:"BROWSER_WORKFLOW",status:reason,reason:"authenticated challenge persisted after trusted observation"};
      if(!challenged){challenged=true;await recordXRecovery(env,context,"CHALLENGE_DETECTED",attempt)}
    }catch(error){
      if(error instanceof BrowserPreDispatchError||error instanceof AuthenticatedProfileError)return{stage:"BROWSER_WORKFLOW",status:"POLICY_DENIED",reason:safeXFailure(error)};
      last={stage:"BROWSER_WORKFLOW",status:"TRANSIENT_FAILURE",reason:safeXFailure(error)};
    }
    if(port)break;
  }
  if(challenged&&(last.status==="CHALLENGE_REQUIRED"||last.status==="AUTH_REQUIRED"))await recordXRecovery(env,context,"AUTOMATED_ROUTES_EXHAUSTED",maxAttempts);
  return last;
}

type XRecoveryState="CHALLENGE_DETECTED"|"CHALLENGE_HANDLING"|"EXECUTOR_FAILOVER"|"SESSION_RESTORE"|"CHALLENGE_CLEARED"|"ACQUISITION_RESUMED"|"AUTOMATED_ROUTES_EXHAUSTED"|"HUMAN_ASSISTANCE_REQUIRED";
async function recordXRecovery(env:Env,context:Context,state:XRecoveryState,attempt:number){
  const now=new Date().toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO authenticated_profile_audit(id,profile_id,tenant_id,run_id,event_type,safe_metadata_json,created_at) VALUES(?,?,?,?,'BOOTSTRAP_PROGRESS',?,?)")
    .bind(makeId("x_recovery",context.runId,state,attempt),context.profileId,context.tenantId,context.runId,JSON.stringify({recoveryState:state,attempt}),now).run();
}

async function openXWithRecovery(env:Env,context:Context,request:SourceAcquisitionRequest,sourceUrl:string,phase:"agent"|"verify",injected?:XPort):Promise<{port:XPort;observation:AuthenticatedSourceTimelineObservation}|AcquisitionStageOutcome>{
  const primary=(env.DISTILLED_BROWSER_PROVIDER??env.DISTILLED_BROWSER_BACKEND??"").trim().toLowerCase();
  const alternateProvider=eligibleXAlternateProvider(env,primary);
  const canFailover=!injected&&Boolean(alternateProvider);
  const maxAttempts=injected?1:Math.max(1,Math.min(request.limits.maxPhysicalAttempts,canFailover?3:2));
  const deadline=Date.now()+request.limits.maxExecutionMs;
  let last:AcquisitionStageOutcome={stage:"WEB_OPERATOR",status:"TRANSIENT_FAILURE",reason:"authenticated observation unavailable"};
  let challenged=false;
  for(let attempt=0;attempt<maxAttempts&&Date.now()<deadline;attempt++){
    const failover=canFailover&&attempt===maxAttempts-1&&attempt>0;
    if(attempt>0){if(challenged)await recordXRecovery(env,context,"CHALLENGE_HANDLING",attempt);if(failover)await recordXRecovery(env,context,"EXECUTOR_FAILOVER",attempt);await recordXRecovery(env,context,"SESSION_RESTORE",attempt);await new Promise(resolve=>setTimeout(resolve,Math.min(750,Math.max(0,deadline-Date.now()))));}
    const port=injected??new ContainerXTimelinePort(env,{...context,runId:makeId("x_discovery",context.runId,phase,attempt)},failover?alternateProvider:undefined);
    try{
      await port.open({sourceUrl,allowedOrigins:["https://x.com"],request});
      const observation=await port.observe();
      if(!observation.challengeState||observation.challengeState==="NO_CHALLENGE"){
        if(challenged)await recordXRecovery(env,context,"CHALLENGE_CLEARED",attempt);
        if(attempt>0)await recordXRecovery(env,context,"ACQUISITION_RESUMED",attempt);
        return{port,observation};
      }
      last={stage:"WEB_OPERATOR",status:observation.challengeState==="LOGIN_REQUIRED"?"AUTH_REQUIRED":"CHALLENGE_REQUIRED",reason:"authenticated observation challenge persists"};
      if(!challenged){challenged=true;await recordXRecovery(env,context,"CHALLENGE_DETECTED",attempt)}
    }catch(error){
      if(error instanceof BrowserPreDispatchError||error instanceof AuthenticatedProfileError){await port.close().catch(()=>undefined);return{stage:"WEB_OPERATOR",status:"POLICY_DENIED",reason:safeXFailure(error)}}
      last={stage:"WEB_OPERATOR",status:"TRANSIENT_FAILURE",reason:safeXFailure(error)};
    }
    await port.close().catch(()=>undefined);
  }
  if(last.status==="AUTH_REQUIRED"||last.status==="CHALLENGE_REQUIRED")await recordXRecovery(env,context,"AUTOMATED_ROUTES_EXHAUSTED",maxAttempts);
  return last;
}

function eligibleXAlternateProvider(env:Env,primary:string):"self_hosted"|"cloudflare"|undefined{
  if(primary!=="self_hosted"&&env.SELF_HOSTED_BROWSER_BRIDGE_URL?.trim()&&env.SELF_HOSTED_BROWSER_BRIDGE_AUTH?.trim())return"self_hosted";
  if(primary!=="cloudflare"&&env.BROWSER)return"cloudflare";
  return undefined;
}

async function discoverXWorkflow(env:Env,context:Context,request:SourceAcquisitionRequest,ports:Ports):Promise<WebOperatorDiscovery|AcquisitionStageOutcome>{
  const sourceUrl=request.source.canonicalSourceUrl??request.source.resourceLocator;
  const model=env.DISTILLED_LIVE_OPENROUTER_MODEL?.trim();
  if(!sourceUrl||!model||!env.OPENROUTER_API_KEY)return{stage:"WEB_OPERATOR",status:"TRANSIENT_FAILURE",reason:"authenticated discovery model unavailable"};
  const agentRunId=`${context.runId}_browser_use`;
  const telemetry=new D1BrowserUseRunTelemetry(env.DB);
  let started=Date.now();
  let agent:XPort|undefined;
  let proposal:BrowserUseDiscoveryProposal;
  let phase="SESSION_ATTACH";
  try{
    const ready=await openXWithRecovery(env,context,request,sourceUrl,"agent",ports.agent);
    if("status" in ready)return ready;
    agent=ready.port;
    phase="TIMELINE_OBSERVE";
    const initial=ready.observation;
    started=Date.now();
    await telemetry.begin({runId:agentRunId,acquisitionRunId:context.runId,tenantId:context.tenantId,resourceId:context.resourceId,startedAt:new Date(started).toISOString()});
    phase="BROWSER_USE_DISCOVERY";
    proposal=await agent.discoverWithBrowserUse(model,6);
    await telemetry.stage(agentRunId,"PROPOSAL_ACCEPTED",{modelCalls:proposal.modelCalls,browserOperations:proposal.browserActions,agentBrowserActions:proposal.agentBrowserActions,agentDurationMs:Date.now()-started});
  }catch(error){await telemetry.stage(agentRunId,"FAILED");return{stage:"WEB_OPERATOR",status:"STRUCTURAL_FAILURE",reason:`${phase}:${safeXFailure(error)}`}}
  finally{await agent?.close().catch(()=>undefined)}
  if(proposal.runId!==agentRunId||proposal.articleUrls.length||!proposal.visitedUrls.includes(sourceUrl)||proposal.modelCalls===undefined||proposal.modelCalls<1||proposal.continuation!=="scroll")return{stage:"WEB_OPERATOR",status:"STRUCTURAL_FAILURE",reason:"X discovery proposal insufficient"};
  let verifier:XPort|undefined;
  let listing:AuthenticatedSourceTimelineObservation,continued:AuthenticatedSourceTimelineObservation;
  const verifyStarted=Date.now();
  try{
    const ready=await openXWithRecovery(env,context,request,sourceUrl,"verify",ports.verifier);
    if("status" in ready)return ready;
    verifier=ready.port;
    listing=ready.observation;
    continued=await verifier.scrollAndObserve(1200);
    if(continued.challengeState&&continued.challengeState!=="NO_CHALLENGE")return{stage:"WEB_OPERATOR",status:continued.challengeState==="LOGIN_REQUIRED"?"AUTH_REQUIRED":"CHALLENGE_REQUIRED",reason:"trusted X continuation requires runtime challenge resolution"};
  }catch{await telemetry.stage(agentRunId,"FAILED");return{stage:"WEB_OPERATOR",status:"STRUCTURAL_FAILURE",reason:"trusted X timeline verification failed"}}
  finally{await verifier?.close().catch(()=>undefined)}
  const initialIds=new Set(listing.items.map(item=>item.sourceItemId));
  const independent=[...listing.items,...continued.items].filter((item,index,array)=>item.sourceItemId&&array.findIndex(candidate=>candidate.sourceItemId===item.sourceItemId)===index);
  if(independent.length<2||!continued.items.some(item=>!initialIds.has(item.sourceItemId))||independent.some(item=>!item.publishedAt||!Number.isFinite(Date.parse(item.publishedAt)))){
    await telemetry.stage(agentRunId,"FAILED",{verificationDurationMs:Date.now()-verifyStarted});
    return{stage:"WEB_OPERATOR",status:"STRUCTURAL_FAILURE",reason:"trusted X timeline lacked two dated posts and continuation"};
  }
  await telemetry.stage(agentRunId,"VERIFIED",{verificationDurationMs:Date.now()-verifyStarted});
  const plan:AuthenticatedSourceWorkflowPlan={version:1,entryUrl:sourceUrl,allowedOrigins:["https://x.com"],continuation:{kind:"SCROLL",deltaY:1200,terminalEvidence:"UNPROVEN"},readOnly:true};
  validateAuthenticatedSourceWorkflowPlan(plan,request);
  const repository=new D1WorkflowRepository(env.DB);
  const now=new Date().toISOString();
  const identity={candidateId:makeId("x_candidate",sourceUrl),canonicalUrl:sourceUrl,publisherId:"x.com",acquisitionAttempt:context.idempotencyKey};
  const listingObservationId=makeId("trusted_x_observation",agentRunId,sourceUrl,listing.pageRevision);
  const continuedObservationId=makeId("trusted_x_observation",agentRunId,sourceUrl,continued.pageRevision);
  const evidenceObservationId=(itemId:string|undefined)=>listing.items.some(item=>item.sourceItemId===itemId)?listingObservationId:continuedObservationId;
  await env.DB.prepare(`INSERT OR IGNORE INTO agent_runs
    (run_id,tenant_id,resource_id,idempotency_key,candidate_id,candidate_url,publisher_id,acquisition_attempt,objective,mode,state,generation,policy_snapshot_id,completion_contract_version,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(agentRunId,context.tenantId,context.resourceId,`${context.idempotencyKey}:x_browser_use`,identity.candidateId,sourceUrl,"x.com",context.idempotencyKey,"Bounded read-only X timeline discovery","discovery","completed",1,makeId("x_policy",context.resourceId),"browser-use-x-timeline-v1",now,now).run();
  const capture:WorkflowCaptureBundle={
    id:makeId("workflow_capture",agentRunId,listingObservationId,continuedObservationId),runId:agentRunId,tenantId:context.tenantId,resourceId:context.resourceId,candidate:identity,
    actions:[],observationIds:[listingObservationId,continuedObservationId],successfulAlternatives:[],failedAlternatives:[],
    discoveryEvidence:{canonicalResourceIdentity:{resourceId:context.resourceId,candidateCanonicalUrl:sourceUrl,publisherId:"x.com"},listingUrlCandidates:[sourceUrl],paginationBehavior:{watermarkObserved:false,exhausted:false,evidenceObservationIds:[continuedObservationId]},articleUrlPatterns:[`${sourceUrl}/status/{id}`],publicationTimeEvidence:independent.map(item=>({observationId:evidenceObservationId(item.sourceItemId),publisherTimestamp:item.publishedAt!})),pageTypeObservations:[{observationId:listingObservationId,url:listing.url,pageType:"listing" as const,title:"X timeline"},{observationId:continuedObservationId,url:continued.url,pageType:"listing" as const,title:"X timeline"}],locatorEvidence:independent.map(item=>({observationId:evidenceObservationId(item.sourceItemId),kind:"link",destinationUrl:item.canonicalItemUrl,safeAction:"follow"})),requiredReadCapabilities:[],stoppingWatermarkEvidence:[]},
    extractionEvidence:await Promise.all(independent.map(async item=>({observationId:evidenceObservationId(item.sourceItemId),canonicalUrl:item.canonicalItemUrl!,contentHash:await hash(item.text??"")}))),
    completionEvidence:{citedObservationIds:[listingObservationId,continuedObservationId],watermarkObserved:false},runtime:{softwareVersion:"distilled-worker@0.1.0",toolSchemaVersion:"browser-use-x-timeline-v1",workflowSchemaVersion:"workflow-capture-v1"},createdAt:now
  };
  await repository.saveCaptureBundle(capture);
  const versions=await repository.listWorkflowCandidates(context.resourceId);
  const candidate:WorkflowCandidate={id:makeId("source_workflow",context.resourceId,agentRunId,JSON.stringify(plan)),tenantId:context.tenantId,resourceId:context.resourceId,sourceCaptureId:capture.id,candidate:identity,state:"CANDIDATE",version:Math.max(0,...versions.map(value=>value.version))+1,operations:[
    {id:makeId("x_op",context.resourceId,"entry"),kind:"navigate",locatorAlternatives:[{kind:"url_pattern",value:sourceUrl,confidence:1}]},
    {id:makeId("x_op",context.resourceId,"listing"),kind:"extract_listing",locatorAlternatives:[{kind:"page_type",value:"listing",confidence:1}]},
    {id:makeId("x_op",context.resourceId,"continuation"),kind:"paginate",locatorAlternatives:[{kind:"page_type",value:"listing",confidence:1}]}
  ],authenticatedSourceAcquisition:plan,unsupportedGaps:[],createdAt:now};
  await repository.saveWorkflowCandidate(candidate);await telemetry.stage(agentRunId,"CANDIDATE");
  const execute=(workflow:WorkflowCandidate,requested:SourceAcquisitionRequest)=>executeXWorkflow(env,context,requested,workflow,ports.replay);
  return{
    candidate:{id:candidate.id,version:candidate.version,state:"CANDIDATE",execute:requested=>execute(candidate,requested)},
    validate:async()=>{const criteria={sourceIdentity:listing.url===sourceUrl,twoDatedPosts:independent.length>=2,groundedAgentProposal:proposal.modelCalls!>0&&proposal.visitedUrls.includes(sourceUrl),deterministicContinuation:continued.items.some(item=>!initialIds.has(item.sourceItemId)),readOnlyOrigins:plan.allowedOrigins.length===1&&plan.allowedOrigins[0]==="https://x.com"};const passed=Object.values(criteria).every(Boolean);await repository.saveValidationResult({workflowId:candidate.id,passed,criteria,failureClass:passed?undefined:"structural_site_change",validatedAt:now});if(!passed)throw new Error("X workflow validation failed");await telemetry.stage(agentRunId,"VALIDATED");return{id:candidate.id,version:candidate.version,state:"VALIDATED" as const,execute:(requested:SourceAcquisitionRequest)=>execute({...candidate,state:"VALIDATED"},requested)}},
    activate:async()=>{const active=await repository.promoteWorkflow(candidate.id,"source-workflow-validator",now);await telemetry.stage(agentRunId,"ACTIVE");return{id:active.id,version:active.version,execute:(requested:SourceAcquisitionRequest)=>execute(active,requested)}},
    runId:agentRunId,modelCalls:proposal.modelCalls,browserOperations:proposal.browserActions
  };
}
async function hash(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("")}
function safeXFailure(error:unknown):string{
  if(error instanceof AuthenticatedBootstrapError)return error.code;
  if(error instanceof AuthenticatedBrowserBridgeError)return error.code;
  if(error instanceof AuthenticatedProfileError)return error.code;
  if(error instanceof BrowserAllocationError)return error.code;
  if(error instanceof BrowserPreDispatchError)return"NETWORK_POLICY_DENIED";
  if(error instanceof Error&&error.cause)return safeXFailure(error.cause);
  return"UNCLASSIFIED_RUNTIME_FAILURE";
}
