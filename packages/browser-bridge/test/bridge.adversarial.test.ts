import {describe,expect,it} from "vitest";
import {
  AuthenticatedBrowserBridgeError,
  AuthenticatedBrowserBridgeExecutor,
  BRIDGE_MAX_REQUEST_BYTES,
  BRIDGE_MAX_SECRET_CHARS,
  BRIDGE_MAX_STORAGE_STATE_BYTES,
  HttpAuthenticatedBrowserBridgeClient,
  type AuthenticatedBrowserBridgeRequest,
  type AuthenticatedBrowserExecutionCapability,
  type BrowserSessionState
} from "@distilled/agent-runtime";
import {AuthenticatedBrowserBridgeService} from "../src/service";
import {BRIDGE_URL,MockBrowserProvider,TEST_SECRET,baseCapability,req,send,signedRequest} from "./support";

const newService=(options:Partial<ConstructorParameters<typeof AuthenticatedBrowserBridgeService>[0]>={},mock=new MockBrowserProvider())=>({mock,service:new AuthenticatedBrowserBridgeService({serviceCredential:TEST_SECRET,provider:mock,...options})});
const open=async(service:AuthenticatedBrowserBridgeService,cap=baseCapability())=>{const result=await send(service,req("OPEN_AUTH_BROWSER",cap,"op_open"));expect(result.status).toBe(200);return cap};

describe("service authentication",()=>{
  it("rejects unauthorized requests: missing headers, bad signature, wrong secret",async()=>{
    const {service}=newService();const payload=req("OPEN_AUTH_BROWSER",baseCapability(),"op_1");
    const missing=await service.handle(new Request(BRIDGE_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)}));
    expect(missing.status).toBe(401);expect(await missing.json()).toMatchObject({ok:false,error:{code:"BRIDGE_UNAUTHORIZED"}});
    expect(await send(service,payload,{signature:"bad_signature_deadbeef"})).toMatchObject({status:401,json:{error:{code:"BRIDGE_UNAUTHORIZED"}}});
    expect(await send(service,payload,{secret:"wrong_secret_key_12345"})).toMatchObject({status:401,json:{error:{code:"BRIDGE_UNAUTHORIZED"}}});
  });

  it("rejects a signature bound to a different body (tampered payload)",async()=>{
    const {service}=newService();const good=req("OPEN_AUTH_BROWSER",baseCapability(),"op_1");const tampered=req("OPEN_AUTH_BROWSER",baseCapability({profileId:"profile_other"}),"op_1");
    const original=await signedRequest(good);
    const forged=new Request(BRIDGE_URL,{method:"POST",headers:original.headers,body:JSON.stringify(tampered)});
    expect((await service.handle(forged)).status).toBe(401);
  });

  it("rejects expired and future-dated timestamps",async()=>{
    const now=Date.now();const {service}=newService({clock:()=>now});const payload=req("OPEN_AUTH_BROWSER",baseCapability(),"op_1");
    expect((await send(service,payload,{timestamp:String(now-40_000)})).status).toBe(401);
    expect((await send(service,payload,{timestamp:String(now+40_000)})).status).toBe(401);
  });

  it("rejects replayed nonces and prunes them after the request window",async()=>{
    let clock=Date.now();const {service}=newService({clock:()=>clock,requestWindowMs:30_000});
    const cap=baseCapability({issuedAt:new Date(clock).toISOString(),expiresAt:new Date(clock+120_000).toISOString()});const nonce="fixed_nonce_123";
    expect((await send(service,req("OPEN_AUTH_BROWSER",cap,"op_open"),{timestamp:String(clock),nonce})).status).toBe(200);
    expect(await send(service,req("OPEN_AUTH_BROWSER",cap,"op_open"),{timestamp:String(clock+1_000),nonce})).toMatchObject({status:409,json:{error:{code:"BRIDGE_REPLAY_REJECTED"}}});
    clock+=35_000;
    const second=baseCapability({profileId:"profile_002",bridgeExecutionId:"bridge_exec_002",issuedAt:new Date(clock).toISOString(),expiresAt:new Date(clock+120_000).toISOString()});
    expect((await send(service,req("OPEN_AUTH_BROWSER",second,"op_open_2"),{timestamp:String(clock),nonce})).status).toBe(200);
  });

  it("does not reveal replay state to unauthenticated callers (signature is verified before the nonce lookup)",async()=>{
    const {service}=newService();const payload=req("OPEN_AUTH_BROWSER",baseCapability(),"op_1");const nonce="probe_nonce";
    expect((await send(service,payload,{nonce})).status).toBe(200);
    expect((await send(service,payload,{nonce,secret:"wrong_secret_key_12345"})).json.error?.code).toBe("BRIDGE_UNAUTHORIZED");
  });

  it("accepts native-container ingress only on its distinct private route and preserves operation-id idempotency",async()=>{
    const {service,mock}=newService();const payload=req("OPEN_AUTH_BROWSER",baseCapability(),"container_open");
    const internalUrl="http://127.0.0.1:8080/v1/internal-authenticated-browser";
    const first=await service.handleInternal(new Request(internalUrl,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)}));
    const second=await service.handleInternal(new Request(internalUrl,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)}));
    expect(first.status).toBe(200);expect(second.status).toBe(200);expect(mock.allocations).toBe(1);
    expect((await service.handleInternal(new Request("http://127.0.0.1:8080/v1/arbitrary-browser",{method:"POST",body:"{}"}))).status).toBe(404);
    expect((await service.handle(new Request(internalUrl,{method:"POST",body:JSON.stringify(payload)}))).status).toBe(404);
  });
});

