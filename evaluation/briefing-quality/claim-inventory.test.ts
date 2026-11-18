import {expect,it} from 'vitest';
import {assessClaimInventory,auditClaimInventory,claimInventoryRequest,parseClaimInventoryAudit} from './worker/src/claim-inventory';
import type {Case,Review} from './worker/src/protocol';
import {groundedReviewSchema} from './worker/src/schema';
const c={items:[{headline:'رئيس الحكومة نجيب سلام يعلن تأجيل الجلسة',body:'',sourceIds:['s']}],articles:[{id:'s',text:'رئاسة الحكومة: لا جلسة بسبب ظرف عائلي طرأ على سلام.'}]} as Case;
const review={claims:[{id:'C1',item:0,text:'تأجيل الجلسة بسبب ظرف عائلي',support:'supported',citationSupport:'supported',evidence:[],explanation:'Source says so.'}],items:[],coverage:[],findings:[],limitations:[]} as Review;
it('requires every item judgment in the provider schema as well as the runtime validator',()=>{
 const schema=groundedReviewSchema(JSON.stringify({case:{items:[{},{},{}],articles:[],prior:[]},independentInventory:{developments:[]}})) as any;
 expect(schema.properties.items).toMatchObject({minItems:3,maxItems:3,items:{properties:{item:{type:'integer',enum:[0,1,2]}}}});
 expect(schema.properties.claims.items.properties.item).toMatchObject({minimum:0,maximum:2});
});
it('reports unassessed Arabic identity separately from a supported extracted event claim',()=>{
 const a=auditClaimInventory(c,review);
 expect(a.identityBindings[0]).toMatchObject({item:0,code:'ARABIC_NAME_UNBOUND'});
 expect(a.unassessedIdentities[0].name).toBe('نجيب سلام');
 expect(a.status).toBe('incomplete');
 expect(review.claims[0].support).toBe('supported');
});
it('distinguishes the actual false pass: name extracted but incorrectly judged supported',()=>{
 const r={...review,claims:[{...review.claims[0],text:c.items[0].headline}]};
 const a=auditClaimInventory(c,r);
 expect(a.unassessedIdentities).toEqual([]);expect(a.identityBindings).toHaveLength(1);
 expect(a.status).toBe('not_independently_established');
});
it('detects an entire item missing from the claim inventory',()=>{
 expect(auditClaimInventory({...c,items:[...c.items,{headline:'A park opened.',body:'',sourceIds:['s']}]},review).unassessedItems).toEqual([1]);
});
it('keeps legitimate surname-only paraphrases unknown rather than claiming whole-text coverage',()=>{
 const next={...c,items:[{...c.items[0],headline:'تأجيل الجلسة لظرف عائلي طرأ على سلام'}]};
 expect(auditClaimInventory(next,review)).toMatchObject({status:'not_independently_established',identityBindings:[],unassessedIdentities:[]});
});
it('does not invent a missing identity from Arabic orthography or Joseph spelling differences',()=>{
 const input={...c,items:[{...c.items[0],headline:'الرئيس جوزاف عون أعلن القرار'}],articles:[{...c.articles[0],text:'الرئيس جوزيف عون أعلن القرار'}]};
 const r={...review,claims:[{...review.claims[0],text:'الرئيس جوزيف عون أعلن القرار'}]};
 expect(auditClaimInventory(input,r)).toMatchObject({unassessedIdentities:[],identityBindings:[]});
});
it('keeps the independent audit blind to support verdicts and source/development inventories',()=>{
 const request=claimInventoryRequest(c,review),packet=JSON.parse(request.user);
 expect(packet).not.toHaveProperty('articles');expect(packet).not.toHaveProperty('inventory');expect(packet.claims[0]).not.toHaveProperty('support');
 expect(request.schemaPolicy).toBe('claim-inventory-audit-v1');
});
const raw=()=>({items:[{item:0,status:'incomplete',missing:[{quote:'نجيب سلام',explanation:'Person identity was not separately assessed.'}],explanation:'The event alone was assessed.'}],limitations:[]});
it('requires exact reader quotes for independently identified omissions',()=>{
 const value=raw();expect(parseClaimInventoryAudit(value,c).items[0].missing[0].quote).toBe('نجيب سلام');
 value.items[0].missing[0].quote='invented reader text';expect(()=>parseClaimInventoryAudit(value,c)).toThrow('CLAIM_AUDIT_UNBOUND_QUOTE');
});
it('rejects missing item rows, contradictory completion labels and empty incomplete findings',()=>{
 expect(()=>parseClaimInventoryAudit({...raw(),items:[]},c)).toThrow('CLAIM_AUDIT_INCOMPLETE_ITEMS');
 const value=raw();value.items[0].status='complete';expect(()=>parseClaimInventoryAudit(value,c)).toThrow('CLAIM_AUDIT_CONTRADICTION');
 value.items[0].status='incomplete';value.items[0].missing=[];expect(()=>parseClaimInventoryAudit(value,c)).toThrow('CLAIM_AUDIT_CONTRADICTION');
});
it('preserves abstention, QUIET and model-checked limitations without certifying truth',()=>{
 const value=raw();value.items[0]={item:0,status:'uncertain',missing:[],explanation:'Ambiguous paraphrase.'};
 expect(parseClaimInventoryAudit(value,c).items[0].status).toBe('uncertain');
 expect(parseClaimInventoryAudit({items:[],limitations:[]},{...c,items:[]})).toEqual({items:[],limitations:[]});
});
it('runs a separately supplied assessor once, preserves negative verdicts and labels model checks honestly',async()=>{
 const input={...c,items:[{headline:'A park opened.',body:'',sourceIds:['s']}]};
 const r={...review,claims:[{...review.claims[0],text:'A park opened.',support:'contradicted' as const}]};
 let calls=0;const before=structuredClone(r);
 const a=await assessClaimInventory(input,r,async request=>{calls++;expect(JSON.parse(request.user).claims[0]).not.toHaveProperty('support');return {items:[{item:0,status:'complete',missing:[],explanation:'The event is extracted.'}],limitations:[]}});
 expect(calls).toBe(1);expect(a.completeness).toBe('model_checked_not_certified');expect(r).toEqual(before);
});
it('does not suppress assessor failure or initiate an unrequested correction',async()=>{
 let calls=0;await expect(assessClaimInventory(c,review,async()=>{calls++;throw Error('UNKNOWN_PROVIDER_OUTCOME')})).rejects.toThrow('UNKNOWN_PROVIDER_OUTCOME');expect(calls).toBe(1);
});
it('does not pay to audit an empty QUIET claim inventory',async()=>{
 let calls=0;const a=await assessClaimInventory({...c,items:[]},{...review,claims:[]},async()=>{calls++;throw Error('unnecessary request')});
 expect(calls).toBe(0);expect(a.independent).toBeNull();
});
