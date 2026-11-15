/** Offline transport experiment. Local source/passage binding validation is unchanged. */
export function compactEvidenceSchema(schema:any):any{
 if(Array.isArray(schema))return schema.map(compactEvidenceSchema);
 if(!schema||typeof schema!=='object')return schema;
 const refs=schema.anyOf;
 if(Array.isArray(refs)&&refs.length&&refs.every(r=>r.type==='object'&&Object.keys(r.properties??{}).sort().join(',')==='passageId,sourceId'&&Array.isArray(r.properties.sourceId.enum)&&Array.isArray(r.properties.passageId.enum))){return{type:'object',properties:{sourceId:{type:'string',enum:[...new Set(refs.flatMap(r=>r.properties.sourceId.enum))]},passageId:{type:'string',enum:[...new Set(refs.flatMap(r=>r.properties.passageId.enum))]}},required:['sourceId','passageId'],additionalProperties:false}}
 return Object.fromEntries(Object.entries(schema).map(([k,v])=>[k,compactEvidenceSchema(v)]));
}
