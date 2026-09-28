import {describe,expect,it} from "vitest";
import {chooseWithFallback,validateBoundedDecision,type BoundedDecisionRequest} from "@distilled/agent-runtime";
import {OpenRouterJevDecisionProvider,handleBoundedDecision} from "./bounded-decision-provider";
import type {Env} from "./types";

const request:BoundedDecisionRequest={runId:"run_1",kind:"PUBLIC_DISCOVERY",browserGeneration:1,observationRevision:"revision_1",expiresAt:new Date(Date.now()+60000).toISOString(),summary:{pageType:"listing",observedItemCount:2,inspectedItemCount:0},choices:[{id:"choice_0",action:"SCROLL",description:"Scroll"},{id:"choice_1",action:"OPEN_OBSERVED_ITEM",targetId:"target_0",description:"Inspect observed target"}]};
const result={choiceId:"choice_1",confidence:0.9,probabilities:{choice_0:0.1,choice_1:0.9},provider:"fixture",model:"fixture"};
describe("bounded decision provider",()=>{
  it("accepts only a legal target at the current generation and observation",()=>{
    expect(validateBoundedDecision(request,result,{revision:"revision_1",generation:1,now:Date.now()},0.75).targetId).toBe("target_0");
    expect(()=>validateBoundedDecision(request,{...result,choiceId:"invented"},{revision:"revision_1",generation:1,now:Date.now()},0.75)).toThrow("invalid");
    expect(()=>validateBoundedDecision(request,result,{revision:"stale",generation:1,now:Date.now()},0.75)).toThrow("stale");
    expect(()=>validateBoundedDecision(request,result,{revision:"revision_1",generation:2,now:Date.now()},0.75)).toThrow("stale");
    expect(()=>validateBoundedDecision(request,{...result,probabilities:{choice_1:0.1}},{revision:"revision_1",generation:1,now:Date.now()},0.75)).toThrow("invalid");
    expect(()=>validateBoundedDecision(request,result,{revision:"revision_1",generation:1,now:Date.now()},NaN)).toThrow("threshold");
  });
  it("falls back on low confidence, malformed output, timeout, and cancellation",async()=>{
    expect(await chooseWithFallback({choose:async()=>({...result,confidence:0.3})},request,0.75)).toBeUndefined();
    expect(await chooseWithFallback({choose:async()=>({} as never)},request,0.75)).toBeUndefined();
    const provider=new OpenRouterJevDecisionProvider("test-only","typesafe/jev-1.13",5,async()=>new Promise(()=>undefined));
    expect(await chooseWithFallback(provider,request,0.75)).toBeUndefined();
    const controller=new AbortController();controller.abort();
    expect(await chooseWithFallback({choose:async()=>result},request,0.75,controller.signal)).toBeUndefined();
  });
  it("sends only finite typed state and never caller prose or extra secret fields",async()=>{
    let sent:unknown;
    const provider=new OpenRouterJevDecisionProvider("test-only","typesafe/jev-1.13",5000,async(url,options)=>{
      expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
      sent=JSON.parse(String(options?.body));
      return Response.json({answers:{action:{type:"choice",choice:"choice_1",confidence:0.9,probabilities:{choice_0:0.1,choice_1:0.9}}},usage:{input_tokens:300,cost:0.0000126}});
    });
    const input={...request,summary:{...request.summary,password:"SECRET_MARKER"},choices:request.choices.map(choice=>({...choice,description:"SECRET_MARKER"}))};
    expect((await provider.choose(input)).choiceId).toBe("choice_1");
    expect(JSON.stringify(sent)).not.toContain("SECRET_MARKER");
  });
  it("rejects malformed, missing probabilities and invented choices",async()=>{
    for(const answer of [{type:"noul"},{type:"choice",choice:"invented",confidence:1,probabilities:{invented:1}},{type:"choice",choice:"choice_1",confidence:1,probabilities:{choice_1:1}}]){
      const provider=new OpenRouterJevDecisionProvider("test-only","typesafe/jev-1.13",5000,async()=>Response.json({answers:{action:answer}}));
      await expect(provider.choose(request)).rejects.toThrow("invalid");
    }
  });
  it("retries only bounded transient HTTP failures and rejects redirects",async()=>{
    let calls=0;
    const provider=new OpenRouterJevDecisionProvider("test-only","typesafe/jev-1.13",5000,async(_url,options)=>{
      expect(options?.redirect).toBe("error");calls++;
      return new Response("SECRET_MARKER",{status:503});
    });
    await expect(provider.choose(request)).rejects.toThrow("decision_http_503");expect(calls).toBe(2);
  });
  it("records safe native OpenRouter metadata and never provider error text",async()=>{
    const persisted:unknown[][]=[];
    const env={WEB_OPERATOR_RUNTIME_TOKEN:"runtime_test",DISTILLED_DISCOVERY_DECISION_MODE:"JEV_HYBRID",OPENROUTER_API_KEY:"test-only",DB:{prepare:()=>({bind:(...args:unknown[])=>({run:async()=>{persisted.push(args)}})})}} as unknown as Env;
    const original=globalThis.fetch;globalThis.fetch=async()=>new Response("SECRET_MARKER",{status:402});
    try{
      const response=await handleBoundedDecision(new Request("https://worker.test/v1/bounded-decisions",{method:"POST",headers:{authorization:"Bearer runtime_test"},body:JSON.stringify(request)}),env);
      expect(await response.json()).toEqual({fallback:true,outcome:"OPENROUTER_HTTP_402"});
      expect(persisted[0]).toContain("OPENROUTER");expect(persisted[0]).toContain("typesafe/jev-1.13");
      expect(JSON.stringify(persisted)).not.toMatch(/SECRET_MARKER|runtime_test|test-only/);
    }finally{globalThis.fetch=original}
  });
});
