import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {COMPACT_COMPLETE_PARENT_POLICY} from './editorial-complete-parents';
import {expect,it,vi} from 'vitest';
import {v2EditorialRequest,prepareV2EditorialPlan,decodeV2EditorialResponse,V2_SOURCE_ANCHOR_POLICY,V2_WHOLE_PARENT_POLICY,canSupersedeRejectedEditorial} from './editorial-plan-v2';
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
 await expect(prepareV2EditorialPlan(store,shortlist,'2026-10-18T02:00:00Z',{model:'model',complete:vi.fn(),usage:()=>({calls:0,costUsd:0,reported:true}),admission} as any)).rejects.toThrow();expect(admission).not.toHaveBeenCalled();
});

it('retains exact rejected model output and distinguishes local editorial validation from provider failure',()=>{
 const raw={stories:'invalid',obligations:[]},rawResponse=JSON.stringify(raw),before=JSON.stringify(raw);
 try{decodeV2EditorialResponse({value:raw,rawResponse},shortlist);throw Error('UNSAFE_ACCEPTANCE')}catch(error){expect((error as Error).message).toBe('SEMANTIC_EDITORIAL_REJECTED');expect((error as any).diagnostic).toMatchObject({stage:'EDITORIAL_BINDING',response:raw,rawResponse,rejection:{code:'EDITORIAL_OUTPUT_INVALID'}})}expect(JSON.stringify(raw)).toBe(before);
});

