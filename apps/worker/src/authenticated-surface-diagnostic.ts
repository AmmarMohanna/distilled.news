import { AuthenticatedBrowserBridgeExecutor,RuntimeAuthenticationFlowLineage,XAuthenticatedSiteAdapter } from "@distilled/agent-runtime";
import { authenticatedBackend } from "./authenticated-profile-bootstrap";
import type { Env } from "./types";

export type AuthenticatedSurfaceDiagnosticInput={authenticatedProfileId:string;tenantId:string;ownerId:string;expectedProfileVersion:number};
type Profile={id:string;tenantId:string;ownerId:string;version:number;siteFamily:string;revokedAt:string|null;disabledAt:string|null};

/** A credential-less, session-less, read-only first-surface observation. */
export async function executeAuthenticatedSurfaceDiagnostic(input:AuthenticatedSurfaceDiagnosticInput,env:Env,requestId:string,dependencies:{selectBackend?:()=>ReturnType<typeof authenticatedBackend>}={}):Promise<Response>{
  const profile=await env.DB.prepare(`SELECT p.id,p.tenant_id tenantId,p.owner_id ownerId,p.version,p.site_family siteFamily,p.revoked_at revokedAt,a.disabled_at disabledAt FROM authenticated_site_profiles p JOIN accounts a ON a.id=p.owner_id WHERE p.id=?`).bind(input.authenticatedProfileId).first<Profile>();
  if(!profile)return Response.json({error:"authenticated_profile_not_found"},{status:404});
  if(profile.tenantId!==input.tenantId||profile.ownerId!==input.ownerId||profile.tenantId!==profile.ownerId)return Response.json({error:"authenticated_profile_owner_denied"},{status:403});
  if(profile.version!==input.expectedProfileVersion)return Response.json({error:"PROFILE_VERSION_MISMATCH"},{status:409});
  if(profile.revokedAt)return Response.json({error:"PROFILE_REVOKED"},{status:409});
  if(profile.disabledAt)return Response.json({error:"OWNER_DISABLED"},{status:409});
  if(profile.siteFamily!=="x")return Response.json({error:"DIAGNOSTIC_SITE_UNSUPPORTED"},{status:409});
  const adapter=new XAuthenticatedSiteAdapter();const runId=`auth_surface_diagnostic_${crypto.randomUUID().replaceAll("-","")}`;
  let selected:ReturnType<typeof authenticatedBackend>;try{selected=dependencies.selectBackend?.()??authenticatedBackend(env,{runId,bootstrapRequestId:requestId,profile,adapter});}catch{return Response.json({error:"DIAGNOSTIC_PROVIDER_UNRESOLVED"},{status:503});}
  if(!isEligibleDiagnosticProvider(selected.providerIdentity)||!(selected.executor instanceof AuthenticatedBrowserBridgeExecutor))return Response.json({error:"DIAGNOSTIC_SELF_HOSTED_PROVIDER_REQUIRED",diagnostic:{browserProvider:selected.providerIdentity??"UNKNOWN",browserBackend:selected.backend}},{status:409});
  let allocation:Awaited<ReturnType<AuthenticatedBrowserBridgeExecutor["allocate"]>>|undefined;
  try{
    allocation=await selected.executor.allocate({runId,tenantId:profile.tenantId,generation:1,allowedOrigins:[...(adapter.authenticationNetworkOrigins??adapter.allowedOrigins)]});
    const lineage=new RuntimeAuthenticationFlowLineage(adapter.authenticationEntryPoint!,{tenantId:profile.tenantId,ownerId:profile.ownerId,profileId:profile.id,profileVersion:profile.version,requestId,browserGeneration:allocation.generation,browserContextId:allocation.contextId,allowedOrigins:[...adapter.allowedOrigins],expiresAt:new Date(Date.now()+120_000).toISOString()},async()=>{const current=await env.DB.prepare(`SELECT version,revoked_at FROM authenticated_site_profiles WHERE id=?`).bind(profile.id).first<{version:number;revoked_at:string|null}>();return !!current&&current.version===profile.version&&!current.revoked_at;});
    await lineage.start();await selected.executor.navigate(allocation,adapter.authenticationEntryPoint!.url);
    const snapshot=await selected.executor.observeAuthenticatedSurface(allocation,"AUTH_SURFACE");const flow=await lineage.observe(snapshot.url);const fingerprint=adapter.fingerprint(snapshot,flow,false);
    return Response.json({status:"OBSERVED",operation:"AUTH_SURFACE_DIAGNOSTIC",diagnostic:{...safeFingerprint(fingerprint),...safeObservationStructure(snapshot),...safeObservationIdentity(snapshot),browserProvider:selected.providerIdentity,browserBackend:selected.backend,browserGeneration:allocation.generation}});
  }catch{return Response.json({error:"AUTH_SURFACE_DIAGNOSTIC_FAILED",diagnostic:{browserProvider:selected.providerIdentity,browserBackend:selected.backend,browserGeneration:allocation?.generation??1}},{status:500});}
  finally{if(allocation)await selected.executor.close(allocation).catch(()=>undefined);}
}

function safeFingerprint(value:ReturnType<XAuthenticatedSiteAdapter["fingerprint"]>){const keys=["surfaceKind","hostname","pathnameCategory","pathnamePattern","authOriginValid","authFlowLineageValid","formCountCategory","activeFormPresent","activeFormUnambiguous","identifierTextboxPresent","identifierTextboxVisible","identifierTextboxEnabled","identifierTextboxFocusable","identifierTextboxInsideActiveForm","knownIdentifierTextboxLabel","passwordTextboxPresent","passwordTextboxVisible","passwordTextboxEnabled","passwordTextboxFocusable","passwordTextboxInsideActiveForm","passwordAutocompleteCategory","knownPasswordTextboxLabel","identifierTextboxCountCategory","passwordTextboxCountCategory","knownControlLabels","submitControlSemanticKind","submitControlVisible","submitControlEnabled","captchaWidgetPresent","securityVerificationSurfacePresent"] as const;const output:Record<string,string|boolean>={};for(const key of keys){const item=value[key];output[key]=key==="knownControlLabels"?(item as readonly string[]).join("|"):item as string|boolean;}return output;}

export function safeObservationStructure(value:{documentCountCategory?:string;iframeCountCategory?:string;domNodeCountCategory?:string;accessibilityNodeCountCategory?:string}){return{documentCountCategory:value.documentCountCategory??"none",iframeCountCategory:value.iframeCountCategory??"none",domNodeCountCategory:value.domNodeCountCategory??"none",accessibilityNodeCountCategory:value.accessibilityNodeCountCategory??"none"};}
export function safeObservationIdentity(value:{bridgeProtocolVersion?:string;trustedObservationSchemaVersion?:string}){return{bridgeProtocolVersion:value.bridgeProtocolVersion??"unknown",trustedObservationSchemaVersion:value.trustedObservationSchemaVersion??"unknown"};}

export function isEligibleDiagnosticProvider(provider: string|undefined): provider is "SELF_HOSTED_CHROMIUM"|"CLOUDFLARE_CONTAINER" {
  return provider === "SELF_HOSTED_CHROMIUM" || provider === "CLOUDFLARE_CONTAINER";
}
