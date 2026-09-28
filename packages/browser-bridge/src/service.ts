import {AUTHENTICATED_BROWSER_BRIDGE_PATH,AuthenticatedBrowserBridgeError,BROWSER_USE_FAILURE_CATEGORIES,BRIDGE_FAILURE_CODES,BRIDGE_MAX_OBSERVATION_BYTES,BRIDGE_MAX_OPERATION_BUDGET,BRIDGE_MAX_REQUEST_BYTES,BRIDGE_MAX_STORAGE_STATE_BYTES,BRIDGE_MUTATION_OPERATIONS,SelfHostedChromiumProvider,assertBridgeRequestShape,assertCapabilityExactMatch,bridgeRequestFingerprint,byteLength,verifyBrowserBridgeRequest,type BrowserBridgeDiagnostic,type BrowserUseFailureCategory,type BrowserNetworkPolicyDiagnostic,type AuthenticatedBrowserBridgeFailureCode,type AuthenticatedBrowserBridgeRequest,type AuthenticatedBrowserBridgeResponse,type AuthenticatedBrowserBridgeResult,type AuthenticatedBrowserExecutionCapability,type BrowserAllocation,type PublicBrowserObservation} from "@distilled/agent-runtime";
import { originMatches } from "@distilled/agent-runtime";
import { assertBoundedProposal, type BrowserUseDiscoveryProposal } from "@distilled/agent-runtime";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { advancePublicDiscovery } from "./bounded-browser-decision";