describe("protocol surface",()=>{
  it("rejects unsupported protocol versions, unknown operations and unexpected paths/methods",async()=>{
    const {service}=newService();const cap=baseCapability();
    expect(await send(service,{protocol:"v2",operationId:"op_1",capability:cap,operation:"OPEN_AUTH_BROWSER"})).toMatchObject({status:400,json:{error:{code:"BRIDGE_PROTOCOL_UNSUPPORTED"}}});
    for(const operation of["EVALUATE_JAVASCRIPT","NAVIGATE","CLICK","SCREENSHOT","GET_COOKIES","GET_HTML","SET_CONTENT"])
      expect(await send(service,{protocol:"v1",operationId:"op_1",capability:cap,operation,url:"https://evil.example",selector:"#x",script:"1"}),operation).toMatchObject({status:400,json:{error:{code:"BRIDGE_OPERATION_UNKNOWN"}}});
    expect((await service.handle(await signedRequest({},{url:"http://127.0.0.1:8789/v1/arbitrary-browser"}))).status).toBe(404);
    expect((await service.handle(new Request(BRIDGE_URL,{method:"GET"}))).status).toBe(404);
  });

  it("rejects malformed or semantically invalid operation payloads without touching the browser",async()=>{
    const {service,mock}=newService();const cap=await open(service);
    const bad:Array<[string,Record<string,unknown>]>=[
      ["INJECT_AUTH_FIELD",{fieldKind:"OTHER",fieldHandle:"h",pageRevision:"rev_1",secretValue:"x"}],
      ["INJECT_AUTH_FIELD",{fieldKind:"IDENTIFIER",fieldHandle:"h",pageRevision:"rev_1"}],
      ["INJECT_AUTH_FIELD",{fieldKind:"IDENTIFIER",fieldHandle:"h",pageRevision:"rev_1",secretValue:"x".repeat(BRIDGE_MAX_SECRET_CHARS+1)}],
      ["ACTIVATE_AUTH_CONTROL",{controlKind:"CLICK_ANYTHING",controlHandle:"h",pageRevision:"rev_1"}],
      ["ACTIVATE_AUTH_CONTROL",{controlKind:"NEXT",controlHandle:"",pageRevision:"rev_1"}],
      ["NAVIGATE_AUTH_ENTRYPOINT",{destination:"https://evil.example/"}],
      ["OBSERVE_AUTH_SURFACE",{wait:"input[type=password]"}]
    ];
    for(const [operation,extra] of bad){const result=await send(service,req(operation,cap,`op_bad_${operation}_${Math.random()}`,extra));expect(result,operation).toMatchObject({status:400,json:{ok:false,error:{code:"BRIDGE_FENCE_MISMATCH"}}})}
    expect(mock.injectedFields).toHaveLength(0);expect(mock.activatedControls).toHaveLength(0);expect(mock.navigations).toHaveLength(0);
  });

  it("navigation is capability-bound: the caller never supplies a URL",async()=>{
    const {service,mock}=newService();const cap=await open(service);
    expect((await send(service,req("NAVIGATE_AUTH_ENTRYPOINT",cap,"op_nav_1"))).status).toBe(200);
    expect((await send(service,req("NAVIGATE_AUTH_ENTRYPOINT",cap,"op_nav_2",{destination:"SESSION_PROBE"}))).status).toBe(200);
    expect(mock.navigations).toEqual([{url:cap.authEntryPoint,writeOrigins:cap.writeOrigins},{url:cap.sessionProbeUrl,writeOrigins:cap.writeOrigins}]);
  });

  it("rejects capabilities whose entrypoint, probe or write origins fall outside the allowed origins",async()=>{
    const {service,mock}=newService();
    for(const [label,cap] of Object.entries({
      entrypoint:baseCapability({authEntryPoint:"https://evil.example/login"}),
      probe:baseCapability({sessionProbeUrl:"https://evil.example/home"}),
      writes:baseCapability({writeOrigins:["https://evil.example"]}),
      nonCanonicalOrigin:baseCapability({allowedOrigins:["https://auth.example.com/"]}),
      credentialsInUrl:baseCapability({authEntryPoint:"https://user:pw@auth.example.com/login"}),
      noOrigins:baseCapability({allowedOrigins:[],writeOrigins:[]})
    }))expect(await send(service,req("OPEN_AUTH_BROWSER",cap,"op_open")),label).toMatchObject({status:400,json:{error:{code:"BRIDGE_FENCE_MISMATCH"}}});
    expect(mock.allocations).toBe(0);
  });

  it("rejects oversized request payloads, including bodies that lie about or omit content-length",async()=>{
    const {service}=newService();const oversized="x".repeat(BRIDGE_MAX_REQUEST_BYTES+100);
    const declared=new Request(BRIDGE_URL,{method:"POST",headers:{"content-length":String(oversized.length),"x-distilled-bridge-timestamp":String(Date.now()),"x-distilled-bridge-nonce":crypto.randomUUID(),"x-distilled-bridge-signature":"sig"},body:oversized});
    expect(await (await service.handle(declared)).json()).toMatchObject({error:{code:"BRIDGE_PAYLOAD_TOO_LARGE"}});
    const chunk=new TextEncoder().encode("y".repeat(64_000));let sent=0;
    const stream=new ReadableStream<Uint8Array>({pull(controller){if(sent++>8)controller.close();else controller.enqueue(chunk)}});
    const streamed=new Request(BRIDGE_URL,{method:"POST",body:stream,duplex:"half"} as RequestInit);
    expect((await service.handle(streamed)).status).toBe(413);
  });

  it("bounds session restore state",async()=>{
    const {service,mock}=newService();const cap=await open(service);
    const state:BrowserSessionState={cookies:[],origins:[{origin:"https://auth.example.com",localStorage:[{name:"big",value:"y".repeat(BRIDGE_MAX_STORAGE_STATE_BYTES+10)}]}]};
    expect(await send(service,req("RESTORE_AUTH_STATE",cap,"op_restore_big",{state}))).toMatchObject({status:400,json:{error:{code:"BRIDGE_PAYLOAD_TOO_LARGE"}}});
    expect(mock.attachedState).toBeUndefined();
  });

  it("bounds captured session state",async()=>{
    class BigCapture extends MockBrowserProvider{override async exportAuthenticatedSession(){return{cookies:[],origins:[{origin:"https://auth.example.com",localStorage:[{name:"big",value:"z".repeat(BRIDGE_MAX_STORAGE_STATE_BYTES+10)}]}]}}}
    const {service}=newService({},new BigCapture());const cap=await open(service);
    expect(await send(service,req("CAPTURE_AUTH_STATE",cap,"op_capture"))).toMatchObject({status:400,json:{error:{code:"BRIDGE_PAYLOAD_TOO_LARGE"}}});
  });

  it("bounds observations",async()=>{
    class BigObservation extends MockBrowserProvider{override async observeAuthenticationSurface(){return{url:"https://auth.example.com/login",title:"t",pageRevision:"r",challengeState:"NO_CHALLENGE" as const,visibleText:"v".repeat(200_000),controls:[]}}}
    const {service}=newService({},new BigObservation());const cap=await open(service);
    expect(await send(service,req("OBSERVE_AUTH_SURFACE",cap,"op_observe"))).toMatchObject({status:400,json:{error:{code:"BRIDGE_PAYLOAD_TOO_LARGE"}}});
  });
});

