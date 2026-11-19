import {expect,it,vi} from 'vitest';
import {consistentReview} from './worker/src/review-consistency';
import type {Case} from './worker/src/protocol';
const c:Case={id:'q',feedId:'f',language:'en',interest:'Local news',windowStart:'2026-11-19T09:00:00Z',windowEnd:'2026-11-19T10:00:00Z',publishedAt:'2026-11-19T10:00:00Z',frozenAt:'2026-11-19T11:00:00Z',evidenceScope:'all_eligible_frozen_input',evidenceComplete:true,articles:[{id:'a',feedId:'f',text:'The court charged five people.',completeness:'complete'}],prior:[],items:[{headline:'Court charges five people',body:'',sourceIds:['a']}],pipelineStatus:'published',sourceLabel:'test',limitations:[]};
const d={developments:[],limitations:[]};
const good=()=>({claims:[{id:'C1',item:0,text:c.items[0].headline,support:'supported',citationSupport:'supported',evidence:[{sourceId:'a',quote:c.articles[0].text!}],explanation:'The current cited source explicitly reports this charge.'}],coverage:[],items:[{item:0,relevance:'relevant',repetition:'novel',temporal:'correct',language:'correct',explanation:'New local news.'}],findings:[],limitations:[] as string[]});
it('corrects the retained contradictory citation pattern once with explicit proof and preserves both responses',async()=>{
 const original=good();original.claims[0].citationSupport='missing';const frozen=structuredClone(original),fixed=good();fixed.limitations=['CORRECTION_RECONSIDERED:citation:0:C1 The current court statement explicitly supports this claim and is already attached to item zero.'];
 const correct=vi.fn(async()=>fixed),r=await consistentReview(c,d,original,correct);expect(correct).toHaveBeenCalledTimes(1);expect(r.originalRawReview).toEqual(frozen);expect(original).toEqual(frozen);expect(r.correction?.replacementRawReview).toEqual(fixed);
});
it('retains an exhausted inconsistent correction as a failure without another call',async()=>{
 const bad=good();bad.items=[];const correct=vi.fn(async()=>bad);await expect(consistentReview(c,d,bad,correct)).rejects.toThrow('MISSING_ITEM_JUDGMENT');expect(correct).toHaveBeenCalledTimes(1);
});
it('cannot drop or rename an adverse claim and clear it through narrative alone',async()=>{
 const original=good();original.items=[];original.claims[0].support='unsupported';const fixed=good();fixed.claims[0].id='C99';fixed.limitations=['CORRECTION_RECONSIDERED:factual:0:C1 The statement appears supported after reconsidering its source.'];
 await expect(consistentReview(c,d,original,async()=>fixed)).rejects.toThrow('CORRECTION_CLAIM_IDENTITY_LOST');
});
it('never corrects fabricated evidence or turns abstention into a pass automatically',async()=>{
 const bad=good();bad.claims[0].evidence[0].quote='fabricated quote';const correct=vi.fn();await expect(consistentReview(c,d,bad,correct)).rejects.toThrow('FABRICATED_OR_FOREIGN_EVIDENCE');expect(correct).not.toHaveBeenCalled();
 const uncertain=good();uncertain.claims[0].support='uncertain';uncertain.claims[0].citationSupport='uncertain';expect((await consistentReview(c,d,uncertain,correct)).review.claims[0].support).toBe('uncertain');expect(correct).not.toHaveBeenCalled();
});
it('does not resolve duplicate claim ownership through a new judge guess',async()=>{
 const bad=good();bad.claims.push({...bad.claims[0],support:'unsupported',text:'A different assertion.'});const send=vi.fn();await expect(consistentReview(c,d,bad,send)).rejects.toThrow('DUPLICATE_CLAIM');expect(send).not.toHaveBeenCalled();
});
