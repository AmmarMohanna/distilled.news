import { describe,expect,it,vi } from "vitest";
import { DEFAULT_SLICE_BUDGET,projectPageState } from "../src";
import { OpenRouterGateway,type ModelRequest } from "../src/model";
import { runOpenRouterDiagnostic } from "../src/openrouter-diagnostic";

describe("bounded OpenRouter diagnostic",()=>{
  it("serializes the staged request matrix and validates each response without exposing message content",async()=>{
    const bodies:Record<string,unknown>[]=[];
    const gateway=new OpenRouterGateway({apiKey:"test-secret",fetcher:async(_input,init)=>{
      const body=JSON.parse(String(init?.body)) as Record<string,unknown>;
      bodies.push(body);
      const stage=bodies.length;
      const message=stage===4
        ? {content:null,tool_calls:[{id:"tool-1",type:"function",function:{name:"report_ok",arguments:'{"ok":true}'}}]}
        : {content:stage===3?'{"ok":true}':stage>=5?'{"version":1,"actions":[{"tool":"browser.inspect_dom@1","arguments":{}}]}':"OK"};
      return Response.json({id:`response-${stage}`,model:"anthropic/claude-sonnet-4.6",provider:"Anthropic",
        choices:[{finish_reason:"stop",message}],usage:{prompt_tokens:2,completion_tokens:2,cost:0.00001}});
    }});

    const report=await runOpenRouterDiagnostic({gateway,productionRequest:request(),timeoutMs:5_000});

    expect(report.stoppedAt).toBeUndefined();
    expect(report.stages).toHaveLength(6);
    expect(report.stages.every((stage)=>stage.state==="passed")).toBe(true);
    expect(bodies[0]).toMatchObject({max_tokens:8,stream:false,provider:{data_collection:"deny",zdr:true}});
    expect(bodies[0].response_format).toBeUndefined();
    expect(bodies[0].tools).toBeUndefined();
    expect(bodies[1].provider).toEqual({only:["anthropic"],allow_fallbacks:false,require_parameters:true,data_collection:"deny",zdr:true});
    expect(bodies[2]).toMatchObject({response_format:{type:"json_schema",json_schema:{name:"gateway_probe",strict:true}}});
    expect(bodies[2].tools).toBeUndefined();
    expect(bodies[3]).toMatchObject({tool_choice:{type:"function",function:{name:"report_ok"}}});
    expect((bodies[3].tools as Array<Record<string,unknown>>)[0]).toMatchObject({type:"function",function:{name:"report_ok"}});
    expect(bodies[4].response_format).toEqual(bodies[5].response_format);
    expect(bodies[4].provider).toEqual(bodies[5].provider);
    expect(bodies[4].tools).toBeUndefined();
    expect(bodies[4].tool_choice).toBeUndefined();
    expect(report.stages[5].request.messageContentBytes.length).toBe(2);
    expect(JSON.stringify(report)).not.toContain("Exact production objective");
    expect(JSON.stringify(report)).not.toContain("test-secret");
  });

  it("stops on the first failing stage and preserves its sanitized typed diagnostic",async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({error:{code:404,type:"NoEndpointError",message:"No endpoints available"}}),{
      status:404,headers:{"x-request-id":"request-a"}
    }));
    const report=await runOpenRouterDiagnostic({
      gateway:new OpenRouterGateway({apiKey:"test-secret",fetcher}),productionRequest:request(),timeoutMs:5_000
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(report.stoppedAt).toBe("A");
    expect(report.stages).toEqual([expect.objectContaining({stage:"A",state:"failed",failureClass:"provider_http_failure",
      diagnostic:expect.objectContaining({httpStatus:404,errorCode:"404",errorType:"NoEndpointError",message:"No endpoints available",
        requestIds:{"x-request-id":"request-a"}})})]);
  });

  it("can resume at a later stage without repeating already-proven paid calls",async()=>{
    let calls=0;
    const gateway=new OpenRouterGateway({apiKey:"secret",fetcher:async()=>{
      calls+=1;
      const message=calls===2
        ? {content:null,tool_calls:[{id:"tool-1",type:"function",function:{name:"report_ok",arguments:'{"ok":true}'}}]}
        : {content:calls===1?'{"ok":true}':'{"version":1,"actions":[{"tool":"browser.inspect_dom@1","arguments":{}}]}'};
      return Response.json({id:`response-${calls}`,model:"anthropic/claude-sonnet-4.6",provider:"Amazon Bedrock",
        choices:[{finish_reason:"stop",message}],usage:{prompt_tokens:1,completion_tokens:1,cost:0.00001}});
    }});
    const report=await runOpenRouterDiagnostic({gateway,productionRequest:request(),timeoutMs:5_000,startAt:"C"});
    expect(report.startedAt).toBe("C");
    expect(report.stages.map((stage)=>stage.stage)).toEqual(["C","D","E","F"]);
    expect(calls).toBe(4);
  });

  it("rejects a truncated or malformed trivial tool call",async()=>{
    let calls=0;
    const gateway=new OpenRouterGateway({apiKey:"secret",fetcher:async()=>{
      calls+=1;
      return Response.json({id:"response",model:"anthropic/claude-sonnet-4.6",provider:"Amazon Bedrock",
        choices:[{finish_reason:"length",message:{content:null,tool_calls:[{id:"tool-1",type:"function",
          function:{name:"report_ok",arguments:'{"ok":'}}]}}]});
    }});
    const report=await runOpenRouterDiagnostic({gateway,productionRequest:request(),timeoutMs:5_000,startAt:"D"});
    expect(calls).toBe(1);
    expect(report).toMatchObject({startedAt:"D",stoppedAt:"D",stages:[{stage:"D",state:"failed",
      failureClass:"diagnostic_validation_failure"}]});
  });

  it("bisects production prompt and output modes using exact serialized payloads",async()=>{
    const bodies:Record<string,unknown>[]=[];
    const gateway=new OpenRouterGateway({apiKey:"secret",fetcher:async(_input,init)=>{
      const body=JSON.parse(String(init?.body)) as Record<string,unknown>;
      bodies.push(body);
      const toolCall=bodies.length>=4?{content:null,tool_calls:[{id:"tool-1",type:"function",function:{
        name:"submit_bounded_action_plan",arguments:'{"version":1,"actions":[{"tool":"browser.inspect_dom@1","arguments":{}}]}'
      }}]}:undefined;
      return Response.json({id:`response-${bodies.length}`,model:"anthropic/claude-sonnet-4.6",provider:"Amazon Bedrock",
        choices:[{finish_reason:"stop",message:toolCall??{content:bodies.length===1?"OK":'{"ok":true}'}}]});
    }});
    const report=await runOpenRouterDiagnostic({gateway,productionRequest:request(),timeoutMs:5_000,
      profile:"production_bisection"});
    expect(report.profile).toBe("production_bisection");
    expect(report.stages.map((stage)=>stage.stage)).toEqual(["A","B","C","D","E","F"]);
    expect(bodies[2].messages).toEqual([
      {role:"system",content:"Exact production system instructions"},
      {role:"user",content:'Return {"ok":true}. '}
    ]);
    expect(bodies[3].response_format).toBeUndefined();
    expect(bodies[3].tools).toHaveLength(1);
    expect(bodies[4].messages).toEqual(bodies[5].messages);
    expect(bodies[4].tools).toEqual(bodies[5].tools);
    expect(bodies[4].response_format).toBeUndefined();
    expect(bodies[5].response_format).toBeDefined();
    expect(bodies[5].tool_choice).toEqual({type:"function",function:{name:"submit_bounded_action_plan"}});
  });
});