const anchorFixture=()=>{
 const fact={id:'fact',text:'The fund may commit 5% if approved.'};
 const candidate={targetType:'EVENT',targetVersionId:'event',facts:[fact],protectedReasons:[],correctionObligationIds:[],flags:[],effects:[]};
 const story={targetType:'EVENT',targetVersionId:'event',decision:'SELECT',order:1,treatment:'STANDARD',deltaType:'NEW',newUnderstandingFactIds:['fact'],contextFactIds:[],mustIncludeFactIds:['fact'],attributionFactIds:[],certaintyFactIds:[],disagreementFactIds:[],openQuestionFactIds:[],correctionObligationIds:[],previousLedgerEntryIds:[],rationale:'New fund',relevanceRationale:'Fund news',feedFit:'DIRECT',editorialImportance:.8,validation:{policyVersion:'editorial-requirements-v2',propositions:[{id:'p',parentFactId:'fact',text:fact.text}],dispositions:[{propositionId:'p',disposition:'REQUIRED',reasonCode:'CORE_DEVELOPMENT',justification:'Main announcement with conditions',obligationIds:[]}]}};
 return {shortlist:{...shortlist,candidates:[candidate]} as any,body:{stories:[story],obligations:[]} as any};
};
it.each([[true,false],[true,true],[false,false],[false,true]])('refreshes a resolved source-index blocker only after a settled rejection (known=%s,compact=%s)',async(known,compact)=>{
 const f=anchorFixture(),oldState={window:f.shortlist.window,outputSchema:{type:'object'},instruction:'frozen question',sourceAnchorPolicy:compact?COMPACT_COMPLETE_PARENT_POLICY:undefined,canonicalCandidateReferences:compact?{R0:'event'}:undefined,candidates:[{targetVersionId:compact?'R0':'event',flags:['TITLE_EXTRACTION_PENDING']}]},input:any={feedId:'f',kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:'evidence-grounded-editorial-plan-v2',model:'model',feedRevision:1,state:oldState},intent={input,token:'token'},result={input,status:'DEFERRED',failure:'SEMANTIC_EDITORIAL_REJECTED',usage:{calls:1,reported:true,costUsd:.01}};
 const admission=vi.fn(()=>({fits:false,reason:'MODEL_CONTEXT_CAPACITY'})),complete=vi.fn(),store:any={getFeed:async()=>({id:'f',revision:1}),list:async()=>[intent],read:async(_f:string,kind:string)=>kind==='semantic_intents'?intent:kind==='semantic_results'&&known?result:undefined,db:{prepare:()=>({bind:()=>({first:async()=>({token:'token',reported:1,cost_usd:.01})})})}};
 await expect(prepareV2EditorialPlan(store,f.shortlist,'2026-10-18T02:00:00Z',{model:'model',admission,complete,usage:()=>({calls:0,costUsd:0,reported:true})} as any)).rejects.toThrow();
 if(known)expect((admission.mock.calls as any)[0][0].candidates[0].flags).toEqual([]);else expect(admission).not.toHaveBeenCalled();expect(complete).not.toHaveBeenCalled();expect(oldState.candidates[0].flags).toEqual(['TITLE_EXTRACTION_PENDING']);
});
it('offers opt-in whole-parent references without duplicating authoritative source text in output',()=>{
 const f=anchorFixture(),request=v2EditorialRequest(f.shortlist,{title:'Feed',interests:[]},true);
 expect(request.state.sourceAnchorPolicy).toBe(V2_WHOLE_PARENT_POLICY);
 const validation:any=(request.schema.properties.stories.items.anyOf[0].properties as any).validation;
 expect(validation.properties.propositions.items.properties.text).toBeUndefined();
 expect(request.state.candidates[0].facts).toEqual(f.shortlist.candidates[0].facts);
});
it('reconstructs every qualifier mechanically for a whole-parent reference and rejects omitted parents',()=>{
 const f=anchorFixture(),p=f.body.stories[0].validation.propositions[0];delete p.text;
 const result=decodeV2EditorialResponse({value:f.body},f.shortlist,V2_WHOLE_PARENT_POLICY);
 expect(result.stories[0].validation!.propositions[0]).toMatchObject({text:'The fund may commit 5% if approved.',start:0,end:'The fund may commit 5% if approved.'.length});
 f.shortlist.candidates[0].facts.push({id:'second',text:'A second fact.'});
 expect(()=>decodeV2EditorialResponse({value:f.body},f.shortlist,V2_WHOLE_PARENT_POLICY)).toThrow('SEMANTIC_EDITORIAL_REJECTED');
});
it.each(['known-rejected','known-length','unknown','unreported','successful','wrong-token','different-input','financial-unknown'])('only permits a conclusively settled rejection as a contract successor: %s',async mode=>{
 const input:any={feedId:'f',kind:'COMPARATIVE_EDITORIAL_PLAN',state:{question:'old'}},intent={input,token:'token'};
 const result:any={input,status:'DEFERRED',failure:'SEMANTIC_EDITORIAL_REJECTED',usage:{calls:1,reported:true,costUsd:.01}};
 if(mode==='known-length')result.failure='SEMANTIC_MODEL_OUTPUT_CONTINUATION_REQUIRED';if(mode==='unreported')result.usage.reported=false;if(mode==='successful')result.status='SUCCEEDED';if(mode==='different-input')result.input={...input,state:{question:'other'}};
 const store:any={read:async(_f:string,kind:string)=>kind==='semantic_intents'?intent:mode==='unknown'?undefined:result,db:{prepare:()=>({bind:()=>({first:async()=>({token:mode==='wrong-token'?'other':'token',reported:mode==='financial-unknown'?0:1,cost_usd:.01})})})}};
 expect(await canSupersedeRejectedEditorial(store,input)).toBe(mode==='known-rejected'||mode==='known-length');
});
it.each(['foreign','injected-text','duplicate'])('rejects %s whole-parent references',kind=>{
 const f=anchorFixture(),p=f.body.stories[0].validation.propositions[0];delete p.text;
 if(kind==='foreign')p.parentFactId='foreign';if(kind==='injected-text')p.text='An invented replacement.';
 if(kind==='duplicate')f.body.stories[0].validation.propositions.push({...p,id:'second'});
 expect(()=>decodeV2EditorialResponse({value:f.body},f.shortlist,V2_WHOLE_PARENT_POLICY)).toThrow('SEMANTIC_EDITORIAL_REJECTED');
});
it('derives canonical source coordinates from a unique exact same-story anchor without changing raw output',()=>{
 const f=anchorFixture(),before=JSON.stringify(f.body),result=decodeV2EditorialResponse({value:f.body},f.shortlist,V2_SOURCE_ANCHOR_POLICY);
 expect(result.stories[0].validation!.propositions[0]).toMatchObject({start:0,end:f.shortlist.candidates[0].facts[0].text.length});expect(JSON.stringify(f.body)).toBe(before);
});
it('keeps historical incorrect coordinates rejected rather than silently rewriting them',()=>{
 const f=anchorFixture();Object.assign(f.body.stories[0].validation.propositions[0],{start:0,end:12});
 expect(()=>decodeV2EditorialResponse({value:f.body},f.shortlist)).toThrow('SEMANTIC_EDITORIAL_REJECTED');
 expect(()=>decodeV2EditorialResponse({value:f.body},f.shortlist,V2_SOURCE_ANCHOR_POLICY)).toThrow('SEMANTIC_EDITORIAL_REJECTED');
});
it.each(['foreign','altered','ambiguous','omitted-qualifier'])('does not accept %s source anchoring',kind=>{
 const f=anchorFixture(),p=f.body.stories[0].validation.propositions[0];
 if(kind==='foreign')p.parentFactId='foreign';if(kind==='altered')p.text='The fund will commit 5%.';
 if(kind==='ambiguous'){f.shortlist.candidates[0].facts[0].text='Fund. Fund.';p.text='Fund.';}
 if(kind==='omitted-qualifier')p.text='The fund may commit 5%';
 expect(()=>decodeV2EditorialResponse({value:f.body},f.shortlist,V2_SOURCE_ANCHOR_POLICY)).toThrow('SEMANTIC_EDITORIAL_REJECTED');
});

