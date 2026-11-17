import type {ModelSpendingAuthorization,ModelSpendingReservation} from './model-spending';
export interface ModelRecoveryScope {feedId:string;requests:{requestId:string;evidenceRevisionId:string}[];maxNewSpendingUsd:number;maxNewOperations:number;maxConcurrentOperations:number;maxLifetimeExposureUsd:number}
export interface RecoveryReservationBinding {requestId:string;evidenceRevisionId:string;stage:'CONSTRUCTION'|'REPAIR';rootOperationId?:string}
export function validateRecoveryScope(grant:ModelSpendingAuthorization):void {
 const s=grant.recoveryScope;if(!s)return;
 if(!s.feedId||!Array.isArray(s.requests)||!s.requests.length||s.requests.some(r=>!r.requestId||!r.evidenceRevisionId)||new Set(s.requests.map(r=>r.requestId)).size!==s.requests.length||new Set(s.requests.map(r=>r.evidenceRevisionId)).size!==s.requests.length||![s.maxNewSpendingUsd,s.maxLifetimeExposureUsd].every(v=>Number.isFinite(v)&&v>0)||s.maxNewSpendingUsd>grant.maxExposureUsd||!Number.isSafeInteger(s.maxNewOperations)||s.maxNewOperations<1||s.maxNewOperations>2*s.requests.length||s.maxConcurrentOperations!==1)throw Error('INVALID_RECOVERY_SCOPE');
}
/** Derived only by the existing rematch lease owner; not a model-generated field.
 * Trigger 0063 independently enforces the saved request, money and call limits. */
export function recoveryBinding(input:{kind:string;policyVersion:string;evidenceRevisionIds:string[];budgetKey:string;state:unknown},workId?:string):RecoveryReservationBinding|undefined {
 if(input.kind!=='SEMANTIC_CONSTRUCTION'||!workId?.startsWith('rematch:')||!input.evidenceRevisionIds[0])return;
 const base={requestId:workId.slice('rematch:'.length),evidenceRevisionId:input.evidenceRevisionIds[0]};
 if(input.policyVersion==='semantic-relations-v3')return {...base,stage:'CONSTRUCTION'};
 const repair=(input.state as any)?.repair;
 if(input.policyVersion==='semantic-relations-v3:targeted-repair-v4-minimal'&&typeof repair?.originalOperationId==='string'&&input.budgetKey==='construction-repair:'+repair.originalOperationId)return {...base,stage:'REPAIR',rootOperationId:repair.originalOperationId};
}
export async function assertRecoveryScopeAvailable(db:D1Database,g:ModelSpendingAuthorization,r:ModelSpendingReservation):Promise<void>{
 if(!g.recoveryScope)return;
 const installed=await db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='v1_model_spending_recovery_scope'").first();if(!installed)throw Error('RECOVERY_SCOPE_MIGRATION_REQUIRED');
 const b=r.recovery,s=g.recoveryScope;if(!b||r.feedId!==s.feedId||!s.requests.some(q=>q.requestId===b.requestId&&q.evidenceRevisionId===b.evidenceRevisionId))throw Error('RECOVERY_SCOPE_DENIED');
}
