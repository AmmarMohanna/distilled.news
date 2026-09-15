import type { ModelGatewayDiagnostic } from "./contracts";
import {
  boundedActionPlanSchema,
  buildOpenRouterRequest,
  ModelGatewayError,
  OpenRouterGateway,
  type ModelRequest
} from "./model";
import { sha256Text } from "./observations";

export const OPENROUTER_DIAGNOSTIC_STAGES=["A","B","C","D","E","F"] as const;
export type OpenRouterDiagnosticStage=(typeof OPENROUTER_DIAGNOSTIC_STAGES)[number];
export type OpenRouterDiagnosticProfile="standard"|"production_bisection";

export interface OpenRouterDiagnosticStageResult {
  stage:OpenRouterDiagnosticStage;
  state:"passed"|"failed";
  request:{
    bodyHash:string;
    bodyBytes:number;
    topLevelFields:string[];
    messageRoles:string[];
    messageContentBytes:number[];
    maxTokens?:number;
    stream?:boolean;
    provider?:unknown;
    responseFormat?:unknown;
    tools?:unknown;
    toolChoice?:unknown;
  };
  response?:{
    httpStatus:number;
    requestIds:Record<string,string>;
    model?:string;
    provider?:string;
    finishReason?:string;
    inputTokens?:number;
    outputTokens?:number;
    costUsd?:number;
    latencyMs:number;
  };
  failureClass?:string;
  diagnostic?:ModelGatewayDiagnostic;
}

export interface OpenRouterDiagnosticReport {
  model:string;
  profile:OpenRouterDiagnosticProfile;
  startedAt:OpenRouterDiagnosticStage;
  stoppedAt?:OpenRouterDiagnosticStage;
  stages:OpenRouterDiagnosticStageResult[];
}

export async function runOpenRouterDiagnostic(input:{
  gateway:OpenRouterGateway;
  productionRequest:ModelRequest;
  timeoutMs:number;
  startAt?:OpenRouterDiagnosticStage;
  profile?:OpenRouterDiagnosticProfile;
  signal?:AbortSignal;
}):Promise<OpenRouterDiagnosticReport> {
  if (!Number.isInteger(input.timeoutMs)||input.timeoutMs<1_000||input.timeoutMs>75_000) {
    throw new Error("OpenRouter diagnostic timeout must be between 1000 and 75000 milliseconds");
  }
  const startAt=input.startAt??"A";
  const profile=input.profile??"standard";
  const bodies=diagnosticBodies(input.productionRequest,profile).slice(OPENROUTER_DIAGNOSTIC_STAGES.indexOf(startAt));
  const stages:OpenRouterDiagnosticStageResult[]=[];
  for (const [stage,body] of bodies) {
    const serialized=JSON.stringify(body);
    const request=await requestManifest(serialized);
    try {
      const result=await input.gateway.probeSerialized(serialized,input.timeoutMs,input.signal);
      const response=responseSummary(result.response,result.httpStatus,result.elapsedMs,result.requestIds);
      validateStageResponse(stage,result.response,profile);
      stages.push({stage,state:"passed",request,response});
    } catch (error) {
      const gatewayError=error instanceof ModelGatewayError?error:undefined;
      stages.push({
        stage,state:"failed",request,
        failureClass:gatewayError?.failureClass??"diagnostic_validation_failure",
        diagnostic:gatewayError?.gatewayDiagnostic
      });
      return {model:input.productionRequest.route.selectedModel,profile,startedAt:startAt,stoppedAt:stage,stages};
    }
  }
  return {model:input.productionRequest.route.selectedModel,profile,startedAt:startAt,stages};
}

