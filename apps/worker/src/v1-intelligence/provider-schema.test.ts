import {it,expect} from 'vitest';
import cases from './fixtures/planner-schema-20261013.json';
import {keyedEditorialPlanWireSchemaFor} from './editorial-plan';
import {admitModelOperation,modelCapability} from './model-capacity';
import {createStrongSemanticModel} from './semantic-model';
import {inspectProviderSchema} from '../provider-schema';
import type {Env} from '../types';
it.each(cases)('admits all retained $name candidates and facts within provider schema constraints',c=>{
 const state=c.state as any,schema=keyedEditorialPlanWireSchemaFor(state);
 const admission=admitModelOperation('openai/gpt-4.1-mini',state,schema,modelCapability('openai/gpt-4.1-mini'));
 let enums=0;const walk=(v:any)=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){enums+=v.enum?.length??0;Object.values(v).forEach(walk)}};walk(schema);
 expect(enums).toBeLessThanOrEqual(1000);expect(admission.fits).toBe(true);
 expect(Object.keys(schema.properties.stories.properties)).toHaveLength(state.candidates.length);
});
it('rejects invalid structured schemas before any paid provider request',async()=>{
 let calls=0;const model=createStrongSemanticModel({OPENROUTER_API_KEY:'fixture',V1_SEMANTIC_STRONG_MODEL:'openai/gpt-4.1-mini'} as Env,(async()=>{calls++;throw Error('PAID')}) as typeof fetch)!;
 const schema={type:'object',additionalProperties:false,required:['fact'],properties:{fact:{type:'string',enum:Array.from({length:1001},(_,i)=>'f'+i)}}};
 expect(model.admission!({},schema).fits).toBe(false);
 await expect(model.complete('feed','COMPARATIVE_EDITORIAL_PLAN',{},schema)).rejects.toThrow('SEMANTIC_MODEL_SCHEMA_CONTINUATION_REQUIRED');expect(calls).toBe(0);
});

it.each([
 ['enum strings',{enum:Array.from({length:251},(_,i)=>('a'.repeat(60)+i))},'ENUM_STRING_SIZE'],
 ['schema strings',{const:'a'.repeat(120001)},'SCHEMA_STRING_SIZE'],
 ['properties',{type:'object',additionalProperties:false,properties:Object.fromEntries(Array.from({length:5001},(_,i)=>['p'+i,{type:'string'}])),required:Array.from({length:5001},(_,i)=>'p'+i)},'PROPERTY_COUNT'],
 ['unsupported composition',{allOf:[{type:'string'}]},'UNSUPPORTED_allOf'],
 ['expanded reference depth',{$defs:{deep:{type:'array',items:{type:'string'}}},type:'array',items:{type:'array',items:{type:'array',items:{type:'array',items:{type:'array',items:{type:'array',items:{type:'array',items:{type:'array',items:{type:'array',items:{type:'array',items:{$ref:'#/$defs/deep'}}}}}}}}}}},'NESTING_DEPTH'],
 ['root array',{type:'array',items:{type:'string'}},'ROOT_OBJECT_REQUIRED'],
 ['root referenced union',{$ref:'#/$defs/root',$defs:{root:{anyOf:[{type:'object',properties:{},required:[],additionalProperties:false}]}}},'ROOT_ANYOF'],
 ['invalid reference',{$ref:'#/$defs/missing'},'INVALID_REFERENCE']
])('rejects provider %s constraints offline',(_name,schema,code)=>expect(inspectProviderSchema('openai/gpt-4.1-mini',schema as object).violations).toContain(code));

it('checks unused definitions and depth through nullable array types',()=>{
 const nullable:any={type:'object',additionalProperties:false,required:['deep'],properties:{deep:{type:'string'}}};
 let child:any={type:'string'};for(let i=0;i<11;i++)child={type:['array','null'],items:child};nullable.properties.deep=child;
 expect(inspectProviderSchema('openai/gpt-4.1-mini',nullable).violations).toContain('NESTING_DEPTH');
 expect(inspectProviderSchema('openai/gpt-4.1-mini',{type:'object',properties:{},required:[],additionalProperties:false,$defs:{unused:{$ref:'#/$defs/missing'}}}).violations).toContain('INVALID_REFERENCE');
});

it('nullable objects retain strict required-property and closed-object guarantees',()=>expect(inspectProviderSchema('openai/gpt-4.1-mini',{type:'object',additionalProperties:false,required:['x'],properties:{x:{type:['object','null']}}}).violations).toContain('STRICT_OBJECT'));

it('alternate GPT judgment admission rejects oversized enums before transport',async()=>{
 const {OpenRouterJudgmentClient}=await import('./salience');let calls=0;const model='openai/gpt-4.1-mini';
 const client=new OpenRouterJudgmentClient({kind:'GPT',model,apiKey:'fixture',durable:true,capability:modelCapability(model),fetcher:(async()=>{calls++;throw Error('NO_CALL')}) as typeof fetch});
 const criteria=Object.fromEntries(Array.from({length:1001},(_,i)=>['choice'+i,'Supported choice']));
 expect(client.admission({},{judgment:{kind:'CHOICE',instructions:'Choose supported identity',criteria}}).fits).toBe(false);
 await expect(client.choose({},'Choose supported identity',criteria)).rejects.toThrow('SEMANTIC_MODEL_SCHEMA_CONTINUATION_REQUIRED');expect(calls).toBe(0);expect(client.usage().calls).toBe(0);
});

it.each([{type:'banana'},{type:'string',enum:[]},{anyOf:[true]},{type:'array',items:[]}])('rejects malformed schema nodes before admission: %j',node=>{
 const schema={type:'object',additionalProperties:false,required:['value'],properties:{value:node}};
 expect(inspectProviderSchema('openai/gpt-4.1-mini',schema).fits).toBe(false);
});

it('supported root recursion remains admitted and inherited pointer names are not references',()=>{
 const root={type:'object',additionalProperties:false,required:['children'],properties:{children:{type:'array',items:{$ref:'#'}}}};
 expect(inspectProviderSchema('openai/gpt-4.1-mini',root).fits).toBe(true);
 expect(inspectProviderSchema('openai/gpt-4.1-mini',{type:'object',additionalProperties:false,required:['x'],properties:{x:{$ref:'#/$defs/__proto__'}},$defs:{}}).violations).toContain('INVALID_REFERENCE');
});