describe("execution fencing",()=>{
  it("enforces capability immutability after OPEN: each mutated fence is rejected individually",async()=>{
    const {service}=newService();const authoritative=await open(service);
    const mutations:Array<[string,Partial<AuthenticatedBrowserExecutionCapability>]>=[
      ["bridgeExecutionId",{bridgeExecutionId:"bridge_exec_mutated"}],
      ["bootstrapRequestId",{bootstrapRequestId:"bootstrap_req_mutated"}],
      ["runId",{runId:"run_mutated"}],
      ["tenantId",{tenantId:"account_tenant_mutated"}],
      ["ownerId",{ownerId:"account_owner_mutated"}],
      ["profileId",{profileId:"profile_mutated"}],
      ["expectedProfileVersion",{expectedProfileVersion:99}],
      ["browserGeneration",{browserGeneration:99}],
      ["authFlowId",{authFlowId:"auth_flow_mutated"}],
      ["siteKind",{siteKind:"x_mutated"}],
      ["authEntryPoint",{authEntryPoint:"https://auth.example.com/other"}],
      ["sessionProbeUrl",{sessionProbeUrl:"https://auth.example.com/other-home"}],
      ["allowedOrigins",{allowedOrigins:["https://auth.example.com","https://cdn.example.com"]}],
      ["writeOrigins",{writeOrigins:[]}],
      ["issuedAt",{issuedAt:new Date(Date.now()-60_000).toISOString()}],
      ["expiresAt",{expiresAt:new Date(Date.now()+600_000).toISOString()}],
      ["operationBudget",{operationBudget:42}]
    ];
    for(const [field,mutation] of mutations){
      const result=await send(service,req("OBSERVE_AUTH_SURFACE",{...authoritative,...mutation},`op_observe_${field}`));
      expect(result,`mutation of ${field}`).toMatchObject({status:400,json:{ok:false,error:{code:"BRIDGE_FENCE_MISMATCH"}}});
    }
  });

  it("rejects OPEN for a profile that already has an active execution at the same or newer generation",async()=>{
    const {service}=newService();await open(service);
    const rival=baseCapability({bridgeExecutionId:"bridge_exec_rival",runId:"run_rival"});
    expect(await send(service,req("OPEN_AUTH_BROWSER",rival,"op_rival"))).toMatchObject({status:400,json:{error:{code:"BRIDGE_FENCE_MISMATCH"}}});
  });

  it("collapses concurrent OPENs of one execution into a single browser allocation",async()=>{
    const mock=new MockBrowserProvider();mock.allocateDelayMs=40;const {service}=newService({},mock);const cap=baseCapability();
    const results=await Promise.all([1,2,3].map(index=>send(service,req("OPEN_AUTH_BROWSER",cap,`op_open_${index}`))));
    expect(results.map(result=>result.status)).toEqual([200,200,200]);expect(mock.allocations).toBe(1);
  });

  it("caps concurrent executions",async()=>{
    const {service}=newService({maxExecutions:1});await open(service);
    const second=baseCapability({bridgeExecutionId:"bridge_exec_2",profileId:"profile_2",runId:"run_2"});
    expect(await send(service,req("OPEN_AUTH_BROWSER",second,"op_open_2"))).toMatchObject({status:503,json:{error:{code:"BRIDGE_UNAVAILABLE"}}});
  });

  it("enforces the operation budget and capability expiry",async()=>{
    let clock=Date.now();const {service}=newService({clock:()=>clock});const cap=baseCapability({operationBudget:2,issuedAt:new Date(clock).toISOString(),expiresAt:new Date(clock+10_000).toISOString()});
    expect((await send(service,req("OPEN_AUTH_BROWSER",cap,"op_1"))).status).toBe(200);
    expect((await send(service,req("OBSERVE_AUTH_SURFACE",cap,"op_2"))).status).toBe(200);
    expect(await send(service,req("OBSERVE_AUTH_SURFACE",cap,"op_3"))).toMatchObject({status:400,json:{error:{code:"BRIDGE_EXECUTION_EXPIRED"}}});
    clock+=20_000;
    expect(await send(service,req("OBSERVE_AUTH_SURFACE",cap,"op_4"))).toMatchObject({status:400,json:{error:{code:"BRIDGE_EXECUTION_EXPIRED"}}});
  });

  it("does not resurrect a closed execution",async()=>{
    const {service,mock}=newService();const cap=await open(service);
    expect((await send(service,req("CLOSE_AUTH_BROWSER",cap,"op_close"))).status).toBe(200);
    expect(mock.closed).toBe(true);
    expect((await send(service,req("CLOSE_AUTH_BROWSER",cap,"op_close_again"))).json).toMatchObject({ok:true,result:{closed:true}});
    expect(await send(service,req("OBSERVE_AUTH_SURFACE",cap,"op_after"))).toMatchObject({json:{error:{code:"BRIDGE_EXECUTION_EXPIRED"}}});
    expect(await send(service,req("OPEN_AUTH_BROWSER",cap,"op_reopen"))).toMatchObject({json:{error:{code:"BRIDGE_EXECUTION_EXPIRED"}}});
  });
});