function diagnosticBodies(request:ModelRequest,profile:OpenRouterDiagnosticProfile):Array<[OpenRouterDiagnosticStage,Record<string,unknown>]> {
  const production=JSON.parse(buildOpenRouterRequest(request).body) as Record<string,unknown>;
  const privacy={data_collection:"deny",zdr:true};
  const tinyMessages=[{role:"user",content:"Reply with OK."}];
  const simpleSchema={
    type:"json_schema",
    json_schema:{name:"gateway_probe",strict:true,schema:{
      type:"object",additionalProperties:false,required:["ok"],properties:{ok:{const:true}}
    }}
  };
  const tool={type:"function",function:{
    name:"report_ok",description:"Report successful tool calling.",
    parameters:{type:"object",additionalProperties:false,required:["ok"],properties:{ok:{const:true}}}
  }};
  const stageE={...production,messages:[{role:"system",content:"Return one valid bounded action plan."},{role:"user",content:"Inspect the current page."}],max_tokens:256,stream:false};
  if (profile==="production_bisection") return productionBisectionBodies(production,simpleSchema);
  return [
    ["A",{model:request.route.selectedModel,messages:tinyMessages,max_tokens:8,stream:false,provider:privacy}],
    ["B",{model:request.route.selectedModel,messages:tinyMessages,max_tokens:8,stream:false,provider:production.provider}],
    ["C",{model:request.route.selectedModel,messages:[{role:"user",content:'Return {"ok":true}.'}],max_tokens:32,stream:false,
      provider:production.provider,response_format:simpleSchema}],
    ["D",{model:request.route.selectedModel,messages:[{role:"user",content:"Call report_ok with ok=true."}],max_tokens:32,stream:false,
      provider:production.provider,tools:[tool],tool_choice:{type:"function",function:{name:"report_ok"}}}],
    ["E",stageE],
    ["F",{...production,stream:false}]
  ];
}

function productionBisectionBodies(
  production:Record<string,unknown>,simpleSchema:Record<string,unknown>
):Array<[OpenRouterDiagnosticStage,Record<string,unknown>]> {
  const responseFormat=isRecord(production.response_format)?production.response_format:{};
  const jsonSchema=isRecord(responseFormat.json_schema)?responseFormat.json_schema:{};
  const boundedSchema=isRecord(jsonSchema.schema)?jsonSchema.schema:{};
  const boundedPlanTool={type:"function",function:{
    name:"submit_bounded_action_plan",
    description:"Submit the next bounded action plan for deterministic runtime validation.",
    parameters:boundedSchema
  }};
  const toolChoice={type:"function",function:{name:"submit_bounded_action_plan"}};
  const productionMessages=production.messages;
  const syntheticMessages=[{role:"system",content:"Choose one safe typed action."},{role:"user",content:"Inspect the current page."}];
  return [
    ["A",{...production,messages:[{role:"user",content:"Reply OK."}],max_tokens:8,stream:false,response_format:undefined}],
    ["B",{...production,messages:[{role:"user",content:'Return {"ok":true}. '}],max_tokens:32,stream:false,response_format:simpleSchema}],
    ["C",{...production,messages:Array.isArray(productionMessages)&&productionMessages.length>0
      ? [productionMessages[0],{role:"user",content:'Return {"ok":true}. '}]
      : [{role:"user",content:'Return {"ok":true}. '}],max_tokens:32,stream:false,response_format:simpleSchema}],
    ["D",{...production,messages:syntheticMessages,max_tokens:256,stream:false,response_format:undefined,
      tools:[boundedPlanTool],tool_choice:toolChoice}],
    ["E",{...production,stream:false,response_format:undefined,tools:[boundedPlanTool],tool_choice:toolChoice}],
    ["F",{...production,stream:false,tools:[boundedPlanTool],tool_choice:toolChoice}]
  ];
}

async function requestManifest(serialized:string):Promise<OpenRouterDiagnosticStageResult["request"]> {
  const body=JSON.parse(serialized) as Record<string,unknown>;
  const messages=Array.isArray(body.messages)?body.messages:[];
  return {
    bodyHash:await sha256Text(serialized),
    bodyBytes:new TextEncoder().encode(serialized).byteLength,
    topLevelFields:Object.keys(body).sort(),
    messageRoles:messages.map((message)=>recordString(message,"role")??"unknown"),
    messageContentBytes:messages.map((message)=>new TextEncoder().encode(recordString(message,"content")??JSON.stringify(recordValue(message,"content")??null)).byteLength),
    maxTokens:typeof body.max_tokens==="number"?body.max_tokens:undefined,
    stream:typeof body.stream==="boolean"?body.stream:undefined,
    provider:body.provider,
    responseFormat:body.response_format,
    tools:body.tools,
    toolChoice:body.tool_choice
  };
}