it('constrains exactly one decision per offered candidate without force-selecting missing context',()=>{
 const f=anchorFixture(),request=v2EditorialRequest(f.shortlist,{title:'Feed',interests:[]});
 expect(request.schema.properties.stories).toMatchObject({minItems:1,maxItems:1});
 f.shortlist.candidates.push({...f.shortlist.candidates[0],targetVersionId:'second'});
 try{decodeV2EditorialResponse({value:f.body},f.shortlist,V2_SOURCE_ANCHOR_POLICY);throw Error('UNSAFE_ACCEPTANCE')}catch(error){expect((error as any).diagnostic.rejection).toMatchObject({code:'EDITORIAL_CANDIDATE_COVERAGE',issues:[{code:'MISSING_CANDIDATES',missing:['second']},{code:'UNKNOWN_OR_DUPLICATE_CANDIDATES'}]})}
 expect(f.body.stories).toHaveLength(1);
});

it('constrains requirement reason codes separately from optional/deferred justifications',()=>{const request=v2EditorialRequest(shortlist,{title:'Feed',interests:[]});const validation:any=(request.schema.properties.stories.items.anyOf[0].properties as any).validation;const branches=validation.properties.dispositions.items.anyOf;expect(branches[0].properties.disposition.enum).toEqual(['REQUIRED']);expect(branches[0].properties.reasonCode.type).toBe('string');expect(branches[1].properties.disposition.enum).toEqual(['OPTIONAL_CONTEXT','DEFERRED','NOT_NEWS']);expect(branches[1].properties.reasonCode).toEqual({type:'null'});expect(branches[1].required).toContain('justification');});

it('requires one keyed decision for every parent and mechanically reconstructs complete requirements',()=>{
 const f=anchorFixture(),request=v2EditorialRequest(f.shortlist,{title:'Feed',interests:[]},'COMPLETE');
 const stories:any=request.schema.properties.stories;
 expect(stories.type).toBe('object');expect(stories.required).toEqual(['candidate_1']);
 const branch=stories.properties.candidate_1.anyOf[0];
 expect(branch.properties.validation.properties.factDecisions.required).toEqual(['fact_1']);
 const story=f.body.stories[0];delete story.validation;delete story.mustIncludeFactIds;
 const body={stories:{candidate_1:{...story,validation:{factDecisions:{fact_1:{disposition:'REQUIRED',reasonCode:'CORE_DEVELOPMENT',justification:'Core announcement and conditions',obligationIds:[]}}}}},obligations:[]};
 const decoded=decodeV2EditorialResponse({value:body},f.shortlist,request.state.sourceAnchorPolicy);
 expect(decoded.stories[0].mustIncludeFactIds).toEqual(['fact']);
 expect(decoded.stories[0].validation!.propositions[0].text).toBe(f.shortlist.candidates[0].facts[0].text);
 delete (body.stories.candidate_1.validation.factDecisions as any).fact_1;
 expect(()=>decodeV2EditorialResponse({value:body},f.shortlist,request.state.sourceAnchorPolicy)).toThrow('SEMANTIC_EDITORIAL_REJECTED');
});

it('shares complete-parent decision definitions while requiring every parent slot',()=>{
 const f=anchorFixture();f.shortlist.candidates[0].facts=Array.from({length:80},(_,i)=>({id:'fact-'+i,text:'A supported fact with its original qualifier.'}));
 const request=v2EditorialRequest(f.shortlist,{title:'Feed',interests:[]},'COMPLETE');
 expect(JSON.stringify(request.schema).length).toBeLessThan(30000);
 const decisions:any=(request.schema.properties.stories as any).properties.candidate_1.anyOf[0].properties.validation.properties.factDecisions;
 expect(decisions.required).toHaveLength(80);
});

