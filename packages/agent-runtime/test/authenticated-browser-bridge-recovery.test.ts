import {expect,it} from 'vitest';
import {AuthenticatedBrowserBridgeError,AuthenticatedBrowserBridgeExecutor,type AuthenticatedBrowserBridgeRequest,type AuthenticatedBrowserBridgeResult,type AuthenticatedBrowserExecutionCapability} from '../src/authenticated-browser-bridge';

it('re-observes once after a pre-effect stale auth handle',async()=>{
  const now=Date.now();
  const capability:AuthenticatedBrowserExecutionCapability={bridgeExecutionId:'bridge_recovery',bootstrapRequestId:'bootstrap_recovery',runId:'run_recovery',tenantId:'account_recovery',ownerId:'account_recovery',profileId:'profile_recovery',expectedProfileVersion:1,browserGeneration:1,authFlowId:'flow_recovery',siteKind:'x',authEntryPoint:'https://x.com/login',sessionProbeUrl:'https://x.com/home',allowedOrigins:['https://x.com'],writeOrigins:['https://x.com'],issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+120000).toISOString(),operationBudget:10};
  const calls:string[]=[];let observation=0,injections=0;
  const transport={execute:async(request:AuthenticatedBrowserBridgeRequest):Promise<AuthenticatedBrowserBridgeResult>=>{
    calls.push(request.operation);
    if(request.operation==='OPEN_AUTH_BROWSER')return{runId:capability.runId,tenantId:capability.tenantId,generation:1,sessionId:'session_recovery',contextId:'context_recovery',pageId:'page_recovery',viewport:{width:960,height:720,deviceScaleFactor:1}};
    if(request.operation==='NAVIGATE_AUTH_ENTRYPOINT')return{accepted:true};
    if(request.operation==='OBSERVE_AUTH_SURFACE'){observation++;return{url:'https://x.com/login',title:'X',pageRevision:`rev_${observation}`,challengeState:'NO_CHALLENGE',visibleText:'Log in',controls:[{handle:`handle_${observation}`,role:'textbox',kind:'textbox',label:'Email or username',type:'text',insideForm:true,disabled:false}]};}
    if(request.operation==='INJECT_AUTH_FIELD'){injections++;if(injections===1)throw new AuthenticatedBrowserBridgeError('BRIDGE_OBSERVATION_STALE');expect(request.fieldHandle).toBe('handle_2');return{accepted:true};}
    if(request.operation==='CLOSE_AUTH_BROWSER')return{closed:true};
    throw new Error('unexpected operation');
  }};
  const executor=new AuthenticatedBrowserBridgeExecutor(transport,()=>capability);
  const scope=await executor.allocate({runId:capability.runId,tenantId:capability.tenantId,generation:1,allowedOrigins:capability.allowedOrigins});
  const adapter={siteFamily:'x',allowedOrigins:['https://x.com'],loginOrigin:'https://x.com',authenticationEntryPoint:{kind:'X_LOGIN',url:capability.authEntryPoint},detect:()=>({state:'ACTIVE',reason:'synthetic'}),bootstrap:async(browser:{goto:(url:string)=>Promise<unknown>;waitForAuthenticationSurface?:()=>Promise<unknown>;fillControl:(control:{role:'textbox';label:string},value:string)=>Promise<unknown>},credential:{username:string})=>{await browser.goto(capability.authEntryPoint);await browser.waitForAuthenticationSurface?.();await browser.fillControl({role:'textbox',label:'Email or username'},credential.username);return{state:'ACTIVE',reason:'synthetic'}}};
  try{await expect(executor.establishAuthenticatedSession(scope,adapter as never,{username:'synthetic-identifier',password:'synthetic-password'})).resolves.toMatchObject({state:'ACTIVE'});expect(calls).toEqual(['OPEN_AUTH_BROWSER','NAVIGATE_AUTH_ENTRYPOINT','OBSERVE_AUTH_SURFACE','INJECT_AUTH_FIELD','OBSERVE_AUTH_SURFACE','INJECT_AUTH_FIELD']);}finally{await executor.close(scope)}
});
