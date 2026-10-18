import {expect,it,vi} from 'vitest';
import {v2EditorialRequest,prepareV2EditorialPlan} from './editorial-plan-v2';
const shortlist:any={id:'s',feedId:'f',feedRevision:1,window:{start:'2026-10-18T00:00:00Z',end:'2026-10-18T01:00:00Z'},candidates:[],obligations:[],ledger:[],evidenceRevisionIds:['r'],communicationFingerprint:'fp'};
it('binds explicit proposition requirements into a different versioned model input',()=>{
 const request=v2EditorialRequest(shortlist,{title:'Feed',interests:'AI'} as any);
 expect(request.state.contract).toBe('EVIDENCE_GROUNDED_V2');expect(request.state.instruction).toContain('not automatically mandatory');expect((request.schema.properties.stories.items.anyOf[0].properties as Record<string,unknown>).validation).toBeDefined();
});
it('does not invoke a provider when v2 admission/capability is unavailable',async()=>{
 const complete=vi.fn();const store:any={getFeed:async()=>({id:'f',revision:1}),read:async()=>undefined,list:async()=>[]};
 await expect(prepareV2EditorialPlan(store,shortlist,'2026-10-18T02:00:00Z',{model:'model',complete,usage:()=>({calls:0,costUsd:0,reported:true}),admission:()=>({fits:false,reason:'MODEL_CONTEXT_CAPACITY'})} as any)).rejects.toThrow();
 expect(complete).not.toHaveBeenCalled();
});