describe("observation handles and semantic checks",()=>{
  it("fails forged handles, stale revisions and semantic mismatches with typed codes",async()=>{
    const {service,mock}=newService();const cap=await open(service);
    const inject=(id:string,extra:Record<string,unknown>)=>send(service,req("INJECT_AUTH_FIELD",cap,id,{fieldKind:"IDENTIFIER",fieldHandle:"handle_valid_user",pageRevision:"rev_1",secretValue:"s",...extra}));
    expect(await inject("op_forged",{fieldHandle:"forged_random_handle"})).toMatchObject({status:400,json:{error:{code:"BRIDGE_OBSERVATION_STALE"}}});
    expect(await inject("op_stale",{pageRevision:"rev_0"})).toMatchObject({status:400,json:{error:{code:"BRIDGE_OBSERVATION_STALE"}}});
    expect(await inject("op_field_mismatch",{fieldKind:"PASSWORD"})).toMatchObject({status:400,json:{error:{code:"BRIDGE_FENCE_MISMATCH"}}});
    const activate=(id:string,extra:Record<string,unknown>)=>send(service,req("ACTIVATE_AUTH_CONTROL",cap,id,{controlKind:"NEXT",controlHandle:"handle_valid_next",pageRevision:"rev_1",...extra}));
    expect(await activate("op_control_mismatch",{controlKind:"LOGIN"})).toMatchObject({status:400,json:{error:{code:"BRIDGE_FENCE_MISMATCH"}}});
    expect(await activate("op_control_forged",{controlHandle:"forged"})).toMatchObject({status:400,json:{error:{code:"BRIDGE_OBSERVATION_STALE"}}});
    expect(mock.injectedFields).toHaveLength(0);expect(mock.activatedControls).toHaveLength(0);
  });
});

