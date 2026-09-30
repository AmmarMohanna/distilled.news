import { makeId } from "./contracts";

export type AuthenticationChallengeKind = "CAPTCHA" | "MFA" | "EMAIL_VERIFICATION" | "SECURITY_CHALLENGE" | "UNKNOWN";
export type AuthenticationChallengeState = "DETECTED" | "CHALLENGE_HANDLING" | "RESOLUTION_REQUESTED" | "RESOLVING" | "RESOLVED" | "FAILED" | "UNSUPPORTED" | "EXPIRED" | "CANCELLED";
export type ChallengeProviderCapability = "NONE" | "DETECT_ONLY" | "ASYNC_RESOLUTION";
export type AuthenticationChallengePhase = "PRE_IDENTIFIER" | "POST_IDENTIFIER" | "PRE_PASSWORD" | "POST_PASSWORD" | "UNKNOWN";

export interface AuthenticationChallengeBinding {
  runId: string;
  bootstrapRequestId: string;
  tenantId: string;
  ownerId: string;
  profileId: string;
  profileVersion: number;
  browserGeneration: number;
  authFlowId: string;
  expiresAt: string;
}

export interface AuthenticationChallengeRecord extends AuthenticationChallengeBinding {
  challengeId: string;
  challengeKind: AuthenticationChallengeKind;
  challengePhase: AuthenticationChallengePhase;
  providerKind: string;
  observedAt: string;
  attemptBudget: number;
  attemptNumber: number;
  state: AuthenticationChallengeState;
  providerOperationId?: string;
  updatedAt: string;
  elapsedMs: number;
  resolutionOutcome?: string;
  subsequentSurfaceKind?: string;
}

export interface AuthenticationChallengeStore {
  create(record: AuthenticationChallengeRecord): Promise<AuthenticationChallengeRecord>;
  get(challengeId: string): Promise<AuthenticationChallengeRecord | null>;
  transition(challengeId: string, expected: readonly AuthenticationChallengeState[], update: Partial<Pick<AuthenticationChallengeRecord,"state"|"providerOperationId"|"updatedAt"|"elapsedMs"|"resolutionOutcome"|"subsequentSurfaceKind"|"attemptNumber">>): Promise<AuthenticationChallengeRecord>;
}

export interface BrowserChallengeProvider {
  readonly providerKind: string;
  readonly productionSafe: boolean;
  capabilities(): Readonly<Record<AuthenticationChallengeKind, ChallengeProviderCapability>>;
  beginResolution(input: { challengeId: string; kind: AuthenticationChallengeKind; expiresAt: string; signal?: AbortSignal }): Promise<{ providerOperationId: string; state: "RESOLVING" | "RESOLVED" | "FAILED" }>;
  getResolutionStatus(input: { challengeId: string; providerOperationId: string; signal?: AbortSignal }): Promise<"RESOLVING" | "RESOLVED" | "FAILED">;
  cancel(input: { challengeId: string; providerOperationId?: string }): Promise<void>;
}

export interface ChallengeReobservation {
  challengePresent: boolean;
  surfaceKind: string;
}

export interface ChallengeCoordinationResult {
  record: AuthenticationChallengeRecord;
  mayContinue: boolean;
}

export class ChallengeCoordinator {
  constructor(private readonly store: AuthenticationChallengeStore, private readonly provider: BrowserChallengeProvider, private readonly options: { pollingIntervalMs?: number; providerRequestTimeoutMs?:number; overallTimeoutMs?: number; settlementReserveMs?:number; passiveReobservations?:number; wait?: (ms: number, signal?: AbortSignal) => Promise<void> } = {}) {}

