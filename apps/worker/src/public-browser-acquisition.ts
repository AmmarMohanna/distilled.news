import {AuthenticatedBrowserBridgeError,type AuthenticatedBrowserExecutionCapability,type PublicBrowserObservation} from "@distilled/agent-runtime";
import {CloudflareContainerBrowserBridgeTransport} from "./cloudflare-container-browser-transport";
import type {Env} from "./types";

type Input={sourceUrl:string;articlePathPrefix:string;maxArticles?:number};
export async function handlePublicBrowserAcquisition(request:Request,env:Env):Promise<Response>{
  if(request.method!=="POST"||!env.BRIDGE_PREFLIGHT_TOKEN)return Response.json({error:"not found"},{status:404});
  if((request.headers.get("authorization")??"").replace(/^Bearer\s+/i,"").trim()!==env.BRIDGE_PREFLIGHT_TOKEN)return Response.json({error:"unauthorized"},{status:401});
  if((env.DISTILLED_BROWSER_PROVIDER??"").trim().toLowerCase()!=="cloudflare_container"||!env.AUTHENTICATED_BROWSER_CONTAINER)return Response.json({error:"container_not_selected"},{status:409});
  const input=await request.json().catch(()=>null) as Partial<Input>|null;let source:URL;try{source=new URL(String(input?.sourceUrl??""));if(source.protocol!=="https:"||source.username||source.password)throw new Error()}catch{return Response.json({error:"invalid_source"},{status:400})}
  const prefix=String(input?.articlePathPrefix??"");if(!prefix.startsWith("/")||prefix.length>256)return Response.json({error:"invalid_article_path_prefix"},{status:400});
  const maxArticles=Math.min(20,Math.max(1,Number.isInteger(input?.maxArticles)?Number(input?.maxArticles):10));
  const runId=`public_browser_${crypto.randomUUID().replaceAll("-","")}`,capability:AuthenticatedBrowserExecutionCapability={bridgeExecutionId:runId,bootstrapRequestId:runId,runId,tenantId:"public_acquisition",ownerId:"public_acquisition",profileId:"public_acquisition",expectedProfileVersion:0,browserGeneration:1,authFlowId:`public_flow_${runId}`,siteKind:"PUBLIC",authEntryPoint:source.href,sessionProbeUrl:source.href,allowedOrigins:[source.origin],writeOrigins:[],issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+120_000).toISOString(),operationBudget:2+maxArticles*2};
  const transport=new CloudflareContainerBrowserBridgeTransport(env.AUTHENTICATED_BROWSER_CONTAINER);let sessionId:string|undefined;let closed=false;
  try{
    const opened=await transport.execute({protocol:"v1",operationId:crypto.randomUUID(),capability,operation:"OPEN_AUTH_BROWSER"}) as {sessionId:string;runId:string;tenantId:string;generation:number};if(opened.runId!==runId||opened.tenantId!=="public_acquisition"||opened.generation!==1)throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");sessionId=opened.sessionId;
    const listing=await navigateAndObserve(transport,capability,source.href);const candidateUrls=[...new Set(listing.controls.map(control=>control.destinationUrl).filter((url):url is string=>typeof url==="string"&&sameOrigin(url,source)&&new URL(url).pathname.startsWith(prefix)))].slice(0,maxArticles);
    const articles:PublicBrowserObservation[]=[];for(const url of candidateUrls){const observation=await navigateAndObserve(transport,capability,url);if(observation.article)articles.push(observation)}
    await close();return Response.json({provider:"CLOUDFLARE_CONTAINER",browserBackend:"container",listing,articles,candidateUrlCount:candidateUrls.length,cleanup:true,synthetic:false});
  }catch(error){await close();return Response.json({error:error instanceof Error?error.name:"public_browser_acquisition_failed",provider:"CLOUDFLARE_CONTAINER",cleanup:closed},{status:502});}
  async function close(){if(sessionId&&!closed){closed=true;await transport.execute({protocol:"v1",operationId:crypto.randomUUID(),capability,operation:"CLOSE_AUTH_BROWSER"}).catch(()=>undefined);sessionId=undefined;}}
}
async function navigateAndObserve(transport:CloudflareContainerBrowserBridgeTransport,capability:AuthenticatedBrowserExecutionCapability,url:string){await transport.execute({protocol:"v1",operationId:crypto.randomUUID(),capability,operation:"NAVIGATE_PUBLIC_PAGE",url});return await transport.execute({protocol:"v1",operationId:crypto.randomUUID(),capability,operation:"OBSERVE_PUBLIC_PAGE"}) as PublicBrowserObservation;}
function sameOrigin(value:string,source:URL){try{return new URL(value).origin===source.origin}catch{return false}}
