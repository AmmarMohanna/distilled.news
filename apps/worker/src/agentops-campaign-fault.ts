import type {Env} from './types';
/** Test-only interruption after durable V3 output, never before paid settlement.
 * Normal deployments do not perform a lookup or alter their execution path. */
export async function campaignInterruptAfterResult(env:Env,feed:string){
 if(env.ENVIRONMENT!=='staging'||env.AGENTOPS_CAMPAIGN_ENABLED!=='true'||env.AGENTOPS_CAMPAIGN_ISOLATED!=='true'||env.AGENTOPS_CAMPAIGN_ALLOW_FAULTS!=='true'||env.VAPID_PRIVATE_KEY||!/^qa_[a-z0-9]{8,24}_u\d+_f\d+$/.test(feed))return;
 const row=await env.DB.prepare('SELECT interrupt_until FROM agentops_campaign_feeds WHERE feed_id=?').bind(feed).first<{interrupt_until:string|null}>();
 if(row?.interrupt_until&&Date.parse(row.interrupt_until)>Date.now())throw Error('CAMPAIGN_INJECTED_AFTER_DURABLE_RESULT');
}