function validateStageResponse(stage:OpenRouterDiagnosticStage,response:unknown,profile:OpenRouterDiagnosticProfile) {
  const message=responseMessage(response);
  if (profile==="production_bisection") {
    if (stage==="A") {
      if (typeof message.content!=="string"||!message.content.trim()) throw new Error("diagnostic response is missing content");
      return;
    }
    if (stage==="B"||stage==="C") {
      const parsed=JSON.parse(typeof message.content==="string"?message.content:"") as {ok?:unknown};
      if (parsed.ok!==true) throw new Error("diagnostic structured response did not return ok=true");
      return;
    }
    validateBoundedPlanToolCall(message);
    return;
  }
  if (stage==="D") {
    const functionCall=responseFunctionCall(message,"report_ok");
    const argumentsValue=JSON.parse(functionCall.arguments) as {ok?:unknown};
    if (argumentsValue.ok!==true) throw new Error("diagnostic report_ok call did not return ok=true");
    return;
  }
  if (typeof message.content!=="string"||!message.content.trim()) throw new Error("diagnostic response is missing content");
  if (stage==="C") {
    const parsed=JSON.parse(message.content) as {ok?:unknown};
    if (parsed.ok!==true) throw new Error("diagnostic structured response did not return ok=true");
  }
  if (stage==="E"||stage==="F") boundedActionPlanSchema.parse(JSON.parse(message.content));
}

function validateBoundedPlanToolCall(message:Record<string,unknown>) {
  const functionCall=responseFunctionCall(message,"submit_bounded_action_plan");
  boundedActionPlanSchema.parse(JSON.parse(functionCall.arguments));
}

function responseFunctionCall(message:Record<string,unknown>,expectedName:string):{name:string;arguments:string} {
  const toolCall=Array.isArray(message.tool_calls)&&isRecord(message.tool_calls[0])?message.tool_calls[0]:undefined;
  const functionCall=toolCall&&isRecord(toolCall.function)?toolCall.function:undefined;
  if (functionCall?.name!==expectedName||typeof functionCall.arguments!=="string") {
    throw new Error(`diagnostic tool response is missing the required ${expectedName} call`);
  }
  return {name:functionCall.name,arguments:functionCall.arguments};
}

function responseSummary(
  response:unknown,httpStatus:number,latencyMs:number,requestIds:Partial<Record<string,string>>
):NonNullable<OpenRouterDiagnosticStageResult["response"]> {
  const record=isRecord(response)?response:{};
  const usage=isRecord(record.usage)?record.usage:{};
  const choice=Array.isArray(record.choices)&&isRecord(record.choices[0])?record.choices[0]:{};
  return {
    httpStatus,
    requestIds:Object.fromEntries(
      Object.entries(requestIds).filter((entry):entry is [string,string]=>typeof entry[1]==="string")
    ),
    model:typeof record.model==="string"?record.model:undefined,
    provider:typeof record.provider==="string"?record.provider:undefined,
    finishReason:typeof choice.finish_reason==="string"?choice.finish_reason:undefined,
    inputTokens:typeof usage.prompt_tokens==="number"?usage.prompt_tokens:undefined,
    outputTokens:typeof usage.completion_tokens==="number"?usage.completion_tokens:undefined,
    costUsd:typeof usage.cost==="number"?usage.cost:undefined,
    latencyMs
  };
}

function responseMessage(response:unknown):Record<string,unknown> {
  if (!isRecord(response)||!Array.isArray(response.choices)||!isRecord(response.choices[0])) return {};
  return isRecord(response.choices[0].message)?response.choices[0].message:{};
}

function isRecord(value:unknown):value is Record<string,unknown> {
  return Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
}

function recordString(value:unknown,key:string):string|undefined {
  return isRecord(value)&&typeof value[key]==="string"?value[key] as string:undefined;
}

function recordValue(value:unknown,key:string):unknown {
  return isRecord(value)?value[key]:undefined;
}
