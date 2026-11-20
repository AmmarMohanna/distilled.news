import {expect,it} from 'vitest';
import {bindingSchema,sharedBindingSchema,sourcePassages} from '../src/source-bound-claims';
function expanded(value:any,defs:any):any{
 if(Array.isArray(value))return value.map(v=>expanded(v,defs));
 if(!value||typeof value!=='object')return value;
 if(value.$ref){const key=value.$ref.replace('#/$defs/','');if(!defs[key])throw Error('Missing definition');return expanded(defs[key],defs)}
 return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='$defs').map(([k,v])=>[k,expanded(v,defs)]));
}
it('retains every schema constraint and proof/citation enum through shared definitions',()=>{
 const items=[{headline:'A claim.',body:'Another claim.',refs:['S1','S2']},{headline:'B claim.',body:'',refs:['S3']}];
 const inventory=Array.from({length:30},(_,i)=>({id:'F'+i,item:i<20?0:1,unit:i<20?'I0.H':'I1.H',quote:'claim',claim:'claim',kind:'action'}));
 const passages=sourcePassages([{ref:'S1',text:'A source.'},{ref:'S2',text:'Another source.'},{ref:'S3',text:'B source.'}]);
 const original=bindingSchema(items,inventory,passages,true),snapshot=JSON.stringify(original),shared=sharedBindingSchema(original);
 expect(JSON.stringify(shared).length).toBeLessThan(snapshot.length);expect(shared).toHaveProperty('$defs');
 expect(expanded(shared,shared.$defs)).toEqual(original);expect(JSON.stringify(original)).toBe(snapshot);
});
it('does not expand a tiny schema or rewrite an already referenced schema',()=>{
 const small={type:'object',properties:{results:{type:'object',properties:{}}},required:['results'],additionalProperties:false};
 expect(sharedBindingSchema(small)).toEqual(small);
 const referenced={...small,$defs:{existing:{type:'string'}}};expect(sharedBindingSchema(referenced)).toEqual(referenced);
});
