import {
  AuthenticatedBrowserLifecycle,AuthenticatedProfileService,ChallengeCoordinator,ProfileEnvelopeCrypto,
  XAuthenticatedSiteAdapter,issueAuthenticatedProfileCapability,makeId,
  AuthenticatedBrowserBridgeExecutor,AuthenticatedBootstrapError,
  type AuthenticatedBrowserExecutorPort,type AuthenticatedSourceTimelineObservation,type AuthenticatedSourceWorkflowPort,
  type BrowserAllocation,type PublicBrowserObservation,type SourceAcquisitionRequest
} from "@distilled/agent-runtime";
import { D1AccountTenantOwnershipPolicy,D1AuthenticatedProfileRepository,D1AuthenticationChallengeStore,R2AuthenticatedSecretStore } from "./authenticated-profile-store";
import { authenticatedBackend } from "./authenticated-profile-bootstrap";
import {safeFingerprint,safeObservationStructure,safeObservationIdentity} from "./authenticated-surface-diagnostic";
import type { Env } from "./types";

/** One X profile per browser execution. Login/session secrets are handled by the existing lifecycle. */
export class ContainerXTimelinePort implements AuthenticatedSourceWorkflowPort {
  private browser?:AuthenticatedBrowserExecutorPort;
  private scope?:BrowserAllocation;
  private sourceUrl?:string;
  private challengeState?:"LOGIN_REQUIRED"|"CHALLENGE_REQUIRED";
  private readonly adapter=new XAuthenticatedSiteAdapter();
  constructor(private readonly env:Env,private readonly context:{tenantId:string;ownerId:string;profileId:string;runId:string}){}

  async open(input:{sourceUrl:string;allowedOrigins:string[];request:SourceAcquisitionRequest}):Promise<void>{
    if(this.scope||input.request.authentication!=="AUTH_REQUIRED")throw new Error("authenticated source scope invalid");
    const source=new URL(input.sourceUrl);
    if(source.protocol!=="https:"||source.origin!=="https://x.com"||!/^\/[A-Za-z0-9_]{1,15}\/?$/.test(source.pathname)||!input.allowedOrigins.includes(source.origin))throw new Error("X source origin or profile invalid");
    const repository=new D1AuthenticatedProfileRepository(this.env.DB);
    const profile=await repository.getSiteProfile(this.context.profileId);
    if(!profile||profile.tenantId!==this.context.tenantId||profile.ownerId!==this.context.ownerId||profile.siteFamily!=="x")throw new Error("authenticated profile owner denied");
    if(!this.env.AUTH_PROFILE_ENCRYPTION_KEYS||!this.env.AUTH_PROFILE_ACTIVE_KEY_ID)throw new Error("authenticated profile storage unavailable");
    const keys=JSON.parse(this.env.AUTH_PROFILE_ENCRYPTION_KEYS) as Record<string,string>;
    const backend=authenticatedBackend(this.env,{runId:this.context.runId,bootstrapRequestId:this.context.runId,profile,adapter:this.adapter});
    this.browser=backend.executor;
    if(!this.browser.navigateAuthenticatedSource||!this.browser.observeAuthenticatedSource||!this.browser.scrollAuthenticatedSource)throw new Error("authenticated timeline bridge unavailable");
    const scope=await this.browser.allocate({runId:this.context.runId,tenantId:profile.tenantId,generation:1,allowedOrigins:[...this.adapter.authenticationNetworkOrigins]});
    this.scope=scope;
    this.sourceUrl=`https://x.com/${source.pathname.split("/").filter(Boolean)[0]}`;
    const service=new AuthenticatedProfileService(repository,new R2AuthenticatedSecretStore(this.env.AUTHENTICATED_SECRETS),new ProfileEnvelopeCrypto(keys,this.env.AUTH_PROFILE_ACTIVE_KEY_ID),new D1AccountTenantOwnershipPolicy(this.env.DB));
    const challenges=new ChallengeCoordinator(new D1AuthenticationChallengeStore(this.env.DB),backend.challengeProvider,{overallTimeoutMs:30_000,pollingIntervalMs:500});
    const lifecycle=new AuthenticatedBrowserLifecycle(repository,service,this.browser,new Map([[this.adapter.siteFamily,this.adapter]]));
    try{
      const capability=issueAuthenticatedProfileCapability(profile,{tenantId:profile.tenantId,ownerId:profile.ownerId,runId:scope.runId,browserGeneration:scope.generation,ttlMs:120_000});
      const attached=await lifecycle.attach({capability,scope,ownerId:profile.ownerId,challengeCoordinator:challenges,bootstrapRequestId:makeId("x_source_bootstrap",scope.runId)});
      if(attached.detection.state!=="ACTIVE"){
        this.challengeState=attached.detection.state==="CHALLENGE_REQUIRED"||attached.detection.state==="MFA_REQUIRED"?"CHALLENGE_REQUIRED":"LOGIN_REQUIRED";
        return;
      }
      await this.browser.navigateAuthenticatedSource(scope,this.sourceUrl);
    }catch(error){
      if(error instanceof AuthenticatedBootstrapError&&this.browser instanceof AuthenticatedBrowserBridgeExecutor){
        try{
          const snapshot=await this.browser.observeAuthenticatedSurface(scope,"IMMEDIATE");
          const fingerprint=this.adapter.fingerprint(snapshot);
          await repository.appendAuthAudit({id:crypto.randomUUID(),profileId:profile.id,tenantId:profile.tenantId,runId:scope.runId,type:"BOOTSTRAP_FAILED",safeMetadata:{failureCode:error.code,failureStage:error.stage,...safeFingerprint(fingerprint),...safeObservationStructure(snapshot),...safeObservationIdentity(snapshot)},createdAt:new Date().toISOString()});
        }catch{/* diagnostics never replace the original typed failure */}
      }
      await this.close();throw error;
    }
  }

