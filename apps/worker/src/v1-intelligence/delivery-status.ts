import type {V1FeedStore} from './store';
import type {BriefingEditionRecord} from './publication';
/** `delivery_jobs` is an outbox written at publication. As of this change NOTHING in the Worker consumes it (verified by delivery-status.test.ts), so a PENDING job
 * with zero attempts is a missing dispatcher, not a transient queue. Reader access today is the public read of a PUBLISHED edition. This record states each step
 * separately and never lets "an edition exists" stand for "the reader received it". */
export const PUSH_DELIVERY_CONSUMER_IMPLEMENTED=false;
export type PushDeliveryState='NOT_IMPLEMENTED_OUTBOX_UNCONSUMED'|'NOT_STARTED'|'IN_PROGRESS'|'DELIVERED'|'FAILED'|'UNKNOWN';
export interface EditionDeliveryStatus {editionId:string;generated:boolean;verified:boolean;persisted:boolean;ledgerProjected:boolean;publiclyReadable:boolean;withdrawn:boolean;push:{state:PushDeliveryState;jobState?:string;attempts?:number;note:string}}
export async function readEditionDelivery(store:V1FeedStore,feedId:string,editionId:string):Promise<EditionDeliveryStatus> {
 const edition=await store.read<BriefingEditionRecord>(feedId,'editions',editionId),status=await store.read<{status:string}>(feedId,'publication_status',editionId),job=await store.read<{state:string;attempts:number}>(feedId,'delivery_jobs',editionId);
 const verificationId=edition?.generation?.verificationId??edition?.selectionId,verification=verificationId?await store.read<{passed?:boolean}>(feedId,'fidelity_results',verificationId):undefined;
 const projected=Boolean(await store.read(feedId,'ledger_projections',JSON.stringify([editionId,'grounded-communication-ledger-v1'])));
 const push=!job?{state:'NOT_STARTED' as const,note:'No delivery job exists.'}:!PUSH_DELIVERY_CONSUMER_IMPLEMENTED&&job.state==='PENDING'&&job.attempts===0?{state:'NOT_IMPLEMENTED_OUTBOX_UNCONSUMED' as const,jobState:job.state,attempts:job.attempts,note:'The delivery outbox has no consumer; a PENDING job with zero attempts will not progress. Readers can open the persisted edition; nothing has been pushed.'}:{state:(job.state==='DONE'?'DELIVERED':job.state==='FAILED'?'FAILED':job.state==='PENDING'?'NOT_STARTED':job.state==='RUNNING'?'IN_PROGRESS':'UNKNOWN') as PushDeliveryState,jobState:job.state,attempts:job.attempts,note:'Reported from the delivery job record.'};
 return {editionId,generated:Boolean(edition),verified:Boolean(verification?.passed),persisted:Boolean(edition),ledgerProjected:projected,publiclyReadable:status?.status==='PUBLISHED',withdrawn:status?.status==='WITHDRAWN',push};
}
