import {AuthenticatedBrowserBridgeError,chooseWithFallback,validateBoundedDecision,type BoundedDecisionProvider,type BoundedDecisionRequest,type BrowserAllocation,type AuthenticatedBrowserExecutionCapability,type SelfHostedChromiumProvider,type BrowserObservationData} from "@distilled/agent-runtime";

export async function advancePublicDiscovery(input:{provider:SelfHostedChromiumProvider;scope:BrowserAllocation;capability:AuthenticatedBrowserExecutionCapability;pageRevision:string;inspected:Set<string>;decisionProvider?:BoundedDecisionProvider}){
  const {provider,scope,capability:cap}=input;
  if(cap.siteKind!=="PUBLIC"||cap.allowedOrigins.length!==1)throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");
  const observed=await provider.observePublicPage(scope);
  if(observed.pageRevision!==input.pageRevision)throw new AuthenticatedBrowserBridgeError("BRIDGE_OBSERVATION_STALE");
  if(observed.challengeState!=="NO_CHALLENGE")return{fallback:true};
  const links=[...new Set([...(observed.listingLinks??[]),...observed.controls.map(control=>control.destinationUrl).filter((value):value is string=>!!value)])]
    .filter(value=>{try{const url=new URL(value);return cap.allowedOrigins.includes(url.origin)&&url.protocol==="https:"&&!url.username&&!url.password&&!input.inspected.has(value)&&/\/20\d{2}\/|\/article\//.test(url.pathname)}catch{return false}}).slice(0,6);
  const article=!!observed.article;
  const choices:BoundedDecisionRequest["choices"]=[{id:"choice_0",action:"STOP",description:"Stop micro-discovery and let the generative agent synthesize the observed structure"},{id:"choice_1",action:"REOBSERVE",description:"Re-observe this page if its structure is not yet clear"}];
  if(article)choices.push({id:"choice_2",action:"RETURN_TO_LISTING",description:"Return to the authorized listing to inspect another item or continuation"});
  else{
    choices.push({id:"choice_2",action:"SCROLL",description:"Scroll the listing to understand dynamic continuation and find additional items"});
    links.forEach((_,index)=>choices.push({id:`choice_${index+3}`,action:"OPEN_OBSERVED_ITEM",targetId:`target_${index}`,description:`Open uninspected observed article target ${index} to understand canonical, timestamp and content structure`}));
  }
  const request:BoundedDecisionRequest={runId:cap.runId,kind:"PUBLIC_DISCOVERY",browserGeneration:cap.browserGeneration,observationRevision:observed.pageRevision,expiresAt:cap.expiresAt,summary:{pageType:article?"article":observed.url===cap.authEntryPoint?"listing":"unknown",observedItemCount:links.length,inspectedItemCount:input.inspected.size},choices};
  const decisionProvider=input.decisionProvider??httpDecisionProvider();
  const decision=await chooseWithFallback(decisionProvider,request,0.75);
  if(!decision)return{fallback:true};
  const fresh=await provider.observePublicPage(scope);
  let choice:BoundedDecisionRequest["choices"][number];
  try{choice=validateBoundedDecision(request,decision,{revision:fresh.pageRevision,generation:scope.generation,now:Date.now()},0.75)}catch{throw new AuthenticatedBrowserBridgeError("BRIDGE_OBSERVATION_STALE")}
  let observation:BrowserObservationData|undefined;
  switch(choice.action){
    case"STOP":return{fallback:false,action:"STOP"};
    case"REOBSERVE":observation=fresh;break;
    case"SCROLL":observation=await provider.scroll(scope,1200);break;
    case"RETURN_TO_LISTING":observation=await provider.navigatePublicPage(scope,cap.authEntryPoint,cap.allowedOrigins);break;
    case"OPEN_OBSERVED_ITEM":{
      const target=links[Number(choice.targetId!.split("_")[1])];
      if(!target)throw new AuthenticatedBrowserBridgeError("BRIDGE_OBSERVATION_STALE");
      observation=await provider.navigatePublicPage(scope,target,cap.allowedOrigins);input.inspected.add(target);break;
    }
  }
  if(!observation||!cap.allowedOrigins.includes(new URL(observation.url).origin))throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED");
  return{fallback:false,action:choice.action,observation};
}

function httpDecisionProvider():BoundedDecisionProvider{return{async choose(request,signal){
  const endpoint=process.env.DISTILLED_DECISION_URL,token=process.env.DISTILLED_DECISION_AUTH;
  if(process.env.DISTILLED_DISCOVERY_DECISION_MODE!=="JEV_HYBRID"||!endpoint||!token||new URL(endpoint).protocol!=="https:")throw new Error("decision_provider_disabled");
  const response=await fetch(endpoint,{method:"POST",redirect:"error",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(request),signal:signal??AbortSignal.timeout(6500)});
  if(!response.ok||Number(response.headers.get("content-length")??0)>8192)throw new Error("decision_provider_failed");
  const text=await response.text();if(text.length>8192)throw new Error("decision_provider_oversized");
  const result=JSON.parse(text);if(!result.decision)throw new Error("decision_fallback");return result.decision;
}}}
