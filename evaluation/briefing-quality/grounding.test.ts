import {it,expect} from 'vitest';
import {groundedInventoryRequest,groundingRequest,parseGrounding,groundedInventory,groundedReviewRequest,groundedReview,groundedMetrics} from './worker/src/grounding';
import {inventory,metrics,type Case,type Inventory} from './worker/src/protocol';
import {groundingSchema,groundedReviewSchema} from './worker/src/schema';
const c:Case={id:'edition',feedId:'feed',language:'en',interest:'Lebanon',windowStart:'2026-11-14T12:25:00Z',windowEnd:'2026-11-14T12:55:00Z',frozenAt:'2026-11-14T13:00:00Z',publishedAt:'2026-11-14T13:00:00Z',evidenceScope:'all_eligible_frozen_input',evidenceComplete:false,articles:[{id:'frost',feedId:'feed',text:'Frost destroys crops in West Bekaa.',completeness:'partial'},{id:'union',feedId:'feed',text:'Unions support land transport; escalation expected.',completeness:'partial'},{id:'criticism',feedId:'feed',text:'A politician criticizes handling of detainees.',completeness:'partial'}],prior:[{id:'prior',at:'2026-11-14T11:00:00Z',headline:'OLD_HISTORY_SECRET',body:'Detainees said they were doing reconnaissance.'}],items:[],pipelineStatus:'quiet',sourceLabel:'test',limitations:[]};
const proposed:Inventory={developments:[{id:'D1',text:'Frost destroys crops in West Bekaa.',importance:2,relation:'new',evidence:[{sourceId:'frost',quote:'Frost destroys crops in West Bekaa.'}]},{id:'D2',text:'Drivers blocked Martyrs Square.',importance:2,relation:'new',evidence:[{sourceId:'union',quote:'Unions support land transport; escalation expected.'}]},{id:'D3',text:'Hezbollah detainees admit reconnaissance.',importance:2,relation:'new',evidence:[{sourceId:'criticism',quote:'A politician criticizes handling of detainees.'}]}],limitations:[]};
const assessment={results:[{developmentId:'D1',support:'supported',explanation:'Explicit crop damage.'},{developmentId:'D2',support:'unsupported',explanation:'Anticipated escalation is not a road closure.'},{developmentId:'D3',support:'unsupported',explanation:'Criticism does not establish testimony or affiliation.'}],limitations:[]};
it('keeps candidate prose and prior reader details out of inventory and entailment requests',()=>{
 for(const request of [groundedInventoryRequest(c),groundingRequest(c,proposed)]){expect(request.user).not.toContain('OLD_HISTORY_SECRET');expect(request.user).not.toContain('doing reconnaissance');expect(JSON.parse(request.user).prior).toBeUndefined();expect(JSON.parse(request.user).items).toBeUndefined()}
 expect(JSON.parse(groundedInventoryRequest(c).user).articles).toHaveLength(3);
});
it('does not mistake passage membership for semantic support',()=>{
 expect(inventory(proposed,c).developments).toHaveLength(3);
 const g=parseGrounding(assessment,proposed),accepted=groundedInventory(proposed,g);
 expect(accepted.developments.map(d=>d.id)).toEqual(['D1']);expect(proposed.developments).toHaveLength(3);expect(accepted.limitations.join(' ')).toContain('D2');expect(accepted.limitations.join(' ')).toContain('D3');
 const raw={claims:[],coverage:[{developmentId:'D1',status:'omitted',items:[],priorIds:[],explanation:'No item.'}],items:[],findings:[],limitations:[]};
 const r=groundedReview(raw,c,accepted);expect(metrics(r,accepted,c).importantDevelopmentRecall.denominator).toBe(1);expect(r.findings).toHaveLength(1);expect(r.findings[0].evidence[0].sourceId).toBe('frost');
});
it.each([[],[assessment.results[0],assessment.results[0],assessment.results[2]],[...assessment.results.slice(0,2),{...assessment.results[2],developmentId:'foreign'}]])('rejects missing duplicate or foreign entailment decisions',results=>{expect(()=>parseGrounding({results,limitations:[]},proposed)).toThrow()});
it('excludes uncertain inventory from omission scoring and retains its diagnostic',()=>{const g=parseGrounding({...assessment,results:assessment.results.map(x=>({...x,support:'uncertain'}))},proposed);const d=groundedInventory(proposed,g);expect(d.developments).toEqual([]);expect(d.limitations).toHaveLength(3)});
it('requires exact prior matches before excluding a grounded development as already reported',()=>{
 const d={...proposed,developments:[proposed.developments[0]]};const raw={claims:[],coverage:[{developmentId:'D1',status:'already_reported',items:[],priorIds:['prior'],explanation:'Earlier coverage.'}],items:[],findings:[],limitations:[]};
 expect(groundedReview(raw,c,d).coverage[0].priorIds).toEqual(['prior']);expect(()=>groundedReview({...raw,coverage:[{...raw.coverage[0],priorIds:[]}]},c,d)).toThrow('NEW_DEVELOPMENT_HIDDEN_AS_OLD');expect(()=>groundedReview({...raw,coverage:[{...raw.coverage[0],priorIds:['foreign']}]},c,d)).toThrow('UNKNOWN_PRIOR_MATCH');
});
it('rejects free-form coverage findings outside grounded structured coverage',()=>{
 const d={developments:[],limitations:[]};expect(()=>groundedReview({claims:[],coverage:[],items:[],limitations:[],findings:[{category:'coverage',severity:'warning',item:null,explanation:'Invented missed roadblock',evidence:[]}]},c,d)).toThrow('UNBOUND_COVERAGE_FINDING');
});
it('constrains grounding IDs and review prior IDs in provider schemas',()=>{
 const g=groundingSchema(groundingRequest(c,proposed).user) as any;expect(g.properties.results.minItems).toBe(3);expect(g.properties.results.items.properties.developmentId.enum).toEqual(['D1','D2','D3']);
 const r=groundedReviewSchema(groundedReviewRequest(c,proposed).user) as any;expect(r.properties.coverage.items.properties.priorIds.items.enum).toEqual(['prior']);expect(r.properties.findings.items.properties.category.enum).not.toContain('coverage');
});

it('does not count validated prior-reader coverage as an omission in new source-only inventories',()=>{
 const d={...proposed,developments:[proposed.developments[0]]};const r=groundedReview({claims:[],coverage:[{developmentId:'D1',status:'already_reported',items:[],priorIds:['prior'],explanation:'Exact prior reader coverage.'}],items:[],findings:[],limitations:[]},c,d);
 expect(groundedMetrics(r,d,c).importantDevelopmentRecall.denominator).toBe(0);expect(groundedMetrics(r,d,c).importantDevelopmentRecall.value).toBeNull();
});

it('cannot launder an omission into an unbound factual warning',()=>{
 expect(()=>groundedReview({claims:[],coverage:[],items:[],limitations:[],findings:[{category:'factual',severity:'warning',item:null,explanation:'An omitted political statement',evidence:[]}]},c,{developments:[],limitations:[]})).toThrow('UNBOUND_REVIEW_FINDING');
 const schema=groundedReviewSchema(groundedReviewRequest(c,{developments:[],limitations:[]}).user) as any;expect(schema.properties.findings.maxItems).toBe(0);
});
