import { z } from "zod";
import { AuthenticatedBrowserLifecycle,AuthenticatedProfileService,ProfileEnvelopeCrypto,XAuthenticatedSiteAdapter,issueAuthenticatedProfileCapability,ChallengeCoordinator,DetectOnlyBrowserChallengeProvider,type AuthenticatedBrowserExecutorPort } from "@distilled/agent-runtime";
import { authorized } from "./authenticated-profile-bootstrap";
import { D1AuthenticatedProfileRepository,D1AccountTenantOwnershipPolicy,R2AuthenticatedSecretStore,D1AuthenticationChallengeStore } from "./authenticated-profile-store";
import type { Env } from "./types";

const cookie=z.object({name:z.string(),value:z.string(),domain:z.string(),path:z.string(),expires:z.number(),httpOnly:z.boolean(),secure:z.boolean(),sameSite:z.enum(["Strict","Lax","None"])}).strict();
const session=z.object({cookies:z.array(cookie).max(300),origins:z.array(z.object({origin:z.string(),localStorage:z.array(z.object({name:z.string(),value:z.string()}).strict()).max(300)}).strict()).max(20)}).strict();
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("begin"),profileId:z.string().startsWith("authenticated_profile_").optional()}).strict(),
  z.object({action:z.literal("challenge"),requestId:z.string(),kind:z.enum(["CAPTCHA","MFA","EMAIL_VERIFICATION","SECURITY_CHALLENGE","UNKNOWN"])}).strict(),
  z.object({action:z.literal("capture"),requestId:z.string(),state:session}).strict(),
  z.object({action:z.literal("abort"),requestId:z.string()}).strict(),
  z.object({action:z.literal("restore"),requestId:z.string()}).strict(),
  z.object({action:z.literal("verify"),requestId:z.string(),restored:z.boolean()}).strict()
]);
type Admission={request_id:string;profile_id:string;expected_profile_version:number;tenant_id:string;owner_id:string;state:string;attempt_count:number;expires_at:string;outcome_reason:string|null};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"cache-control":"no-store"}});

