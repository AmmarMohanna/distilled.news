import {describe,expect,it} from "vitest";
import {chooseWithFallback,validateBoundedDecision,type BoundedDecisionRequest} from "@distilled/agent-runtime";
import {WorkersAiBoundedDecisionProvider,handleBoundedDecision} from "./bounded-decision-provider";
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
    const provider=new WorkersAiBoundedDecisionProvider({run:async()=>new Promise(()=>undefined)},"typesafe/jev",5);
    expect(await chooseWithFallback(provider,request,0.75)).toBeUndefined();
    const controller=new AbortController();controller.abort();
    expect(await chooseWithFallback({choose:async()=>result},request,0.75,controller.signal)).toBeUndefined();
  });
  it("sends only finite typed state and never caller prose or extra secret fields",async()=>{
    let sent:unknown;
    const provider=new WorkersAiBoundedDecisionProvider({run:async(_model,input)=>{sent=input;return{model:"jev-1.13.0",answers:{action:{choice:"choice_1",confidence:0.9,probabilities:{choice_0:0.1,choice_1:0.9}}},usage:{input_tokens:300}}}});
    const input={...request,summary:{...request.summary,password:"SECRET_MARKER"},choices:request.choices.map(choice=>({...choice,description:"SECRET_MARKER"}))};
    expect((await provider.choose(input)).choiceId).toBe("choice_1");
    expect(JSON.stringify(sent)).not.toContain("SECRET_MARKER");
  });
  it("routes through the configured gateway and durably records only bounded provider failures",async()=>{
    const persisted:unknown[][]=[];
    const env={WEB_OPERATOR_RUNTIME_TOKEN:"runtime_test",DISTILLED_DISCOVERY_DECISION_MODE:"JEV_HYBRID",CLOUDFLARE_AI_GATEWAY_ID:"configured-gateway",DECISION_AI:{run:async(_model:unknown,_input:unknown,options:unknown)=>{
      expect(options).toEqual({gateway:{id:"configured-gateway",skipCache:true}});
      throw "2021: Gateway doesn't exist. SECRET_MARKER";
    }},DB:{prepare:()=>({bind:(...args:unknown[])=>({run:async()=>{persisted.push(args)}})})}} as unknown as Env;
    const response=await handleBoundedDecision(new Request("https://worker.test/v1/bounded-decisions",{method:"POST",headers:{authorization:"Bearer runtime_test"},body:JSON.stringify(request)}),env);
    expect(await response.json()).toEqual({fallback:true,outcome:"GATEWAY_UNAVAILABLE_CODE_2021_OTHER"});
    expect(persisted).toHaveLength(1);expect(JSON.stringify(persisted)).not.toMatch(/SECRET_MARKER|runtime_test/);
  });
});
