import { AuthenticatedProfileError,AuthenticatedProfileService,ProfileEnvelopeCrypto,XAuthenticatedSiteAdapter } from "@distilled/agent-runtime";
import { z } from "zod";
import { D1AccountTenantOwnershipPolicy,D1AuthenticatedProfileRepository,R2AuthenticatedSecretStore } from "./authenticated-profile-store";
import type { Env } from "./types";

const inputSchema=z.object({tenantId:z.string().min(1),ownerId:z.string().min(1),site:z.literal("x"),username:z.string().min(1),password:z.string().min(1)}).strict();
export async function provisionAuthenticatedProfile(request:Request,env:Env){
  if(request.method!=="POST")return Response.json({error:"method_not_allowed"},{status:405});
  if(!authorized(request,env.WEB_OPERATOR_RUNTIME_TOKEN))return Response.json({error:"unauthorized"},{status:401});
  if(!env.AUTH_PROFILE_ENCRYPTION_KEYS||!env.AUTH_PROFILE_ACTIVE_KEY_ID)return Response.json({error:"authenticated_profile_storage_not_configured"},{status:503});
  let body:unknown;try{body=await request.json()}catch{return Response.json({error:"invalid_json"},{status:400})}
  const parsed=inputSchema.safeParse(body);if(!parsed.success)return Response.json({error:"invalid_profile_request"},{status:400});
  let keys:Record<string,string>;try{keys=JSON.parse(env.AUTH_PROFILE_ENCRYPTION_KEYS) as Record<string,string>}catch{return Response.json({error:"authenticated_profile_keyring_invalid"},{status:503})}
  const adapter=new XAuthenticatedSiteAdapter();
  try{
    const service=new AuthenticatedProfileService(new D1AuthenticatedProfileRepository(env.DB),new R2AuthenticatedSecretStore(env.AUTHENTICATED_SECRETS),new ProfileEnvelopeCrypto(keys,env.AUTH_PROFILE_ACTIVE_KEY_ID),new D1AccountTenantOwnershipPolicy(env.DB));
    const safe=await service.provision({tenantId:parsed.data.tenantId,ownerId:parsed.data.ownerId,siteFamily:parsed.data.site,allowedOrigins:[...adapter.allowedOrigins],credential:{username:parsed.data.username,password:parsed.data.password}});
    return Response.json(safe,{status:201});
  }catch(error){if(error instanceof AuthenticatedProfileError&&["AUTH_TENANT_OWNER_MISMATCH","AUTH_OWNER_NOT_FOUND","AUTH_OWNER_DISABLED"].includes(error.code))return Response.json({error:error.code.toLowerCase()},{status:error.code==="AUTH_OWNER_NOT_FOUND"?404:403});console.error("authenticated profile provisioning failed",safeError(error));return Response.json({error:"authenticated_profile_provisioning_failed"},{status:500});}
}
function authorized(request:Request,expected:string|undefined){if(!expected)return false;const provided=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"";if(provided.length!==expected.length)return false;let mismatch=0;for(let i=0;i<provided.length;i++)mismatch|=provided.charCodeAt(i)^expected.charCodeAt(i);return mismatch===0;}
function safeError(error:unknown){return error instanceof Error?{name:error.name,message:error.message.replace(/[A-Za-z0-9+/_=-]{24,}/g,"[REDACTED]")}:{name:"UnknownError"};}
