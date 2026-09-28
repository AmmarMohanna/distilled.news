import {describe,expect,it} from "vitest";
import {chooseWithFallback,validateBoundedDecision,type BoundedDecisionRequest} from "@distilled/agent-runtime";
import {WorkersAiBoundedDecisionProvider} from "./bounded-decision-provider";

const request:BoundedDecisionRequest={runId:"run_1",kind:"PUBLIC_DISCOVERY",browserGeneration:1,observationRevision:"revision_1",expiresAt:new Date(Date.now()+60000).toISOString(),summary:{pageType:"listing",observedItemCount:2,inspectedItemCount:0},choices:[{id:"choice_0",action:"SCROLL",description:"Scroll"},{id:"choice_1",action:"OPEN_OBSERVED_ITEM",targetId:"target_0",description:"Inspect observed target"}]};
const result={choiceId:"choice_1",confidence:0.9,probabilities:{choice_0:0.1,choice_1:0.9},provider:"fixture",model:"fixture"};
describe("bounded decision provider",()=>{
  it("accepts only a legal target at the current generation and observation",()=>{
    expect(validateBoundedDecision(request,result,{revision:"revision_1",generation:1,now:Date.now()},0.75).targetId).toBe("target_0");
    expect(()=>validateBoundedDecision(request,{...result,choiceId:"invented"},{revision:"revision_1",generation:1,now:Date.now()},0.75)).toThrow("invalid");
    expect(()=>validateBoundedDecision(request,result,{revision:"stale",generation:1,now:Date.now()},0.75)).toThrow("stale");
    expect(()=>validateBoundedDecision(request,result,{revision:"revision_1",generation:2,now:Date.now()},0.75)).toThrow("stale");
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
});
