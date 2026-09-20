import type { BrowserScope } from "./browser";
import type { AuthenticatedBrowserSurface } from "./browser";
import { ChallengeCoordinator,DetectOnlyBrowserChallengeProvider,InMemoryAuthenticationChallengeStore } from "./challenge-coordinator";
import { makeId } from "./contracts";
import type { AuthenticatedSiteAdapter,AuthenticatedSiteSnapshot } from "./authenticated-site";
import { AuthenticatedBrowserBridgeExecutor,AuthenticatedBrowserBridgeError,HttpAuthenticatedBrowserBridgeClient,signBrowserBridgeRequest,type AuthenticatedBrowserBridgeRequest,type AuthenticatedBrowserExecutionCapability } from "./authenticated-browser-bridge";

/**
 * Synthetic preflight for the self-hosted authenticated browser bridge. It exercises the real protocol client, executor and
 * challenge coordinator against synthetic sites only, with synthetic markers, and never touches storage, credentials or a real site.
 * Results carry check names and typed codes only: no page content, markers, cookies or credentials.
 */
export type BridgePreflightStage="AUTH_PROTOCOL"|"FENCING"|"LIFECYCLE"|"CHALLENGE"|"REDIRECT"|"CLEANUP";
export const BRIDGE_PREFLIGHT_STAGES:readonly BridgePreflightStage[]=["AUTH_PROTOCOL","FENCING","LIFECYCLE","CHALLENGE","REDIRECT","CLEANUP"];
export interface BridgePreflightInput{stage:BridgePreflightStage;siteOrigin:string;markers:{identifier:string;password:string};/** Wait used by the CLEANUP stage to outlive the bridge's idle lease. */idleWaitMs?:number}
export interface BridgePreflightCheck{name:string;pass:boolean;detail?:string}
export interface BridgePreflightResult{stage:BridgePreflightStage;pass:boolean;protocol:"v1";checks:BridgePreflightCheck[]}
export interface BridgePreflightConfig{url:string;serviceCredential:string;fetch?:typeof fetch;allowLoopbackHttp?:boolean}

/** A two-step synthetic login (`/login` → identifier → Continue → password → Log in → `/home`), used through the same port as the X adapter. */
export class SyntheticBridgeAdapter implements AuthenticatedSiteAdapter{
  readonly siteFamily="synthetic";readonly allowedOrigins:readonly string[];readonly loginOrigin:string;readonly authenticationEntryPoint:{kind:string;url:string};
  constructor(origin:string,entryPath="/login"){this.allowedOrigins=[origin];this.loginOrigin=origin;this.authenticationEntryPoint={kind:"SYNTHETIC_LOGIN",url:`${origin}${entryPath}`}}
  detect(snapshot:AuthenticatedSiteSnapshot){
    if(new URL(snapshot.url).pathname==="/home")return{state:"ACTIVE" as const,reason:"synthetic_authenticated"};
    if(/captcha/i.test(snapshot.visibleText))return{state:"CHALLENGE_REQUIRED" as const,reason:"synthetic_captcha"};
    if(/incorrect password|unknown account/i.test(snapshot.visibleText))return{state:"REAUTH_REQUIRED" as const,reason:"synthetic_rejected"};
    return{state:"SESSION_EXPIRED" as const,reason:"synthetic_unexpected"};
  }
  async bootstrap(browser:Parameters<AuthenticatedSiteAdapter["bootstrap"]>[0],credential:{username:string;password:string},_observer?:unknown,_lineage?:unknown,challenges?:Parameters<AuthenticatedSiteAdapter["bootstrap"]>[4]){
    await browser.goto(this.authenticationEntryPoint.url,{waitUntil:"domcontentloaded"});
    let snapshot=await browser.waitForAuthenticationSurface!();
    if(/captcha/i.test(snapshot.visibleText)){
      if(!challenges)return this.detect(snapshot);
      const coordinated=await challenges.coordinator.coordinate({...challenges.binding,kind:"CAPTCHA",phase:"PRE_IDENTIFIER",validateFences:challenges.validateFences,reobserve:async()=>{snapshot=await browser.snapshot();return{challengePresent:/captcha/i.test(snapshot.visibleText),surfaceKind:"CAPTCHA"}}});
      return{...this.detect(snapshot),challengeKind:"CAPTCHA" as const,challengePhase:"PRE_IDENTIFIER" as const,challengeProviderOutcome:coordinated.record.state};
    }
    await browser.fillControl({role:"textbox",label:"Username"},credential.username);
    await browser.clickControl({role:"button",label:"Continue"});
    await browser.waitForPasswordSurface!();
    await browser.fillControl({role:"textbox",label:"Password"},credential.password);
    // No snapshot here on purpose: the executor must re-observe lazily after a mutation invalidated its handles.
    await browser.clickControl({role:"button",label:"Log in"});
    return this.detect(await browser.snapshot());
  }
}

