import {expect,it} from "vitest";
import {chromium,type Browser} from "@playwright/test";
import {SelfHostedChromiumProvider} from "../src/browser";

it("reuses a remote browser default context and restores only admitted session state",async()=>{
  let defaultContextUsed=false;
  const provider=new SelfHostedChromiumProvider({testOnlyPrivateNetwork:true,useConnectedDefaultContext:true,launchBrowser:async()=>{
    const launched=await chromium.launch();
    const context=await launched.newContext();
    return {contexts:()=>{defaultContextUsed=true;return[context]},newContext:()=>{throw new Error("new context would discard provider settings")},close:()=>launched.close()} as unknown as Browser;
  }});
  const scope=await provider.allocate({runId:"remote-context-test",tenantId:"tenant",generation:1,allowedOrigins:["http://127.0.0.1:8765"],authenticatedSessionState:{cookies:[{name:"auth_token",value:"synthetic",domain:"127.0.0.1",path:"/",expires:-1,httpOnly:true,secure:false,sameSite:"Lax"}],origins:[]}});
  try{
    expect(defaultContextUsed).toBe(true);
    expect((await provider.exportAuthenticatedSession(scope)).cookies).toEqual(expect.arrayContaining([expect.objectContaining({name:"auth_token",value:"synthetic"})]));
  }finally{await provider.close(scope)}
});
