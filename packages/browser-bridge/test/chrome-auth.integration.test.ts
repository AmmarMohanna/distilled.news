import {expect,it} from "vitest";
import {chromium} from "@playwright/test";
import {SelfHostedChromiumProvider} from "@distilled/agent-runtime";
import {SYNTHETIC_COOKIE,SYNTHETIC_IDENTIFIER,SYNTHETIC_PASSWORD,SyntheticAuthAdapter,SyntheticSite} from "./synthetic-site";

it("logs in and restores a synthetic session using fresh Chrome browsers",async()=>{
  const site=new SyntheticSite();await site.start();
  const provider=new SelfHostedChromiumProvider({testOnlyPrivateNetwork:true,allowAuthenticationSiteFeatures:true,launchBrowser:options=>chromium.launch({...options,channel:"chrome",headless:true,ignoreDefaultArgs:["--enable-automation"]})});
  const adapter=new SyntheticAuthAdapter(site.origin);
  const allocation=(runId:string)=>provider.allocate({runId,tenantId:"chrome-test",generation:1,allowedOrigins:[site.origin],authenticationBootstrap:true});
  try{
    const first=await allocation("chrome-login");let state;
    try{
      expect(await provider.establishAuthenticatedSession(first,adapter,{username:SYNTHETIC_IDENTIFIER,password:SYNTHETIC_PASSWORD})).toMatchObject({state:"ACTIVE"});
      state=await provider.exportAuthenticatedSession(first);
      expect(state.cookies).toEqual(expect.arrayContaining([expect.objectContaining({name:"auth_session",value:SYNTHETIC_COOKIE})]));
    }finally{await provider.close(first)}
    const second=await allocation("chrome-restore");
    try{
      await provider.attachAuthenticatedSession(second,state);
      await provider.navigate(second,`${site.origin}/home`);
      expect(await provider.detectAuthenticatedState(second,adapter)).toMatchObject({state:"ACTIVE"});
    }finally{await provider.close(second)}
  }finally{await site.stop()}
},60_000);
