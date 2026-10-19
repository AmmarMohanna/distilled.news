import {it,expect} from 'vitest';
import {constructionTransport,MINIMAL_CONSTRUCTION_VERSION} from './construction-transport';
import {extractClaimMentions} from './claims';
import {createStrongSemanticModel} from './semantic-model';
import {inspectProviderSchema} from '../provider-schema';
import {STAGING_GROUPING_CAPABILITIES_JSON} from '../staging-grouping-run-policy';
import type {Env} from '../types';
const env={OPENROUTER_API_KEY:'offline-fixture',V1_SEMANTIC_STRONG_MODEL:'openai/gpt-4.1-mini',V1_MODEL_CAPABILITIES_JSON:STAGING_GROUPING_CAPABILITIES_JSON} as Env;
async function fixture(candidate:boolean){
 const revision:any={id:'revision',feedId:'feed',body:'The council announced a fund committing 5% of its shares.',acceptedAt:'2026-10-19T12:00:00Z',contentHash:'h'}, {mentions}=await extractClaimMentions(revision);
 const input:any={revision,role:'REPORTED_DEVELOPMENT',candidates:candidate?[{id:'fund-event',version:{id:'version',state:revision.body},evidenceRevisionIds:['old-revision'],newestAt:revision.acceptedAt}]:[],storylineIds:candidate?['fund-story']:[]};
 return constructionTransport(mentions,input,{constructionOwnershipVersion:MINIMAL_CONSTRUCTION_VERSION});
}
function audit(schema:any){
 const resolve=(v:any):any=>v.$ref?v.$ref.slice(2).split('/').reduce((node:any,key:string)=>node[key.replace(/~1/g,'/').replace(/~0/g,'~')],schema):v;
 const walk=(v:any)=>{if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return}if(v.$ref){expect(Object.keys(v)).toEqual(['$ref']);expect(resolve(v)).toBeDefined()}if(v.properties){expect(v.additionalProperties).toBe(false);expect([...v.required].sort()).toEqual(Object.keys(v.properties).sort())}Object.values(v).forEach(walk)};walk(schema);
 expect(inspectProviderSchema('openai/gpt-4.1-mini',schema)).toMatchObject({fits:true,violations:[]});return resolve;
}
it.each([false,true])('serialized provider request keeps strict construction constraints with candidate=%s',async candidate=>{
 const wire=await fixture(candidate);let body:any,calls=0;
 const model=createStrongSemanticModel(env,(async(_url,init)=>{calls++;body=JSON.parse(init!.body as string);return Response.json({choices:[{message:{content:'{}'}}],usage:{prompt_tokens:0,completion_tokens:0,cost:0}})}) as typeof fetch)!;
 await model.complete('feed','SEMANTIC_CONSTRUCTION',wire.state,wire.schema);
 expect(calls).toBe(1);expect(body.response_format.json_schema).toMatchObject({name:'distilled_evidence',strict:true});const schema=body.response_format.json_schema.schema,resolve=audit(schema);
 expect(schema.required).toEqual(expect.arrayContaining(['groups','dispositionByUnitId','confidence','originDependencyLabel']));expect(schema.properties.dispositionByUnitId).toMatchObject({additionalProperties:false,required:['C0']});
 expect(resolve(schema.properties.dispositionByUnitId.properties.C0).enum).toEqual(['G0']);
 const branches=schema.properties.groups.items.anyOf;expect(branches).toHaveLength(candidate?3:1);expect(resolve(branches[0].properties.structuralRelation).enum).toEqual(['NEW_STORYLINE','DEFER']);expect(branches[0].properties.eventId).toEqual({type:'null'});
 for(const branch of branches){expect(branch.required).toEqual(expect.arrayContaining(['groupId','occurrence','eventId','storylineId','structuralRelation','epistemicEffects']));for(const name of ['entities','slots','storylineState','claimMentionIds'])expect(branch.properties[name]).toBeUndefined();}
 if(candidate){expect(resolve(branches[1].properties.eventId).enum).toEqual(['E0']);expect(resolve(branches[1].properties.structuralRelation).enum).toEqual(['SAME_EVENT']);expect(resolve(branches[2].properties.storylineId).enum).toEqual(['L0']);}
});
it.each(['description','type','enum'])('rejects a %s sibling on a reference before transport',async keyword=>{
 const wire=await fixture(true),schema:any=structuredClone(wire.schema);schema.properties.groups.items.anyOf[0].properties.structuralRelation[keyword]=keyword==='enum'?['NEW_STORYLINE']:keyword==='type'?'string':'Identity guidance';let calls=0;
 expect(inspectProviderSchema('openai/gpt-4.1-mini',schema).violations).toContain('UNSUPPORTED_REF_SIBLINGS');
 const model=createStrongSemanticModel(env,(async()=>{calls++;throw Error('NO_PROVIDER_CALL')}) as typeof fetch)!;await expect(model.complete('feed','SEMANTIC_CONSTRUCTION',wire.state,schema)).rejects.toThrow('SEMANTIC_MODEL_SCHEMA_CONTINUATION_REQUIRED');expect(calls).toBe(0);
});

