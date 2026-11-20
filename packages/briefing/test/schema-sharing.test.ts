import {expect,it} from 'vitest';
import {shareSchemaDefinitions,withSharedSchemas} from '../src/schema-sharing';
import type {ModelRequest} from '../src/model';
const expand=(v:any,defs:any):any=>Array.isArray(v)?v.map(x=>expand(x,defs)):!v||typeof v!=='object'?v:v.$ref?expand(defs[v.$ref.slice('#/$defs/'.length)],defs):Object.fromEntries(Object.entries(v).filter(([k])=>k!=='$defs').map(([k,x])=>[k,expand(x,defs)]));
it('shares repeated constraints while preserving all output keys and nested enums',()=>{
 const row={type:'object',properties:{support:{type:'string',enum:['supported','contradicted','uncertain']},evidence:{type:'array',items:{type:'string',enum:['S1:P1','S1:P2','S2:P1']}},explanation:{type:'string'}},required:['support','evidence','explanation'],additionalProperties:false};
 const schema={type:'object',properties:Object.fromEntries(Array.from({length:40},(_,i)=>['F'+i,structuredClone(row)])),required:Array.from({length:40},(_,i)=>'F'+i),additionalProperties:false},before=JSON.stringify(schema);
 const shared=shareSchemaDefinitions(schema);expect(JSON.stringify(shared).length).toBeLessThan(before.length);expect(expand(shared,shared.$defs)).toEqual(schema);expect(JSON.stringify(schema)).toBe(before);
});
it('preserves small and already defined schemas exactly',()=>{
 const small={type:'object',properties:{a:{type:'string'}},required:['a'],additionalProperties:false};expect(shareSchemaDefinitions(small)).toBe(small);
 const defined={...small,$defs:{x:{type:'string'}}};expect(shareSchemaDefinitions(defined)).toBe(defined);
});
it('leaves unstructured requests and transport fields unchanged',async()=>{
 const requests:ModelRequest[]=[],port=withSharedSchemas({complete:async q=>{requests.push(q);return {text:'{}',inputTokens:1,outputTokens:1}}});
 const q={model:'m',system:'s',user:'u',maxTokens:6000};await port.complete(q);expect(requests[0]).toBe(q);
});
