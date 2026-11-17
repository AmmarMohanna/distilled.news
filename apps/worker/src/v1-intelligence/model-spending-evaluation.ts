import type {ModelSpendingAuthorization,ModelSpendingReservation} from './model-spending';
export interface ModelEvaluationScope {feedId:string;manifestHash:string;operations:{id:string;model:string;requestHash:string}[];maxNewSpendingUsd:number;maxNewOperations:number;maxConcurrentOperations:1;maxLifetimeExposureUsd:number;maxPerOperationUsd?:number;workflow?:{id:string;maxNewOperations:number;maxNewSpendingUsd:number}}
export function validateEvaluationScope(g:ModelSpendingAuthorization){
 const s=g.evaluationScope;if(!s)return;
 const w=s.workflow,c=s.maxPerOperationUsd??.125;
 if(!Number.isFinite(c)||c<=0||c>.35||c>.125&&!w||w&&(!w.id||w.id!==s.manifestHash||!Number.isSafeInteger(w.maxNewOperations)||w.maxNewOperations<1||w.maxNewOperations>24||!Number.isFinite(w.maxNewSpendingUsd)||w.maxNewSpendingUsd<=0||w.maxNewSpendingUsd>3||s.maxNewSpendingUsd>w.maxNewSpendingUsd))throw Error('INVALID_EVALUATION_WORKFLOW');
 if(g.recoveryScope||!s.feedId||!s.manifestHash||!Array.isArray(s.operations)||!s.operations.length||s.operations.length>24||new Set(s.operations.map(o=>o.id)).size!==s.operations.length||s.operations.some(o=>!o.id||!o.requestHash||!g.modelIds.includes(o.model))||s.maxNewOperations!==s.operations.length||s.maxConcurrentOperations!==1||!Number.isFinite(s.maxNewSpendingUsd)||s.maxNewSpendingUsd<=0||s.maxNewSpendingUsd>3||s.maxNewSpendingUsd>g.maxExposureUsd||s.maxLifetimeExposureUsd!==73)throw Error('INVALID_EVALUATION_SCOPE');
}
export async function assertEvaluationScopeAvailable(db:D1Database,g:ModelSpendingAuthorization,r:ModelSpendingReservation){
 const s=g.evaluationScope;if(!s)return;
 if(!await db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='v1_model_spending_evaluation_scope'").first())throw Error('EVALUATION_SCOPE_MIGRATION_REQUIRED');
 if(r.feedId!==s.feedId||r.evaluation?.manifestHash!==s.manifestHash||!s.operations.some(o=>o.id===r.id&&o.model===r.model&&o.requestHash===r.evaluation?.requestHash))throw Error('EVALUATION_SCOPE_DENIED');
}
