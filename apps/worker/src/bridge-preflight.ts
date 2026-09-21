import { AuthenticatedBrowserBridgeExecutor,BRIDGE_PREFLIGHT_STAGES,XAuthenticatedSiteAdapter,runBridgePreflight,type AuthenticatedBrowserBridgeRequest,type AuthenticatedBrowserExecutionCapability } from "@distilled/agent-runtime";
import { z } from "zod";
import { authenticatedBackend } from "./authenticated-profile-bootstrap";
import { CloudflareContainerBrowserBridgeTransport } from "./cloudflare-container-browser-transport";
import type { Env } from "./types";

const inputSchema=z.object({stage:z.enum(BRIDGE_PREFLIGHT_STAGES as unknown as [string,...string[]]),siteOrigin:z.string().url().max(200),markers:z.object({identifier:z.string().startsWith("TEST_").max(120),password:z.string().startsWith("TEST_").max(120)}).strict(),idleWaitMs:z.number().int().min(1_000).max(60_000).optional()}).strict();

/**
 * Synthetic self-hosted bridge preflight, executed from the production Worker so it proves the deployed configuration
 * (URL, dedicated credential, egress, TLS). It is inert (404) unless a dedicated BRIDGE_PREFLIGHT_TOKEN secret exists, uses
 * no D1, R2, keyring or account credential, contacts only the configured bridge, and returns check names and typed codes only.
 */
export async function handleBridgePreflight(request:Request,env:Env):Promise<Response>{
  if(!env.BRIDGE_PREFLIGHT_TOKEN)return Response.json({error:"not found"},{status:404});
  if(!await matches(request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"",env.BRIDGE_PREFLIGHT_TOKEN))return Response.json({error:"unauthorized"},{status:401});
  const url=env.SELF_HOSTED_BROWSER_BRIDGE_URL?.trim(),credential=env.SELF_HOSTED_BROWSER_BRIDGE_AUTH?.trim();
  const configuration={providerSelfHosted:(env.DISTILLED_BROWSER_PROVIDER??"").trim().toLowerCase()==="self_hosted",bridgeUrlConfigured:!!url,dedicatedAuthConfigured:!!credential,https:!!url&&new URL(url).protocol==="https:"};
  if(!url||!credential)return Response.json({error:"bridge_not_configured",configuration},{status:503});
  const parsed=inputSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:"invalid_request"},{status:400});
  try{
    const result=await runBridgePreflight({url,serviceCredential:credential,allowLoopbackHttp:env.ENVIRONMENT==="development"},{...parsed.data,stage:parsed.data.stage as (typeof BRIDGE_PREFLIGHT_STAGES)[number]});
    return Response.json({...result,configuration},{status:result.pass?200:502});
  }catch{return Response.json({error:"preflight_failed",configuration},{status:502})}
}

/**
 * Reports which browser the authenticated bootstrap would actually use, computed by the SAME selection function the bootstrap
 * calls (not by re-parsing configuration), in the deployed runtime. It reports the bridge only if the selected executor really is
 * the bridge executor. Inert (404) without the dedicated operator token. It reveals no URL, credential, token or profile data,
 * and contacts nothing: selecting a backend only constructs an executor.
 */
export async function handleProviderDiagnostic(request:Request,env:Env):Promise<Response>{
  if(!env.BRIDGE_PREFLIGHT_TOKEN)return Response.json({error:"not found"},{status:404});
  if(!await matches(request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"",env.BRIDGE_PREFLIGHT_TOKEN))return Response.json({error:"unauthorized"},{status:401});
  const containerConfigured=!!env.AUTHENTICATED_BROWSER_CONTAINER,bridgeConfigured=containerConfigured||!!env.SELF_HOSTED_BROWSER_BRIDGE_URL?.trim()&&!!env.SELF_HOSTED_BROWSER_BRIDGE_AUTH?.trim();
  try{
    const selected=authenticatedBackend(env,{runId:"provider_diagnostic",bootstrapRequestId:"provider_diagnostic",profile:{id:"provider_diagnostic",tenantId:"provider_diagnostic",ownerId:"provider_diagnostic",version:0},adapter:new XAuthenticatedSiteAdapter()});
    const bridgeExecutor=selected.executor instanceof AuthenticatedBrowserBridgeExecutor;
    const providerSecret=(env.DISTILLED_BROWSER_PROVIDER??"").trim().toLowerCase();
    return Response.json({authenticatedBrowserProvider:selected.providerIdentity??"UNKNOWN",providerSelfHosted:selected.providerIdentity==="SELF_HOSTED_CHROMIUM"&&providerSecret==="self_hosted",providerContainer:selected.providerIdentity==="CLOUDFLARE_CONTAINER",bridgeConfigured,containerConfigured,bridgeExecutor});
  }catch{return Response.json({authenticatedBrowserProvider:"UNRESOLVED",providerSelfHosted:false,bridgeConfigured,error:"provider_resolution_failed"})}
}