/** Privileged operator transport only. Session material is transient and never returned in errors. */
export async function manualAuthenticatedProfileBootstrap(request:Request,env:Env){
  try{
    if(!await authorized(request,env.AUTH_PROFILE_BOOTSTRAP_TOKEN??env.WEB_OPERATOR_RUNTIME_TOKEN))return reply({error:"unauthorized"},401);
    if(new URL(request.url).protocol!=="https:")return reply({error:"https_required"},400);
    const reader=request.body?.getReader();if(!reader)return reply({error:"invalid_request"},400);
    let length=0;const chunks:Uint8Array[]=[];
    while(true){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>256*1024){await reader.cancel();return reply({error:"request_too_large"},413)}chunks.push(next.value)}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    const parsed=schema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));if(!parsed.success)return reply({error:"invalid_request"},400);
    const input=parsed.data;
    if(!env.AUTH_PROFILE_ENCRYPTION_KEYS||!env.AUTH_PROFILE_ACTIVE_KEY_ID)return reply({error:"storage_not_configured"},503);
    const repository=new D1AuthenticatedProfileRepository(env.DB);
    const service=new AuthenticatedProfileService(repository,new R2AuthenticatedSecretStore(env.AUTHENTICATED_SECRETS),new ProfileEnvelopeCrypto(JSON.parse(env.AUTH_PROFILE_ENCRYPTION_KEYS),env.AUTH_PROFILE_ACTIVE_KEY_ID),new D1AccountTenantOwnershipPolicy(env.DB));
    if(input.action==="begin"){
      const rows=await env.DB.prepare("SELECT p.id FROM authenticated_site_profiles p JOIN accounts a ON a.id=p.owner_id WHERE p.site_family='x' AND p.revoked_at IS NULL AND a.disabled_at IS NULL AND (? IS NULL OR p.id=?) LIMIT 2").bind(input.profileId??null,input.profileId??null).all<{id:string}>();
      if(rows.results.length!==1)return reply({error:"specify_one_existing_x_profile"},409);
      const profile=(await repository.getSiteProfile(rows.results[0].id))!;await service.assertActiveOwner(profile);
      const requestId=`authenticated_manual_${crypto.randomUUID()}`,now=new Date().toISOString(),expiresAt=new Date(Date.now()+600_000).toISOString();
      issueAuthenticatedProfileCapability(profile,{tenantId:profile.tenantId,ownerId:profile.ownerId,runId:requestId,browserGeneration:1});
      // Running admissions are never picked up by the automated bootstrap dispatcher.
      await env.DB.prepare("INSERT INTO authenticated_profile_bootstrap_requests(request_id,operation,profile_id,expected_profile_version,tenant_id,owner_id,state,attempt_budget,attempt_count,created_at,expires_at,started_at,browser_generation) VALUES(?,'AUTHENTICATION_BOOTSTRAP',?,?,?,?,'running',1,0,?,?,?,1)").bind(requestId,profile.id,profile.version,profile.tenantId,profile.ownerId,now,expiresAt,now).run();
      return reply({requestId,profileId:profile.id,tenantId:profile.tenantId,expiresAt});
    }
    const admission=await env.DB.prepare("SELECT * FROM authenticated_profile_bootstrap_requests WHERE request_id=? AND request_id LIKE 'authenticated_manual_%'").bind(input.requestId).first<Admission>();
    if(!admission)return reply({error:"admission_expired"},409);
    if(input.action==="abort"){
      const result=await env.DB.prepare("UPDATE authenticated_profile_bootstrap_requests SET state='failed',completed_at=?,failure_code='MANUAL_LOGIN_NOT_COMPLETED',outcome_reason='MANUAL_LOGIN_NOT_COMPLETED' WHERE request_id=? AND state='running' AND attempt_count=0").bind(new Date().toISOString(),input.requestId).run();
      return reply({closed:Number(result.meta.changes)===1});
    }
    if(admission.expires_at<=new Date().toISOString())return reply({error:"admission_expired"},409);
    const profile=await repository.getSiteProfile(admission.profile_id);
    if(!profile||profile.siteFamily!=="x"||profile.tenantId!==admission.tenant_id||profile.ownerId!==admission.owner_id)return reply({error:"profile_denied"},403);
    await service.assertActiveOwner(profile);
    const expected=admission.expected_profile_version+(["capture","challenge"].includes(input.action)?0:1);
    if(profile.version!==expected||profile.revokedAt||profile.expiresAt&&profile.expiresAt<=new Date().toISOString())return reply({error:"stale_profile"},409);
    if(input.action==="challenge"){
      if(admission.state!=="running"||admission.attempt_count!==0)return reply({error:"admission_closed"},409);
      const coordinator=new ChallengeCoordinator(new D1AuthenticationChallengeStore(env.DB),new DetectOnlyBrowserChallengeProvider("operator_manual_chromium"));
      await coordinator.coordinate({runId:input.requestId,bootstrapRequestId:input.requestId,tenantId:profile.tenantId,ownerId:profile.ownerId,profileId:profile.id,profileVersion:profile.version,browserGeneration:1,authFlowId:input.requestId,expiresAt:admission.expires_at,kind:input.kind,phase:"UNKNOWN",validateFences:async()=>true,reobserve:async()=>({challengePresent:true,surfaceKind:"UNKNOWN"})});
      return reply({challengeRecorded:true});
    }
    if(input.action==="capture"){
      // Accept only X state from the privileged local runtime; no arbitrary-origin material.
      if(!input.state.cookies.some(c=>c.name==="auth_token"&&c.value&&c.httpOnly&&c.secure))return reply({error:"session_incomplete"},400);
      if(input.state.cookies.some(c=>!["x.com","twitter.com"].includes(c.domain.replace(/^\./,"")))||input.state.origins.some(o=>!profile.allowedOrigins.includes(o.origin)))return reply({error:"session_origin_denied"},400);
      const claim=await env.DB.prepare("UPDATE authenticated_profile_bootstrap_requests SET attempt_count=1 WHERE request_id=? AND state='running' AND attempt_count=0").bind(input.requestId).run();if(Number(claim.meta.changes)!==1)return reply({error:"capture_already_attempted"},409);
      const scope={runId:input.requestId,tenantId:profile.tenantId,sessionId:input.requestId,contextId:input.requestId,generation:1};
      // The authenticated operator has already detected ACTIVE in its browser. No credentials are loaded.
      const port={detectAuthenticatedState:async()=>({state:"ACTIVE",reason:"operator_manual_capture"}),exportAuthenticatedSession:async()=>input.state} as unknown as AuthenticatedBrowserExecutorPort;
      const lifecycle=new AuthenticatedBrowserLifecycle(repository,service,port,new Map([["x",new XAuthenticatedSiteAdapter()]]));
      await lifecycle.captureManualSession({capability:issueAuthenticatedProfileCapability(profile,{tenantId:profile.tenantId,ownerId:profile.ownerId,runId:input.requestId,browserGeneration:1}),scope,ownerId:profile.ownerId});
      await env.DB.prepare("UPDATE authenticated_profile_bootstrap_requests SET outcome_state='REAUTH_REQUIRED',outcome_reason='MANUAL_CAPTURE_PENDING_RESTORE' WHERE request_id=? AND state='running'").bind(input.requestId).run();
      return reply({encryptedSessionPersisted:true});
    }
    if(admission.state!=="running"||admission.attempt_count!==1||admission.outcome_reason!=="MANUAL_CAPTURE_PENDING_RESTORE")return reply({error:"admission_closed"},409);
    if(input.action==="restore"){
      const state=await service.loadSession({...profile,sessionState:"ACTIVE"});if(!state)return reply({error:"persisted_session_missing"},409);
      return reply({state});
    }
    await service.transition(profile,input.restored?"ACTIVE":"REAUTH_REQUIRED",{runId:input.requestId,reason:input.restored?undefined:"manual_restore_failed"});
    await env.DB.prepare("UPDATE authenticated_profile_bootstrap_requests SET state=?,completed_at=?,outcome_reason=?,outcome_state=? WHERE request_id=? AND state='running'").bind(input.restored?"completed":"failed",new Date().toISOString(),input.restored?"MANUAL_RESTORE_VERIFIED":"MANUAL_RESTORE_FAILED",input.restored?"ACTIVE":"REAUTH_REQUIRED",input.requestId).run();
    return reply({encryptedSessionPersisted:true,freshContextRestored:input.restored});
  }catch{return reply({error:"manual_bootstrap_failed"},500)}
}
