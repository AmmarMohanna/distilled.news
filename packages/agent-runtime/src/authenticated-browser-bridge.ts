import { AUTH_CONTROL_LABEL_PATTERNS,AUTH_FIELD_KINDS,BROWSER_BRIDGE_PROTOCOL_VERSION,type AuthControlKind,type AuthenticatedBrowserSurface,type AuthFieldKind,type AuthSurfaceWait,type BrowserAllocation,type BrowserObservationData,type BrowserScope,type PublicBrowserObservation } from "./browser";
import type { SemanticControl } from "./contracts";
import type { BrowserUseDiscoveryProposal } from "./browser-use-discovery";
import type { BrowserSessionState,CredentialMaterial } from "./auth-profile";
import type { AuthenticatedBootstrapObserver,AuthenticatedBrowserExecutorPort,AuthenticatedSiteAdapter,AuthenticatedSiteDetection,AuthenticatedSiteSnapshot,AuthenticationChallengeRuntime,AuthenticationFlowLineage } from "./authenticated-site";

export const AUTHENTICATED_BROWSER_BRIDGE_PROTOCOL=BROWSER_BRIDGE_PROTOCOL_VERSION;
export const AUTHENTICATED_BROWSER_BRIDGE_PATH="/v1/authenticated-browser" as const;
export const BRIDGE_MAX_REQUEST_BYTES=256_000;
export const BRIDGE_MAX_RESPONSE_BYTES=512_000;
export const BRIDGE_MAX_STORAGE_STATE_BYTES=192_000;
export const BRIDGE_MAX_OBSERVATION_BYTES=96_000;
export const BRIDGE_MAX_SECRET_CHARS=4_096;
export const BRIDGE_MAX_OPERATION_BUDGET=64;
export const BRIDGE_FAILURE_CODES=["BRIDGE_UNAVAILABLE","BRIDGE_UNAUTHORIZED","BRIDGE_REPLAY_REJECTED","BRIDGE_EXECUTION_EXPIRED","BRIDGE_FENCE_MISMATCH","BRIDGE_OBSERVATION_STALE","BRIDGE_NETWORK_POLICY_DENIED","BRIDGE_EFFECT_UNKNOWN","BRIDGE_BROWSER_FAILURE","BRIDGE_PROTOCOL_UNSUPPORTED","BRIDGE_PAYLOAD_TOO_LARGE","BRIDGE_OPERATION_UNKNOWN"] as const;
export type AuthenticatedBrowserBridgeFailureCode=typeof BRIDGE_FAILURE_CODES[number];
export type BrowserNetworkPolicyRule="ORIGIN_NOT_ADMITTED"|"REDIRECT_ORIGIN_NOT_ADMITTED"|"FINAL_ORIGIN_NOT_ADMITTED"|"SCHEME_NOT_ALLOWED"|"PRIVATE_OR_UNRESOLVED_ORIGIN"|"METHOD_NOT_ALLOWED"|"REQUEST_BLOCKED"; export interface BrowserNetworkPolicyDiagnostic{policyRule:BrowserNetworkPolicyRule;deniedHostname?:string;redirectHop:boolean;topLevelNavigation:boolean;sameSiteWithRequestedSource?:boolean;admittedOriginCount?:number;}
export const BROWSER_USE_FAILURE_CATEGORIES=["RUNNER_START_FAILED","BROWSER_USE_IMPORT_FAILED","MODEL_CONFIGURATION_FAILED","MODEL_REQUEST_FAILED","AGENT_INITIALIZATION_FAILED","AGENT_RUN_FAILED","ACTION_BRIDGE_FAILED","STRUCTURED_OUTPUT_INVALID","TIMEOUT","CANCELLED","PROPOSAL_INVALID"] as const;
export type BrowserUseFailureCategory=typeof BROWSER_USE_FAILURE_CATEGORIES[number];
export interface BrowserUseFailureDiagnostic{browserUseFailure:BrowserUseFailureCategory;failureType?:string;causeType?:string;failureTrace?:string[];runnerExit?:"SIGNAL"|"EMPTY_OUTPUT"|"EXIT_CODE"}
export type BrowserBridgeDiagnostic=BrowserNetworkPolicyDiagnostic|BrowserUseFailureDiagnostic;
export class AuthenticatedBrowserBridgeError extends Error{constructor(public readonly code:AuthenticatedBrowserBridgeFailureCode,public readonly diagnostic?:BrowserBridgeDiagnostic){super(code);this.name="AuthenticatedBrowserBridgeError"}}
export const BRIDGE_OPERATIONS=["OPEN_AUTH_BROWSER","RESTORE_AUTH_STATE","NAVIGATE_AUTH_ENTRYPOINT","OBSERVE_AUTH_SURFACE","NAVIGATE_PUBLIC_PAGE","OBSERVE_PUBLIC_PAGE","SCROLL_PUBLIC_PAGE","DISCOVER_SOURCE_WITH_BROWSER_USE","INJECT_AUTH_FIELD","ACTIVATE_AUTH_CONTROL","CAPTURE_AUTH_STATE","CLOSE_AUTH_BROWSER"] as const;
export type AuthenticatedBrowserBridgeOperation=typeof BRIDGE_OPERATIONS[number];
/** Operations whose transport-level outcome must never be blindly repeated: an unknown result is BRIDGE_EFFECT_UNKNOWN. */
export const BRIDGE_MUTATION_OPERATIONS:ReadonlySet<string>=new Set(["RESTORE_AUTH_STATE","NAVIGATE_AUTH_ENTRYPOINT","INJECT_AUTH_FIELD","ACTIVATE_AUTH_CONTROL","SCROLL_PUBLIC_PAGE","DISCOVER_SOURCE_WITH_BROWSER_USE"]);
export type BridgeNavigationDestination="ENTRYPOINT"|"SESSION_PROBE";

