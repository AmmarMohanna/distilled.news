import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {expect,it} from "vitest";
import {PlaywrightBrowserAdapter} from "../src/browser";
import {XAuthenticatedSiteAdapter,type AuthenticatedSiteAdapter,type AuthenticatedSiteSnapshot} from "../src/authenticated-site";

// No X credentials, network access or page-realm observation is used here.
const PASSWORD="fixture_password_not_a_real_secret";
async function fixture(html:string){
  const server=createServer((_request,response)=>{response.setHeader("content-type","text/html");response.end(html)});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const browser=new PlaywrightBrowserAdapter({testOnlyPrivateNetwork:true,allowAuthenticationSiteFeatures:true});
  const scope=await browser.allocate({runId:crypto.randomUUID(),tenantId:"fixture",generation:1,allowedOrigins:[origin],authenticationBootstrap:true});
  await browser.navigateAuthenticationEntrypoint(scope,origin,[origin]);
  return{browser,scope,origin,close:async()=>{await browser.close(scope);await new Promise<void>(resolve=>server.close(()=>resolve()))}};
}

it("observes and activates a SPA password alternative implemented as a role button",async()=>{
  const f=await fixture(`<form><div role="button" tabindex="0" onclick="this.closest('form').innerHTML='<label>Password<input type=password autocomplete=current-password></label><button>Log in</button>'">Use password</div></form>`);
  try{
    const before=await f.browser.observeAuthenticationSurface(f.scope);
    const control=before.controls.find(item=>item.role==="button"&&item.label==="Use password");
    expect(control).toBeDefined();
    await f.browser.activateAuthenticationControl(f.scope,{controlKind:"USE_PASSWORD",controlHandle:control!.handle,pageRevision:before.pageRevision});
    const after=await f.browser.observeAuthenticationSurface(f.scope);
    expect(after.controls).toEqual(expect.arrayContaining([expect.objectContaining({type:"password",label:"Password"})]));
  }finally{await f.close()}
});

it("injects an ordinary labeled password input without requiring an implicit textbox role",async()=>{
  const f=await fixture(`<form><label>Password<input type="password" autocomplete="current-password"></label><button>Log in</button></form>`);
  try{
    const before=await f.browser.observeAuthenticationSurface(f.scope);
    const field=before.controls.find(item=>item.type==="password");
    expect(field).toMatchObject({label:"Password"});
    await f.browser.injectAuthenticationField(f.scope,{fieldKind:"PASSWORD",fieldHandle:field!.handle,pageRevision:before.pageRevision,secretValue:PASSWORD});
    await expect(f.browser.injectAuthenticationField(f.scope,{fieldKind:"PASSWORD",fieldHandle:field!.handle,pageRevision:before.pageRevision,secretValue:PASSWORD})).rejects.toThrow();
    const after=await f.browser.observeAuthenticationSurface(f.scope);
    expect(JSON.stringify(after)).not.toContain(PASSWORD);
  }finally{await f.close()}
},20_000);

it("runs a delayed SPA identifier/password-alternative flow through trusted observations and restores in two fresh browsers",async()=>{
  const html=`<form id="auth"><label>Email or username<input></label><div role="button" tabindex="0" id="continue">Continue</div></form>
    <script>
    if(document.cookie.includes('fixture_session=valid'))location.replace('/home');
    const auth=document.querySelector('#auth');
    document.querySelector('#continue').onclick=()=>{
      auth.innerHTML='<label>Verification code<input autocomplete="one-time-code"></label><div role="button" tabindex="0" id="use">Use password</div>';
      document.querySelector('#use').onclick=()=>{setTimeout(()=>{
        auth.innerHTML='<label>Password<input type="password" autocomplete="current-password"></label><div role="button" tabindex="0" id="login">Log in</div>';
        document.querySelector('#login').onclick=()=>{document.cookie='fixture_session=valid;path=/;SameSite=Lax';history.replaceState(null,'','/home');auth.innerHTML='<a data-testid="AppTabBar_Profile_Link" href="/profile">Profile</a><button data-testid="SideNav_AccountSwitcher_Button">Account</button>'};
      },750)};
    };
    </script>`;
  const server=createServer((request,response)=>{
    response.setHeader('content-type','text/html');
    response.end(request.url==='/home'&&request.headers.cookie?.includes('fixture_session=valid')?'<a data-testid="AppTabBar_Profile_Link" href="/profile">Profile</a><button data-testid="SideNav_AccountSwitcher_Button">Account</button>':html);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const x=new XAuthenticatedSiteAdapter(true);
  const mapped=(snapshot:AuthenticatedSiteSnapshot)=>({...snapshot,url:snapshot.url.replace(origin,'https://x.com')});
  const adapter:AuthenticatedSiteAdapter={siteFamily:'fixture',allowedOrigins:[origin],loginOrigin:origin,
    detect:snapshot=>x.detect(mapped(snapshot)),
    bootstrap:(runtime,credential,observer)=>x.bootstrap({...runtime,goto:()=>runtime.goto(`${origin}/login`),snapshot:async()=>mapped(await runtime.snapshot()),waitForAuthenticationSurface:async()=>mapped(await runtime.waitForAuthenticationSurface!())},credential,observer)};
  const browser=new PlaywrightBrowserAdapter({testOnlyPrivateNetwork:true,allowAuthenticationSiteFeatures:true});
  const allocate=(generation:number)=>browser.allocate({runId:`fresh-${generation}`,tenantId:'fixture',generation,allowedOrigins:[origin],authenticationBootstrap:true});
  const stages:string[]=[];
  try{
    const first=await allocate(1);let state;
    try{
      expect(await browser.establishAuthenticatedSession(first,adapter,{username:'fixture_identifier',password:PASSWORD},{stage:async stage=>{stages.push(stage)}})).toMatchObject({state:'ACTIVE'});
      state=await browser.exportAuthenticatedSession(first);
    }finally{await browser.close(first)}
    for(const generation of [2,3]){
      const fresh=await allocate(generation);
      try{await browser.attachAuthenticatedSession(fresh,state);await browser.navigate(fresh,`${origin}/home`);expect(await browser.detectAuthenticatedState(fresh,adapter)).toMatchObject({state:'ACTIVE'})}finally{await browser.close(fresh)}
    }
    expect(stages).toEqual(expect.arrayContaining(['identifier_submitted','password_alternative_selected','password_injected','password_submitted']));
    expect(JSON.stringify(stages)).not.toContain(PASSWORD);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()))}
},30_000);

it("advertises supported operations without claiming an unconfigured solver or proxy",()=>{
  const browser=new PlaywrightBrowserAdapter();
  expect(browser.getCapabilities()).toMatchObject({supportsAuthenticatedProfiles:true,supportsSecretInjection:true,supportsFreshContextRestore:true,supportsCaptchaSolver:false,supportsServiceWorkers:false,supportsProxyRouting:false,supportsStealthCompatibility:false});
  expect(Object.isFrozen(browser.getCapabilities())).toBe(true);
});
