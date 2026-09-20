import { BRIDGE_PREFLIGHT_STAGES,runBridgePreflight } from "@distilled/agent-runtime";
import { z } from "zod";
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

async function matches(provided:string,expected:string){const encoder=new TextEncoder();const [a,b]=await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(provided)),crypto.subtle.digest("SHA-256",encoder.encode(expected))]);const x=new Uint8Array(a),y=new Uint8Array(b);let diff=0;for(let index=0;index<x.length;index++)diff|=x[index]^y[index];return diff===0}