export interface AuthenticatedBrowserExecutionCapability {bridgeExecutionId:string;bootstrapRequestId:string;runId:string;tenantId:string;ownerId:string;profileId:string;expectedProfileVersion:number;browserGeneration:number;authFlowId:string;siteKind:string;authEntryPoint:string;sessionProbeUrl:string;allowedOrigins:string[];writeOrigins:string[];issuedAt:string;expiresAt:string;operationBudget:number;}
interface BoundOperation{protocol:typeof AUTHENTICATED_BROWSER_BRIDGE_PROTOCOL;operationId:string;capability:AuthenticatedBrowserExecutionCapability;}
export type AuthenticatedBrowserBridgeRequest=
  | (BoundOperation&{operation:"OPEN_AUTH_BROWSER"})
  | (BoundOperation&{operation:"RESTORE_AUTH_STATE";state:BrowserSessionState})
  | (BoundOperation&{operation:"NAVIGATE_AUTH_ENTRYPOINT";destination?:BridgeNavigationDestination})
  | (BoundOperation&{operation:"OBSERVE_AUTH_SURFACE";wait?:AuthSurfaceWait})
  | (BoundOperation&{operation:"NAVIGATE_PUBLIC_PAGE";url:string})
  | (BoundOperation&{operation:"OBSERVE_PUBLIC_PAGE"})
  | (BoundOperation&{operation:"SCROLL_PUBLIC_PAGE";deltaY:number})
  | (BoundOperation&{operation:"DISCOVER_SOURCE_WITH_BROWSER_USE";sourceUrl:string;modelRef:string;maxSteps:number})
  | (BoundOperation&{operation:"INJECT_AUTH_FIELD";fieldKind:AuthFieldKind;fieldHandle:string;pageRevision:string;secretValue:string})
  | (BoundOperation&{operation:"ACTIVATE_AUTH_CONTROL";controlKind:AuthControlKind;controlHandle:string;pageRevision:string})
  | (BoundOperation&{operation:"CAPTURE_AUTH_STATE"})
  | (BoundOperation&{operation:"CLOSE_AUTH_BROWSER"});