export async function runBridgePreflight(config:BridgePreflightConfig,input:BridgePreflightInput):Promise<BridgePreflightResult>{
  const site=new URL(input.siteOrigin);if(site.origin!==input.siteOrigin||(site.protocol!=="https:"&&!config.allowLoopbackHttp))throw new Error("preflight site must be an exact HTTPS origin");
  if(!input.markers.identifier.startsWith("TEST_")||!input.markers.password.startsWith("TEST_"))throw new Error("preflight markers must be synthetic (TEST_ prefix)");
  const checks:BridgePreflightCheck[]=[];/** A body returns true to pass, false to fail, or a string (a bounded, non-secret reason) to fail with detail. */
  const check=async(name:string,body:()=>Promise<boolean|string>)=>{try{const value=await body();checks.push({name,pass:value===true,detail:typeof value==="string"?value:undefined})}catch(error){checks.push({name,pass:false,detail:codeOf(error)})}};
  const client=()=>new HttpAuthenticatedBrowserBridgeClient({url:config.url,serviceCredential:config.serviceCredential,fetch:config.fetch,allowLoopbackHttp:config.allowLoopbackHttp});
  const capability=(label:string,entryPath="/login",overrides:Partial<AuthenticatedBrowserExecutionCapability>={}):AuthenticatedBrowserExecutionCapability=>{const runId=makeId("preflight_run",label,crypto.randomUUID());const now=Date.now();return{bridgeExecutionId:makeId("bridge_execution",runId),bootstrapRequestId:makeId("preflight_request",runId),runId,tenantId:"account_preflight",ownerId:"account_preflight",profileId:makeId("authenticated_profile",label,crypto.randomUUID()),expectedProfileVersion:1,browserGeneration:1,authFlowId:makeId("auth_flow",runId),siteKind:"synthetic",authEntryPoint:`${site.origin}${entryPath}`,sessionProbeUrl:`${site.origin}/home`,allowedOrigins:[site.origin],writeOrigins:[site.origin],issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+120_000).toISOString(),operationBudget:40,...overrides}};
  const executorFor=(cap:AuthenticatedBrowserExecutionCapability)=>{const executor=new AuthenticatedBrowserBridgeExecutor(client(),()=>cap);return{executor,open:()=>executor.allocate({runId:cap.runId,tenantId:cap.tenantId,generation:cap.browserGeneration,allowedOrigins:cap.allowedOrigins})}};
  const call=(cap:AuthenticatedBrowserExecutionCapability,operation:string,extra:Record<string,unknown>={})=>client().execute({protocol:"v1",operationId:crypto.randomUUID(),capability:cap,operation,...extra} as AuthenticatedBrowserBridgeRequest);
  const expectCode=(name:string,operation:()=>Promise<unknown>,code:string)=>check(name,async()=>{try{await operation()}catch(error){return codeOf(error)===code?true:`expected ${code}, got ${codeOf(error)}`}return`expected ${code}, got success`});
  const raw=async(body:string,options:{secret?:string;timestamp?:string;nonce?:string;path?:string}={})=>{const url=new URL(config.url);if(options.path)url.pathname=options.path;const timestamp=options.timestamp??String(Date.now()),nonce=options.nonce??crypto.randomUUID();const signature=await signBrowserBridgeRequest(options.secret??config.serviceCredential,timestamp,nonce,body);const response=await(config.fetch??fetch)(url,{method:"POST",redirect:"error",signal:AbortSignal.timeout(30_000),headers:{"content-type":"application/json","x-distilled-bridge-timestamp":timestamp,"x-distilled-bridge-nonce":nonce,"x-distilled-bridge-signature":signature},body});let parsed:{protocol?:string;ok?:boolean;error?:{code?:string}}={};try{parsed=await response.json()}catch{}return{status:response.status,protocol:parsed.protocol,code:parsed.error?.code,ok:parsed.ok}};
  const seen=(result:{status:number;code?:string;ok?:boolean;protocol?:string})=>`observed ${result.status} ${result.code??(result.ok===true?"ok":"-")}`;
  /** Reports pass, or the observed status/code (never content) so a failure is diagnosable. */
  const expectRaw=(name:string,run:()=>Promise<{status:number;code?:string;ok?:boolean;protocol?:string}>,accept:(result:{status:number;code?:string;ok?:boolean;protocol?:string})=>boolean)=>check(name,async()=>{const result=await run();return accept(result)?true:seen(result)});
  const mustClose=async(executor:AuthenticatedBrowserBridgeExecutor,scope?:BrowserScope)=>{if(scope)await executor.close(scope).catch(()=>undefined)};

  switch(input.stage){
    case"AUTH_PROTOCOL":{
      const cap=capability("auth");const open=JSON.stringify({protocol:"v1",operationId:crypto.randomUUID(),capability:cap,operation:"OPEN_AUTH_BROWSER"});const close=JSON.stringify({protocol:"v1",operationId:crypto.randomUUID(),capability:cap,operation:"CLOSE_AUTH_BROWSER"});
      const nonce=crypto.randomUUID();let opened=false;
      await expectRaw("signed OPEN accepted; protocol v1 in response",()=>raw(open,{nonce}),result=>{opened=result.status===200&&result.ok===true;return opened&&result.protocol==="v1"});
      await expectRaw("replayed nonce rejected (BRIDGE_REPLAY_REJECTED)",()=>raw(open,{nonce}),result=>result.status===409&&result.code==="BRIDGE_REPLAY_REJECTED");
      await expectRaw("wrong credential rejected (BRIDGE_UNAUTHORIZED)",()=>raw(open,{secret:`${config.serviceCredential}x`}),result=>result.status===401&&result.code==="BRIDGE_UNAUTHORIZED");
      await expectRaw("stale timestamp rejected (BRIDGE_UNAUTHORIZED)",()=>raw(open,{timestamp:String(Date.now()-120_000)}),result=>result.status===401&&result.code==="BRIDGE_UNAUTHORIZED");
      await expectRaw("unsupported protocol version rejected",()=>raw(JSON.stringify({protocol:"v2",operationId:"x",capability:cap,operation:"OPEN_AUTH_BROWSER"})),result=>result.code==="BRIDGE_PROTOCOL_UNSUPPORTED");
      for(const operation of["EVALUATE_JAVASCRIPT","NAVIGATE","SCREENSHOT"])await expectRaw(`no generic endpoint: ${operation} unknown`,()=>raw(JSON.stringify({protocol:"v1",operationId:"x",capability:cap,operation,url:"https://example.invalid",selector:"#x"})),result=>result.code==="BRIDGE_OPERATION_UNKNOWN");
      await expectRaw("no other path is served",()=>raw(open,{path:"/v1/arbitrary-browser"}),result=>result.status===404);
      await expectRaw("execution CLOSE accepted",()=>opened?raw(close):Promise.resolve({status:0,code:"not opened"}),result=>result.ok===true);
      break;
    }
    case"FENCING":{
      const cap=capability("fence");const{executor,open}=executorFor(cap);let scope:BrowserScope|undefined;
      try{
        scope=await open();await call(cap,"NAVIGATE_AUTH_ENTRYPOINT");const surface=await call(cap,"OBSERVE_AUTH_SURFACE",{wait:"AUTH_SURFACE"}) as AuthenticatedBrowserSurface;
        const mutations:Array<[string,Partial<AuthenticatedBrowserExecutionCapability>]>=[["profile version",{expectedProfileVersion:99}],["browser generation",{browserGeneration:99}],["auth flow",{authFlowId:"auth_flow_other"}],["bootstrap request",{bootstrapRequestId:"request_other"}],["run",{runId:"run_other"}],["tenant",{tenantId:"tenant_other"}],["owner",{ownerId:"owner_other"}],["origins",{allowedOrigins:[site.origin,"https://example.invalid"]}],["operation budget",{operationBudget:64}],["execution id",{bridgeExecutionId:"bridge_execution_other"}]];
        for(const[label,override]of mutations)await expectCode(`fence rejects mutated ${label}`,()=>call({...cap,...override},"OBSERVE_AUTH_SURFACE"),"BRIDGE_FENCE_MISMATCH");
        const username=surface.controls.find(control=>control.label==="Username"),next=surface.controls.find(control=>control.label==="Continue");
        await check("synthetic observation returns opaque handles",async()=>!!username&&!!next&&!/username|input|#|\[/i.test(username.handle));
        if(username&&next){
          await expectCode("forged handle rejected (stale)",()=>call(cap,"INJECT_AUTH_FIELD",{fieldKind:"IDENTIFIER",fieldHandle:"handle_forged",pageRevision:surface.pageRevision,secretValue:"TEST_FORGED"}),"BRIDGE_OBSERVATION_STALE");
          await expectCode("stale revision rejected",()=>call(cap,"INJECT_AUTH_FIELD",{fieldKind:"IDENTIFIER",fieldHandle:username.handle,pageRevision:"stale_revision",secretValue:"TEST_STALE"}),"BRIDGE_OBSERVATION_STALE");
          await expectCode("semantic field mismatch rejected",()=>call(cap,"INJECT_AUTH_FIELD",{fieldKind:"PASSWORD",fieldHandle:username.handle,pageRevision:surface.pageRevision,secretValue:"TEST_MISMATCH"}),"BRIDGE_FENCE_MISMATCH");
          await expectCode("semantic control mismatch rejected",()=>call(cap,"ACTIVATE_AUTH_CONTROL",{controlKind:"LOGIN",controlHandle:next.handle,pageRevision:surface.pageRevision}),"BRIDGE_FENCE_MISMATCH");
        }
      }catch(error){checks.push({name:"fencing setup",pass:false,detail:codeOf(error)})}finally{await mustClose(executor,scope)}
      break;
    }
    case"LIFECYCLE":{
      const cap=capability("lifecycle");const adapter=new SyntheticBridgeAdapter(site.origin);const{executor,open}=executorFor(cap);let scope:BrowserScope|undefined;let state:Awaited<ReturnType<typeof executor.exportAuthenticatedSession>>|undefined;
      try{
        scope=await open();checks.push({name:"execution OPEN",pass:true});
        await check("synthetic secret injection path: identifier and password injected, authenticated",async()=>(await executor.establishAuthenticatedSession(scope!,adapter,{username:input.markers.identifier,password:input.markers.password})).state==="ACTIVE");
        await check("session captured and returned",async()=>{state=await executor.exportAuthenticatedSession(scope!);return state.cookies.some(cookie=>cookie.name==="auth_session"&&cookie.value.length>0)});
      }catch(error){checks.push({name:"lifecycle",pass:false,detail:codeOf(error)})}finally{await mustClose(executor,scope)}
      await check("execution CLOSE",async()=>scope?(await executor.health(scope))==="closed":false);
      if(state){
        const second=capability("transfer");const two=executorFor(second);let restored:BrowserScope|undefined;
        try{
          restored=await two.executor.allocate({runId:second.runId,tenantId:second.tenantId,generation:1,allowedOrigins:second.allowedOrigins,authenticatedSessionState:state});
          await check("session restored into a fresh isolated browser and verified via session probe",async()=>{await two.executor.navigate(restored!,`${site.origin}/home`);return(await two.executor.detectAuthenticatedState(restored!,adapter)).state==="ACTIVE"});
        }catch(error){checks.push({name:"session transfer",pass:false,detail:codeOf(error)})}finally{await mustClose(two.executor,restored)}
      }
      break;
    }
    case"CHALLENGE":{
      const cap=capability("challenge","/captcha");const adapter=new SyntheticBridgeAdapter(site.origin,"/captcha");const{executor,open}=executorFor(cap);let scope:BrowserScope|undefined;
      const store=new InMemoryAuthenticationChallengeStore();const provider=new DetectOnlyBrowserChallengeProvider("self_hosted_chromium");const coordinator=new ChallengeCoordinator(store,provider,{overallTimeoutMs:5_000,pollingIntervalMs:50});
      try{
        scope=await open();
        await check("provider CAPTCHA capability is DETECT_ONLY",async()=>provider.capabilities().CAPTCHA==="DETECT_ONLY");
        await check("CAPTCHA detected, coordinated as UNSUPPORTED, CHALLENGE_REQUIRED",async()=>{const detection=await executor.establishAuthenticatedSession(scope!,adapter,{username:input.markers.identifier,password:input.markers.password},undefined,undefined,{coordinator,binding:{runId:cap.runId,bootstrapRequestId:cap.bootstrapRequestId,tenantId:cap.tenantId,ownerId:cap.ownerId,profileId:cap.profileId,profileVersion:1,browserGeneration:1,authFlowId:cap.authFlowId,expiresAt:cap.expiresAt},validateFences:async()=>true});const record=[...store.records.values()][0];return detection.state==="CHALLENGE_REQUIRED"&&detection.challengeProviderOutcome==="UNSUPPORTED"&&record?.state==="UNSUPPORTED"&&record.resolutionOutcome==="DETECT_ONLY"});
      }catch(error){checks.push({name:"challenge",pass:false,detail:codeOf(error)})}finally{await mustClose(executor,scope)}
      break;
    }
    case"REDIRECT":{
      // allowed origin → 307 → disallowed origin, with a marker POST body. The operator independently reads the foreign server's counters.
      for(const[label,path]of[["POST 307 with marker body","/form-307"],["GET 302","/to-foreign"]] as const){
        const cap=capability(`redirect${path.replace(/\W/g,"_")}`,path);const{executor,open}=executorFor(cap);let scope:BrowserScope|undefined;
        try{
          scope=await open();
          await expectCode(`${label}: redirect to disallowed origin denied`,()=>call(cap,"NAVIGATE_AUTH_ENTRYPOINT"),"BRIDGE_NETWORK_POLICY_DENIED");
          await expectCode(`${label}: execution terminated, nothing further runs`,()=>call(cap,"OBSERVE_AUTH_SURFACE"),"BRIDGE_EXECUTION_EXPIRED");
        }catch(error){checks.push({name:`${label}: setup`,pass:false,detail:codeOf(error)})}finally{await mustClose(executor,scope)}
      }
      break;
    }
    case"CLEANUP":{
      const wait=Math.min(Math.max(input.idleWaitMs??35_000,1_000),60_000);
      const abandoned=capability("abandoned");const one=executorFor(abandoned);
      try{
        await one.open();
        await new Promise(resolve=>setTimeout(resolve,wait));
        await expectCode("abandoned execution is reaped after the idle lease",()=>call(abandoned,"OBSERVE_AUTH_SURFACE"),"BRIDGE_EXECUTION_EXPIRED");
      }catch(error){checks.push({name:"abandoned execution",pass:false,detail:codeOf(error)})}
      const cancelled=capability("cancelled");const controller=new AbortController();const executor=new AuthenticatedBrowserBridgeExecutor(client(),()=>cancelled);
      try{
        const scope=await executor.allocate({runId:cancelled.runId,tenantId:cancelled.tenantId,generation:1,allowedOrigins:cancelled.allowedOrigins,signal:controller.signal});
        controller.abort();await new Promise(resolve=>setTimeout(resolve,1_500));
        await check("Worker cancellation closes the remote browser",async()=>(await executor.health(scope))==="closed");
        await expectCode("cancelled execution no longer usable",()=>call(cancelled,"OBSERVE_AUTH_SURFACE"),"BRIDGE_EXECUTION_EXPIRED");
      }catch(error){checks.push({name:"worker cancellation",pass:false,detail:codeOf(error)})}
      break;
    }
  }
  const secrets=[input.markers.identifier,input.markers.password,config.serviceCredential];
  const rendered=JSON.stringify(checks);checks.push({name:"result carries no marker or credential",pass:!secrets.some(secret=>rendered.includes(secret))});
  return{stage:input.stage,pass:checks.every(entry=>entry.pass),protocol:"v1",checks};
}
function codeOf(error:unknown){return error instanceof AuthenticatedBrowserBridgeError?error.code:error instanceof Error?`ERROR:${error.name}`:"ERROR"}
