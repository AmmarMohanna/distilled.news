import { describe,expect,it } from "vitest";
import { handleBridgePreflight } from "./bridge-preflight";
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
