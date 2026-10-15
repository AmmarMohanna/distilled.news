/** OpenAI strict structured-output constraints, separate from editorial quotas.
 * https://developers.openai.com/api/docs/guides/structured-outputs */
export interface SchemaAdmission {fits:boolean;violations:string[];enumValues:number;schemaStringCharacters:number;objectProperties:number;nestingDepth:number}
export function inspectProviderSchema(model:string,schema:object):SchemaAdmission {
 const result:SchemaAdmission={fits:true,violations:[],enumValues:0,schemaStringCharacters:0,objectProperties:0,nestingDepth:0};
 if(!/^(openai\/|gpt-)/.test(model))return result;
 const root=schema as Record<string,any>,issue=(code:string)=>{if(!result.violations.includes(code))result.violations.push(code)};
 const unsupported=new Set(['allOf','not','dependentRequired','dependentSchemas','if','then','else','oneOf','patternProperties','unevaluatedProperties','prefixItems']);
 const reference=(ref:string)=>{if(ref==='#')return root;if(!ref.startsWith('#/'))return undefined;return ref.slice(2).split('/').reduce((v:any,k)=>{const key=k.replace(/~1/g,'/').replace(/~0/g,'~');return v&&Object.hasOwn(v,key)?v[key]:undefined},root)};
 const walk=(v:any)=>{
  if(!v||typeof v!=='object'||Array.isArray(v)){issue('INVALID_SCHEMA_NODE');return}
  if(v.type!==undefined){const types=Array.isArray(v.type)?v.type:[v.type];if(!types.length||types.some((t:unknown)=>!['object','array','string','number','integer','boolean','null'].includes(t as string)))issue('UNSUPPORTED_TYPE')}
  if(v.required!==undefined&&(!Array.isArray(v.required)||v.required.some((k:unknown)=>typeof k!=='string')||new Set(v.required).size!==v.required.length))issue('INVALID_REQUIRED');
  if(v.anyOf!==undefined&&(!Array.isArray(v.anyOf)||!v.anyOf.length))issue('INVALID_ANYOF');
  if(v.items!==undefined&&(!v.items||typeof v.items!=='object'||Array.isArray(v.items)))issue('INVALID_ARRAY_ITEMS');
  if(v.$ref&&(typeof v.$ref!=='string'||!reference(v.$ref)))issue('INVALID_REFERENCE');
  for(const k of Object.keys(v))if(unsupported.has(k))issue('UNSUPPORTED_'+k);
  if(v.enum){if(!Array.isArray(v.enum)||!v.enum.length)issue('INVALID_ENUM');else{result.enumValues+=v.enum.length;const chars=v.enum.reduce((n:number,s:unknown)=>n+(typeof s==='string'?s.length:0),0);result.schemaStringCharacters+=chars;if(v.enum.length>250&&chars>15000)issue('ENUM_STRING_SIZE')}}
  if(typeof v.const==='string')result.schemaStringCharacters+=v.const.length;
  if((v.type==='object'||Array.isArray(v.type)&&v.type.includes('object'))&&(!v.properties||v.additionalProperties!==false||!Array.isArray(v.required)))issue('STRICT_OBJECT');
  if(v.properties){const keys=Object.keys(v.properties);result.objectProperties+=keys.length;result.schemaStringCharacters+=keys.reduce((n,k)=>n+k.length,0);if(v.additionalProperties!==false||!Array.isArray(v.required)||keys.some(k=>!v.required.includes(k))||v.required.some((k:string)=>!keys.includes(k)))issue('STRICT_OBJECT');Object.values(v.properties).forEach(walk)}
  for(const defs of [v.$defs,v.definitions])if(defs){result.schemaStringCharacters+=Object.keys(defs).reduce((n,k)=>n+k.length,0);Object.values(defs).forEach(walk)}
  for(const k of ['items','additionalProperties'])if(v[k]&&typeof v[k]==='object')walk(v[k]);
  for(const k of ['anyOf','oneOf','allOf'])if(Array.isArray(v[k]))v[k].forEach(walk);
 };
 walk(root);
 const depth=(v:any,n:number,seen:Set<string>):void=>{
  if(!v||typeof v!=='object')return;
  if(v.$ref){if(typeof v.$ref!=='string'||!reference(v.$ref)){issue('INVALID_REFERENCE');return}if(!seen.has(v.$ref))depth(reference(v.$ref),n,new Set([...seen,v.$ref]));return}
  const next=n+(v.type==='object'||v.properties||v.type==='array'||Array.isArray(v.type)&&v.type.some((t:string)=>t==='array'||t==='object')?1:0);result.nestingDepth=Math.max(result.nestingDepth,next);
  Object.values(v.properties??{}).forEach(child=>depth(child,next,seen));if(v.items)depth(v.items,next,seen);if(Array.isArray(v.anyOf))v.anyOf.forEach((child:any)=>depth(child,next,seen));
 };
 depth(root,0,new Set());
 let resolved=root;const roots=new Set<string>();while(resolved?.$ref&&typeof resolved.$ref==='string'&&!roots.has(resolved.$ref)){roots.add(resolved.$ref);resolved=reference(resolved.$ref)}
 if(!resolved||resolved.type!=='object')issue('ROOT_OBJECT_REQUIRED');if(resolved?.anyOf)issue('ROOT_ANYOF');
 if(result.enumValues>1000)issue('ENUM_COUNT');if(result.schemaStringCharacters>120000)issue('SCHEMA_STRING_SIZE');if(result.objectProperties>5000)issue('PROPERTY_COUNT');if(result.nestingDepth>10)issue('NESTING_DEPTH');
 result.fits=!result.violations.length;return result;
}
/** Shared enum definitions retain exact reference capabilities without repeated
 * values. Ownership validation still binds each decoded reference to its story. */
export function shareSchemaEnums<T extends object>(schema:T):T {
 const output=structuredClone(schema) as any,defs=output.$defs??={},known=new Map<string,string>();let index=0;
 const walk=(v:any):any=>{
  if(Array.isArray(v))return v.map(walk);if(!v||typeof v!=='object')return v;
  if(Array.isArray(v.enum)){const key=JSON.stringify(v);let name=known.get(key);if(!name){do{name='Enum'+index++}while(name in defs);known.set(key,name);defs[name]=v}return {$ref:'#/$defs/'+name}}
  return Object.fromEntries(Object.entries(v).map(([k,value])=>[k,k==='$defs'?value:walk(value)]));
 };
 const old=Object.entries(defs);const value=walk(output);for(const [k,v] of old)defs[k]=walk(v);return {...value,$defs:defs};
}