describe("idempotency and effect certainty",()=>{
  it("returns the recorded outcome for a repeated mutation without executing it again",async()=>{
    const {service,mock}=newService();const cap=await open(service);
    const inject=req("INJECT_AUTH_FIELD",cap,"op_inject_1",{fieldKind:"IDENTIFIER",fieldHandle:"handle_valid_user",pageRevision:"rev_1",secretValue:"user123"});
    expect((await send(service,inject)).status).toBe(200);expect(mock.injectedFields).toHaveLength(1);
    expect(await send(service,inject)).toMatchObject({status:200,json:{ok:true,result:{accepted:true}}});expect(mock.injectedFields).toHaveLength(1);
    const control=req("ACTIVATE_AUTH_CONTROL",cap,"op_control_1",{controlKind:"NEXT",controlHandle:"handle_valid_next",pageRevision:"rev_1"});
    expect((await send(service,control)).status).toBe(200);expect((await send(service,control)).status).toBe(200);expect(mock.activatedControls).toHaveLength(1);
  });

  it("collapses concurrent duplicates of a secret-bearing mutation into one execution",async()=>{
    const {service,mock}=newService();const cap=await open(service);
    const inject=req("INJECT_AUTH_FIELD",cap,"op_inject_dup",{fieldKind:"IDENTIFIER",fieldHandle:"handle_valid_user",pageRevision:"rev_1",secretValue:"user123"});
    const results=await Promise.all([send(service,inject),send(service,inject),send(service,inject)]);
    expect(results.map(result=>result.status)).toEqual([200,200,200]);expect(mock.injectedFields).toHaveLength(1);
  });

  it("refuses to reuse an operationId for a different request",async()=>{
    const {service,mock}=newService();const cap=await open(service);
    await send(service,req("INJECT_AUTH_FIELD",cap,"op_same",{fieldKind:"IDENTIFIER",fieldHandle:"handle_valid_user",pageRevision:"rev_1",secretValue:"user123"}));
    expect(await send(service,req("ACTIVATE_AUTH_CONTROL",cap,"op_same",{controlKind:"NEXT",controlHandle:"handle_valid_next",pageRevision:"rev_1"}))).toMatchObject({json:{error:{code:"BRIDGE_FENCE_MISMATCH"}}});
    expect(mock.activatedControls).toHaveLength(0);
  });

  it("classifies an unexplained failure during a mutation as EFFECT_UNKNOWN and never re-executes it",async()=>{
    const {service,mock}=newService();const cap=await open(service);
    mock.failNextInject=new Error("Target page, context or browser has been closed");
    const inject=req("INJECT_AUTH_FIELD",cap,"op_unknown",{fieldKind:"IDENTIFIER",fieldHandle:"handle_valid_user",pageRevision:"rev_1",secretValue:"user123"});
    expect(await send(service,inject)).toMatchObject({status:409,json:{error:{code:"BRIDGE_EFFECT_UNKNOWN"}}});
    expect(await send(service,inject)).toMatchObject({status:409,json:{error:{code:"BRIDGE_EFFECT_UNKNOWN"}}});
    expect(mock.injectedFields).toHaveLength(0);
  });

  it("classifies an unexplained failure during a read as BROWSER_FAILURE (safe to repeat)",async()=>{
    class Broken extends MockBrowserProvider{override async observeAuthenticationSurface():Promise<never>{throw new Error("boom")}}
    const {service}=newService({},new Broken());const cap=await open(service);
    expect(await send(service,req("OBSERVE_AUTH_SURFACE",cap,"op_observe"))).toMatchObject({json:{error:{code:"BRIDGE_BROWSER_FAILURE"}}});
  });

  it("never echoes provider error text",async()=>{
    const {service,mock}=newService();const cap=await open(service);mock.failNextInject=new Error("SENSITIVE_PROVIDER_TEXT https://internal.example/path");
    const response=await service.handle(await signedRequest(req("INJECT_AUTH_FIELD",cap,"op_leak",{fieldKind:"IDENTIFIER",fieldHandle:"handle_valid_user",pageRevision:"rev_1",secretValue:"s"})));
    expect(await response.text()).not.toMatch(/SENSITIVE_PROVIDER_TEXT|internal\.example/);
  });
});

