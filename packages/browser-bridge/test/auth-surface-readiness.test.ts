import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {expect,it} from "vitest";
import {SelfHostedChromiumProvider} from "@distilled/agent-runtime";

it("does not wait on a hidden first input when a later login control is visible",async()=>{
  const server=createServer((_req,res)=>{res.writeHead(200,{"content-type":"text/html"});res.end('<html><body><input type="hidden" value="opaque"><form><input aria-label="Username"><button>Next</button></form></body></html>')});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const provider=SelfHostedChromiumProvider.forTest();
  const scope=await provider.allocate({runId:"hidden-first",tenantId:"test",generation:1,allowedOrigins:[origin]});
  try{
    await provider.navigateAuthenticationEntrypoint(scope,`${origin}/login`,[origin]);
    const started=Date.now();
    const surface=await provider.observeAuthenticationSurface(scope,"AUTH_SURFACE");
    expect(surface.controls.some(control=>control.label==="Username")).toBe(true);
    expect(Date.now()-started).toBeLessThan(5000);
  }finally{await provider.close(scope);await new Promise<void>(resolve=>server.close(()=>resolve()))}
},30000);
