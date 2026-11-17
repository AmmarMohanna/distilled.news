import {it,expect} from 'vitest';
import {nextRematch,REMATCH_CONTINUATION_POLICY} from './rematch';
const request:any={id:'r',policyVersion:REMATCH_CONTINUATION_POLICY},now='2026-10-21T00:00:00Z';
const wait:any={requestId:'r',attempt:1,state:'WAITING_BUDGET',reason:'PROVIDER_LIMIT_MIGRATION_REQUIRED',nextAttemptAt:'2026-10-21T00:10:00Z',createdAt:'2026-10-20T23:59:00Z'};
it('wakes a proven resolved schema dependency without waiting for resource backoff',()=>{
 expect(nextRematch(request,[wait],now)).toBeUndefined();expect(nextRematch(request,[wait],now,{resolvedWaitReasons:new Set(['PROVIDER_LIMIT_MIGRATION_REQUIRED'])})).toBe(1);
});
it('does not bypass unknown or semantic-failure backoff using dependency readiness',()=>{
 for(const reason of ['SEMANTIC_OUTCOME_UNKNOWN','SEMANTIC_CONSTRUCTION_REJECTED'])expect(nextRematch(request,[{...wait,state:'DEFERRED',reason}],now,{resolvedWaitReasons:new Set(['PROVIDER_LIMIT_MIGRATION_REQUIRED'])})).toBeUndefined();
});
