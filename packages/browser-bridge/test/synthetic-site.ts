import {
  AuthenticatedBrowserBridgeExecutor,
  ChallengeCoordinator,
  DetectOnlyBrowserChallengeProvider,
  HttpAuthenticatedBrowserBridgeClient,
  InMemoryAuthenticationChallengeStore,
  SyntheticBridgeAdapter,
  makeId,
  type AuthenticatedBrowserExecutionCapability,
  type BrowserScope
} from "@distilled/agent-runtime";
import {SyntheticSite as BaseSyntheticSite} from "../preflight/synthetic-sites";

export const SYNTHETIC_IDENTIFIER="TEST_IDENTIFIER_SECRET_7f3a91";
export const SYNTHETIC_PASSWORD="TEST_PASSWORD_SECRET_c20b48";
export const SYNTHETIC_COOKIE="TEST_COOKIE_SECRET_5d1e77";

/** Test-side bindings over the shared synthetic site and adapter (also used by the production preflight). */
export class SyntheticSite extends BaseSyntheticSite{constructor(){super({identifier:SYNTHETIC_IDENTIFIER,password:SYNTHETIC_PASSWORD,cookie:SYNTHETIC_COOKIE,redirectMarker:"TEST_PASSWORD_SECRET_redirect"})}}
export class SyntheticAuthAdapter extends SyntheticBridgeAdapter{}

export interface FlowContext{
  runId:string;tenantId:string;profileId:string;capability:AuthenticatedBrowserExecutionCapability;executor:AuthenticatedBrowserBridgeExecutor;transport:HttpAuthenticatedBrowserBridgeClient;
  store:InMemoryAuthenticationChallengeStore;coordinator:ChallengeCoordinator;
  challenges:{coordinator:ChallengeCoordinator;binding:{runId:string;bootstrapRequestId:string;tenantId:string;ownerId:string;profileId:string;profileVersion:number;browserGeneration:number;authFlowId:string;expiresAt:string};validateFences:()=>Promise<boolean>};
}

/** Plays the production coordinator's role: mints fenced capabilities and talks to the bridge only through the public protocol client. */
export function newFlow(input:{bridgeUrl:string;secret:string;adapter:SyntheticAuthAdapter;label:string;fetch?:typeof fetch;profileId?:string;operationBudget?:number}):FlowContext{
  const runId=makeId("run",input.label,Date.now(),Math.random());const tenantId="account_test_tenant";const profileId=input.profileId??makeId("authenticated_profile",input.label);
  const now=Date.now();const bootstrapRequestId=makeId("boot_req",runId);
  const capability:AuthenticatedBrowserExecutionCapability={bridgeExecutionId:makeId("bridge_exec",runId),bootstrapRequestId,runId,tenantId,ownerId:tenantId,profileId,expectedProfileVersion:1,browserGeneration:1,authFlowId:makeId("auth_flow",runId),siteKind:input.adapter.siteFamily,authEntryPoint:input.adapter.authenticationEntryPoint.url,sessionProbeUrl:`${input.adapter.loginOrigin}/home`,allowedOrigins:[...input.adapter.allowedOrigins],writeOrigins:[...input.adapter.allowedOrigins],issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+120_000).toISOString(),operationBudget:input.operationBudget??40};
  const transport=new HttpAuthenticatedBrowserBridgeClient({url:input.bridgeUrl,serviceCredential:input.secret,allowLoopbackHttp:true,fetch:input.fetch});
  const executor=new AuthenticatedBrowserBridgeExecutor(transport,()=>capability);
  const store=new InMemoryAuthenticationChallengeStore();const coordinator=new ChallengeCoordinator(store,new DetectOnlyBrowserChallengeProvider("self_hosted_chromium"),{overallTimeoutMs:5_000,pollingIntervalMs:50});
  return{runId,tenantId,profileId,capability,executor,transport,store,coordinator,challenges:{coordinator,binding:{runId,bootstrapRequestId,tenantId,ownerId:tenantId,profileId,profileVersion:1,browserGeneration:1,authFlowId:capability.authFlowId,expiresAt:capability.expiresAt},validateFences:async()=>true}};
}

export const allocate=(flow:FlowContext):Promise<BrowserScope>=>flow.executor.allocate({runId:flow.runId,tenantId:flow.tenantId,generation:1,allowedOrigins:flow.capability.allowedOrigins});