it('uses existing compact references for complete-parent semantic decisions without changing source text',()=>{
 const f=anchorFixture(),request=v2EditorialRequest(f.shortlist,{title:'Feed',interests:[]},'COMPLETE_COMPACT');
 expect(request.state.candidates[0].facts[0].id).not.toBe('fact');expect(request.state.candidates[0].facts[0].text).toBe(f.shortlist.candidates[0].facts[0].text);
 const target=request.state.candidates[0].targetVersionId,id=request.state.candidates[0].facts[0].id;
 const story=f.body.stories[0];delete story.validation;delete story.mustIncludeFactIds;story.targetVersionId=target;story.newUnderstandingFactIds=[id];
 const raw:any={stories:{candidate_1:{...story,validation:{factDecisions:{fact_1:{disposition:'REQUIRED',reasonCode:'CORE_DEVELOPMENT',justification:'Core announcement and conditions',obligationIds:[]}}}}},obligations:[]};
 expect(decodeV2EditorialResponse({value:raw},f.shortlist,request.state.sourceAnchorPolicy).stories[0].mustIncludeFactIds).toEqual(['fact']);
 raw.stories.candidate_1.newUnderstandingFactIds=['foreign'];expect(()=>decodeV2EditorialResponse({value:raw},f.shortlist,request.state.sourceAnchorPolicy)).toThrow();
});

it.each([false,true])('fences a newer unresolved frame despite an old settled rejection and changed shortlist (reverse=%s)',async reverse=>{
 const f=anchorFixture(),base:any={feedId:'f',kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:'evidence-grounded-editorial-plan-v2',model:'model',feedRevision:1,evidenceRevisionIds:['previous-evidence']};
 f.shortlist.evidenceRevisionIds=['disjoint-current-evidence'];
 const old={input:{...base,state:{window:f.shortlist.window,candidates:[{targetVersionId:'event',flags:['TITLE_EXTRACTION_PENDING']}]}},token:'old',createdAt:'2026-10-18T00:00:00Z'};
 const pending={input:{...base,state:{window:f.shortlist.window,candidates:[{targetVersionId:'event',flags:[]}],outputSchema:{type:'object'},question:'new'}},token:'new',createdAt:'2026-10-18T01:00:00Z'};
 const oldId=await sha256(canonicalJson(old.input)),pendingId=await sha256(canonicalJson(pending.input));
 const admission=vi.fn(()=>({fits:true,reservationCostUsd:.01})),complete=vi.fn();
 const store:any={getFeed:async()=>({id:'f',revision:1}),list:async()=>reverse?[pending,old]:[old,pending],read:async(_f:string,kind:string,id:string)=>kind==='semantic_intents'?(id===oldId?old:pending):kind==='semantic_results'&&id===oldId?{input:old.input,status:'DEFERRED',failure:'SEMANTIC_EDITORIAL_REJECTED',usage:{calls:1,reported:true,costUsd:.01}}:undefined};
 await expect(prepareV2EditorialPlan(store,f.shortlist,'2026-10-18T02:00:00Z',{model:'model',admission,complete,usage:()=>({calls:0,costUsd:0,reported:true})} as any)).rejects.toThrow();
 expect(admission).not.toHaveBeenCalled();expect(complete).not.toHaveBeenCalled();expect(pendingId).not.toBe(oldId);
});
it('records canonical ownership for request-local compact aliases',()=>{
 const f=anchorFixture(),request=v2EditorialRequest(f.shortlist,{title:'Feed',interests:[]},'COMPLETE_COMPACT');
 expect((request.state as any).canonicalCandidateReferences[request.state.candidates[0].targetVersionId]).toBe('event');
});

