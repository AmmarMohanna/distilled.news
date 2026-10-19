import {expect,it,vi} from 'vitest';
import {v2EditorialRequest,prepareV2EditorialPlan,decodeV2EditorialResponse} from './editorial-plan-v2';
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

it('omits only repeated fallback prose and ranking audit metadata, retaining facts and protected relationships',()=>{
 const candidate:any={targetVersionId:'event',facts:[{id:'fact',text:'The fund may commit 5% if approved.',evidenceRevisionIds:['revision'],certainty:{kind:'POSSIBLE',hedges:['may']}}],effects:['CORRECTS'],flags:['QUALIFIED'],protectedReasons:['CORRECTS'],correctionObligationIds:['obligation'],ranking:{score:.8,policyVersion:'rank',semanticKey:'repeated audit prose',operationId:'paid-id'},fallbackEditorial:{newUnderstanding:[{text:'The fund may commit 5% if approved.'}]}};
 const source={...shortlist,candidates:[candidate]},before=JSON.stringify(source),request=v2EditorialRequest(source,{title:'Feed',interests:['AI']});expect(request.state.candidates[0].facts).toEqual(candidate.facts);expect(request.state.candidates[0].protectedReasons).toEqual(['CORRECTS']);expect(request.state.candidates[0].correctionObligationIds).toEqual(['obligation']);expect(request.state.candidates[0].ranking).toEqual({score:.8,policyVersion:'rank'});expect((request.state.candidates[0] as any).fallbackEditorial).toBeUndefined();expect(JSON.stringify(source)).toBe(before);
});
it('retains an already-started paid V2 frame instead of buying a changed projection',async()=>{
 const oldState={window:shortlist.window,outputSchema:{type:'object'},instruction:'frozen paid input'},admission=vi.fn(()=>({fits:false,reason:'MODEL_CONTEXT_CONTINUATION_REQUIRED'}));const store:any={getFeed:async()=>({id:'f',revision:1}),read:async()=>undefined,list:async()=>[{input:{kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:'evidence-grounded-editorial-plan-v2',model:'model',feedRevision:1,state:oldState}}]};
 await expect(prepareV2EditorialPlan(store,shortlist,'2026-10-18T02:00:00Z',{model:'model',complete:vi.fn(),usage:()=>({calls:0,costUsd:0,reported:true}),admission} as any)).rejects.toThrow();expect(admission.mock.calls[0]).toEqual([{window:shortlist.window,instruction:'frozen paid input'},{type:'object'},'COMPARATIVE_EDITORIAL_PLAN']);
});

it('retains exact rejected model output and distinguishes local editorial validation from provider failure',()=>{
 const raw={stories:'invalid',obligations:[]},rawResponse=JSON.stringify(raw),before=JSON.stringify(raw);
 try{decodeV2EditorialResponse({value:raw,rawResponse},shortlist);throw Error('UNSAFE_ACCEPTANCE')}catch(error){expect((error as Error).message).toBe('SEMANTIC_EDITORIAL_REJECTED');expect((error as any).diagnostic).toMatchObject({stage:'EDITORIAL_BINDING',response:raw,rawResponse,rejection:{code:'EDITORIAL_OUTPUT_INVALID'}})}expect(JSON.stringify(raw)).toBe(before);
});