  async coordinate(input: AuthenticationChallengeBinding & { kind: AuthenticationChallengeKind; phase: AuthenticationChallengePhase; validateFences: () => Promise<boolean>; reobserve: () => Promise<ChallengeReobservation>; signal?: AbortSignal }): Promise<ChallengeCoordinationResult> {
    const started = Date.now();
    const challengeId = makeId("auth_challenge",input.bootstrapRequestId,input.runId,input.profileId,input.profileVersion,input.browserGeneration,input.authFlowId,input.kind,input.phase);
    let record = await this.store.create({challengeId,runId:input.runId,bootstrapRequestId:input.bootstrapRequestId,tenantId:input.tenantId,ownerId:input.ownerId,profileId:input.profileId,profileVersion:input.profileVersion,browserGeneration:input.browserGeneration,authFlowId:input.authFlowId,expiresAt:input.expiresAt,challengeKind:input.kind,challengePhase:input.phase,providerKind:this.provider.providerKind,observedAt:new Date(started).toISOString(),attemptBudget:1,attemptNumber:0,state:"DETECTED",updatedAt:new Date(started).toISOString(),elapsedMs:0});
    if (!(await input.validateFences())) return this.cancel(record,"FENCE_REJECTED");
    if (input.signal?.aborted) return this.cancel(record,"CANCELLED");
    const capability=this.provider.capabilities()[input.kind]??"NONE";
    if(capability==="DETECT_ONLY"){
      if(record.state==="UNSUPPORTED"||record.state==="FAILED"||record.state==="EXPIRED"||record.state==="CANCELLED")return{record,mayContinue:false};
      if(record.state==="DETECTED")record=await this.store.transition(record.challengeId,["DETECTED"],{state:"CHALLENGE_HANDLING",updatedAt:new Date().toISOString(),elapsedMs:Date.now()-started});
      const attempts=Math.max(0,Math.min(3,this.options.passiveReobservations??2));
      const deadline=Math.min(new Date(input.expiresAt).getTime()-(this.options.settlementReserveMs??1_000),started+(this.options.overallTimeoutMs??30_000));
      for(let attempt=0;attempt<attempts;attempt++){
        if(input.signal?.aborted)return this.cancel(record,"CANCELLED");
        if(!(await input.validateFences()))return this.cancel(record,"FENCE_REJECTED");
        if(Date.now()>=deadline)return this.expire(record);
        await (this.options.wait??waitFor)(Math.min(this.options.pollingIntervalMs??500,Math.max(0,deadline-Date.now())),input.signal);
        let observed:ChallengeReobservation;try{observed=await input.reobserve()}catch{return this.finish(record,"FAILED","REOBSERVATION_FAILED")}
        if(!observed.challengePresent){record=await this.store.transition(record.challengeId,[record.state],{state:"RESOLVED",subsequentSurfaceKind:observed.surfaceKind,resolutionOutcome:"REOBSERVED_CLEAR",updatedAt:new Date().toISOString(),elapsedMs:Date.now()-started});return{record,mayContinue:true}}
      }
      return this.finish(record,"UNSUPPORTED","DETECT_ONLY_AFTER_REOBSERVATION");
    }
    if(capability!=="ASYNC_RESOLUTION") return this.finish(record,"UNSUPPORTED",capability);
    if(record.attemptNumber>=record.attemptBudget&&!["RESOLUTION_REQUESTED","RESOLVING","RESOLVED"].includes(record.state))return this.finish(record,"FAILED","ATTEMPT_BUDGET_EXHAUSTED");
    if(record.state==="DETECTED")record=await this.store.transition(record.challengeId,["DETECTED"],{state:"RESOLUTION_REQUESTED",attemptNumber:1,updatedAt:new Date().toISOString(),elapsedMs:Date.now()-started});
    if(record.state==="RESOLUTION_REQUESTED"){
      let begun;try{begun=await withTimeout(this.provider.beginResolution({challengeId:record.challengeId,kind:record.challengeKind,expiresAt:record.expiresAt,signal:input.signal}),this.options.providerRequestTimeoutMs??5_000,input.signal)}catch{return this.finish(record,"FAILED","PROVIDER_REQUEST_FAILED")}
      record=await this.store.transition(record.challengeId,["RESOLUTION_REQUESTED"],{state:begun.state,providerOperationId:begun.providerOperationId,updatedAt:new Date().toISOString(),elapsedMs:Date.now()-started,resolutionOutcome:begun.state==="FAILED"?"PROVIDER_FAILED":undefined});
    }
    const deadline=Math.min(new Date(input.expiresAt).getTime()-(this.options.settlementReserveMs??1_000),started+(this.options.overallTimeoutMs??30_000));
    while(record.state==="RESOLVING"){
      if(input.signal?.aborted)return this.cancel(record,"CANCELLED");
      if(!(await input.validateFences()))return this.cancel(record,"FENCE_REJECTED");
      if(Date.now()>=deadline)return this.expire(record);
      await (this.options.wait??waitFor)(Math.min(this.options.pollingIntervalMs??250,Math.max(0,deadline-Date.now())),input.signal);
      let status;try{status=await withTimeout(this.provider.getResolutionStatus({challengeId:record.challengeId,providerOperationId:record.providerOperationId!,signal:input.signal}),this.options.providerRequestTimeoutMs??5_000,input.signal)}catch{return this.finish(record,"FAILED","PROVIDER_STATUS_FAILED")}
      if(status!=="RESOLVING")record=await this.store.transition(record.challengeId,["RESOLVING"],{state:status,updatedAt:new Date().toISOString(),elapsedMs:Date.now()-started,resolutionOutcome:status==="FAILED"?"PROVIDER_FAILED":"PROVIDER_RESOLVED"});
    }
    if(record.state!=="RESOLVED")return{record,mayContinue:false};
    if(!(await input.validateFences()))return this.cancel(record,"FENCE_REJECTED");
    const observed=await input.reobserve();
    record=await this.store.transition(record.challengeId,["RESOLVED"],{state:observed.challengePresent?"FAILED":"RESOLVED",subsequentSurfaceKind:observed.surfaceKind,resolutionOutcome:observed.challengePresent?"CHALLENGE_STILL_PRESENT":"REOBSERVED_CLEAR",updatedAt:new Date().toISOString(),elapsedMs:Date.now()-started});
    return{record,mayContinue:!observed.challengePresent};
  }

