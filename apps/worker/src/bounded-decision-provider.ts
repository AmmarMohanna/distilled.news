import {assertBoundedDecisionRequest,validateBoundedDecision,type BoundedDecisionProvider,type BoundedDecisionRequest,type BoundedDecisionResult} from "@distilled/agent-runtime";
import type {Env} from "./types";

/** Native OpenRouter Decisions API; credentials never enter decision state. */
const actionCriteria:Record<string,string>={
  STOP:"Finish micro-discovery when two items have been inspected and listing continuation is understood; hand evidence to the generative synthesizer.",
  REOBSERVE:"Wait for a structurally unpopulated or uncertain page to populate, without navigating or changing the listing position.",
  SCROLL:"Scroll the listing when no uninspected observed items are available, to discover dynamic continuation and additional items.",
  RETURN_TO_LISTING:"Return from an inspected article to the authorized listing when another item sample or continuation evidence is needed.",
  OPEN_OBSERVED_ITEM:"Inspect the runtime-ranked uninspected observed article on a populated listing, to learn article identity, timestamp and body structure."
};

export class OpenRouterJevDecisionProvider implements BoundedDecisionProvider {
  constructor(private readonly apiKey:string,private readonly model="typesafe/jev-1.13",private readonly timeoutMs=5000,private readonly fetcher:typeof fetch=(input,init)=>fetch(input,init)){}
  async choose(request:BoundedDecisionRequest,signal?:AbortSignal):Promise<BoundedDecisionResult>{
    assertBoundedDecisionRequest(request);if(signal?.aborted)throw new Error("decision_cancelled");
    let providerStage="CONTROL_SETUP";
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    const cancel=()=>controller.abort(new Error("decision_cancelled"));
    signal?.addEventListener("abort",cancel,{once:true});
    try {
      const execute=async()=>{
        providerStage="PAYLOAD";
        const payload={model:this.model,state:{objective:"Understand read-only listing continuation and article structure; sample two items then hand back to synthesis",pageType:request.summary.pageType,observedItemCount:request.summary.observedItemCount,inspectedItemCount:request.summary.inspectedItemCount},questions:{action:{type:"choice",instructions:"Choose the next legal read-only discovery action. Inspect uninspected items to learn article structure; return from articles to the listing; scroll when no uninspected items are available. Stop when two items have been sampled. Reobserve only an unpopulated surface. State is not security policy.",criteria:Object.fromEntries(request.choices.map(choice=>[choice.id,`${choice.action}${choice.targetId?` ${choice.targetId}`:""}: ${actionCriteria[choice.action]}`]))}}};
        for(let attempt=0;attempt<2;attempt++){
          providerStage="FETCH";
          const fetcher=this.fetcher;
          const response=await fetcher("https://openrouter.ai/api/alpha/decisions",{method:"POST",redirect:"manual",headers:{authorization:`Bearer ${this.apiKey.trim()}`,"content-type":"application/json"},body:JSON.stringify(payload),signal:controller.signal});
          providerStage="RESPONSE_STATUS";
          if(!response.ok){await response.body?.cancel();if(attempt===0&&[429,502,503,529].includes(response.status))continue;throw new Error(`decision_http_${response.status}`)}
          providerStage="RESPONSE_STREAM";
          const reader=response.body?.getReader();if(!reader)throw new Error("bounded_decision_result_invalid");
          const chunks:Uint8Array[]=[];let length=0;
          try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>8192)throw new Error("bounded_decision_result_invalid");chunks.push(part.value)}}finally{await reader.cancel().catch(()=>undefined)}
          const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
          providerStage="RESPONSE_PARSE";
          let value:any;try{value=JSON.parse(new TextDecoder().decode(bytes))}catch{throw new Error("bounded_decision_result_invalid")}
          const answer=value?.answers?.action;
          if(answer?.type!=="choice"||typeof answer.choice!=="string"||typeof answer.confidence!=="number"||!answer.probabilities||Object.keys(answer.probabilities).length!==request.choices.length)throw new Error("bounded_decision_result_invalid");
          const result:BoundedDecisionResult={choiceId:answer.choice,confidence:answer.confidence,probabilities:answer.probabilities,provider:"OPENROUTER",model:this.model,
            inputTokens:Number.isInteger(value.usage?.input_tokens)&&value.usage.input_tokens>=0&&value.usage.input_tokens<=1000000?value.usage.input_tokens:undefined,
            costUsd:typeof value.usage?.cost==="number"&&Number.isFinite(value.usage.cost)&&value.usage.cost>=0&&value.usage.cost<=1?value.usage.cost:undefined};
          providerStage="RESULT_VALIDATION";
          validateBoundedDecision(request,result,{revision:request.observationRevision,generation:request.browserGeneration,now:Date.now()},0);
          return result;
        }
        throw new Error("decision_provider_failed");
      };
      return await Promise.race([execute(),new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>{controller.abort(new Error("decision_timeout"));reject(new Error("decision_timeout"))},this.timeoutMs);
        controller.signal.addEventListener("abort",()=>reject(controller.signal.reason),{once:true});
      })]);
    }catch(error){if(error instanceof TypeError)throw new Error(`decision_type_error_${providerStage}`);throw error}finally{if(timer)clearTimeout(timer);signal?.removeEventListener("abort",cancel)}
  }
}