export type AuthenticatedBrowserBridgeResult=BrowserAllocation|AuthenticatedBrowserSurface|PublicBrowserObservation|BrowserSessionState|BrowserUseDiscoveryProposal|{closed:true}|{accepted:true};
export type AuthenticatedBrowserBridgeResponse={protocol:typeof AUTHENTICATED_BROWSER_BRIDGE_PROTOCOL;ok:true;result:AuthenticatedBrowserBridgeResult}|{protocol:typeof AUTHENTICATED_BROWSER_BRIDGE_PROTOCOL;ok:false;error:{code:AuthenticatedBrowserBridgeFailureCode;diagnostic?:BrowserBridgeDiagnostic}};

export interface BrowserBridgeTransport{execute(request:AuthenticatedBrowserBridgeRequest):Promise<AuthenticatedBrowserBridgeResult>}
export class HttpAuthenticatedBrowserBridgeClient implements BrowserBridgeTransport{
  constructor(private readonly input:{url:string;serviceCredential:string;fetch?:typeof fetch;allowLoopbackHttp?:boolean;clock?:()=>number;nonce?:()=>string;timeoutMs?:number}){let parsed:URL;try{parsed=new URL(input.url)}catch{throw new Error("self-hosted browser bridge URL is invalid")}const isProd=typeof process!=="undefined"&&process.env.NODE_ENV==="production";if(isProd&&input.allowLoopbackHttp)throw new Error("loopback HTTP is forbidden in production mode");if(parsed.protocol!=="https:"&&!(input.allowLoopbackHttp&&parsed.protocol==="http:"&&isLoopback(parsed.hostname)))throw new Error("self-hosted browser bridge requires HTTPS outside explicit loopback development");if(parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error("self-hosted browser bridge URL must not carry credentials or query parameters");if(!input.serviceCredential)throw new Error("SELF_HOSTED_BROWSER_BRIDGE_AUTH is required")}
  async execute(request:AuthenticatedBrowserBridgeRequest){
    const unknownOutcome:AuthenticatedBrowserBridgeFailureCode=BRIDGE_MUTATION_OPERATIONS.has(request.operation)?"BRIDGE_EFFECT_UNKNOWN":"BRIDGE_UNAVAILABLE";
    const body=JSON.stringify(request);if(byteLength(body)>BRIDGE_MAX_REQUEST_BYTES)throw new AuthenticatedBrowserBridgeError("BRIDGE_PAYLOAD_TOO_LARGE");
    const timestamp=String(this.input.clock?.()??Date.now());const nonce=this.input.nonce?.()??crypto.randomUUID();const signature=await signBrowserBridgeRequest(this.input.serviceCredential,timestamp,nonce,body);
    let response:Response;try{response=await(this.input.fetch??fetch)(this.input.url,{method:"POST",redirect:"manual",signal:AbortSignal.timeout(this.input.timeoutMs??45_000),headers:{"content-type":"application/json","x-distilled-bridge-timestamp":timestamp,"x-distilled-bridge-nonce":nonce,"x-distilled-bridge-signature":signature},body})}catch{throw new AuthenticatedBrowserBridgeError(unknownOutcome)}
    /* Workers accept only "follow"|"manual" for redirect, so redirects are refused explicitly: a signed request must never be forwarded elsewhere. */if(response.status>=300&&response.status<400)throw new AuthenticatedBrowserBridgeError(unknownOutcome);const declared=Number(response.headers.get("content-length")??0);if(declared>BRIDGE_MAX_RESPONSE_BYTES)throw new AuthenticatedBrowserBridgeError(unknownOutcome);
    let text:string;try{text=await response.text()}catch{throw new AuthenticatedBrowserBridgeError(unknownOutcome)}if(byteLength(text)>BRIDGE_MAX_RESPONSE_BYTES)throw new AuthenticatedBrowserBridgeError(unknownOutcome);
    let envelope:Partial<AuthenticatedBrowserBridgeResponse>|undefined;try{envelope=JSON.parse(text) as Partial<AuthenticatedBrowserBridgeResponse>}catch{throw new AuthenticatedBrowserBridgeError(unknownOutcome)}
    if(!envelope||typeof envelope!=="object"||envelope.protocol!==AUTHENTICATED_BROWSER_BRIDGE_PROTOCOL)throw new AuthenticatedBrowserBridgeError(unknownOutcome);
    if(envelope.ok===true&&response.ok&&envelope.result!==undefined)return envelope.result;
    if(envelope.ok===false){const bridgeError=envelope.error as {code?:string;diagnostic?:BrowserBridgeDiagnostic}|undefined;const code=bridgeError?.code;if(BRIDGE_FAILURE_CODES.includes(code as AuthenticatedBrowserBridgeFailureCode))throw new AuthenticatedBrowserBridgeError(code as AuthenticatedBrowserBridgeFailureCode,bridgeError?.diagnostic)}
    throw new AuthenticatedBrowserBridgeError(unknownOutcome);
  }
}

type ExecutorSession={capability:AuthenticatedBrowserExecutionCapability;surface?:AuthenticatedBrowserSurface;state:"healthy"|"closed"|"crashed"};
export class AuthenticatedBrowserBridgeExecutor implements AuthenticatedBrowserExecutorPort{
  private readonly sessions=new Map<string,ExecutorSession>();
  constructor(private readonly transport:BrowserBridgeTransport,private readonly capability:(input:{runId:string;tenantId:string;generation:number;allowedOrigins:string[]})=>AuthenticatedBrowserExecutionCapability){}
  async allocate(input:{runId:string;tenantId:string;generation:number;allowedOrigins:string[];authenticatedSessionState?:BrowserSessionState;signal?:AbortSignal}){
    input.signal?.throwIfAborted();const capability=this.capability(input);const opened=await this.transport.execute({protocol:"v1",operationId:crypto.randomUUID(),capability,operation:"OPEN_AUTH_BROWSER"}) as BrowserAllocation;
    const session:ExecutorSession={capability,state:"healthy"};
    if(!opened||opened.runId!==capability.runId||opened.tenantId!==capability.tenantId||opened.generation!==capability.browserGeneration||typeof opened.sessionId!=="string"){await this.transport.execute({protocol:"v1",operationId:crypto.randomUUID(),capability,operation:"CLOSE_AUTH_BROWSER"}).catch(()=>undefined);throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH")}
    this.sessions.set(opened.sessionId,session);
    try{if(input.authenticatedSessionState)await this.attachAuthenticatedSession(opened,input.authenticatedSessionState)}catch(error){await this.close(opened);throw error}
    input.signal?.addEventListener("abort",()=>void this.close(opened),{once:true});return opened;
  }
  async attachAuthenticatedSession(scope:BrowserScope,state:BrowserSessionState){await this.operation(scope,{operation:"RESTORE_AUTH_STATE",state});}
  async exportAuthenticatedSession(scope:BrowserScope){return await this.operation(scope,{operation:"CAPTURE_AUTH_STATE"}) as BrowserSessionState;}
  async establishAuthenticatedSession(scope:BrowserScope,adapter:AuthenticatedSiteAdapter,credential:CredentialMaterial,observer?:AuthenticatedBootstrapObserver,lineage?:AuthenticationFlowLineage,challenges?:AuthenticationChallengeRuntime):Promise<AuthenticatedSiteDetection>{
    const current=this.require(scope);
    const observe=async(wait?:AuthSurfaceWait)=>{const surface=await this.operation(scope,wait?{operation:"OBSERVE_AUTH_SURFACE",wait}:{operation:"OBSERVE_AUTH_SURFACE"}) as AuthenticatedBrowserSurface;current.surface=surface;return surface};
    const snapshot=async()=>surfaceToSnapshot(await observe());
    try{return await adapter.bootstrap({
      goto:async(url)=>{if(url!==current.capability.authEntryPoint)throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED");current.surface=undefined;await this.operation(scope,{operation:"NAVIGATE_AUTH_ENTRYPOINT",destination:"ENTRYPOINT"})},
      fill:async()=>{throw new AuthenticatedBrowserBridgeError("BRIDGE_OPERATION_UNKNOWN")},
      click:async()=>{throw new AuthenticatedBrowserBridgeError("BRIDGE_OPERATION_UNKNOWN")},
      fillControl:async(control,value)=>{const found=await this.control(scope,current,control,observe);await this.operation(scope,{operation:"INJECT_AUTH_FIELD",fieldKind:found.type?.toLowerCase()==="password"||found.autocomplete?.toLowerCase()==="current-password"?"PASSWORD":"IDENTIFIER",fieldHandle:found.handle,pageRevision:current.surface!.pageRevision,secretValue:value});current.surface=undefined},
      clickControl:async(control)=>{const found=await this.control(scope,current,control,observe);await this.operation(scope,{operation:"ACTIVATE_AUTH_CONTROL",controlKind:controlKind(found.label),controlHandle:found.handle,pageRevision:current.surface!.pageRevision});current.surface=undefined},
      waitForAuthenticationSurface:async()=>surfaceToSnapshot(await observe("AUTH_SURFACE")),
      waitForPasswordSurface:async()=>{await observe("PASSWORD_FIELD")},
      snapshot,importSession:async(state)=>this.attachAuthenticatedSession(scope,state),exportSession:async()=>this.exportAuthenticatedSession(scope)
    },credential,observer,lineage,challenges)}finally{lineage?.invalidate()}
  }
  async detectAuthenticatedState(scope:BrowserScope,adapter:AuthenticatedSiteAdapter){const surface=await this.operation(scope,{operation:"OBSERVE_AUTH_SURFACE"}) as AuthenticatedBrowserSurface;return adapter.detect(surfaceToSnapshot(surface))}
  /** Diagnostic-only trusted observation. It cannot restore state or mutate page controls. */
  async observeAuthenticatedSurface(scope:BrowserScope,wait:AuthSurfaceWait="AUTH_SURFACE"):Promise<AuthenticatedSiteSnapshot>{const surface=await this.operation(scope,{operation:"OBSERVE_AUTH_SURFACE",wait}) as AuthenticatedBrowserSurface;return surfaceToSnapshot(surface)}
  async health(scope:BrowserScope){const session=this.sessions.get(scope.sessionId);if(!session)return"closed";if(session.capability.runId!==scope.runId||session.capability.tenantId!==scope.tenantId||session.capability.browserGeneration!==scope.generation)throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");return session.state}
  async close(scope:BrowserScope){const session=this.sessions.get(scope.sessionId);if(!session)return;this.sessions.delete(scope.sessionId);session.state="closed";await this.transport.execute({protocol:"v1",operationId:crypto.randomUUID(),capability:session.capability,operation:"CLOSE_AUTH_BROWSER"}).catch(()=>undefined)}
  async crashForTest(scope:BrowserScope){const session=this.require(scope);session.state="crashed";await this.close(scope)}
  async bindObservationCapabilities(_scope:BrowserScope,_input:{observationId:string;observationHash:string;pageRevision:string;controls:SemanticControl[];allowedDestinationUrls:string[]}):Promise<SemanticControl[]>{throw new AuthenticatedBrowserBridgeError("BRIDGE_OPERATION_UNKNOWN")}
  /** Only the two capability-bound destinations are navigable; the caller never supplies a URL to the bridge. */
  async navigate(scope:BrowserScope,url:string):Promise<BrowserObservationData>{const current=this.require(scope);const destination:BridgeNavigationDestination|undefined=url===current.capability.authEntryPoint?"ENTRYPOINT":url===current.capability.sessionProbeUrl?"SESSION_PROBE":undefined;if(!destination)throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED");current.surface=undefined;await this.operation(scope,{operation:"NAVIGATE_AUTH_ENTRYPOINT",destination});const surface=await this.operation(scope,{operation:"OBSERVE_AUTH_SURFACE"}) as AuthenticatedBrowserSurface;current.surface=surface;return{url:surface.url,finalUrl:surface.url,title:surface.title,pageId:"auth_page",pageRevision:surface.pageRevision,contentType:"text/html",raw:new Uint8Array(),representation:surface,observationSource:"CDP_DOM_SNAPSHOT",protocolSnapshotVersion:"1",controls:[],challengeState:surface.challengeState,watermarkObserved:false}}
  async inspectDom(_scope:BrowserScope):Promise<never>{throw new AuthenticatedBrowserBridgeError("BRIDGE_OPERATION_UNKNOWN")}
  async inspectAccessibilityTree(_scope:BrowserScope):Promise<never>{throw new AuthenticatedBrowserBridgeError("BRIDGE_OPERATION_UNKNOWN")}
  async followLink(_scope:BrowserScope,_handle:string,_observationRevision:string,_capability:string):Promise<never>{throw new AuthenticatedBrowserBridgeError("BRIDGE_OPERATION_UNKNOWN")}
  async extract(_scope:BrowserScope):Promise<never>{throw new AuthenticatedBrowserBridgeError("BRIDGE_OPERATION_UNKNOWN")}
  async queryPageState(_scope:BrowserScope):Promise<never>{throw new AuthenticatedBrowserBridgeError("BRIDGE_OPERATION_UNKNOWN")}
  async scroll(_scope:BrowserScope,_deltaY:number):Promise<never>{throw new AuthenticatedBrowserBridgeError("BRIDGE_OPERATION_UNKNOWN")}
  /** Resolves a semantic role+label to the opaque handle of the latest observation; observes lazily when a prior mutation invalidated it. */
  private async control(scope:BrowserScope,session:ExecutorSession,control:{role:string;label:string},observe:()=>Promise<AuthenticatedBrowserSurface>){const surface=session.surface??await observe();const matches=surface.controls.filter(candidate=>candidate.role===control.role&&candidate.label.trim()===control.label.trim());if(matches.length!==1)throw new AuthenticatedBrowserBridgeError("BRIDGE_OBSERVATION_STALE");return matches[0]}
  private require(scope:BrowserScope){const session=this.sessions.get(scope.sessionId);if(!session||session.capability.runId!==scope.runId||session.capability.tenantId!==scope.tenantId||session.capability.browserGeneration!==scope.generation)throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");return session}
  private async operation(scope:BrowserScope,input:Record<string,unknown>){const session=this.require(scope);return this.transport.execute({protocol:"v1",operationId:crypto.randomUUID(),capability:session.capability,...input} as AuthenticatedBrowserBridgeRequest)}
}

const SIGNATURE_CONTEXT=`POST ${AUTHENTICATED_BROWSER_BRIDGE_PATH}`;
export async function signBrowserBridgeRequest(secret:string,timestamp:string,nonce:string,body:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(body));const payload=`${SIGNATURE_CONTEXT}.${timestamp}.${nonce}.${toHex(new Uint8Array(hash))}`;return toHex(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload))));}
export async function verifyBrowserBridgeRequest(secret:string,timestamp:string,nonce:string,body:string,signature:string){const expected=await signBrowserBridgeRequest(secret,timestamp,nonce,body);const a=fromHex(expected),b=fromHex(signature);if(a.length===0||a.length!==b.length)return false;let different=0;for(let i=0;i<a.length;i++)different|=a[i]^b[i];return different===0;}

const REQUIRED_CAPABILITY_STRINGS=["bridgeExecutionId","bootstrapRequestId","runId","tenantId","ownerId","profileId","authFlowId","siteKind","authEntryPoint","sessionProbeUrl","issuedAt","expiresAt"] as const;
export function assertBridgeCapabilityShape(value:unknown):asserts value is AuthenticatedBrowserExecutionCapability{
  const fail=()=>{throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH")};if(!value||typeof value!=="object")return fail();const v=value as Record<string,unknown>;
  for(const key of REQUIRED_CAPABILITY_STRINGS)if(typeof v[key]!=="string"||!v[key]||(v[key] as string).length>512)return fail();
  if(!Number.isInteger(v.expectedProfileVersion)||!Number.isInteger(v.browserGeneration)||!Number.isInteger(v.operationBudget)||(v.browserGeneration as number)<1)return fail();
  const origins=(key:string)=>{const list=v[key];if(!Array.isArray(list)||list.length>16)return fail();for(const origin of list as unknown[]){if(typeof origin!=="string")return fail();let parsed:URL;try{parsed=new URL(origin)}catch{return fail()}if((parsed.protocol!=="https:"&&parsed.protocol!=="http:")||parsed.origin!==origin)return fail()}return list as string[]};
  const allowed=origins("allowedOrigins"),writes=origins("writeOrigins");if(!allowed||!writes||allowed.length===0||writes.some(origin=>!allowed.includes(origin)))return fail();
  for(const key of["authEntryPoint","sessionProbeUrl"] as const){let parsed:URL;try{parsed=new URL(v[key] as string)}catch{return fail()}if(!allowed.includes(parsed.origin)||parsed.username||parsed.password)return fail()}
  if(Number.isNaN(Date.parse(v.issuedAt as string))||Number.isNaN(Date.parse(v.expiresAt as string)))return fail();
}
const CAPABILITY_SCALARS=["bridgeExecutionId","bootstrapRequestId","runId","tenantId","ownerId","profileId","expectedProfileVersion","browserGeneration","authFlowId","siteKind","authEntryPoint","sessionProbeUrl","issuedAt","expiresAt","operationBudget"] as const;
export function assertCapabilityExactMatch(authoritative:AuthenticatedBrowserExecutionCapability,incoming:AuthenticatedBrowserExecutionCapability):void{const same=(a:string[],b:string[])=>a.length===b.length&&a.every((value,index)=>value===b[index]);if(CAPABILITY_SCALARS.some(key=>authoritative[key]!==incoming[key])||!same(authoritative.allowedOrigins,incoming.allowedOrigins)||!same(authoritative.writeOrigins,incoming.writeOrigins))throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");}
export function bridgeCapabilityFingerprint(value:AuthenticatedBrowserExecutionCapability){return JSON.stringify([...CAPABILITY_SCALARS.map(key=>value[key]),value.allowedOrigins,value.writeOrigins]);}
/** Validates the per-operation payload without ever touching the secret beyond its type and length. */
export function assertBridgeRequestShape(value:unknown):asserts value is AuthenticatedBrowserBridgeRequest{
  if(!value||typeof value!=="object")throw new AuthenticatedBrowserBridgeError("BRIDGE_PROTOCOL_UNSUPPORTED");const v=value as Record<string,unknown>;
  if(v.protocol!==AUTHENTICATED_BROWSER_BRIDGE_PROTOCOL)throw new AuthenticatedBrowserBridgeError("BRIDGE_PROTOCOL_UNSUPPORTED");
  if(typeof v.operation!=="string"||!(BRIDGE_OPERATIONS as readonly string[]).includes(v.operation))throw new AuthenticatedBrowserBridgeError("BRIDGE_OPERATION_UNKNOWN");
  if(typeof v.operationId!=="string"||!v.operationId||v.operationId.length>128)throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");
  assertBridgeCapabilityShape(v.capability);const bad=()=>{throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH")};const text=(key:string,max=256)=>{if(typeof v[key]!=="string"||!v[key]||(v[key] as string).length>max)bad()};
  switch(v.operation){
    case"RESTORE_AUTH_STATE":if(!v.state||typeof v.state!=="object"||!Array.isArray((v.state as {cookies?:unknown}).cookies))bad();break;
    case"NAVIGATE_AUTH_ENTRYPOINT":if(v.destination!==undefined&&v.destination!=="ENTRYPOINT"&&v.destination!=="SESSION_PROBE")bad();break;
    case"OBSERVE_AUTH_SURFACE":if(v.wait!==undefined&&v.wait!=="AUTH_SURFACE"&&v.wait!=="PASSWORD_FIELD")bad();break;
    case"NAVIGATE_PUBLIC_PAGE":text("url",2048);break;
    case"SCROLL_PUBLIC_PAGE":if(!Number.isInteger(v.deltaY)||Number(v.deltaY)<1||Number(v.deltaY)>2000)bad();break;
    case"DISCOVER_SOURCE_WITH_BROWSER_USE":text("sourceUrl",2048);text("modelRef",128);if(!Number.isInteger(v.maxSteps)||Number(v.maxSteps)<1||Number(v.maxSteps)>16)bad();if((v.capability as AuthenticatedBrowserExecutionCapability).siteKind!=="PUBLIC")bad();break;
    case"INJECT_AUTH_FIELD":if(!(AUTH_FIELD_KINDS as readonly unknown[]).includes(v.fieldKind))bad();text("fieldHandle");text("pageRevision");if(typeof v.secretValue!=="string"||v.secretValue.length>BRIDGE_MAX_SECRET_CHARS)bad();break;
    case"ACTIVATE_AUTH_CONTROL":if(typeof v.controlKind!=="string"||!(v.controlKind in AUTH_CONTROL_LABEL_PATTERNS))bad();text("controlHandle");text("pageRevision");break;
  }
}
/** Stable identity of a request for idempotency; deliberately excludes the secret value (only its length is bound). */
export function bridgeRequestFingerprint(request:AuthenticatedBrowserBridgeRequest){switch(request.operation){case"INJECT_AUTH_FIELD":return JSON.stringify([request.operation,request.fieldKind,request.fieldHandle,request.pageRevision,request.secretValue.length]);case"ACTIVATE_AUTH_CONTROL":return JSON.stringify([request.operation,request.controlKind,request.controlHandle,request.pageRevision]);case"RESTORE_AUTH_STATE":return JSON.stringify([request.operation,byteLength(JSON.stringify(request.state))]);case"NAVIGATE_AUTH_ENTRYPOINT":return JSON.stringify([request.operation,request.destination??"ENTRYPOINT"]);case"NAVIGATE_PUBLIC_PAGE":return JSON.stringify([request.operation,request.url]);case"SCROLL_PUBLIC_PAGE":return JSON.stringify([request.operation,request.deltaY]);case"DISCOVER_SOURCE_WITH_BROWSER_USE":return JSON.stringify([request.operation,request.sourceUrl,request.modelRef,request.maxSteps]);case"OBSERVE_AUTH_SURFACE":case"OBSERVE_PUBLIC_PAGE":return JSON.stringify([request.operation,request.operation==="OBSERVE_AUTH_SURFACE"?request.wait??null:null]);default:return request.operation}}
export function byteLength(value:string){return new TextEncoder().encode(value).byteLength}
function isLoopback(host:string){return host==="localhost"||host==="127.0.0.1"||host==="[::1]"}
function toHex(bytes:Uint8Array){return[...bytes].map(value=>value.toString(16).padStart(2,"0")).join("")}
function fromHex(value:string){if(!/^[a-f0-9]+$/i.test(value)||value.length%2)return new Uint8Array();return Uint8Array.from(value.match(/../g)!.map(part=>Number.parseInt(part,16)))}
function surfaceToSnapshot(surface:AuthenticatedBrowserSurface):AuthenticatedSiteSnapshot{return{url:surface.url,title:surface.title,visibleText:surface.visibleText??"",bridgeProtocolVersion:surface.bridgeProtocolVersion,trustedObservationSchemaVersion:surface.trustedObservationSchemaVersion,formCountCategory:surface.formCountCategory,documentCountCategory:surface.documentCountCategory,iframeCountCategory:surface.iframeCountCategory,domNodeCountCategory:surface.domNodeCountCategory,accessibilityNodeCountCategory:surface.accessibilityNodeCountCategory,controls:surface.controls.map(control=>({role:control.role??"",label:control.label,type:control.type,autocomplete:control.autocomplete,insideForm:control.insideForm,disabled:control.disabled,visible:control.visible,focusable:control.focusable,focused:false}))}}
function controlKind(label:string):AuthControlKind{for(const kind of Object.keys(AUTH_CONTROL_LABEL_PATTERNS) as AuthControlKind[])if(AUTH_CONTROL_LABEL_PATTERNS[kind].test(label.trim()))return kind;throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH")}