/** Native Container-only synthetic proof: open Chromium, take one trusted observation, and close. */
export async function handleContainerPreflight(request:Request,env:Env):Promise<Response>{
  if(request.method!=="POST"||!env.BRIDGE_PREFLIGHT_TOKEN)return Response.json({error:"not found"},{status:404});
  if(!await matches(request.headers.get("authorization")?.replace(/^Bearer\s+/i,"").trim()??"",env.BRIDGE_PREFLIGHT_TOKEN))return Response.json({error:"unauthorized"},{status:401});
  if((env.DISTILLED_BROWSER_PROVIDER??"").trim().toLowerCase()!=="cloudflare_container"||!env.AUTHENTICATED_BROWSER_CONTAINER)return Response.json({error:"container_not_selected"},{status:409});
  let capability:AuthenticatedBrowserExecutionCapability|undefined;
  let sessionId:string|undefined;
  try{
    const transport=new CloudflareContainerBrowserBridgeTransport(env.AUTHENTICATED_BROWSER_CONTAINER);
    const issuedAt=new Date().toISOString();
    capability={bridgeExecutionId:"bridge_execution_container_preflight",bootstrapRequestId:"container_preflight",runId:"container_preflight",tenantId:"container_preflight",ownerId:"container_preflight",profileId:"container_preflight",expectedProfileVersion:0,browserGeneration:1,authFlowId:"auth_flow_container_preflight",siteKind:"synthetic",authEntryPoint:"https://example.com/login",sessionProbeUrl:"https://example.com/home",allowedOrigins:["https://example.com"],writeOrigins:[],issuedAt,expiresAt:new Date(Date.now()+120_000).toISOString(),operationBudget:8};
    const open=await transport.execute({protocol:"v1",operationId:crypto.randomUUID(),capability,operation:"OPEN_AUTH_BROWSER"}) as {sessionId:string;runId:string;tenantId:string;generation:number};
    if(open.runId!==capability.runId||open.tenantId!==capability.tenantId||open.generation!==capability.browserGeneration)throw new Error("container_fence_mismatch");
    sessionId=open.sessionId;
    const observation=await transport.execute({protocol:"v1",operationId:crypto.randomUUID(),capability,operation:"OBSERVE_AUTH_SURFACE",wait:"AUTH_SURFACE"});
    await transport.execute({protocol:"v1",operationId:crypto.randomUUID(),capability,operation:"CLOSE_AUTH_BROWSER"});sessionId=undefined;
    return Response.json({pass:true,provider:"CLOUDFLARE_CONTAINER",allocated:true,observed:!!observation,cleanup:true,synthetic:true});
  }catch(error){
    if(capability&&sessionId){try{await new CloudflareContainerBrowserBridgeTransport(env.AUTHENTICATED_BROWSER_CONTAINER).execute({protocol:"v1",operationId:crypto.randomUUID(),capability,operation:"CLOSE_AUTH_BROWSER"})}catch{/* cleanup is best effort after a failed synthetic probe */}}
    return Response.json({pass:false,provider:"CLOUDFLARE_CONTAINER",error:error instanceof Error?error.name:"preflight_failed"},{status:502});
  }
}

async function matches(provided:string,expected:string){const encoder=new TextEncoder();const [a,b]=await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(provided)),crypto.subtle.digest("SHA-256",encoder.encode(expected))]);const x=new Uint8Array(a),y=new Uint8Array(b);let diff=0;for(let index=0;index<x.length;index++)diff|=x[index]^y[index];return diff===0}
