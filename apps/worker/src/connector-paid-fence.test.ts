import {afterAll,beforeAll,expect,it} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {hasUncertainSourcePayment,inspectSourcePaymentHolds} from './connector-paid-fence';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
beforeAll(async()=>{ctx=await createIntakeDatabase({product:true});});
afterAll(async()=>ctx?.dispose());
it('holds later windows and fallback for the same source without charging or changing another source',async()=>{
 await ctx.db.prepare(`INSERT INTO connector_provider_operations(provider_id,operation_id,request_hash,ceiling_usd,status,headers,feed_id,feed_source_id)
 VALUES('x_twitterapi_io','unknown','hash',0.01,-1,'{"claimToken":"private"}','feed','source')`).run();
 expect(await hasUncertainSourcePayment(ctx.db,'feed','source',['x_apify'])).toBe(true);
 expect(await hasUncertainSourcePayment(ctx.db,'feed','other',['x_twitterapi_io'])).toBe(false);
 const holds=await inspectSourcePaymentHolds(ctx.db,'feed');expect(holds).toHaveLength(1);expect(JSON.stringify(holds)).not.toContain('private');
 expect((await ctx.db.prepare("SELECT status,payload_ref FROM connector_provider_operations WHERE operation_id='unknown'").first())).toEqual({status:-1,payload_ref:null});
});
it('unattributed legacy uncertainty blocks only the affected provider and never invents attribution',async()=>{
 await ctx.db.prepare("INSERT INTO connector_provider_operations(provider_id,operation_id,request_hash,ceiling_usd,status) VALUES('linkedin_apify','legacy','hash',0.25,-1)").run();
 expect(await hasUncertainSourcePayment(ctx.db,'another','source',['linkedin_apify'])).toBe(true);
 expect(await hasUncertainSourcePayment(ctx.db,'another','source',['x_apify'])).toBe(false);
 expect((await ctx.db.prepare("SELECT feed_source_id FROM connector_provider_operations WHERE operation_id='legacy'").first())?.feed_source_id).toBeNull();
});
it('distinguishes an audited completed response loss from a genuinely unknown payment',async()=>{
 await ctx.db.prepare("INSERT INTO connector_provider_operations(provider_id,operation_id,request_hash,ceiling_usd,status,headers,feed_id,feed_source_id) VALUES('zyte','confirmed-loss','hash',0.05,200,?,'receipt-feed','receipt-source')").bind(JSON.stringify({reconciliation:{kind:'COMPLETED_RESPONSE_LOST',requestId:'verified'}})).run();
 expect(await hasUncertainSourcePayment(ctx.db,'receipt-feed','receipt-source',['zyte'])).toBe(false);expect(await inspectSourcePaymentHolds(ctx.db,'receipt-feed')).toHaveLength(1); // The unattributed unrelated legacy hold remains visible.
 await ctx.db.prepare("INSERT INTO connector_provider_operations(provider_id,operation_id,request_hash,ceiling_usd,status,feed_id,feed_source_id) VALUES('zyte','unverified-loss','hash',0.05,200,'unverified-feed','source')").run();
 expect(await hasUncertainSourcePayment(ctx.db,'unverified-feed','source',['zyte'])).toBe(true);
});
it('admits future collection only for a hash-bound operator acknowledgement without changing the unknown outcome',async()=>{
 const acknowledgement={kind:'UNKNOWN_OUTCOME_ACCEPTED_NO_REPLAY',requestHash:'ack-hash',reservedCeilingUsd:.01,approvedBy:'operator',approvalId:'explicit-approval',at:'2026-10-29T16:00:00Z'};
 await ctx.db.prepare("INSERT INTO connector_provider_operations(provider_id,operation_id,request_hash,ceiling_usd,status,headers,feed_id,feed_source_id) VALUES('x_twitterapi_io','ack-old','ack-hash',0.01,-1,?,'ack-feed','ack-source')").bind(JSON.stringify({claimExpiresAt:'2026-10-29T15:00:00Z',acknowledgement})).run();
 expect(await hasUncertainSourcePayment(ctx.db,'ack-feed','ack-source',['x_twitterapi_io'])).toBe(false);
 expect(await ctx.db.prepare("SELECT status,payload_ref,ceiling_usd FROM connector_provider_operations WHERE operation_id='ack-old'").first()).toEqual({status:-1,payload_ref:null,ceiling_usd:.01});
});
