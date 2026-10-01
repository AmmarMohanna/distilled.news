import {expect,it} from "vitest";
import {PlaywrightBrowserAdapter} from "../src/browser";

it("enables ordinary site JavaScript only in a guarded authentication context",async()=>{
  const browser=new PlaywrightBrowserAdapter({testOnlyPrivateNetwork:true,allowAuthenticationSiteFeatures:true});
  const allocate=(runId:string,authenticationBootstrap?:true)=>browser.allocate({runId,tenantId:"tenant",generation:1,allowedOrigins:["http://127.0.0.1:8765"],authenticationBootstrap});
  const live=(sessionId:string)=>(browser as unknown as {sessions:Map<string,{page:import("@playwright/test").Page;context:import("@playwright/test").BrowserContext}>}).sessions.get(sessionId)!;
  const auth=await allocate("authentication",true);
  try{
    expect(await live(auth.sessionId).page.evaluate(()=>typeof Worker)).toBe("function");
    expect(await live(auth.sessionId).page.evaluate(()=>typeof WebSocket)).toBe("function");
  }finally{await browser.close(auth)}
  const acquisition=await allocate("acquisition");
  try{
    expect(await live(acquisition.sessionId).page.evaluate(()=>typeof Worker)).toBe("undefined");
    expect(await live(acquisition.sessionId).page.evaluate(()=>typeof WebSocket)).toBe("function");
  }finally{await browser.close(acquisition)}
});
