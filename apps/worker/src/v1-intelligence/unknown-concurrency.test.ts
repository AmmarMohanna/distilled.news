import {beforeAll,afterAll,it,expect} from 'vitest';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {authorizeModelSpending,reserveModelSpending,settleModelSpending,spendingExposure,executionCapacityDiagnostic} from './model-spending';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
beforeAll(async()=>ctx=await createIntakeDatabase({modelSpending:false}));
afterAll(async()=>ctx.dispose());
const at='2026-10-13T00:00:00Z';
const grant=(id:string,slots:number,cost=50)=>({id,accountId:id,modelIds:['fixture'],validFrom:'2026-10-12T00:00:00Z',validUntil:'2026-10-19T00:00:00Z',maxExposureUsd:cost,maxConcurrentOperations:slots});
const reservation=(accountId:string,id:string,cost=.02)=>({id:accountId+':'+id,accountId,model:'fixture',feedId:'feed-'+id,token:'owner-'+id,reservedCostUsd:cost,leaseUntil:0,createdAt:at});
it('expired local ownership is not remote termination or permission to release a held slot',()=>{
 expect(executionCapacityDiagnostic({accountMapped:true,reported:false,leaseUntil:0},100)).toMatchObject({localLeaseState:'EXPIRED',countedAgainstConcurrency:true,remoteExecutionState:'TERMINATION_UNPROVEN',capacityReleaseEligibility:'INSUFFICIENT_PROVIDER_EVIDENCE'});
 expect(executionCapacityDiagnostic({accountMapped:true,reported:false,leaseUntil:200},100)).toMatchObject({localLeaseState:'LIVE',remoteExecutionState:'TERMINATION_UNPROVEN'});
});
it('confirmed settlement and unpaid work have distinct concurrency diagnostics',()=>{
 expect(executionCapacityDiagnostic({accountMapped:true,reported:true,leaseUntil:0},100)).toMatchObject({countedAgainstConcurrency:false,capacityReleaseEligibility:'ALREADY_RELEASED_BY_SETTLEMENT'});
 expect(executionCapacityDiagnostic({accountMapped:false,calls:0},100)).toMatchObject({remoteExecutionState:'NOT_RUN',countedAgainstConcurrency:false});
 expect(executionCapacityDiagnostic({accountMapped:false},100)).toMatchObject({countedAgainstConcurrency:null,capacityReleaseEligibility:'NOT_OBSERVABLE'});
});
it('HTTP failure or request ID alone cannot establish termination',()=>{
 const diagnostic={httpStatus:400,message:'details unavailable',requestId:'req-known',execution:'UNKNOWN' as const};
 expect(executionCapacityDiagnostic({accountMapped:true,reported:false,providerDiagnostic:diagnostic})).toMatchObject({remoteExecutionState:'TERMINATION_UNPROVEN',countedAgainstConcurrency:true});
});
it('explicit retained rejection proof requires reconciliation, never silently releases a slot',()=>{
 const diagnostic={httpStatus:400,message:'invalid schema',code:'invalid_json_schema',category:'invalid_request_error',requestId:'req-proof',execution:'REJECTED_BEFORE_EXECUTION' as const};
 expect(executionCapacityDiagnostic({accountMapped:true,reported:false,providerDiagnostic:diagnostic})).toMatchObject({remoteExecutionState:'CONFIRMED_NONEXECUTION',countedAgainstConcurrency:true,capacityReleaseEligibility:'EVIDENCE_BOUND_RECONCILIATION_REQUIRED'});
 expect(executionCapacityDiagnostic({accountMapped:true,reported:false,providerDiagnostic:{...diagnostic,requestId:undefined}})).toMatchObject({remoteExecutionState:'TERMINATION_UNPROVEN'});
});
it('21 expired UNKNOWN liabilities saturate 21 slots with dollars remaining; exact replay and status reads are idempotent',async()=>{
 const g=grant('saturation',21);await authorizeModelSpending(ctx.db,g);
 const costs=[...Array(6).fill(.04),...Array(11).fill(.02),.2682928,.0673288,.069454,.1493576];
 for(const [i,cost] of costs.entries())await reserveModelSpending(ctx.db,reservation(g.accountId,String(i),cost));
 const before=await spendingExposure(ctx.db,g.accountId,at);
 expect(before.heldCostUsd).toBeCloseTo(1.0144332,8);expect(before).toMatchObject({reportedCostUsd:0,unsettledConcurrencySlots:21,unknown:21});
 await expect(reserveModelSpending(ctx.db,reservation(g.accountId,'independent'))).rejects.toMatchObject({reason:'ACCOUNT_RESOURCE_WAIT'});
 await reserveModelSpending(ctx.db,reservation(g.accountId,'0',costs[0]));
 expect(await spendingExposure(ctx.db,g.accountId,at)).toEqual(before);
 await settleModelSpending(ctx.db,g.accountId+':0','owner-0',{costUsd:.03,reported:true});
 await settleModelSpending(ctx.db,g.accountId+':0','owner-0',{costUsd:.03,reported:true});
 await reserveModelSpending(ctx.db,reservation(g.accountId,'independent'));
 const after=await spendingExposure(ctx.db,g.accountId,at);expect(after.unsettledConcurrencySlots).toBe(21);expect(after.reportedCostUsd).toBe(.03);expect(after.heldCostUsd).toBeCloseTo(.9944332,8);
},30000);
it('two Workers cannot over-admit independent operations even with expired leases',async()=>{
 const g=grant('concurrent',1);await authorizeModelSpending(ctx.db,g);
 const outcomes=await Promise.allSettled(['a','b'].map(id=>reserveModelSpending(ctx.db,reservation(g.accountId,id))));
 expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect(await spendingExposure(ctx.db,g.accountId,at)).toMatchObject({unsettledConcurrencySlots:1,heldCostUsd:.02});
});
it('financial authorization remains binding independently of available execution slots',async()=>{
 const g=grant('financial',21,.03);await authorizeModelSpending(ctx.db,g);
 await reserveModelSpending(ctx.db,reservation(g.accountId,'a',.02));
 await expect(reserveModelSpending(ctx.db,reservation(g.accountId,'b',.02))).rejects.toMatchObject({reason:'ACCOUNT_RESOURCE_WAIT'});
 expect(await spendingExposure(ctx.db,g.accountId,at)).toMatchObject({unsettledConcurrencySlots:1,heldCostUsd:.02});
});
