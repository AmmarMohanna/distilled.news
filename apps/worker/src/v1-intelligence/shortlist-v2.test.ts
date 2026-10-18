import {expect,it} from 'vitest';
import {prepareV2Shortlist} from './shortlist-v2';
it('projects only trusted navigation and retains ambiguous fragments for explicit defer',async()=>{
 const raw='Published: October 8\nOfficials approved the law.';
 const shortlist:any={id:'s',feedId:'f',feedRevision:1,candidates:[{facts:[{id:'nav',text:'Published: October 8',evidenceRevisionIds:['r']},{id:'news',text:'Officials approved the law.',evidenceRevisionIds:['r']}]}],overflow:[]};
 const store:any={revision:async()=>({id:'r',contentHash:'h',body:raw}),list:async()=>[]};
 const v2=await prepareV2Shortlist(store,shortlist,false);
 expect(v2.candidates[0].facts[0].newsEligibility!.status).toBe('UNRESOLVED');expect(v2.candidates[0].facts[1].newsEligibility!.status).toBe('ELIGIBLE');
 expect(shortlist.candidates[0].facts[0].newsEligibility).toBeUndefined();
 store.list=async()=>[{evidenceRevisionId:'r',regions:[{revisionId:'r',contentHash:'h',field:'body',start:0,end:20,role:'NAVIGATION',provenance:'PARSER_STRUCTURE'}]}];
 const trusted=await prepareV2Shortlist(store,shortlist,false);expect(trusted.candidates[0].facts[0].newsEligibility!.status).toBe('NOT_NEWS');
 expect(trusted.id).not.toBe(shortlist.id);expect(trusted.candidates[0].facts[0].text).toBe(shortlist.candidates[0].facts[0].text);
});