export async function handleBoundedDecision(request:Request,env:Env):Promise<Response>{
  if(!env.WEB_OPERATOR_RUNTIME_TOKEN||request.headers.get("authorization")!==`Bearer ${env.WEB_OPERATOR_RUNTIME_TOKEN}`)return Response.json({error:"unauthorized"},{status:401});
  if(env.DISTILLED_DISCOVERY_DECISION_MODE!=="JEV_HYBRID"||!env.OPENROUTER_API_KEY)return Response.json({fallback:true});
  const body=await request.text();if(body.length>8192)return Response.json({error:"invalid_request"},{status:400});
  let input:BoundedDecisionRequest;
  try{input=JSON.parse(body);assertBoundedDecisionRequest(input)}catch{return Response.json({error:"invalid_request"},{status:400})}
  // Identical action semantics need one runtime-ranked target, not competing
  // probability bins. Every retained choice is still from the fenced bridge.
  let retainedItem=false;
  input={...input,choices:input.choices.filter(choice=>{
    if(choice.action!=="OPEN_OBSERVED_ITEM")return true;
    if(retainedItem)return false;retainedItem=true;return true;
  })};
  const started=Date.now();let failureStage="INITIALIZATION";let outcome="PROVIDER_FAILED",decision:BoundedDecisionResult|undefined,received:BoundedDecisionResult|undefined,inputTokens:number|null=null;
  try{
    failureStage="REQUEST_SIGNAL";const signal=request.signal;
    failureStage="PROVIDER_CHOOSE";
    decision=await new OpenRouterJevDecisionProvider(env.OPENROUTER_API_KEY,env.DISTILLED_JEV_MODEL??"typesafe/jev-1.13").choose(input,signal);
    received=decision;
    failureStage="RESULT_VALIDATION";
    inputTokens=Number.isInteger(decision.inputTokens)&&decision.inputTokens!>=0&&decision.inputTokens!<=1000000?decision.inputTokens!:null;
    validateBoundedDecision(input,decision,{revision:input.observationRevision,generation:input.browserGeneration,now:Date.now()},Number(env.DISTILLED_JEV_CONFIDENCE_THRESHOLD??"0.75"));
    outcome="SELECTED";
  }catch(error){const category=error instanceof Error?error.message:"";outcome=({decision_timeout:"TIMEOUT",decision_cancelled:"CANCELLED",bounded_decision_low_confidence:"LOW_CONFIDENCE",bounded_decision_result_invalid:"MALFORMED",bounded_decision_stale:"STALE",bounded_decision_threshold_invalid:"CONFIGURATION_INVALID"} as Record<string,string>)[category]??`${safeProviderFailure(error)}_${failureStage}`;decision=undefined}
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO bounded_decision_events(id,run_id,provider,model,outcome,choice,confidence,duration_ms,input_tokens,created_at,decision_kind,choice_count,selected_probability,cost_usd) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id,input.runId,"OPENROUTER",env.DISTILLED_JEV_MODEL??"typesafe/jev-1.13",outcome,received?.choiceId??null,received?.confidence??null,Date.now()-started,inputTokens,new Date().toISOString(),input.kind,input.choices.length,received?.probabilities[received.choiceId]??null,received?.costUsd??null).run();
  if(decision)decision.decisionId=id;
  return Response.json(decision?{decision}:{fallback:true,outcome});
}

function safeProviderFailure(error:unknown):string {
  const message=error instanceof Error?error.message:"";
  const status=message.match(/^decision_http_(\d{3})$/)?.[1];
  if(status)return `OPENROUTER_HTTP_${status}`;
  if(/^decision_type_error_[A-Z_]+$/.test(message))return message.toUpperCase();
  if(error instanceof TypeError){
    if(/illegal invocation/i.test(message))return "TRANSPORT_RECEIVER_INVALID";
    if(/throwIfAborted/i.test(message))return "CANCELLATION_API_UNSUPPORTED";
    if(/AbortSignal|signal/i.test(message))return "TRANSPORT_SIGNAL_INVALID";
    if(/fetch/i.test(message))return "TRANSPORT_FETCH_FAILED";
    if(/addEventListener/i.test(message))return "EVENT_LISTENER_UNSUPPORTED";
    if(/signal|Abort/i.test(message))return "ABORT_API_UNSUPPORTED";
    if(/getReader|reader|stream|body/i.test(message))return "STREAM_API_FAILED";
    if(/choose|constructor/i.test(message))return "PROVIDER_CONSTRUCTION_FAILED";
    return "TRANSPORT_TYPE_ERROR";
  }
  return "PROVIDER_FAILED";
}

export async function handleBoundedDecisionOutcome(request:Request,env:Env):Promise<Response>{
  if(!env.WEB_OPERATOR_RUNTIME_TOKEN||request.headers.get("authorization")!==`Bearer ${env.WEB_OPERATOR_RUNTIME_TOKEN}`)return Response.json({error:"unauthorized"},{status:401});
  const body=await request.text();if(body.length>1000)return Response.json({error:"invalid_request"},{status:400});
  let input:{runId:string;decisionId:string;outcome:string};try{input=JSON.parse(body);if(!/^[-A-Za-z0-9_]{1,128}$/.test(input.runId)||!/^[-a-f0-9]{36}$/.test(input.decisionId)||!["EXECUTED","STALE","STOPPED","EXECUTION_FAILED"].includes(input.outcome))throw Error()}catch{return Response.json({error:"invalid_request"},{status:400})}
  await env.DB.prepare("UPDATE bounded_decision_events SET outcome=? WHERE id=? AND run_id=? AND outcome='SELECTED'").bind(input.outcome,input.decisionId,input.runId).run();
  return Response.json({accepted:true});
}