type Recorded=AuthenticatedBrowserBridgeResponse;
type Execution={capability:AuthenticatedBrowserExecutionCapability;scope?:BrowserAllocation;ready:Promise<BrowserAllocation>;state:"OPENING"|"OPEN"|"CLOSING"|"CLOSED"|"EXPIRED";operations:number;discovery?:Promise<BrowserUseDiscoveryProposal>;authSourceUrl?:string;sessionReady?:boolean;/** Idempotency records for mutations only: outcome envelopes carry no secret material. */records:Map<string,{fingerprint:string;response:Recorded}>;inflight:Map<string,{fingerprint:string;promise:Promise<Recorded>}>;queue:Promise<unknown>;abort:AbortController;idleTimer?:ReturnType<typeof setTimeout>;absoluteTimer?:ReturnType<typeof setTimeout>};
const MAX_CAPABILITY_TTL_MS=15*60_000;
const MAX_CLOCK_SKEW_MS=30_000;
const MAX_TRACKED_NONCES=10_000;
const TOMBSTONE_MS=5*60_000;
export class AuthenticatedBrowserBridgeService{
  private readonly executions=new Map<string,Execution>();private readonly nonces=new Map<string,number>();
  constructor(private readonly input:{serviceCredential:string;provider?:SelfHostedChromiumProvider;allowTestMode?:boolean;clock?:()=>number;requestWindowMs?:number;idleTimeoutMs?:number;absoluteTimeoutMs?:number;maxExecutions?:number}){if(!input.serviceCredential)throw new Error("bridge service credential is required");if(input.allowTestMode&&typeof process!=="undefined"&&process.env.NODE_ENV==="production")throw new Error("test mode is forbidden in production mode");}
  private get provider(){return this.input.provider??(this.input.provider=this.input.allowTestMode?SelfHostedChromiumProvider.forTest():new SelfHostedChromiumProvider({launchBrowser:options=>chromium.launch(options)}))}
  private now(){return this.input.clock?.()??Date.now()}
  get activeExecutionCount(){return[...this.executions.values()].filter(execution=>execution.state==="OPENING"||execution.state==="OPEN"||execution.state==="CLOSING").length}
  async handle(request:Request):Promise<Response>{
    if(request.method!=="POST"||new URL(request.url).pathname!==AUTHENTICATED_BROWSER_BRIDGE_PATH)return this.failure("BRIDGE_OPERATION_UNKNOWN",404);
    if(Number(request.headers.get("content-length")??0)>BRIDGE_MAX_REQUEST_BYTES)return this.failure("BRIDGE_PAYLOAD_TOO_LARGE",413);
    const body=await readBounded(request,BRIDGE_MAX_REQUEST_BYTES);if(body===undefined)return this.failure("BRIDGE_PAYLOAD_TOO_LARGE",413);
    const timestamp=request.headers.get("x-distilled-bridge-timestamp")??"",nonce=request.headers.get("x-distilled-bridge-nonce")??"",signature=request.headers.get("x-distilled-bridge-signature")??"";
    const now=this.now(),time=Number(timestamp);
    if(!timestamp||!Number.isFinite(time)||Math.abs(now-time)>(this.input.requestWindowMs??30_000)||!nonce||nonce.length>128||!signature)return this.failure("BRIDGE_UNAUTHORIZED",401);
    if(!await verifyBrowserBridgeRequest(this.input.serviceCredential,timestamp,nonce,body,signature))return this.failure("BRIDGE_UNAUTHORIZED",401);
    this.pruneNonces(now);if(this.nonces.has(nonce))return this.failure("BRIDGE_REPLAY_REJECTED",409);if(this.nonces.size>=MAX_TRACKED_NONCES)return this.failure("BRIDGE_UNAVAILABLE",503);this.nonces.set(nonce,now);
    let message:unknown;try{message=JSON.parse(body)}catch{return this.failure("BRIDGE_PROTOCOL_UNSUPPORTED",400)}
    try{const result=await this.execute(message,request.signal);return this.response({protocol:"v1",ok:true,result})}catch(error){const code=classifyFailure("",error);return this.failure(code,statusFor(code),failureDiagnostic("",error))}
  }
  /**
   * Native Container ingress. This is intentionally not an HTTP-public API: the
   * container Durable Object is the sole caller and exposes only the typed
   * protocol request below. It retains every protocol, capability, operation,
   * replay/idempotency and browser-policy fence; HMAC remains mandatory on
   * `handle()` for the optional externally hosted transport.
   */
  async handleInternal(request:Request):Promise<Response>{
    if(request.method!=="POST"||new URL(request.url).pathname!=="/v1/internal-authenticated-browser")return this.failure("BRIDGE_OPERATION_UNKNOWN",404);
    if(Number(request.headers.get("content-length")??0)>BRIDGE_MAX_REQUEST_BYTES)return this.failure("BRIDGE_PAYLOAD_TOO_LARGE",413);
    const body=await readBounded(request,BRIDGE_MAX_REQUEST_BYTES);if(body===undefined)return this.failure("BRIDGE_PAYLOAD_TOO_LARGE",413);
    let message:unknown;try{message=JSON.parse(body)}catch{return this.failure("BRIDGE_PROTOCOL_UNSUPPORTED",400)}
    try{return this.response({protocol:"v1",ok:true,result:await this.execute(message,request.signal)})}catch(error){const code=classifyFailure("",error);return this.failure(code,statusFor(code),failureDiagnostic("",error))}
  }
  async shutdown(){await Promise.all([...this.executions.values()].map(execution=>this.close(execution)));this.executions.clear()}
  private async execute(raw:unknown,signal?:AbortSignal):Promise<AuthenticatedBrowserBridgeResult>{
    assertBridgeRequestShape(raw);const message=raw,capability=message.capability,now=this.now();
    if(Date.parse(capability.expiresAt)<=now||Date.parse(capability.issuedAt)>now+MAX_CLOCK_SKEW_MS)throw new AuthenticatedBrowserBridgeError("BRIDGE_EXECUTION_EXPIRED");
    if(capability.operationBudget<1||capability.operationBudget>BRIDGE_MAX_OPERATION_BUDGET||Date.parse(capability.expiresAt)-Date.parse(capability.issuedAt)>MAX_CAPABILITY_TTL_MS)throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");
    if(message.operation==="OPEN_AUTH_BROWSER"){try{return await this.open(message)}catch(error){throw new AuthenticatedBrowserBridgeError(classifyFailure("OPEN_AUTH_BROWSER",error),failureDiagnostic("OPEN_AUTH_BROWSER",error))}}
    const execution=this.executions.get(capability.bridgeExecutionId);if(!execution)throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");
    assertCapabilityExactMatch(execution.capability,capability);
    // The agent invokes bounded bridge operations on this same execution. It
    // must run outside the per-execution queue to avoid deadlocking those calls.
    if(message.operation==="DISCOVER_SOURCE_WITH_BROWSER_USE"||message.operation==="DISCOVER_AUTH_SOURCE_WITH_BROWSER_USE")return this.discoverWithBrowserUse(execution,message,signal);
    if(message.operation==="CLOSE_AUTH_BROWSER"&&(execution.state==="CLOSED"||execution.state==="EXPIRED")){return{closed:true}}
    const envelope=await this.dispatch(execution,message);if(envelope.ok)return envelope.result;throw new AuthenticatedBrowserBridgeError(envelope.error.code,envelope.error.diagnostic);
  }
  private async discoverWithBrowserUse(execution:Execution,message:Extract<AuthenticatedBrowserBridgeRequest,{operation:"DISCOVER_SOURCE_WITH_BROWSER_USE"|"DISCOVER_AUTH_SOURCE_WITH_BROWSER_USE"}>,signal?:AbortSignal):Promise<BrowserUseDiscoveryProposal>{
    const cap=execution.capability;
    if(execution.discovery)throw new AuthenticatedBrowserBridgeError("BRIDGE_REPLAY_REJECTED");
    const xTimeline=message.operation==="DISCOVER_AUTH_SOURCE_WITH_BROWSER_USE";
    if(execution.state!=="OPEN"||(xTimeline?(cap.siteKind!=="x"||!execution.sessionReady):(cap.siteKind!=="PUBLIC"||cap.allowedOrigins.length!==1)))throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");
    if(xTimeline){admittedXProfileUrl(message.sourceUrl,cap)}
    else if(!originAllowed(message.sourceUrl,cap.allowedOrigins,this.input.allowTestMode)||message.sourceUrl!==cap.authEntryPoint)throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED");
    if(!process.env.OPENROUTER_API_KEY||!process.env.DISTILLED_BROWSER_USE_PYTHON)throw new AuthenticatedBrowserBridgeError("BRIDGE_UNAVAILABLE");
    const payload={runId:cap.runId,sourceUrl:message.sourceUrl,allowedOrigin:new URL(message.sourceUrl).origin,siteMode:xTimeline?"X_TIMELINE":"PUBLIC",decisionMode:process.env.DISTILLED_DISCOVERY_DECISION_MODE??"GENERATIVE_ONLY",modelRef:message.modelRef,maxSteps:message.maxSteps,capability:cap};
    const python=process.env.DISTILLED_BROWSER_USE_PYTHON;
    const script=fileURLToPath(new URL("../browser_use_discovery.py",import.meta.url));
    clearTimeout(execution.idleTimer);
    const discovery=new Promise<BrowserUseDiscoveryProposal>((resolve,reject)=>{
      const uid=process.env.DISTILLED_BROWSER_USE_UID?Number(process.env.DISTILLED_BROWSER_USE_UID):undefined;
      const gid=process.env.DISTILLED_BROWSER_USE_GID?Number(process.env.DISTILLED_BROWSER_USE_GID):undefined;
      const {DISTILLED_DECISION_AUTH:decisionAuth,...runnerEnvironment}=process.env;
      if((uid!==undefined&&(!Number.isInteger(uid)||uid<1))||(gid!==undefined&&(!Number.isInteger(gid)||gid<1)))throw new AuthenticatedBrowserBridgeError("BRIDGE_UNAVAILABLE",{browserUseFailure:"RUNNER_START_FAILED"});
      const child=spawn(python,[script],{shell:false,...(uid!==undefined?{uid}:{}),...(gid!==undefined?{gid}:{}),stdio:["pipe","pipe","ignore"],env:{...runnerEnvironment,HOME:process.env.DISTILLED_BROWSER_USE_HOME??process.env.HOME,ANONYMIZED_TELEMETRY:"false",BROWSER_USE_CLOUD_SYNC:"false",OPENAI_API_KEY:process.env.OPENROUTER_API_KEY,OPENAI_BASE_URL:"https://openrouter.ai/api/v1",DISTILLED_BRIDGE_URL:"http://127.0.0.1:8080/v1/internal-authenticated-browser"}});
      let output="",settled=false;
      const finish=(error?:Error,value?:BrowserUseDiscoveryProposal)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener("abort",cancel);if(error)reject(error);else resolve(value!)};
      const cancel=()=>{child.kill();finish(new AuthenticatedBrowserBridgeError("BRIDGE_UNAVAILABLE",{browserUseFailure:"CANCELLED"}))};
      const timer=setTimeout(()=>{child.kill();finish(new AuthenticatedBrowserBridgeError("BRIDGE_UNAVAILABLE",{browserUseFailure:"TIMEOUT"}))},Math.min(90_000,Math.max(1,Date.parse(cap.expiresAt)-this.now())));
      signal?.addEventListener("abort",cancel,{once:true});if(signal?.aborted)cancel();
      child.stdout.on("data",(chunk:Buffer)=>{output+=chunk.toString("utf8");if(output.length>32_768){child.kill();finish(new AuthenticatedBrowserBridgeError("BRIDGE_PAYLOAD_TOO_LARGE"))}});
      child.on("error",()=>finish(new AuthenticatedBrowserBridgeError("BRIDGE_UNAVAILABLE",{browserUseFailure:"RUNNER_START_FAILED"})));
      child.stdin.on("error",()=>finish(new AuthenticatedBrowserBridgeError("BRIDGE_UNAVAILABLE",{browserUseFailure:"RUNNER_START_FAILED"})));
      child.on("close",(code,signal)=>{
        if(settled)return;
        try{
          if(code!==0){
            let category:BrowserUseFailureCategory="AGENT_RUN_FAILED",failureType:string|undefined,causeType:string|undefined,failureTrace:string[]|undefined,runtimeHint:string|undefined,bridgeFailureCode:AuthenticatedBrowserBridgeFailureCode|undefined,bridgeHttpStatus:number|undefined,policyRule:BrowserNetworkPolicyDiagnostic["policyRule"]|undefined,deniedHostname:string|undefined,bridgeOperation:"NAVIGATE_PUBLIC_PAGE"|"OBSERVE_PUBLIC_PAGE"|"SCROLL_PUBLIC_PAGE"|undefined;
            const runnerExit=signal?"SIGNAL":output.trim()?"EXIT_CODE":"EMPTY_OUTPUT";
            try{
              const failure=JSON.parse(output) as {category?:unknown;failureType?:unknown;causeType?:unknown;failureTrace?:unknown;runtimeHint?:unknown;bridgeFailureCode?:unknown;bridgeHttpStatus?:unknown;policyRule?:unknown;deniedHostname?:unknown;bridgeOperation?:unknown};
              if(BROWSER_USE_FAILURE_CATEGORIES.includes(failure.category as BrowserUseFailureCategory))category=failure.category as BrowserUseFailureCategory;
              if(typeof failure.failureType==="string"&&/^[A-Za-z0-9_.]{1,120}$/.test(failure.failureType))failureType=failure.failureType;
              if(typeof failure.causeType==="string"&&/^[A-Za-z0-9_.]{1,120}$/.test(failure.causeType))causeType=failure.causeType;
              if(Array.isArray(failure.failureTrace)&&failure.failureTrace.length<=4&&failure.failureTrace.every(value=>typeof value==="string"&&/^[A-Za-z0-9_.]{1,100}$/.test(value)))failureTrace=failure.failureTrace;
              if(typeof failure.runtimeHint==="string"&&/^[A-Z_]{1,40}$/.test(failure.runtimeHint))runtimeHint=failure.runtimeHint;
              if(BRIDGE_FAILURE_CODES.includes(failure.bridgeFailureCode as AuthenticatedBrowserBridgeFailureCode))bridgeFailureCode=failure.bridgeFailureCode as AuthenticatedBrowserBridgeFailureCode;
              if(typeof failure.bridgeHttpStatus==="number"&&Number.isInteger(failure.bridgeHttpStatus)&&failure.bridgeHttpStatus>=400&&failure.bridgeHttpStatus<=599)bridgeHttpStatus=failure.bridgeHttpStatus;
              if(["ORIGIN_NOT_ADMITTED","REDIRECT_ORIGIN_NOT_ADMITTED","FINAL_ORIGIN_NOT_ADMITTED","SCHEME_NOT_ALLOWED","PRIVATE_OR_UNRESOLVED_ORIGIN","METHOD_NOT_ALLOWED","REQUEST_BLOCKED","REQUEST_BUDGET_EXCEEDED"].includes(String(failure.policyRule)))policyRule=failure.policyRule as BrowserNetworkPolicyDiagnostic["policyRule"];
              if(typeof failure.deniedHostname==="string"&&/^[A-Za-z0-9.-]{1,253}$/.test(failure.deniedHostname))deniedHostname=failure.deniedHostname;
              if(["NAVIGATE_PUBLIC_PAGE","OBSERVE_PUBLIC_PAGE","SCROLL_PUBLIC_PAGE"].includes(String(failure.bridgeOperation)))bridgeOperation=failure.bridgeOperation as typeof bridgeOperation;
            }catch{/* bounded diagnostic only */}
            console.log(JSON.stringify({event:"browser_use_runner_failure",category,failureType,causeType,failureTrace,runtimeHint,bridgeFailureCode,bridgeHttpStatus,policyRule,deniedHostname,bridgeOperation,runnerExit}));
            finish(new AuthenticatedBrowserBridgeError("BRIDGE_BROWSER_FAILURE",{browserUseFailure:category,failureType,causeType,failureTrace,runtimeHint,bridgeFailureCode,bridgeHttpStatus,policyRule,deniedHostname,bridgeOperation,runnerExit}));return;
          }
          const parsed=JSON.parse(output) as BrowserUseDiscoveryProposal;
          // This helper validates the common bounded proposal shape. The X
          // capability and source path are checked separately above and below.
          assertBoundedProposal(parsed,{runId:cap.runId,tenantId:cap.tenantId,ownerId:cap.ownerId,resourceId:cap.profileId,browserGeneration:cap.browserGeneration,allowedOrigins:[new URL(message.sourceUrl).origin],siteKind:"PUBLIC",readOnly:true,expiresAt:cap.expiresAt});
          if(xTimeline&&(parsed.articleUrls.length!==0||parsed.listingUrls.some(url=>url!==message.sourceUrl)||parsed.visitedUrls.some(url=>url!==message.sourceUrl)))throw new Error("invalid X timeline proposal");
          finish(undefined,parsed);
        }catch{finish(new AuthenticatedBrowserBridgeError("BRIDGE_BROWSER_FAILURE",{browserUseFailure:"PROPOSAL_INVALID"}))}
      });
      child.stdin.end(JSON.stringify(payload));
    });
    execution.discovery=discovery;
    try{return await discovery}finally{if(execution.state==="OPEN")this.refreshIdle(execution)}
  }
  /** Serialises operations per execution, deduplicates by operationId, and records mutation outcomes so a retry can never re-execute one. */
  private dispatch(execution:Execution,message:AuthenticatedBrowserBridgeRequest):Promise<Recorded>{
    const fingerprint=bridgeRequestFingerprint(message),key=message.operationId,mutation=BRIDGE_MUTATION_OPERATIONS.has(message.operation);
    const recorded=execution.records.get(key);if(recorded){if(recorded.fingerprint!==fingerprint)throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");return Promise.resolve(recorded.response)}
    const pending=execution.inflight.get(key);if(pending){if(pending.fingerprint!==fingerprint)throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");return pending.promise}
    const run=async():Promise<Recorded>=>{
      let envelope:Recorded;
      try{
        if(execution.state==="OPENING")await execution.ready;
        if(execution.state==="EXPIRED"||(execution.state==="CLOSED"&&message.operation!=="CLOSE_AUTH_BROWSER"))throw new AuthenticatedBrowserBridgeError("BRIDGE_EXECUTION_EXPIRED");
        if(execution.state==="CLOSING"&&message.operation!=="CLOSE_AUTH_BROWSER")throw new AuthenticatedBrowserBridgeError("BRIDGE_EXECUTION_EXPIRED");
        if(execution.operations>=execution.capability.operationBudget)throw new AuthenticatedBrowserBridgeError("BRIDGE_EXECUTION_EXPIRED");
        execution.operations++;this.refreshIdle(execution);
        envelope={protocol:"v1",ok:true,result:await this.perform(execution,message)};
      }catch(error){const code=classifyFailure(message.operation,error);const diagnostic=failureDiagnostic(message.operation,error);envelope={protocol:"v1",ok:false,error:{code,...(diagnostic?{diagnostic}: {})}};if(code==="BRIDGE_NETWORK_POLICY_DENIED")void this.expire(execution)}
      if(mutation||message.operation==="CLOSE_AUTH_BROWSER")execution.records.set(key,{fingerprint,response:envelope});
      return envelope;
    };
    const promise=execution.queue.then(run,run);execution.queue=promise.catch(()=>undefined);
    execution.inflight.set(key,{fingerprint,promise});void promise.finally(()=>execution.inflight.delete(key));return promise;
  }
  private async perform(execution:Execution,message:AuthenticatedBrowserBridgeRequest):Promise<AuthenticatedBrowserBridgeResult>{
    const scope=execution.scope!,capability=execution.capability;
    if(capability.siteKind==="PUBLIC"&&["RESTORE_AUTH_STATE","INJECT_AUTH_FIELD","ACTIVATE_AUTH_CONTROL","CAPTURE_AUTH_STATE"].includes(message.operation))throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED");
    switch(message.operation){
      case"RESTORE_AUTH_STATE":if(byteLength(JSON.stringify(message.state))>BRIDGE_MAX_STORAGE_STATE_BYTES)throw new AuthenticatedBrowserBridgeError("BRIDGE_PAYLOAD_TOO_LARGE");await this.provider.attachAuthenticatedSession(scope,message.state);execution.sessionReady=true;return{accepted:true};
      case"NAVIGATE_AUTH_ENTRYPOINT":await this.provider.navigateAuthenticationEntrypoint(scope,message.destination==="SESSION_PROBE"?capability.sessionProbeUrl:capability.authEntryPoint,capability.writeOrigins);return{accepted:true};
      case"OBSERVE_AUTH_SURFACE":{const surface=await this.provider.observeAuthenticationSurface(scope,message.wait);if(!originAllowed(surface.url,capability.allowedOrigins,this.input.allowTestMode))throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED");if(byteLength(JSON.stringify(surface))>BRIDGE_MAX_OBSERVATION_BYTES)throw new AuthenticatedBrowserBridgeError("BRIDGE_PAYLOAD_TOO_LARGE");return surface}
      case"NAVIGATE_AUTH_SOURCE":{const source=admittedXProfileUrl(message.sourceUrl,capability);if(!execution.sessionReady)throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");const observed=await this.provider.navigatePublicPage(scope,source,capability.allowedOrigins);if(!xSourceObservationAllowed(observed.url,source))throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED",finalOriginDiagnostic(observed.url,capability.allowedOrigins));execution.authSourceUrl=source;return boundedPublicObservation(observed)}
      case"OBSERVE_AUTH_SOURCE":{if(!execution.authSourceUrl)throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");const observed=await this.provider.observePublicPage(scope);if(!xSourceObservationAllowed(observed.url,execution.authSourceUrl))throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED",finalOriginDiagnostic(observed.url,capability.allowedOrigins));return boundedPublicObservation(observed)}
      case"SCROLL_AUTH_SOURCE":{if(!execution.authSourceUrl)throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");const observed=await this.provider.scroll(scope,message.deltaY);if(!xSourceObservationAllowed(observed.url,execution.authSourceUrl))throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED",finalOriginDiagnostic(observed.url,capability.allowedOrigins));return boundedPublicObservation(observed)}
      case"NAVIGATE_PUBLIC_PAGE":{if(capability.siteKind!=="PUBLIC")throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED");const observed=await this.provider.navigatePublicPage(scope,message.url,capability.allowedOrigins);if(!originAllowed(observed.url,capability.allowedOrigins,this.input.allowTestMode))throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED",finalOriginDiagnostic(observed.url,capability.allowedOrigins));const result=publicObservation(observed);if(byteLength(JSON.stringify(result))>BRIDGE_MAX_OBSERVATION_BYTES)throw new AuthenticatedBrowserBridgeError("BRIDGE_PAYLOAD_TOO_LARGE");return result}
      case"OBSERVE_PUBLIC_PAGE":{if(capability.siteKind!=="PUBLIC")throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED");const observed=await this.provider.observePublicPage(scope);if(!originAllowed(observed.url,capability.allowedOrigins,this.input.allowTestMode))throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED",finalOriginDiagnostic(observed.url,capability.allowedOrigins));const result=publicObservation(observed);if(byteLength(JSON.stringify(result))>BRIDGE_MAX_OBSERVATION_BYTES)throw new AuthenticatedBrowserBridgeError("BRIDGE_PAYLOAD_TOO_LARGE");return result}
      case"SCROLL_PUBLIC_PAGE":{if(capability.siteKind!=="PUBLIC")throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED");const observed=await this.provider.scroll(scope,message.deltaY);if(!originAllowed(observed.url,capability.allowedOrigins,this.input.allowTestMode))throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED",finalOriginDiagnostic(observed.url,capability.allowedOrigins));const result=publicObservation(observed);if(byteLength(JSON.stringify(result))>BRIDGE_MAX_OBSERVATION_BYTES)throw new AuthenticatedBrowserBridgeError("BRIDGE_PAYLOAD_TOO_LARGE");return result}
      case"ADVANCE_PUBLIC_DISCOVERY":{
        const key=execution as Execution&{decisionInspected?:Set<string>};key.decisionInspected??=new Set();
        const result=await advancePublicDiscovery({provider:this.provider,scope,capability,pageRevision:message.pageRevision,inspected:key.decisionInspected});
        return{fallback:result.fallback,action:result.action,observation:result.observation?boundedPublicObservation(result.observation):undefined};
      }
      case"INJECT_AUTH_FIELD":await this.provider.injectAuthenticationField(scope,{fieldKind:message.fieldKind,fieldHandle:message.fieldHandle,pageRevision:message.pageRevision,secretValue:message.secretValue});return{accepted:true};
      case"ACTIVATE_AUTH_CONTROL":await this.provider.activateAuthenticationControl(scope,{controlKind:message.controlKind,controlHandle:message.controlHandle,pageRevision:message.pageRevision});return{accepted:true};
      case"CAPTURE_AUTH_STATE":{const captured=await this.provider.exportAuthenticatedSession(scope);if(byteLength(JSON.stringify(captured))>BRIDGE_MAX_STORAGE_STATE_BYTES)throw new AuthenticatedBrowserBridgeError("BRIDGE_PAYLOAD_TOO_LARGE");execution.sessionReady=true;return captured}
      case"CLOSE_AUTH_BROWSER":await this.close(execution);return{closed:true};
      default:throw new AuthenticatedBrowserBridgeError("BRIDGE_OPERATION_UNKNOWN");
    }
  }
  private async open(message:Extract<AuthenticatedBrowserBridgeRequest,{operation:"OPEN_AUTH_BROWSER"}>):Promise<BrowserAllocation>{
    const capability=message.capability,existing=this.executions.get(capability.bridgeExecutionId);
    if(existing){assertCapabilityExactMatch(existing.capability,capability);if(existing.state==="CLOSED"||existing.state==="EXPIRED"||existing.state==="CLOSING")throw new AuthenticatedBrowserBridgeError("BRIDGE_EXECUTION_EXPIRED");return existing.ready}
    for(const execution of this.executions.values()){if(execution.state!=="CLOSED"&&execution.state!=="EXPIRED"&&execution.capability.profileId===capability.profileId&&execution.capability.browserGeneration>=capability.browserGeneration)throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH")}
    if(this.activeExecutionCount>=(this.input.maxExecutions??2))throw new AuthenticatedBrowserBridgeError("BRIDGE_UNAVAILABLE");
    const abort=new AbortController();const execution={capability,state:"OPENING",operations:1,records:new Map(),inflight:new Map(),queue:Promise.resolve(),abort} as Execution;
    execution.ready=(async()=>{try{const scope=await this.provider.allocate({runId:capability.runId,tenantId:capability.tenantId,generation:capability.browserGeneration,allowedOrigins:capability.allowedOrigins,signal:abort.signal});execution.scope=scope;if(execution.state==="OPENING"){execution.state="OPEN";this.refreshIdle(execution)}else await this.provider.close(scope).catch(()=>undefined);return scope}catch(error){clearTimeout(execution.idleTimer);clearTimeout(execution.absoluteTimer);execution.state="CLOSED";execution.records.clear();if(this.executions.get(capability.bridgeExecutionId)===execution)this.executions.delete(capability.bridgeExecutionId);throw error}})();
    execution.ready.catch(()=>undefined);this.executions.set(capability.bridgeExecutionId,execution);
    /* The idle lease starts once the browser is open (a slow launch must not consume it); the absolute deadline bounds the whole execution. */
    execution.absoluteTimer=unref(setTimeout(()=>void this.expire(execution),Math.max(1,Math.min(this.input.absoluteTimeoutMs??120_000,Date.parse(capability.expiresAt)-this.now()))));
    return execution.ready;
  }
  private refreshIdle(execution:Execution){clearTimeout(execution.idleTimer);execution.idleTimer=unref(setTimeout(()=>void this.expire(execution),this.input.idleTimeoutMs??30_000))}
  private async expire(execution:Execution){if(execution.state==="CLOSED"||execution.state==="EXPIRED")return;execution.state="EXPIRED";execution.abort.abort();await this.release(execution);this.retire(execution,"EXPIRED")}
  private async close(execution:Execution){if(execution.state==="CLOSED"||execution.state==="EXPIRED")return;execution.state="CLOSING";execution.abort.abort();await this.release(execution);this.retire(execution,"CLOSED")}
  private async release(execution:Execution){const scope=execution.scope??await execution.ready.catch(()=>undefined);if(scope)await this.provider.close(scope).catch(()=>undefined)}
  /** Drops timers and per-operation records immediately; keeps a small tombstone so late calls are answered EXPIRED rather than as an unknown execution. */
  private retire(execution:Execution,state:"CLOSED"|"EXPIRED"){execution.state=state;clearTimeout(execution.idleTimer);clearTimeout(execution.absoluteTimer);execution.records.clear();const id=execution.capability.bridgeExecutionId;unref(setTimeout(()=>{if(this.executions.get(id)===execution)this.executions.delete(id)},TOMBSTONE_MS))}
  private pruneNonces(now:number){for(const[nonce,seen]of this.nonces)if(now-seen>(this.input.requestWindowMs??30_000))this.nonces.delete(nonce)}
  private failure(code:AuthenticatedBrowserBridgeFailureCode,status:number,diagnostic?:BrowserBridgeDiagnostic){return this.response({protocol:"v1",ok:false,error:{code,...((code==="BRIDGE_NETWORK_POLICY_DENIED"||code==="BRIDGE_BROWSER_FAILURE"||code==="BRIDGE_UNAVAILABLE")&&diagnostic?{diagnostic}: {})}},status)}
  private response(value:AuthenticatedBrowserBridgeResponse,status=200){return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})}
}

