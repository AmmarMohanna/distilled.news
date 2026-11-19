import {expect,it,vi} from 'vitest';
import {auditOmissionHistory} from './worker/src/omission-history';
import type {Case,Inventory,Review} from './worker/src/protocol';
const c:Case={id:'q',feedId:'f',language:'en',interest:'Local news',windowStart:'2026-11-19T09:00:00Z',windowEnd:'2026-11-19T10:00:00Z',publishedAt:'2026-11-19T10:00:00Z',frozenAt:'2026-11-19T11:00:00Z',evidenceScope:'all_eligible_frozen_input',evidenceComplete:true,articles:[{id:'a',feedId:'f',text:'New sanctions target the charity.',completeness:'complete'}],prior:[{id:'old',at:'2026-11-18T18:00:00Z',headline:'Sanctions target the charity',body:'The Treasury announced sanctions.'}],items:[{headline:'UNIQUE_CANDIDATE_SENTINEL',body:'',sourceIds:['a']}],pipelineStatus:'published',sourceLabel:'test',limitations:[]};
const d:Inventory={developments:[{id:'D1',text:'New sanctions target the charity.',importance:3,relation:'new',evidence:[{sourceId:'a',quote:c.articles[0].text!}]}],limitations:[]};
const review:Review={claims:[],items:[],coverage:[{developmentId:'D1',status:'omitted',items:[],explanation:'No item covers it.',priorIds:[]}],findings:[{category:'coverage',severity:'warning',item:null,explanation:'Potential omission of D1',evidence:d.developments[0].evidence}],limitations:[]};
it('preserves conflicting omission/reader-history judgments as uncertainty with exact prior evidence',async()=>{
 const original=structuredClone(review),send=vi.fn(async req=>{expect(req.user).not.toContain('UNIQUE_CANDIDATE_SENTINEL');return {results:[{developmentId:'D1',status:'already_reported',priorEvidence:[{priorId:'H1',passageId:'P1'}],explanation:'The same sanctions and charity already appeared in the prior edition.'}]};});
 const r=await auditOmissionHistory(c,d,review,send);expect(send).toHaveBeenCalledTimes(1);expect(r.review.coverage[0].status).toBe('uncertain');expect(r.audit.disagreements).toEqual(['D1']);expect(r.audit.results[0].priorEvidence[0].priorId).toBe('old');expect(review).toEqual(original);expect(r.review.findings).toEqual([]);
});
it('keeps a genuine new occurrence omitted even when the topic/place was previously reported',async()=>{
 const r=await auditOmissionHistory(c,d,review,async()=>({results:[{developmentId:'D1',status:'new_or_updated',priorEvidence:[{priorId:'H1',passageId:'P1'}],explanation:'The current evidence establishes a different designation.'}]}));expect(r.review.coverage[0].status).toBe('omitted');expect(r.review.findings).toHaveLength(1);
});
it('rejects foreign history proofs and incomplete audits rather than silently suppressing an omission',async()=>{
 await expect(auditOmissionHistory(c,d,review,async()=>({results:[{developmentId:'D1',status:'already_reported',priorEvidence:[{priorId:'H99',passageId:'P1'}],explanation:'Same event.'}]}))).rejects.toThrow('INVALID_READER_HISTORY_EVIDENCE');
 await expect(auditOmissionHistory(c,d,review,async()=>({results:[]}))).rejects.toThrow('INCOMPLETE_OMISSION_HISTORY_AUDIT');
});
it('does not add a model call for absent reader history or no important omissions',async()=>{
 const send=vi.fn();expect((await auditOmissionHistory({...c,prior:[]},d,review,send)).audit.status).toBe('not_needed');await auditOmissionHistory(c,{...d,developments:[]},review,send);expect(send).not.toHaveBeenCalled();
});