  async observe():Promise<AuthenticatedSourceTimelineObservation>{
    if(this.challengeState)return{url:this.sourceUrl!,pageRevision:"challenge",items:[],challengeState:this.challengeState};
    return this.convert(await this.requiredBrowser().observeAuthenticatedSource!(this.requiredScope()));
  }
  async scrollAndObserve(deltaY:number):Promise<AuthenticatedSourceTimelineObservation>{
    if(this.challengeState)return this.observe();
    return this.convert(await this.requiredBrowser().scrollAuthenticatedSource!(this.requiredScope(),deltaY));
  }
  async discoverWithBrowserUse(modelRef:string,maxSteps=6){
    if(this.challengeState)throw new Error("authenticated challenge prevents discovery");
    const browser=this.requiredBrowser();
    if(!browser.discoverAuthenticatedSource)throw new Error("authenticated Browser Use bridge unavailable");
    return browser.discoverAuthenticatedSource(this.requiredScope(),this.sourceUrl!,modelRef,maxSteps);
  }
  async close():Promise<void>{const scope=this.scope,browser=this.browser;this.scope=undefined;if(scope&&browser)await browser.close(scope)}

  private convert(observation:PublicBrowserObservation):AuthenticatedSourceTimelineObservation{
    const source=this.sourceUrl!;
    const expected=new URL(source);
    const observed=new URL(observation.url);
    if(observed.origin!==expected.origin||!([expected.pathname,`${expected.pathname}/`].includes(observed.pathname)))throw new Error("authenticated timeline escaped profile");
    if(observation.challengeState&&observation.challengeState!=="NO_CHALLENGE"&&observation.challengeState!=="PASSIVE_BROWSER_CHALLENGE")return{url:observation.url,pageRevision:observation.pageRevision,items:[],challengeState:observation.challengeState==="LOGIN_REQUIRED"?"LOGIN_REQUIRED":"CHALLENGE_REQUIRED"};
    const account=expected.pathname.slice(1).toLowerCase();
    const items=(observation.timelinePosts??[]).filter(post=>{
      const url=new URL(post.canonicalItemUrl);
      return url.origin==="https://x.com"&&url.pathname.toLowerCase().startsWith(`/${account}/status/`)&&/^\d+$/.test(post.sourceItemId)&&Number.isFinite(Date.parse(post.publishedAt))&&Boolean(post.text.trim());
    }).map(post=>({sourceResource:source,sourceItemId:post.sourceItemId,canonicalItemUrl:post.canonicalItemUrl,publishedAt:post.publishedAt,text:post.text,originalSourceReference:post.canonicalItemUrl,acquisitionEvidence:{kind:"CDP_DOM_SNAPSHOT",pageRevision:observation.pageRevision,trustedObservationSchemaVersion:observation.trustedObservationSchemaVersion}}));
    return{url:observation.url,pageRevision:observation.pageRevision,items,challengeState:"NO_CHALLENGE"};
  }
  private requiredScope(){if(!this.scope)throw new Error("authenticated timeline scope closed");return this.scope}
  private requiredBrowser(){if(!this.browser)throw new Error("authenticated timeline browser unavailable");return this.browser}
}
