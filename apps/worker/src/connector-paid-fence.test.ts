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
