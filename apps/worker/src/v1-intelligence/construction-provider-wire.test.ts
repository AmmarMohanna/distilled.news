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
