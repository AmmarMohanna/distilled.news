export type DiscoveryDecisionMode="GENERATIVE_ONLY"|"JEV_HYBRID";
export type BrowserDecisionAction="SCROLL"|"OPEN_OBSERVED_ITEM"|"REOBSERVE"|"RETURN_TO_LISTING"|"STOP";
export interface BoundedDecisionChoice {id:string;action:BrowserDecisionAction;targetId?:string;description:string}
export interface BoundedDecisionRequest {
  runId:string;kind:"PUBLIC_DISCOVERY";browserGeneration:number;observationRevision:string;expiresAt:string;
  summary:{pageType:"listing"|"article"|"unknown";observedItemCount:number;inspectedItemCount:number};
  choices:BoundedDecisionChoice[];
}
export interface BoundedDecisionResult {choiceId:string;confidence:number;probabilities:Record<string,number>;provider:string;model:string;inputTokens?:number}
export interface BoundedDecisionProvider {choose(request:BoundedDecisionRequest,signal?:AbortSignal):Promise<BoundedDecisionResult>}
export function assertBoundedDecisionRequest(value:BoundedDecisionRequest):void{
  if(!value||value.kind!=="PUBLIC_DISCOVERY"||!/^[-A-Za-z0-9_]{1,128}$/.test(value.runId)||!Number.isInteger(value.browserGeneration)||value.browserGeneration<1||typeof value.observationRevision!=="string"||value.observationRevision.length>128||!Number.isFinite(Date.parse(value.expiresAt))||!value.summary||!["listing","article","unknown"].includes(value.summary.pageType)||!Number.isInteger(value.summary.observedItemCount)||value.summary.observedItemCount<0||value.summary.observedItemCount>32||!Number.isInteger(value.summary.inspectedItemCount)||value.summary.inspectedItemCount<0||value.summary.inspectedItemCount>32||!Array.isArray(value.choices)||value.choices.length<2||value.choices.length>12)throw new Error("bounded_decision_request_invalid");
  const ids=new Set<string>();
  for(const choice of value.choices){if(!choice||!/^choice_[0-9]{1,2}$/.test(choice.id)||ids.has(choice.id)||!["SCROLL","OPEN_OBSERVED_ITEM","REOBSERVE","RETURN_TO_LISTING","STOP"].includes(choice.action)||typeof choice.description!=="string"||choice.description.length>200||(choice.targetId!==undefined&&!/^target_[0-9]{1,2}$/.test(choice.targetId))||(choice.action==="OPEN_OBSERVED_ITEM"&&!choice.targetId))throw new Error("bounded_decision_choice_invalid");ids.add(choice.id)}
}
export function validateBoundedDecision(request:BoundedDecisionRequest,result:BoundedDecisionResult,current:{revision:string;generation:number;now:number},threshold:number):BoundedDecisionChoice{
  assertBoundedDecisionRequest(request);
  if(current.revision!==request.observationRevision||current.generation!==request.browserGeneration||current.now>=Date.parse(request.expiresAt))throw new Error("bounded_decision_stale");
  const choice=request.choices.find(value=>value.id===result?.choiceId);
  if(!choice||!Number.isFinite(result.confidence)||result.confidence<0||result.confidence>1||!result.probabilities||Object.entries(result.probabilities).some(([id,p])=>!request.choices.some(value=>value.id===id)||!Number.isFinite(p)||p<0||p>1))throw new Error("bounded_decision_result_invalid");
  if(result.confidence<threshold)throw new Error("bounded_decision_low_confidence");
  return choice;
}
export async function chooseWithFallback(provider:BoundedDecisionProvider,request:BoundedDecisionRequest,threshold:number,signal?:AbortSignal):Promise<BoundedDecisionResult|undefined>{
  try{signal?.throwIfAborted();const result=await provider.choose(request,signal);signal?.throwIfAborted();validateBoundedDecision(request,result,{revision:request.observationRevision,generation:request.browserGeneration,now:Date.now()},threshold);return result}catch{return undefined}
}