describe("transport loss and client behaviour",()=>{
  const client=(service:AuthenticatedBrowserBridgeService,onCall:(request:AuthenticatedBrowserBridgeRequest)=>void,lose:(request:AuthenticatedBrowserBridgeRequest)=>boolean)=>new HttpAuthenticatedBrowserBridgeClient({url:"https://bridge.example.test/v1/authenticated-browser",serviceCredential:TEST_SECRET,fetch:async(_url,init)=>{const request=JSON.parse(String(init?.body)) as AuthenticatedBrowserBridgeRequest;onCall(request);const response=await service.handle(new Request(BRIDGE_URL,{method:"POST",headers:init?.headers,body:init?.body as string}));if(lose(request))throw new TypeError("connection reset after dispatch");return response}});

  it("turns transport loss after a mutation into EFFECT_UNKNOWN, and the executor does not retry it",async()=>{
    const {service,mock}=newService();const calls:string[]=[];
    const transport=client(service,request=>calls.push(request.operation),request=>request.operation==="INJECT_AUTH_FIELD");
    const cap=baseCapability();
    await expect(transport.execute(req("INJECT_AUTH_FIELD",cap,"op_lost",{fieldKind:"IDENTIFIER",fieldHandle:"h",pageRevision:"rev_1",secretValue:"s"}))).rejects.toMatchObject({code:"BRIDGE_EFFECT_UNKNOWN"});
    const executor=new AuthenticatedBrowserBridgeExecutor(transport,()=>cap);const scope=await executor.allocate({runId:cap.runId,tenantId:cap.tenantId,generation:1,allowedOrigins:cap.allowedOrigins});
    calls.length=0;
    await expect(executor.establishAuthenticatedSession(scope,{siteFamily:"generic",allowedOrigins:cap.allowedOrigins,loginOrigin:cap.allowedOrigins[0],authenticationEntryPoint:{kind:"T",url:cap.authEntryPoint},detect:()=>({state:"ACTIVE",reason:"x"}),bootstrap:async browser=>{await browser.goto(cap.authEntryPoint);const snapshot=await browser.waitForAuthenticationSurface!();expect(snapshot.controls.length).toBeGreaterThan(0);await browser.fillControl({role:"textbox",label:"Username"},"synthetic");return{state:"ACTIVE",reason:"unreachable"}}},{username:"u",password:"p"})).rejects.toMatchObject({code:"BRIDGE_EFFECT_UNKNOWN"});
    expect(calls.filter(operation=>operation==="INJECT_AUTH_FIELD")).toHaveLength(1);
    expect(mock.injectedFields.length).toBe(1);
  });

  it("turns transport loss on a read into UNAVAILABLE",async()=>{
    const {service}=newService();const transport=client(service,()=>undefined,request=>request.operation==="OBSERVE_AUTH_SURFACE");const cap=baseCapability();
    await transport.execute(req("OPEN_AUTH_BROWSER",cap,"op_open"));
    await expect(transport.execute(req("OBSERVE_AUTH_SURFACE",cap,"op_observe"))).rejects.toMatchObject({code:"BRIDGE_UNAVAILABLE"});
  });

  it("treats non-protocol, oversized or redirecting responses as unknown outcomes rather than authentication results",async()=>{
    const make=(fetch:typeof globalThis.fetch)=>new HttpAuthenticatedBrowserBridgeClient({url:"https://bridge.example.test/v1/authenticated-browser",serviceCredential:TEST_SECRET,fetch});
    const cap=baseCapability();const inject=req("INJECT_AUTH_FIELD",cap,"op",{fieldKind:"IDENTIFIER",fieldHandle:"h",pageRevision:"r",secretValue:"s"});const observe=req("OBSERVE_AUTH_SURFACE",cap,"op");
    await expect(make(async()=>new Response("<html>502 Bad Gateway</html>",{status:502})).execute(inject)).rejects.toMatchObject({code:"BRIDGE_EFFECT_UNKNOWN"});
    await expect(make(async()=>new Response("<html>502 Bad Gateway</html>",{status:502})).execute(observe)).rejects.toMatchObject({code:"BRIDGE_UNAVAILABLE"});
    await expect(make(async()=>new Response(JSON.stringify({protocol:"v1",ok:false,error:{code:"WRONG_PASSWORD"}}))).execute(inject)).rejects.toMatchObject({code:"BRIDGE_EFFECT_UNKNOWN"});
    await expect(make(async()=>new Response("x".repeat(600_000))).execute(observe)).rejects.toMatchObject({code:"BRIDGE_UNAVAILABLE"});
    await expect(make(async()=>new Response(JSON.stringify({protocol:"v2",ok:true,result:{}}))).execute(observe)).rejects.toMatchObject({code:"BRIDGE_UNAVAILABLE"});
  });

  it("uses only fetch redirect modes the Workers runtime accepts, and refuses any redirect instead of following it",async()=>{
    const modes:unknown[]=[];const cap=baseCapability();
    const make=(response:()=>Response)=>new HttpAuthenticatedBrowserBridgeClient({url:"https://bridge.example.test/v1/authenticated-browser",serviceCredential:TEST_SECRET,fetch:async(_url,init)=>{modes.push(init?.redirect);return response()}});
    // A redirect that carries a plausible protocol envelope must still be refused (the signed request would otherwise leave the bridge).
    const redirecting=()=>new Response(JSON.stringify({protocol:"v1",ok:true,result:{accepted:true}}),{status:307,headers:{location:"https://evil.example/collect"}});
    await expect(make(redirecting).execute(req("INJECT_AUTH_FIELD",cap,"op",{fieldKind:"IDENTIFIER",fieldHandle:"h",pageRevision:"r",secretValue:"s"}))).rejects.toMatchObject({code:"BRIDGE_EFFECT_UNKNOWN"});
    await expect(make(redirecting).execute(req("OBSERVE_AUTH_SURFACE",cap,"op"))).rejects.toMatchObject({code:"BRIDGE_UNAVAILABLE"});
    expect(modes.every(mode=>mode==="manual"||mode==="follow")).toBe(true);expect(modes).not.toContain("error");expect(modes).not.toContain("follow");
  });

  it("never lets an infrastructure failure look like an authentication outcome",async()=>{
    for(const code of["BRIDGE_UNAVAILABLE","BRIDGE_UNAUTHORIZED","BRIDGE_EFFECT_UNKNOWN","BRIDGE_BROWSER_FAILURE"] as const){
      const transport=new HttpAuthenticatedBrowserBridgeClient({url:"https://bridge.example.test/v1/authenticated-browser",serviceCredential:TEST_SECRET,fetch:async()=>new Response(JSON.stringify({protocol:"v1",ok:false,error:{code}}),{status:400})});
      const error=await transport.execute(req("OBSERVE_AUTH_SURFACE",baseCapability(),"op")).catch(reason=>reason);
      expect(error).toBeInstanceOf(AuthenticatedBrowserBridgeError);expect((error as AuthenticatedBrowserBridgeError).code).toBe(code);expect(String(error.message)).not.toMatch(/captcha|password|challenge/i);
    }
  });

  it("enforces transport policy: HTTPS outside explicit loopback development, no URL credentials, and production guards",async()=>{
    const build=(url:string,allowLoopbackHttp?:boolean)=>()=>new HttpAuthenticatedBrowserBridgeClient({url,serviceCredential:TEST_SECRET,allowLoopbackHttp});
    expect(build("http://bridge.example.test/v1/authenticated-browser")).toThrow(/HTTPS/);
    expect(build("http://bridge.example.test/v1/authenticated-browser",true)).toThrow(/HTTPS/);
    expect(build("http://127.0.0.1:8789/v1/authenticated-browser")).toThrow(/HTTPS/);
    expect(build("http://127.0.0.1:8789/v1/authenticated-browser",true)).not.toThrow();
    expect(build("https://u:p@bridge.example.test/v1/authenticated-browser")).toThrow(/credentials/);
    expect(build("https://bridge.example.test/v1/authenticated-browser?token=abc")).toThrow(/query/);
    expect(()=>new HttpAuthenticatedBrowserBridgeClient({url:"https://bridge.example.test/v1/authenticated-browser",serviceCredential:""})).toThrow(/required/);
    const previous=process.env.NODE_ENV;
    try{
      process.env.NODE_ENV="production";
      expect(build("http://127.0.0.1:8789/v1/authenticated-browser",true)).toThrow(/forbidden in production/);
      expect(()=>new AuthenticatedBrowserBridgeService({serviceCredential:TEST_SECRET,allowTestMode:true})).toThrow(/test mode is forbidden in production mode/);
      expect(build("https://bridge.example.test/v1/authenticated-browser")).not.toThrow();
    }finally{process.env.NODE_ENV=previous}
  });
});

