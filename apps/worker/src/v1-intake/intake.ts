import { connectorHandoffRequestSchema, HandoffError, intakeReceiptSchema, timestampSchema, validateHandoffResponse, type CandidateIntakePort, type IntakeReceipt } from '@distilled/contracts';
import { itemId, V1IntakeStore } from './store';
import { canonicalJson, canonicalRequest } from './canonical';
import { transact } from './transaction';
import type { AcceptedInput, CandidateRecord, DownstreamJob, IntakePolicy } from './types';
export function createCandidateIntakePort(store:V1IntakeStore,policy:IntakePolicy):CandidateIntakePort {
  return { async acceptBatch(input) {
    const parsed=connectorHandoffRequestSchema.safeParse(input);
    if(!parsed.success) throw new HandoffError('INVALID_REQUEST');
    const request=parsed.data, canonical=canonicalRequest(request);
    const response=await transact(store,request.coverage.feedSourceId,async tx=>{
      if(tx.snapshot.scope.feedId!==request.coverage.feedId || request.observations.some(o=>o.sourceId!==tx.snapshot.scope.sourceId)) throw new HandoffError('SCOPE_DENIED');
      const handoffKey=itemId(request.coverage.feedSourceId,request.handoffId);
      const existing=await tx.read<{canonical:string}>('handoffs',handoffKey);
      if(existing && existing.canonical!==canonical) throw new HandoffError('IDEMPOTENCY_CONFLICT');
      if(!existing) tx.write('handoffs',handoffKey,{canonical},undefined,true);
      const receipts:IntakeReceipt[]=[];
      for(const observation of request.observations) {
        const proposal=request.proposals.find(p=>p.observationId===observation.id);
        const value:AcceptedInput={observation,proposal}, stored=await tx.read<AcceptedInput>('inputs',observation.id);
        if(stored && canonicalJson(stored)!==canonicalJson(value)) throw new HandoffError('IDEMPOTENCY_CONFLICT');
        if(!stored) tx.write('inputs',observation.id,value,observation.sourceItemKey,true);
        const prior=await tx.read<IntakeReceipt>('intake_receipts',observation.id);
        if(prior) {receipts.push(prior);continue}
        const id=itemId(observation.feedSourceId,observation.sourceItemKey), candidate=await tx.read<CandidateRecord>('candidates',id);
        const receipt:IntakeReceipt={id:crypto.randomUUID(),observationId:observation.id,feedId:observation.feedId,feedSourceId:observation.feedSourceId,sourceItemKey:observation.sourceItemKey,decision:'ACCEPTED',reasonCode:candidate?'ACCEPTED_NEW_OBSERVATION':'ACCEPTED_NEW_ITEM',checkpointResolution:'RESOLVED',candidateItemId:id,decidedAt:timestampSchema.parse(policy.now()),intakePolicyVersion:policy.version};
        tx.write('candidates',id,{id,feedId:observation.feedId,feedSourceId:observation.feedSourceId,sourceId:observation.sourceId,sourceItemKey:observation.sourceItemKey,latestObservationId:observation.id,discoveredAt:candidate?.discoveredAt??observation.observedAt,intakePolicyVersion:policy.version} satisfies CandidateRecord,observation.sourceItemKey);
        const job:DownstreamJob={id:JSON.stringify(['ACQUIRE',observation.id]),feedId:observation.feedId,feedSourceId:observation.feedSourceId,observationId:observation.id,kind:'ACQUIRE',state:'PENDING',attempts:0};
        tx.write('jobs',job.id,job,observation.sourceItemKey,true);
        tx.write('intake_receipts',observation.id,intakeReceiptSchema.parse(receipt),observation.sourceItemKey);
        receipts.push(receipt);
      }
      return validateHandoffResponse(request,{contractVersion:request.contractVersion,handoffId:request.handoffId,durable:true,receipts});
    });
    return response;
  }};
}
