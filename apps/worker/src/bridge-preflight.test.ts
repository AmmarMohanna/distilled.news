import { describe,expect,it } from "vitest";
import { handleBridgePreflight,handleProviderDiagnostic } from "./bridge-preflight";
import type { Env } from "./types";

const call=(env:Partial<Env>,init:{token?:string;body?:unknown}={})=>handleBridgePreflight(new Request("https://worker.test/v1/authenticated-profiles/bridge-preflight",{method:"POST",headers:{...(init.token?{authorization:`Bearer ${init.token}`}:{}),"content-type":"application/json"},body:JSON.stringify(init.body??{})}),env as Env);
const valid={stage:"AUTH_PROTOCOL",siteOrigin:"https://site.example.test",markers:{identifier:"TEST_IDENTIFIER_SECRET_x",password:"TEST_PASSWORD_SECRET_x"}};
const configured={BRIDGE_PREFLIGHT_TOKEN:"preflight-token",SELF_HOSTED_BROWSER_BRIDGE_URL:"https://bridge.example.test/v1/authenticated-browser",SELF_HOSTED_BROWSER_BRIDGE_AUTH:"dedicated-credential"};

describe("bridge preflight route",()=>{
  it("is inert (404) unless the dedicated preflight token secret exists, whatever credentials are presented",async()=>{
    expect((await call({},{token:"anything",body:valid})).status).toBe(404);
    expect((await call({WEB_OPERATOR_RUNTIME_TOKEN:"runtime"},{token:"runtime",body:valid})).status).toBe(404);
  });
  it("rejects a missing or wrong token, including the runtime token",async()=>{
    expect((await call(configured,{body:valid})).status).toBe(401);
    expect((await call(configured,{token:"wrong",body:valid})).status).toBe(401);
    expect((await call({...configured,WEB_OPERATOR_RUNTIME_TOKEN:"runtime"},{token:"runtime",body:valid})).status).toBe(401);
  });
  it("reports missing bridge configuration without leaking values",async()=>{
    const response=await call({BRIDGE_PREFLIGHT_TOKEN:"preflight-token"},{token:"preflight-token",body:valid});
    expect(response.status).toBe(503);expect(await response.json()).toMatchObject({error:"bridge_not_configured",configuration:{bridgeUrlConfigured:false,dedicatedAuthConfigured:false}});
  });
  it("rejects non-synthetic markers, unknown stages and unexpected fields",async()=>{
    for(const body of[{...valid,markers:{identifier:"real-user",password:"TEST_p"}},{...valid,stage:"EXFILTRATE"},{...valid,extra:1}])expect((await call(configured,{token:"preflight-token",body})).status).toBe(400);
  });
  it("never echoes the credential or token",async()=>{
    const response=await call({...configured,SELF_HOSTED_BROWSER_BRIDGE_URL:undefined},{token:"preflight-token",body:valid});const text=await response.text();
    expect(text).not.toContain("dedicated-credential");expect(text).not.toContain("preflight-token");
  });
});

describe("provider diagnostic route (proves the deployed runtime's actual selection)",()=>{
  const ask=(env:Partial<Env>,token="preflight-token")=>handleProviderDiagnostic(new Request("https://worker.test/v1/authenticated-profiles/provider-diagnostic",{headers:token?{authorization:`Bearer ${token}`}:{}}),env as Env);
  const cloudflare={DISTILLED_BROWSER_BACKEND:"cloudflare",BROWSER:{} as never};
  it("is inert without the operator token secret and rejects a wrong or runtime token",async()=>{
    expect((await ask({...cloudflare})).status).toBe(404);
    expect((await ask({...cloudflare,BRIDGE_PREFLIGHT_TOKEN:"preflight-token"},"wrong")).status).toBe(401);
    expect((await ask({...cloudflare,BRIDGE_PREFLIGHT_TOKEN:"preflight-token",WEB_OPERATOR_RUNTIME_TOKEN:"rt"},"rt")).status).toBe(401);
  });
  it("reports the bridge only when the provider secret selects it, using exactly three fields",async()=>{
    const body=await (await ask({...cloudflare,...configured,DISTILLED_BROWSER_PROVIDER:"self_hosted"})).json();
    expect(body).toEqual({authenticatedBrowserProvider:"SELF_HOSTED_CHROMIUM",providerSelfHosted:true,bridgeConfigured:true});
  });
  it("tolerates case and whitespace exactly as the bootstrap does",async()=>{
    expect(await (await ask({...cloudflare,...configured,DISTILLED_BROWSER_PROVIDER:"  Self_Hosted "})).json()).toMatchObject({providerSelfHosted:true});
  });
  it("reports Cloudflare when the provider secret is absent, even with the bridge fully configured (the silent default that caused the accidental runs)",async()=>{
    expect(await (await ask({...cloudflare,...configured})).json()).toEqual({authenticatedBrowserProvider:"CLOUDFLARE_BROWSER",providerSelfHosted:false,bridgeConfigured:true});
  });
  it("never resolves a misspelt or unsupported provider to the bridge, and never silently to Cloudflare",async()=>{
    for(const value of["selfhosted","self-hosted","","selfhosted "]){const body=await (await ask({...cloudflare,...configured,DISTILLED_BROWSER_PROVIDER:value})).json() as Record<string,unknown>;expect(body,JSON.stringify(value)).toMatchObject({authenticatedBrowserProvider:"UNRESOLVED",providerSelfHosted:false,error:"provider_resolution_failed"})}
  });
  it("fails closed when the bridge is selected but not configured",async()=>{
    expect(await (await ask({...cloudflare,BRIDGE_PREFLIGHT_TOKEN:"preflight-token",DISTILLED_BROWSER_PROVIDER:"self_hosted"})).json()).toMatchObject({authenticatedBrowserProvider:"UNRESOLVED",providerSelfHosted:false,bridgeConfigured:false});
  });
  it("does not report the bridge for provider=local (which would run Chromium inside the Worker, not the bridge)",async()=>{
    const body=await (await ask({...cloudflare,...configured,DISTILLED_BROWSER_PROVIDER:"local"})).json() as Record<string,unknown>;
    expect(body.providerSelfHosted).toBe(false);
  });
  it("reveals no URL, credential or token",async()=>{
    const text=await (await ask({...cloudflare,...configured,DISTILLED_BROWSER_PROVIDER:"self_hosted"})).text();
    for(const secret of["bridge.example.test","dedicated-credential","preflight-token"])expect(text).not.toContain(secret);
  });
});