import {v2EditorialRequest} from './editorial-plan-v2';
it.each([false,true])('V2 editorial serialized provider schema has unique complete required fields; candidate=%s',async candidate=>{
 const request=v2EditorialRequest({id:'shortlist',feedId:'feed',feedRevision:1,window:{start:'2026-10-19T00:00:00Z',end:'2026-10-19T01:00:00Z'},candidates:candidate?[{targetVersionId:'event-version',facts:[{id:'fact',text:'The fund commits 5% of shares.'}]}]:[],ledger:[],obligations:[]} as any,{title:'Fund briefing',interests:['AI']});let calls=0;
 const model=createStrongSemanticModel(env,(async(_url,init)=>{calls++;const body=JSON.parse(init!.body as string);audit(body.response_format.json_schema.schema);expect(body.response_format.json_schema.schema.properties.stories).toMatchObject({minItems:candidate?1:0,maxItems:candidate?1:0});return Response.json({choices:[{message:{content:'{}'}}],usage:{prompt_tokens:0,completion_tokens:0,cost:0}})}) as typeof fetch)!;
 const completed=await model.complete('feed','COMPARATIVE_EDITORIAL_PLAN',request.state,request.schema);expect(completed.rawResponse).toBe('{}');expect(calls).toBe(1);
 for(const branch of request.schema.properties.stories.items.anyOf){expect(branch.required.filter(k=>k==='validation')).toHaveLength(1);expect(branch.required.filter(k=>k==='editorialImportance')).toHaveLength(1);}
});

import {createStoredEvidenceModel} from './model';
it.each(['writer','repair','verifier'] as const)('serialized V2 %s schemas pass complete offline audit with optional context/correction variants',async phase=>{
 for(const rich of [false,true]){
 let calls=0,captured:any;const model=createStoredEvidenceModel({...env,V1_SYNTHESIS_MODEL_ENABLED:'true',DISTILLED_LLM_API_GATEWAY:'openrouter',DISTILLED_LIVE_OPENROUTER_MODEL:'openai/gpt-4.1-mini',V1_PUBLICATION_VALIDATION_CONTRACT:'EVIDENCE_GROUNDED_V2'} as Env,(async(_url,init)=>{calls++;captured=JSON.parse(init!.body as string).response_format.json_schema.schema;throw Error('OFFLINE_CAPTURE_STOP')}) as typeof fetch)!;
 const text='The council announced a fund committing 5% of its shares.',fact={id:'fact',text,evidenceRevisionIds:['revision'],support:[{evidenceRevisionId:'revision',quote:text}],...(rich?{attribution:'Council',certainty:{kind:'POSSIBLE',hedges:['may']},timing:{framingRequired:true,reportTime:'2026-10-18T00:00:00Z'}}:{})},input:any={feed:{id:'feed',revision:1,title:'Feed',interests:[],outputLanguage:'en'},selectionId:'selection',stories:[{candidate:{id:'candidate',targetType:'EVENT',targetVersionId:'version'},approvedFacts:[fact],plan:{validation:{},mustIncludeFactIds:['fact'],newUnderstandingFactIds:['fact'],facts:[fact],previousLedgerEntries:[],correctionObligations:rich?[{id:'correction',kind:'CORRECTED',previousReaderClaims:['Prior claim.']}]:[]},evidence:[{id:'revision',body:text,language:'en',canonicalUrl:'https://example.com/news'}]}]},limits={maxOutputTokens:8192,signal:new AbortController().signal};
 const run=phase==='writer'?model.synthesize(input,limits):phase==='repair'?model.repair!(input,{language:'en',stories:[]},{id:'feedback',feedId:'feed',selectionId:'selection',draftId:'draft',issues:[],missingFactIds:['fact'],createdAt:'2026-10-19T00:00:00Z'},limits):model.verify!([{id:'claim',candidateId:'candidate',text,support:fact.support,context:[{evidenceRevisionId:'revision',text,truncated:false}],requiredFacts:[fact],allowedFacts:[fact]}] as any,limits);
 await run.catch(()=>undefined);expect(calls).toBe(1);audit(captured);
 }
});
