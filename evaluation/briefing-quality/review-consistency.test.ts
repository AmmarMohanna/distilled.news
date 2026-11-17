import {expect,it,vi} from 'vitest';
import {groundedReview,groundedReviewRequest} from './worker/src/grounding';
import {completeReview} from './worker/src/complete-review';
import type {Case} from './worker/src/protocol';

const c:Case={id:'raid',feedId:'feed',language:'en',interest:'Local news',windowStart:'2026-11-17T15:00:00Z',windowEnd:'2026-11-17T15:25:00Z',publishedAt:'2026-11-17T15:30:00Z',frozenAt:'2026-11-17T15:40:00Z',evidenceScope:'all_eligible_frozen_input',evidenceComplete:true,articles:[{id:'attached',feedId:'feed',text:'The army conducted a raid in Sharawneh, Baalbek, searching for wanted individuals.',completeness:'complete'},{id:'uncited',feedId:'feed',text:'The search continued in the afternoon.',completeness:'complete'}],items:[{headline:'Army conducts raid',body:'The army conducted a raid in Sharawneh, Baalbek, searching for wanted individuals.',sourceIds:['attached']}],prior:[],pipelineStatus:'published',sourceLabel:'test',limitations:[]};
const d={developments:[],limitations:[]};
const raw=()=>({claims:[{id:'C1',item:0,text:c.items[0].body,support:'supported',citationSupport:'supported',evidence:[{sourceId:'attached',quote:c.articles[0].text!}],explanation:'The cited passage establishes this claim.'}],coverage:[],items:[{item:0,relevance:'relevant',repetition:'novel',temporal:'correct',language:'correct',explanation:'Current relevant English news.'}],findings:[],limitations:[]});

it('rejects the retained raid pattern: supported evidence is attached but citation is called missing',()=>{
 const r=raw();r.claims[0].citationSupport='missing';const original=structuredClone(r);
 expect(()=>groundedReview(r,c,d)).toThrow('CITED_SUPPORT_LABEL_CONTRADICTION');expect(r).toEqual(original);
});
it('rejects unsupported citation labels when all judge-affirmed support is actually attached',()=>{
 const r=raw();r.claims[0].citationSupport='unsupported';expect(()=>groundedReview(r,c,d)).toThrow('CITED_SUPPORT_LABEL_CONTRADICTION');
});
it('preserves citation abstention without upgrading it to supported',()=>{
 const r=raw();r.claims[0].citationSupport='uncertain';expect(groundedReview(r,c,d).claims[0].citationSupport).toBe('uncertain');
});
it('allows genuinely missing citations and uncited factual support',()=>{
 const r=raw();r.claims[0].citationSupport='missing';expect(groundedReview(r,{...c,items:[{...c.items[0],sourceIds:[]}]},d).claims[0].citationSupport).toBe('missing');
});
it('allows unsupported citations when the complete claim depends on uncited evidence',()=>{
 const r=raw();r.claims[0].citationSupport='unsupported';r.claims[0].evidence.push({sourceId:'uncited',quote:c.articles[1].text!});expect(groundedReview(r,c,d).claims[0].citationSupport).toBe('unsupported');
});
it('does not infer citation correctness from an attached ID or an uncertain claim',()=>{
 const r=raw();r.claims[0].support='uncertain';r.claims[0].citationSupport='unsupported';r.claims[0].evidence=[];expect(groundedReview(r,c,d).claims[0].citationSupport).toBe('unsupported');
});
it('does not initiate a paid completeness correction or mutate an inconsistent review',async()=>{
 const r=raw();r.claims[0].citationSupport='missing';const send=vi.fn();const original=structuredClone(r);
 await expect(completeReview(c,d,r,send,{request:groundedReviewRequest(c,d),validate:v=>groundedReview(v,c,d)})).rejects.toThrow('CITED_SUPPORT_LABEL_CONTRADICTION');expect(send).not.toHaveBeenCalled();expect(r).toEqual(original);
});


it('preserves a legitimate missing citation on a second claim in an otherwise cited item',()=>{
 const r=raw();r.claims.push({id:'C2',item:0,text:c.articles[1].text!,support:'supported',citationSupport:'missing',evidence:[{sourceId:'uncited',quote:c.articles[1].text!}],explanation:'Only uncited B supports this separate claim.'});
 const multi={...c,items:[{...c.items[0],body:c.items[0].body+' '+c.articles[1].text}]};
 expect(groundedReview(r,multi,d).claims.map(v=>v.citationSupport)).toEqual(['supported','missing']);
 expect(r.claims[1].citationSupport).toBe('missing');
});
it('preserves missing or unsupported when only part of the complete claim support is cited',()=>{
 for(const label of ['missing','unsupported']){
  const r=raw();r.claims[0].text+=' '+c.articles[1].text;r.claims[0].citationSupport=label;r.claims[0].evidence.push({sourceId:'uncited',quote:c.articles[1].text!});
  const multi={...c,items:[{...c.items[0],body:c.items[0].body+' '+c.articles[1].text}]};
  expect(groundedReview(r,multi,d).claims[0].citationSupport).toBe(label);
 }
});
it('does not mistake another item citation for support attached to this claim',()=>{
 const r=raw();r.claims[0].text=c.articles[1].text!;r.claims[0].citationSupport='missing';r.claims[0].evidence=[{sourceId:'uncited',quote:c.articles[1].text!}];
 const next={...c,items:[{...c.items[0],body:c.items[0].body+' '+c.articles[1].text},{headline:'Later search',body:c.articles[1].text!,sourceIds:['uncited']}]};r.items.push({...r.items[0],item:1});
 expect(groundedReview(r,next,d).claims[0].citationSupport).toBe('missing');
});
