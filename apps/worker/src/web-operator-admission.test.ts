import { describe,expect,it } from "vitest";
import { WebOperatorAcquisitionStrategy } from "@distilled/agent-runtime/admission";
import { MemoryRuntimeStore } from "@distilled/agent-runtime/persistence";
import type { KnownCandidateInvocation } from "@distilled/agent-runtime/runtime";
import { relayPendingWebOperatorOutbox } from "./web-operator-admission";
import type { Env,WebOperatorRunMessage } from "./types";

describe("web operator durable outbox",()=>{
  it("relays a wake after admission committed without publication and makes duplicate relay harmless",async()=>{
    const store=new MemoryRuntimeStore();
    const admitted=await new WebOperatorAcquisitionStrategy(store).admitKnownCandidate(invocation());
    expect((await store.getOutbox(admitted.run.runId))?.state).toBe("pending");
    const sent:WebOperatorRunMessage[]=[];
    const env={WEB_OPERATOR_QUEUE:{send:async(message:WebOperatorRunMessage)=>{sent.push(message);}}} as unknown as Env;
    expect(await relayPendingWebOperatorOutbox(env,store)).toBe(1);
    expect(await relayPendingWebOperatorOutbox(env,store)).toBe(0);
    expect(sent).toEqual([{type:"web_operator_run",runId:admitted.run.runId}]);
    expect((await store.getOutbox(admitted.run.runId))?.state).toBe("delivered");
  });
});

function invocation():KnownCandidateInvocation {
  return {tenantId:"tenant",resourceId:"resource",idempotencyKey:"key",objective:"Acquire candidate",enabled:true,
    candidate:{candidateId:"candidate",canonicalUrl:"https://fixture.test/article",publisherId:"fixture",acquisitionAttempt:"attempt"},
    policy:{id:"policy",allowedOrigins:["https://fixture.test"],allowLoopback:false,allowedTools:["browser.navigate@1"],visualReadPurposes:[],
      modelPolicy:{allowedProviders:["fixture"],allowedDeployments:["api"],requiredPrivacyEligibility:["public"],allowedRetentionClasses:["zero_data_retention"]}},
    modelRouting:{mode:"api",apiGateway:"openrouter",selfHostedGateway:"openai_compatible",roles:{NAVIGATION_FAST:{primary:{deployment:"api",model:"fixture"},fallbacks:[]}}},
    modelCapabilities:[{modelRef:"fixture",provider:"fixture",deployment:"api",externallyHosted:true,privacyEligibility:["public"],
      retentionClass:"zero_data_retention",toolCalling:true,vision:false,structuredOutput:true,reasoningClass:"fast",enabled:true,inputCostPerMillion:0,outputCostPerMillion:0}]};
}
