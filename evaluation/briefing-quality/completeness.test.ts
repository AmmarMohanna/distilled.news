import {it,expect} from 'vitest';
import {completeReview} from './worker/src/complete-review';
import {reviewSchema} from './worker/src/schema';
import {reviewRequest,type Case,type Inventory} from './worker/src/protocol';
const c:Case={id:'q',feedId:'f',language:'en',interest:'Lebanon',windowStart:'2026-11-14T10:00:00Z',windowEnd:'2026-11-14T10:30:00Z',frozenAt:'2026-11-14T10:30:00Z',publishedAt:'2026-11-14T10:30:00Z',evidenceScope:'all_eligible_frozen_input',evidenceComplete:true,articles:[{id:'a',feedId:'f',text:'A new explosion was reported.',completeness:'complete'}],prior:[],items:[],pipelineStatus:'quiet',sourceLabel:'test',limitations:[]};
const d:Inventory={developments:[{id:'D1',text:'Explosion',importance:2,relation:'new',evidence:[{sourceId:'a',quote:'new explosion'}]}],limitations:[]};
const empty={claims:[],coverage:[],items:[],findings:[],limitations:[]};
const full={...empty,coverage:[{developmentId:'D1',status:'omitted',items:[],explanation:'No published item.'}]};
it('uses one separately identified complete assessment, never default coverage rows',async()=>{
 let calls=0;const result=await completeReview(c,d,empty,async request=>{calls++;const data=JSON.parse(request.user);expect(data.requiredDevelopmentIds).toEqual(['D1']);expect(data.independentInventory.developments).toHaveLength(1);expect(data.incompleteReview).toEqual(empty);expect(request.system).toContain('never fill missing rows');return full});
 expect(calls).toBe(1);expect(result.coverage[0].status).toBe('omitted');
});
it('keeps incomplete correction visibly failed',async()=>{let calls=0;await expect(completeReview(c,d,empty,async()=>{calls++;return empty})).rejects.toThrow('MISSING_DEVELOPMENT_ASSESSMENT');expect(calls).toBe(1)});
it('does not request a correction for valid review or invalid evidence',async()=>{
 let calls=0;const complete=async()=>{calls++;return full};await completeReview(c,d,full,complete);
 await expect(completeReview(c,d,{...empty,coverage:[{developmentId:'foreign',status:'omitted',items:[],explanation:'invalid'}]},complete)).rejects.toThrow('UNKNOWN_OR_DUPLICATE_DEVELOPMENT');expect(calls).toBe(0);
});
it('constrains provider coverage length and IDs to the frozen inventory',()=>{
 const s=reviewSchema(false,reviewRequest(c,d).user),coverage=s.properties.coverage as any;
 expect(coverage.minItems).toBe(1);expect(coverage.maxItems).toBe(1);expect(coverage.items.properties.developmentId.enum).toEqual(['D1']);
});