  private async finish(record:AuthenticationChallengeRecord,state:AuthenticationChallengeState,outcome:string){const next=await this.store.transition(record.challengeId,[record.state],{state,resolutionOutcome:outcome,updatedAt:new Date().toISOString(),elapsedMs:record.elapsedMs});return{record:next,mayContinue:false}}
  private async cancel(record:AuthenticationChallengeRecord,outcome:string){await this.provider.cancel({challengeId:record.challengeId,providerOperationId:record.providerOperationId}).catch(()=>undefined);return this.finish(record,"CANCELLED",outcome)}
  private async expire(record:AuthenticationChallengeRecord){await this.provider.cancel({challengeId:record.challengeId,providerOperationId:record.providerOperationId}).catch(()=>undefined);return this.finish(record,"EXPIRED","RESOLUTION_TIMEOUT")}
}

export class InMemoryAuthenticationChallengeStore implements AuthenticationChallengeStore {
  readonly records=new Map<string,AuthenticationChallengeRecord>();
  async create(record:AuthenticationChallengeRecord){const existing=this.records.get(record.challengeId);if(existing)return structuredClone(existing);this.records.set(record.challengeId,structuredClone(record));return structuredClone(record)}
  async get(id:string){return structuredClone(this.records.get(id)??null)}
  async transition(id:string,expected:readonly AuthenticationChallengeState[],update:Partial<AuthenticationChallengeRecord>){const current=this.records.get(id);if(!current)throw new Error("challenge record unavailable");if(!expected.includes(current.state)){if(update.state===current.state)return structuredClone(current);throw new Error("challenge state conflict")}const next={...current,...update};this.records.set(id,next);return structuredClone(next)}
}

export class DetectOnlyBrowserChallengeProvider implements BrowserChallengeProvider {
  readonly productionSafe=true;
  constructor(public readonly providerKind:string){ }
  capabilities(){return{CAPTCHA:"DETECT_ONLY",MFA:"DETECT_ONLY",EMAIL_VERIFICATION:"DETECT_ONLY",SECURITY_CHALLENGE:"DETECT_ONLY",UNKNOWN:"DETECT_ONLY"} as const}
  async beginResolution():Promise<{providerOperationId:string;state:"RESOLVING"|"RESOLVED"|"FAILED"}>{throw new Error("challenge resolution unsupported")}
  async getResolutionStatus(){return"FAILED" as const}
  async cancel(){ }
}

export class DeterministicTestChallengeProvider implements BrowserChallengeProvider {
  readonly providerKind="deterministic_test";readonly productionSafe=false;private readonly operations=new Map<string,{polls:number;cancelled:boolean}>();
  constructor(private readonly resolveAfterPolls=1){ }
  capabilities(){return{CAPTCHA:"ASYNC_RESOLUTION",MFA:"ASYNC_RESOLUTION",EMAIL_VERIFICATION:"ASYNC_RESOLUTION",SECURITY_CHALLENGE:"ASYNC_RESOLUTION",UNKNOWN:"ASYNC_RESOLUTION"} as const}
  async beginResolution(input:{challengeId:string}){const operation=this.operations.get(input.challengeId)??{polls:0,cancelled:false};this.operations.set(input.challengeId,operation);return{providerOperationId:`test_operation_${input.challengeId}`,state:this.resolveAfterPolls===0?"RESOLVED" as const:"RESOLVING" as const}}
  async getResolutionStatus(input:{challengeId:string}){const operation=this.operations.get(input.challengeId)??{polls:0,cancelled:false};this.operations.set(input.challengeId,operation);if(operation.cancelled)return"FAILED" as const;operation.polls++;return operation.polls>=this.resolveAfterPolls?"RESOLVED" as const:"RESOLVING" as const}
  async cancel(input:{challengeId:string}){const operation=this.operations.get(input.challengeId);if(operation)operation.cancelled=true}
}

export function assertProductionChallengeProvider(provider:BrowserChallengeProvider){if(!provider.productionSafe)throw new Error("test challenge provider cannot be enabled in production")}

function waitFor(ms:number,signal?:AbortSignal){return new Promise<void>((resolve,reject)=>{if(signal?.aborted)return reject(signal.reason);const timer=setTimeout(resolve,ms);signal?.addEventListener("abort",()=>{clearTimeout(timer);reject(signal.reason)},{once:true})})}
function withTimeout<T>(operation:Promise<T>,ms:number,signal?:AbortSignal){return new Promise<T>((resolve,reject)=>{if(signal?.aborted)return reject(signal.reason);const timer=setTimeout(()=>reject(new Error("challenge provider request timeout")),ms);operation.then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)});signal?.addEventListener("abort",()=>{clearTimeout(timer);reject(signal.reason)},{once:true})})}