describe("cleanup",()=>{
  it("closes an abandoned execution after the idle timeout and answers EXPIRED afterwards",async()=>{
    const {service,mock}=newService({idleTimeoutMs:60});const cap=await open(service);
    expect(mock.closed).toBe(false);await new Promise(resolve=>setTimeout(resolve,200));
    expect(mock.closed).toBe(true);expect(service.activeExecutionCount).toBe(0);
    expect(await send(service,req("OBSERVE_AUTH_SURFACE",cap,"op_late"))).toMatchObject({json:{error:{code:"BRIDGE_EXECUTION_EXPIRED"}}});
  });

  it("does not let a slow browser launch consume the idle lease, and starts the lease once the browser is open",async()=>{
    const mock=new MockBrowserProvider();mock.allocateDelayMs=200;const {service}=newService({idleTimeoutMs:80},mock);
    const cap=await open(service);expect(mock.closed).toBe(false);
    expect((await send(service,req("OBSERVE_AUTH_SURFACE",cap,"op_observe"))).status).toBe(200);
    await new Promise(resolve=>setTimeout(resolve,250));expect(mock.closed).toBe(true);
  });

  it("closes an execution at its absolute deadline even while it is being kept active",async()=>{
    const {service,mock}=newService({absoluteTimeoutMs:150,idleTimeoutMs:10_000});const cap=await open(service);
    const keepAlive=setInterval(()=>void send(service,req("OBSERVE_AUTH_SURFACE",cap,`op_${Math.random()}`)),30);
    await new Promise(resolve=>setTimeout(resolve,400));clearInterval(keepAlive);expect(mock.closed).toBe(true);
  });

  it("closes the remote browser when the Worker cancels the run",async()=>{
    const {service,mock}=newService();const cap=baseCapability();
    const transport=new HttpAuthenticatedBrowserBridgeClient({url:"https://bridge.example.test/v1/authenticated-browser",serviceCredential:TEST_SECRET,fetch:async(_url,init)=>service.handle(new Request(BRIDGE_URL,{method:"POST",headers:init?.headers,body:init?.body as string}))});
    const executor=new AuthenticatedBrowserBridgeExecutor(transport,()=>cap);const controller=new AbortController();
    const scope=await executor.allocate({runId:cap.runId,tenantId:cap.tenantId,generation:1,allowedOrigins:cap.allowedOrigins,signal:controller.signal});
    expect(mock.closed).toBe(false);controller.abort();await new Promise(resolve=>setTimeout(resolve,50));
    expect(mock.closed).toBe(true);expect(await executor.health(scope)).toBe("closed");
  });

  it("closes the remote browser when session restore fails during allocation",async()=>{
    const {service,mock}=newService();const cap=baseCapability();
    const transport=new HttpAuthenticatedBrowserBridgeClient({url:"https://bridge.example.test/v1/authenticated-browser",serviceCredential:TEST_SECRET,fetch:async(_url,init)=>service.handle(new Request(BRIDGE_URL,{method:"POST",headers:init?.headers,body:init?.body as string}))});
    const executor=new AuthenticatedBrowserBridgeExecutor(transport,()=>cap);
    const oversized:BrowserSessionState={cookies:[],origins:[{origin:"https://auth.example.com",localStorage:[{name:"big",value:"y".repeat(BRIDGE_MAX_STORAGE_STATE_BYTES)}]}]};
    await expect(executor.allocate({runId:cap.runId,tenantId:cap.tenantId,generation:1,allowedOrigins:cap.allowedOrigins,authenticatedSessionState:oversized})).rejects.toBeInstanceOf(AuthenticatedBrowserBridgeError);
    expect(mock.closed).toBe(true);
  });

  it("closes all active browser executions on service shutdown",async()=>{
    const {service,mock}=newService();await open(service);expect(mock.closed).toBe(false);
    await service.shutdown();expect(mock.closed).toBe(true);expect(service.activeExecutionCount).toBe(0);
  });

  it("answers OBSERVE and CAPTURE by re-execution (no stored observation or session state)",async()=>{
    const {service}=newService();const cap=await open(service);
    const capture=await send(service,req("CAPTURE_AUTH_STATE",cap,"op_capture"));expect(capture.status).toBe(200);
    const internals=(service as unknown as {executions:Map<string,{records:Map<string,unknown>}>}).executions.get(cap.bridgeExecutionId)!;
    expect(JSON.stringify([...internals.records.entries()])).not.toMatch(/token_xyz|secret_token/);
  });
});