/**
 * Maps a provider error to a typed failure. Only the code leaves the service: error text can echo page or field content, so it is never returned or logged.
 * A mutation that fails for any reason not provably pre-dispatch is EFFECT_UNKNOWN and must not be retried by the caller.
 */
function failureDiagnostic(operation:string,error:unknown):BrowserBridgeDiagnostic|undefined{if(error instanceof AuthenticatedBrowserBridgeError)return error.diagnostic;if(error instanceof Error&&(error.name==="BrowserNavigationError"||error.name==="BrowserPreDispatchError")){const diagnostic=(error as {diagnostic?:BrowserNetworkPolicyDiagnostic}).diagnostic;if(diagnostic)return diagnostic;}return undefined;}
function classifyFailure(operation:string,error:unknown):AuthenticatedBrowserBridgeFailureCode{
  if(error instanceof AuthenticatedBrowserBridgeError)return error.code;
  const name=error instanceof Error?error.name:"",message=error instanceof Error?error.message:"";
  if(name==="StaleObservationError")return"BRIDGE_OBSERVATION_STALE";
  if(name==="BrowserPreDispatchError")return failureDiagnostic(operation,error)||/origin|scheme|hostname|method denied|request url|private|policy/i.test(message)?"BRIDGE_NETWORK_POLICY_DENIED":"BRIDGE_FENCE_MISMATCH";
  if(name==="BrowserScopeError")return"BRIDGE_FENCE_MISMATCH";
  if(name==="BrowserNavigationError"){const code=(error as {code?:string}).code;return code==="NETWORK_POLICY_DENIED"||code==="UNEXPECTED_AUTH_ORIGIN"?"BRIDGE_NETWORK_POLICY_DENIED":"BRIDGE_BROWSER_FAILURE"}
  if(name==="BrowserAllocationError")return/concurrency/i.test(String((error as {cause?:{message?:string}}).cause?.message??""))?"BRIDGE_UNAVAILABLE":"BRIDGE_BROWSER_FAILURE";
  return BRIDGE_MUTATION_OPERATIONS.has(operation)?"BRIDGE_EFFECT_UNKNOWN":"BRIDGE_BROWSER_FAILURE";
}
function statusFor(code:AuthenticatedBrowserBridgeFailureCode){switch(code){case"BRIDGE_UNAUTHORIZED":return 401;case"BRIDGE_REPLAY_REJECTED":case"BRIDGE_EFFECT_UNKNOWN":return 409;case"BRIDGE_PAYLOAD_TOO_LARGE":return 400;case"BRIDGE_UNAVAILABLE":return 503;default:return 400}}
async function readBounded(request:Request,max:number):Promise<string|undefined>{if(!request.body)return"";const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;for(;;){const{done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel().catch(()=>undefined);return undefined}chunks.push(value)}const merged=new Uint8Array(total);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength}return new TextDecoder().decode(merged)}
/** The bridge never trusts the caller's origin claim: what the browser actually landed on must sit inside the fenced origin set before any of it is returned. */
function originAllowed(url:string,allowed:readonly string[],testMode?:boolean){if(url==="about:blank")return true;if(originMatches(url,allowed))return true;if(!testMode)return false;try{const parsed=new URL(url);return parsed.protocol==="http:"&&["127.0.0.1","localhost","[::1]"].includes(parsed.hostname)&&allowed.includes(parsed.origin)}catch{return false}}
function finalOriginDiagnostic(value:string,allowed:readonly string[]):BrowserNetworkPolicyDiagnostic{let deniedHostname:string|undefined;try{deniedHostname=new URL(value).hostname.slice(0,253)||undefined}catch{}return{policyRule:"FINAL_ORIGIN_NOT_ADMITTED",deniedHostname,redirectHop:true,topLevelNavigation:true,admittedOriginCount:allowed.length};}
function admittedXProfileUrl(value:string,capability:AuthenticatedBrowserExecutionCapability):string{
  let parsed:URL;try{parsed=new URL(value)}catch{throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH")}
  const account=parsed.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if(capability.siteKind!=="x"||parsed.protocol!=="https:"||!["x.com","twitter.com"].includes(parsed.hostname)||!capability.allowedOrigins.includes(parsed.origin)||parsed.username||parsed.password||parsed.search||parsed.hash||!/^\/[A-Za-z0-9_]{1,15}\/?$/.test(parsed.pathname)||!account||["messages","settings","compose","home","explore","search","login","notifications","i"].includes(account))throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED");
  return `${parsed.origin}/${parsed.pathname.split("/").filter(Boolean)[0]}`;
}
function xSourceObservationAllowed(value:string,source:string):boolean{
  try{const observed=new URL(value),expected=new URL(source);return observed.origin===expected.origin&&(observed.pathname===expected.pathname||observed.pathname===`${expected.pathname}/`)}catch{return false}
}
function boundedPublicObservation(value:Parameters<typeof publicObservation>[0]):PublicBrowserObservation{const result=publicObservation(value);if(byteLength(JSON.stringify(result))>BRIDGE_MAX_OBSERVATION_BYTES)throw new AuthenticatedBrowserBridgeError("BRIDGE_PAYLOAD_TOO_LARGE");return result}
function publicObservation(value:{url:string;title:string;pageRevision:string;representation:unknown;controls:PublicBrowserObservation["controls"];listingLinks?:string[];challengeState?:PublicBrowserObservation["challengeState"];challengeDiagnostics?:PublicBrowserObservation["challengeDiagnostics"];watermarkObserved?:boolean;article?:PublicBrowserObservation["article"];timelinePosts?:PublicBrowserObservation["timelinePosts"];documentCountCategory?:PublicBrowserObservation["documentCountCategory"];iframeCountCategory?:PublicBrowserObservation["iframeCountCategory"];domNodeCountCategory?:PublicBrowserObservation["domNodeCountCategory"];accessibilityNodeCountCategory?:PublicBrowserObservation["accessibilityNodeCountCategory"];bridgeProtocolVersion?:string;trustedObservationSchemaVersion?:string}):PublicBrowserObservation{const visibleText=typeof value.representation==="object"&&value.representation!==null&&typeof (value.representation as {visibleText?:unknown}).visibleText==="string"?(value.representation as {visibleText:string}).visibleText:"";return{url:value.url,title:value.title.slice(0,300),pageRevision:value.pageRevision,visibleText:visibleText.slice(0,12000),controls:value.controls.slice(0,80),listingLinks:value.listingLinks?.slice(0,100),challengeState:value.challengeState,challengeDiagnostics:value.challengeDiagnostics,watermarkObserved:value.watermarkObserved,article:value.article?{...value.article,title:value.article.title.slice(0,500),canonicalUrl:value.article.canonicalUrl,publisherTimestamp:value.article.publisherTimestamp,excerpt:value.article.excerpt.slice(0,500),body:value.article.body.slice(0,100000)}:undefined,timelinePosts:value.timelinePosts?.slice(0,30),documentCountCategory:value.documentCountCategory,iframeCountCategory:value.iframeCountCategory,domNodeCountCategory:value.domNodeCountCategory,accessibilityNodeCountCategory:value.accessibilityNodeCountCategory,bridgeProtocolVersion:value.bridgeProtocolVersion,trustedObservationSchemaVersion:value.trustedObservationSchemaVersion}}
function unref<T>(timer:T):T{(timer as {unref?:()=>void}).unref?.();return timer}
