import {createServer,type Server} from "node:http";
import type {AddressInfo} from "node:net";
import {
  AuthenticatedBrowserBridgeExecutor,
  ChallengeCoordinator,
  DetectOnlyBrowserChallengeProvider,
  HttpAuthenticatedBrowserBridgeClient,
  InMemoryAuthenticationChallengeStore,
  makeId,
  type AuthenticatedBrowserExecutionCapability,
  type AuthenticatedSiteAdapter,
  type AuthenticatedSiteSnapshot,
  type BrowserScope
} from "@distilled/agent-runtime";

export const SYNTHETIC_IDENTIFIER="TEST_IDENTIFIER_SECRET_7f3a91";
export const SYNTHETIC_PASSWORD="TEST_PASSWORD_SECRET_c20b48";
export const SYNTHETIC_COOKIE="TEST_COOKIE_SECRET_5d1e77";

const page=(title:string,body:string)=>`<!DOCTYPE html><html><head><title>${title}</title></head><body>${body}</body></html>`;

/** A local, deterministic, no-JavaScript site standing in for a two-step login. It records what it received so tests can prove real injection. */
export class SyntheticSite{
  readonly received:Array<{path:string;body:string}>=[];
  otherHits=0;
  server!:Server;
  origin!:string;
  otherOrigin?:string;
  private other?:Server;

