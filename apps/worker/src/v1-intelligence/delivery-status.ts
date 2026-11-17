import type {V1FeedStore} from './store';
import type {BriefingEditionRecord} from './publication';
/** Publication and notification are separate. The scheduled browser-push consumer
 * acknowledges the outbox only after durable push-service acceptance receipts.
 * DONE means service acceptance, never device display or proof the reader opened it. */
export const PUSH_DELIVERY_CONSUMER_IMPLEMENTED=true;
export type PushDeliveryState='NOT_STARTED'|'IN_PROGRESS'|'DELIVERED'|'FAILED'|'UNKNOWN';
export interface EditionDeliveryStatus {editionId:string;generated:boolean;verified:boolean;persisted:boolean;ledgerProjected:boolean;publiclyReadable:boolean;withdrawn:boolean;push:{state:PushDeliveryState;jobState?:string;attempts?:number;note:string}}
export async function readEditionDelivery(store:V1FeedStore,feedId:string,editionId:string):Promise<EditionDeliveryStatus> {
 const edition=await store.read<BriefingEditionRecord>(feedId,'editions',editionId),status=await store.read<{status:string}>(feedId,'publication_status',editionId),job=await store.read<{state:string;attempts:number}>(feedId,'delivery_jobs',editionId);
 const verificationId=edition?.generation?.verificationId??edition?.selectionId,verification=verificationId?await store.read<{passed?:boolean}>(feedId,'fidelity_results',verificationId):undefined;
 const projected=Boolean(await store.read(feedId,'ledger_projections',JSON.stringify([editionId,'grounded-communication-ledger-v1'])));
 const push=!job?{state:'NOT_STARTED' as const,note:'No delivery job exists.'}:{state:(job.state==='DONE'?'DELIVERED':job.state==='FAILED'?'FAILED':job.state==='PENDING'?'NOT_STARTED':job.state==='RUNNING'?'IN_PROGRESS':'UNKNOWN') as PushDeliveryState,jobState:job.state,attempts:job.attempts,note:job.state==='DONE'?'Eligible browser subscriptions were accepted by the push service; device receipt and reader opening are unverified.':'Awaiting notification processing, configured VAPID credentials and eligible subscriptions.'};
 return {editionId,generated:Boolean(edition),verified:Boolean(verification?.passed),persisted:Boolean(edition),ledgerProjected:projected,publiclyReadable:status?.status==='PUBLISHED',withdrawn:status?.status==='WITHDRAWN',push};
}