function request():ModelRequest {
  const model="anthropic/claude-sonnet-4.6";
  const capability={modelRef:model,provider:"anthropic",toolCalling:true,vision:true,structuredOutput:true,reasoningClass:"fast" as const,
    enabled:true,inputCostPerMillion:3,outputCostPerMillion:15,deployment:"api" as const,externallyHosted:true,
    privacyEligibility:["public"],retentionClass:"zero_data_retention" as const};
  return {
    callId:"diagnostic-call",role:"NAVIGATION_FAST",
    route:{role:"NAVIGATION_FAST",routingReason:"diagnostic",requiredCapabilities:["toolCalling","structuredOutput"],configuredChain:[model],
      configuredTargets:[{deployment:"api",model}],deployment:"api",gateway:"openrouter",selectedModel:model,selectedProvider:"anthropic",
      selectedCapability:capability,appliedPolicyConstraints:["public-read"]},
    stable:{version:"web-operator-runtime-v1",toolSchemaVersion:"web-operator-tools-v1",system:"Exact production system instructions"},
    dynamic:{runId:"diagnostic-run",objective:"Exact production objective",pageState:projectPageState({url:"about:blank",title:"",pageRevision:"initial",
      challengeState:"NO_CHALLENGE",progress:{watermarkObserved:false,validatedListingBoundaryReached:false,articleExtracted:false},
      remainingBudget:DEFAULT_SLICE_BUDGET,policyVisibleCapabilities:["browser.navigate@1"]}),observationIds:[],completionDeficits:[]},
    contextManifestHash:"diagnostic-context",allowExactReuse:false,maxOutputTokens:500,timeoutMs:5_000
  };
}
