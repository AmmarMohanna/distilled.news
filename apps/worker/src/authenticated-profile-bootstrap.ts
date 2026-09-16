import { AuthenticatedBrowserLifecycle,AuthenticatedProfileService,ProfileEnvelopeCrypto,XAuthenticatedSiteAdapter,issueAuthenticatedProfileCapability,makeId,selectBrowserBackend } from "@distilled/agent-runtime";
import { z } from "zod";
import { D1AccountTenantOwnershipPolicy,D1AuthenticatedProfileRepository,R2AuthenticatedSecretStore } from "./authenticated-profile-store";
import type { Env } from "./types";
import { workerCloudflareBrowser } from "./web-operator-runtime";

const inputSchema=z.object({authenticatedProfileId:z.string().startsWith("authenticated_profile_"),tenantId:z.string().startsWith("account_"),ownerId:z.string().startsWith("account_")}).strict();

export async function bootstrapAuthenticatedProfile(request:Request,env:Env){
  if(!await authorized(request,env.AUTH_PROFILE_BOOTSTRAP_TOKEN??env.WEB_OPERATOR_RUNTIME_TOKEN))return Response.json({error:"unauthorized"},{status:401});
  const parsed=inputSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:"invalid_request"},{status:400});
  if(!env.AUTH_PROFILE_ENCRYPTION_KEYS||!env.AUTH_PROFILE_ACTIVE_KEY_ID)return Response.json({error:"authenticated_profile_storage_not_configured"},{status:503});
  let keys:Record<string,string>;try{keys=JSON.parse(env.AUTH_PROFILE_ENCRYPTION_KEYS) as Record<string,string>}catch{return Response.json({error:"authenticated_profile_keyring_invalid"},{status:503})}
  const repository=new D1AuthenticatedProfileRepository(env.DB);const profile=await repository.getSiteProfile(parsed.data.authenticatedProfileId);if(!profile)return Response.json({error:"authenticated_profile_not_found"},{status:404});
  if(profile.tenantId!==parsed.data.tenantId||profile.ownerId!==parsed.data.ownerId)return Response.json({error:"authenticated_profile_owner_denied"},{status:403});
  const adapter=new XAuthenticatedSiteAdapter();const browser=selectBrowserBackend({environment:env,cloudflare:workerCloudflareBrowser(env)}).executor;const runId=makeId("authenticated_bootstrap",profile.id,crypto.randomUUID());
  const allocation=await browser.allocate({runId,tenantId:profile.tenantId,generation:1,allowedOrigins:[...(adapter.authenticationNetworkOrigins??adapter.allowedOrigins)]});
  let result:Awaited<ReturnType<AuthenticatedBrowserLifecycle["attach"]>>;
  try{
    const service=new AuthenticatedProfileService(repository,new R2AuthenticatedSecretStore(env.AUTHENTICATED_SECRETS),new ProfileEnvelopeCrypto(keys,env.AUTH_PROFILE_ACTIVE_KEY_ID),new D1AccountTenantOwnershipPolicy(env.DB));
    const lifecycle=new AuthenticatedBrowserLifecycle(repository,service,browser,new Map([[adapter.siteFamily,adapter]]));const capability=issueAuthenticatedProfileCapability(profile,{tenantId:profile.tenantId,ownerId:profile.ownerId,runId,browserGeneration:allocation.generation,ttlMs:120_000});
    result=await lifecycle.attach({capability,scope:allocation,ownerId:profile.ownerId});
  }catch(error){console.error(JSON.stringify({message:"authenticated profile bootstrap failed",errorName:error instanceof Error?error.name:"UnknownError"}));return Response.json({error:"authenticated_profile_bootstrap_failed"},{status:500});}
  finally{await browser.close(allocation).catch(()=>undefined)}
  return Response.json({authenticatedProfileId:profile.id,site:profile.siteFamily,status:result.detection.state,reason:result.detection.reason,sessionReused:result.sessionReused,browserClosed:true});
}

async function authorized(request:Request,expected:string|undefined){if(!expected)return false;const encoder=new TextEncoder();const [providedHash,expectedHash]=await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"")),crypto.subtle.digest("SHA-256",encoder.encode(expected))]);const a=new Uint8Array(providedHash),b=new Uint8Array(expectedHash);let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];return mismatch===0;}
