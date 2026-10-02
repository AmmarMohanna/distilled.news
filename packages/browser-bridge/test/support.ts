import {
  BrowserPreDispatchError,
  SelfHostedChromiumProvider,
  StaleObservationError,
  signBrowserBridgeRequest,
  type AuthenticatedBrowserBridgeRequest,
  type AuthenticatedBrowserExecutionCapability,
  type BrowserAllocation,
  type BrowserSessionState
} from "@distilled/agent-runtime";
import type {AuthenticatedBrowserBridgeService} from "../src/service";

export const TEST_SECRET="test_bridge_secret_key_1234567890abcdef";
export const BRIDGE_URL="http://127.0.0.1:8789/v1/authenticated-browser";

export function baseCapability(overrides:Partial<AuthenticatedBrowserExecutionCapability>={}):AuthenticatedBrowserExecutionCapability{
  return{
    bridgeExecutionId:"bridge_exec_001",
    bootstrapRequestId:"bootstrap_req_001",
    runId:"run_001",
    tenantId:"account_tenant_001",
    ownerId:"account_owner_001",
    profileId:"profile_001",
    expectedProfileVersion:1,
    browserGeneration:1,
    authFlowId:"auth_flow_001",
    siteKind:"generic_auth",
    authEntryPoint:"https://auth.example.com/login",
    sessionProbeUrl:"https://auth.example.com/home",
    allowedOrigins:["https://auth.example.com"],
    writeOrigins:["https://auth.example.com"],
    issuedAt:new Date().toISOString(),
    expiresAt:new Date(Date.now()+120_000).toISOString(),
    operationBudget:10,
    ...overrides
  };
}

/** Records every provider call so tests can prove what did (and did not) reach the browser layer. */
export class MockBrowserProvider extends SelfHostedChromiumProvider{
  attachedState?:BrowserSessionState;
  allocations=0;
  lastAuthenticationBootstrap?:boolean;
  navigations:Array<{url:string;writeOrigins:string[]}>=[];
  injectedFields:Array<{fieldKind:string;secretValue:string}>=[];
  activatedControls:string[]=[];
  closeCalls=0;
  closed=false;
  failNextInject?:Error;
  allocateDelayMs=0;

  override async allocate(input:{runId:string;tenantId:string;generation:number;allowedOrigins:string[];authenticationBootstrap?:boolean}):Promise<BrowserAllocation>{
    this.allocations++;
    this.lastAuthenticationBootstrap=input.authenticationBootstrap;
    if(this.allocateDelayMs)await new Promise(resolve=>setTimeout(resolve,this.allocateDelayMs));
    return{
      runId:input.runId,
      tenantId:input.tenantId,
      sessionId:"session_"+input.runId,
      contextId:"context_"+input.runId,
      generation:input.generation,
      pageId:"page_001",
      viewport:{width:1280,height:800,deviceScaleFactor:1}
    };
  }

  override async close():Promise<void>{
    this.closeCalls++;
    this.closed=true;
  }

  override async attachAuthenticatedSession(_scope:unknown,state:BrowserSessionState):Promise<void>{
    this.attachedState=state;
  }

  override async navigateAuthenticationEntrypoint(_scope:unknown,entrypoint:string,writeOrigins:string[]):Promise<void>{
    this.navigations.push({url:entrypoint,writeOrigins});
  }

  override async observeAuthenticationSurface(_scope:unknown){
    return{
      url:"https://auth.example.com/login",
      title:"Login",
      pageRevision:"rev_1",
      challengeState:"NO_CHALLENGE" as const,
      visibleText:"Sign in to continue",
      controls:[
        {handle:"handle_valid_user",kind:"textbox",role:"textbox",label:"Username",insideForm:true,disabled:false},
        {handle:"handle_valid_next",kind:"button",role:"button",label:"Next",insideForm:true,disabled:false}
      ]
    };
  }

  override async injectAuthenticationField(_scope:unknown,input:{fieldKind:string;fieldHandle:string;pageRevision:string;secretValue:string}):Promise<void>{
    if(this.failNextInject){const error=this.failNextInject;this.failNextInject=undefined;throw error}
    if(input.fieldHandle!=="handle_valid_user"||input.pageRevision!=="rev_1")throw new StaleObservationError("handle");
    if(input.fieldKind!=="IDENTIFIER")throw new BrowserPreDispatchError("authentication field kind mismatch");
    this.injectedFields.push({fieldKind:input.fieldKind,secretValue:input.secretValue});
  }

  override async activateAuthenticationControl(_scope:unknown,input:{controlKind:string;controlHandle:string;pageRevision:string}):Promise<void>{
    if(input.controlHandle!=="handle_valid_next"||input.pageRevision!=="rev_1")throw new StaleObservationError("handle");
    if(input.controlKind!=="NEXT")throw new BrowserPreDispatchError("authentication control kind mismatch");
    this.activatedControls.push(input.controlKind);
  }

  override async exportAuthenticatedSession(_scope:unknown):Promise<BrowserSessionState>{
    return{
      cookies:[{name:"auth_session",value:"token_xyz",domain:".example.com",path:"/",expires:-1,httpOnly:true,secure:true,sameSite:"Lax"}],
      origins:[{origin:"https://auth.example.com",localStorage:[{name:"token",value:"secret_token"}]}]
    };
  }
}

export async function signedRequest(payload:unknown,options:{url?:string;secret?:string;timestamp?:string;nonce?:string;signature?:string;rawBody?:string}={}){
  const body=options.rawBody??JSON.stringify(payload);
  const timestamp=options.timestamp??String(Date.now());
  const nonce=options.nonce??crypto.randomUUID();
  const signature=options.signature??await signBrowserBridgeRequest(options.secret??TEST_SECRET,timestamp,nonce,body);
  return new Request(options.url??BRIDGE_URL,{
    method:"POST",
    headers:{
      "content-type":"application/json",
      "content-length":String(new TextEncoder().encode(body).byteLength),
      "x-distilled-bridge-timestamp":timestamp,
      "x-distilled-bridge-nonce":nonce,
      "x-distilled-bridge-signature":signature
    },
    body
  });
}

export async function send(service:AuthenticatedBrowserBridgeService,payload:unknown,options:Parameters<typeof signedRequest>[1]={}){
  const response=await service.handle(await signedRequest(payload,options));
  return{status:response.status,json:await response.json() as {ok:boolean;result?:unknown;error?:{code:string}}};
}

export function req(operation:string,capability:AuthenticatedBrowserExecutionCapability,operationId:string,extra:Record<string,unknown>={}):AuthenticatedBrowserBridgeRequest{
  return{protocol:"v1",operationId,capability,operation,...extra} as AuthenticatedBrowserBridgeRequest;
}