  async start(){
    this.other=createServer((_req,res)=>{this.otherHits++;res.writeHead(200,{"content-type":"text/html"});res.end(page("Other origin","<h1>should never load</h1>"))});
    await new Promise<void>(resolve=>this.other!.listen(0,"127.0.0.1",resolve));
    this.otherOrigin=`http://127.0.0.1:${(this.other.address() as AddressInfo).port}`;
    this.server=createServer((req,res)=>{
      const url=new URL(req.url??"/","http://127.0.0.1");const chunks:Buffer[]=[];
      req.on("data",chunk=>chunks.push(chunk));
      req.on("end",()=>{
        const body=Buffer.concat(chunks).toString("utf8");if(req.method==="POST")this.received.push({path:url.pathname,body});
        const html=(status:number,title:string,content:string,headers:Record<string,string>={})=>{res.writeHead(status,{"content-type":"text/html",...headers});res.end(page(title,content))};
        if(url.pathname==="/login"&&req.method==="GET")return html(200,"Login step 1",`<form method="POST" action="/login/step1"><label>Username <input name="username" type="text" aria-label="Username"></label><button type="submit">Continue</button></form>`);
        if(url.pathname==="/login/step1"&&req.method==="POST"){
          if(new URLSearchParams(body).get("username")!==SYNTHETIC_IDENTIFIER)return html(200,"Login step 1",`<p>Unknown account</p><form method="POST" action="/login/step1"><input name="username" type="text" aria-label="Username"><button type="submit">Continue</button></form>`);
          return html(200,"Login step 2",`<form method="POST" action="/login/step2"><label>Password <input name="password" type="password" aria-label="Password"></label><button type="submit">Log in</button></form>`);
        }
        if(url.pathname==="/login/step2"&&req.method==="POST"){
          if(new URLSearchParams(body).get("password")!==SYNTHETIC_PASSWORD)return html(200,"Login step 2",`<p>Incorrect password</p>`);
          res.writeHead(302,{location:"/home","set-cookie":`auth_session=${SYNTHETIC_COOKIE}; Path=/; HttpOnly; SameSite=Lax`});return res.end();
        }
        if(url.pathname==="/home"&&req.method==="GET"){
          if((req.headers.cookie??"").includes(`auth_session=${SYNTHETIC_COOKIE}`))return html(200,"Home / Synthetic","<main><h1>Welcome to the feed</h1></main>");
          res.writeHead(302,{location:"/login"});return res.end();
        }
        if(url.pathname==="/captcha")return html(200,"Security challenge","<h2>Complete CAPTCHA</h2><div id=\"captcha-widget\">Please verify you are a human</div><button type=\"button\">Verify</button>");
        if(url.pathname==="/bounce"){res.writeHead(302,{location:`${this.otherOrigin}/login`});return res.end()}
        res.writeHead(404);res.end();
      });
    });
    await new Promise<void>(resolve=>this.server.listen(0,"127.0.0.1",resolve));
    this.origin=`http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  async stop(){await Promise.all([new Promise<void>(resolve=>this.server.close(()=>resolve())),new Promise<void>(resolve=>this.other?.close(()=>resolve())??resolve())])}
}

/** Drives the bridge through the same RuntimeAuthenticationBrowser port the production X adapter uses. */
export class SyntheticAuthAdapter implements AuthenticatedSiteAdapter{
  readonly siteFamily="synthetic";
  readonly allowedOrigins:readonly string[];
  readonly loginOrigin:string;
  readonly authenticationEntryPoint:{kind:string;url:string};
  constructor(origin:string,entryPath="/login"){this.allowedOrigins=[origin];this.loginOrigin=origin;this.authenticationEntryPoint={kind:"SYNTHETIC_LOGIN",url:`${origin}${entryPath}`}}
  detect(snapshot:AuthenticatedSiteSnapshot){
    if(new URL(snapshot.url).pathname==="/home")return{state:"ACTIVE" as const,reason:"synthetic_authenticated"};
    if(/captcha/i.test(snapshot.visibleText))return{state:"CHALLENGE_REQUIRED" as const,reason:"synthetic_captcha"};
    if(/incorrect password|unknown account/i.test(snapshot.visibleText))return{state:"REAUTH_REQUIRED" as const,reason:"synthetic_rejected"};
    return{state:"SESSION_EXPIRED" as const,reason:"synthetic_unexpected"};
  }
  async bootstrap(browser:Parameters<AuthenticatedSiteAdapter["bootstrap"]>[0],credential:{username:string;password:string},_observer:unknown,_lineage:unknown,challenges?:Parameters<AuthenticatedSiteAdapter["bootstrap"]>[4]){
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
    // Deliberately no snapshot here: the executor must re-observe lazily after a mutation invalidated its handles.
    await browser.clickControl({role:"button",label:"Log in"});
    return this.detect(await browser.snapshot());
  }
}

export interface FlowContext{
  runId:string;tenantId:string;profileId:string;capability:AuthenticatedBrowserExecutionCapability;executor:AuthenticatedBrowserBridgeExecutor;transport:HttpAuthenticatedBrowserBridgeClient;
  store:InMemoryAuthenticationChallengeStore;coordinator:ChallengeCoordinator;
  challenges:{coordinator:ChallengeCoordinator;binding:{runId:string;bootstrapRequestId:string;tenantId:string;ownerId:string;profileId:string;profileVersion:number;browserGeneration:number;authFlowId:string;expiresAt:string};validateFences:()=>Promise<boolean>};
}

/** Plays the production coordinator's role: mints fenced capabilities and talks to the bridge only through the public protocol client. */
export function newFlow(input:{bridgeUrl:string;secret:string;adapter:SyntheticAuthAdapter;label:string;fetch?:typeof fetch;profileId?:string;operationBudget?:number}):FlowContext{
  const runId=makeId("run",input.label,Date.now(),Math.random());const tenantId="account_test_tenant";const profileId=input.profileId??makeId("authenticated_profile",input.label);
  const now=Date.now();const bootstrapRequestId=makeId("boot_req",runId);
  const capability:AuthenticatedBrowserExecutionCapability={bridgeExecutionId:makeId("bridge_exec",runId),bootstrapRequestId,runId,tenantId,ownerId:tenantId,profileId,expectedProfileVersion:1,browserGeneration:1,authFlowId:makeId("auth_flow",runId),siteKind:input.adapter.siteFamily,authEntryPoint:input.adapter.authenticationEntryPoint.url,sessionProbeUrl:`${input.adapter.loginOrigin}/home`,allowedOrigins:[...input.adapter.allowedOrigins],writeOrigins:[...input.adapter.allowedOrigins],issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+120_000).toISOString(),operationBudget:input.operationBudget??40};
  const transport=new HttpAuthenticatedBrowserBridgeClient({url:input.bridgeUrl,serviceCredential:input.secret,allowLoopbackHttp:true,fetch:input.fetch});
  const executor=new AuthenticatedBrowserBridgeExecutor(transport,()=>capability);
  const store=new InMemoryAuthenticationChallengeStore();const coordinator=new ChallengeCoordinator(store,new DetectOnlyBrowserChallengeProvider("self_hosted_chromium"),{overallTimeoutMs:5_000,pollingIntervalMs:50});
  return{runId,tenantId,profileId,capability,executor,transport,store,coordinator,challenges:{coordinator,binding:{runId,bootstrapRequestId,tenantId,ownerId:tenantId,profileId,profileVersion:1,browserGeneration:1,authFlowId:capability.authFlowId,expiresAt:capability.expiresAt},validateFences:async()=>true}};
}

export const allocate=(flow:FlowContext):Promise<BrowserScope>=>flow.executor.allocate({runId:flow.runId,tenantId:flow.tenantId,generation:1,allowedOrigins:flow.capability.allowedOrigins});