it('does not equate compact R0 with a different canonical candidate after reordering',async()=>{
 const f=anchorFixture(),state={window:f.shortlist.window,outputSchema:{type:'object'},sourceAnchorPolicy:COMPACT_COMPLETE_PARENT_POLICY,canonicalCandidateReferences:{R0:'other-original-event'},candidates:[{targetVersionId:'R0',flags:['TITLE_EXTRACTION_PENDING']}]},input:any={feedId:'f',kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:'evidence-grounded-editorial-plan-v2',model:'model',feedRevision:1,state},intent={input,token:'t'};
 const result={input,status:'DEFERRED',failure:'SEMANTIC_EDITORIAL_REJECTED',usage:{calls:1,reported:true,costUsd:.01}},admission=vi.fn(()=>({fits:false,reason:'STOP'})),complete=vi.fn();
 const store:any={getFeed:async()=>({id:'f',revision:1}),list:async()=>[intent],read:async(_f:string,kind:string)=>kind==='semantic_results'?result:kind==='semantic_intents'?intent:undefined};
 await expect(prepareV2EditorialPlan(store,f.shortlist,'2026-10-18T02:00:00Z',{model:'model',admission,complete,usage:()=>({calls:0,costUsd:0,reported:true})} as any)).rejects.toThrow();
 expect((admission.mock.calls as any)[0][0].canonicalCandidateReferences.R0).toBe('other-original-event');expect((admission.mock.calls as any)[0][0].candidates[0].flags).toContain('TITLE_EXTRACTION_PENDING');expect(complete).not.toHaveBeenCalled();
});

it.each([true,false])('keeps settled crash recovery available only with the original intent token (matching=%s)',async matching=>{
 const f=anchorFixture(),input:any={feedId:'f',kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:'evidence-grounded-editorial-plan-v2',model:'model',feedRevision:1,state:{window:f.shortlist.window,outputSchema:{type:'object'},instruction:'original settled question'}},intent={input,token:'owned'},settlement={input,token:matching?'owned':'foreign',status:'SUCCEEDED',usage:{calls:1,reported:true,costUsd:.01}};
 const admission=vi.fn(()=>({fits:false,reason:'STOP'})),complete=vi.fn(),store:any={getFeed:async()=>({id:'f',revision:1}),list:async()=>[intent],read:async(_f:string,kind:string)=>kind==='semantic_settlements'?settlement:undefined};
 await expect(prepareV2EditorialPlan(store,f.shortlist,'2026-10-18T02:00:00Z',{model:'model',admission,complete,usage:()=>({calls:0,costUsd:0,reported:true})} as any)).rejects.toThrow();
 expect(admission).toHaveBeenCalledTimes(matching?1:0);if(matching)expect((admission.mock.calls as any)[0][0].instruction).toBe('original settled question');expect(complete).not.toHaveBeenCalled();
});

it('constructs protected parent decision requirements in the schema instead of asking the model to remember them',()=>{
 const f=anchorFixture();f.shortlist.candidates[0].protectedReasons=['CORRECTS'];const request=v2EditorialRequest(f.shortlist,{title:'Feed',interests:[]},'COMPLETE');const branches:any=(request.schema.properties.stories as any).properties.candidate_1.anyOf;
 const resolve=(s:any):any=>s.$ref?(request.schema as any).$defs[s.$ref.split('/').at(-1)]:s;
 expect(branches[0].properties.validation.properties.factDecisions.properties.fact_1.$ref).toBe('#/$defs/EditorialRequiredParentDecision');expect(resolve(branches[1].properties.decision).enum).toEqual(['DEFER']);expect(branches[1].properties.validation.properties.factDecisions.properties.fact_1.$ref).toBe('#/$defs/EditorialDeferredParentDecision');
 expect(resolve((request.schema as any).$defs.EditorialRequiredParentDecision.properties.disposition).enum).toEqual(['REQUIRED']);expect(resolve((request.schema as any).$defs.EditorialDeferredParentDecision.properties.disposition).enum).toEqual(['DEFERRED']);
});

it('scopes every candidate fact reference before inference instead of allowing foreign article facts',()=>{
 const f=anchorFixture();f.shortlist.candidates[0].evidenceRevisionIds=['r'];f.shortlist.candidates[0].facts[0].evidenceRevisionIds=['r'];const request=v2EditorialRequest(f.shortlist,{title:'Feed',interests:[]},'COMPLETE'),branch:any=(request.schema.properties.stories as any).properties.candidate_1.anyOf[0];const resolve=(x:any):any=>x.$ref?(request.schema as any).$defs[x.$ref.split('/').at(-1)]:x;expect(resolve(branch.properties.newUnderstandingFactIds.items).enum).toEqual(['fact']);expect(resolve(branch.properties.attributionFactIds.items).enum).toEqual(['fact']);
});
