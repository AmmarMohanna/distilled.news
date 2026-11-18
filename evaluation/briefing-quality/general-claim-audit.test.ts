import {expect,it} from 'vitest';
import {auditClaimInventory,assessClaimInventory} from './worker/src/claim-inventory';
import type {Case,Review} from './worker/src/protocol';
it.each([
 ['ar','قال الرئيس عبد الفتاح الوحش إن القرار اتخذ.','عبد الفتاح الوحش'],
 ['en','The former president did not approve the plan.','did not approve'],
 ['fr',"Jean-Baptiste de La Tour pourrait annoncer une hausse de 3 %.",'pourrait'],
])('independently audits %s reader facets without trusting name dictionaries or the original support verdict',async(language,headline,quote)=>{
 const c={language,items:[{headline,body:'',sourceIds:[]}],articles:[]} as unknown as Case;
 const r={claims:[{id:'C1',item:0,text:'An announcement.',support:'supported'}]} as Review;
 const mechanical=auditClaimInventory(c,r);expect(mechanical.status).toBe('not_independently_established');expect(mechanical.policy).toBe('reader-claim-inventory-v2');
 let calls=0;const a=await assessClaimInventory(c,r,async request=>{
  calls++;const p=JSON.parse(request.user);expect(p.items[0].headline).toBe(headline);expect(p.claims[0]).not.toHaveProperty('support');
  return {items:[{item:0,status:'incomplete',missing:[{quote,explanation:'The quoted factual qualification is absent from the extracted inventory.'}],explanation:'Incomplete decomposition.'}],limitations:[]};
 });
 expect(calls).toBe(1);expect(a.completeness).toBe('incomplete');expect(a.requiresAttention).toBe(true);expect(r.claims[0].support).toBe('supported');
});
