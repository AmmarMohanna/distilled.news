const string={type:'string'},integer={type:'integer',minimum:0};
const array=(items:unknown)=>({type:'array',items});
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const label=(values:string[])=>({type:'string',enum:values});
const evidence=array(object({sourceId:string,passageId:string}));
/** Provider-enforced shape complements, never replaces, evidence validation. */
export function reviewSchema(inventory:boolean,input?:string){
 let packet:any;try{packet=input?JSON.parse(input):null}catch{packet=null}const articles=packet?.case?.articles??packet?.articles;
 const refs=Array.isArray(articles)?articles.filter(a=>a.passages?.length).map(a=>object({sourceId:label([a.id]),passageId:label(a.passages.map((p:{id:string})=>p.id))})):[];
 const evidence=refs.length?array({anyOf:refs}):{...array(object({sourceId:string,passageId:string})),maxItems:0};
 const result=inventory?object({developments:array(object({id:string,text:string,importance:{type:'integer',enum:[1,2,3]},relation:label(['new','update','correction','already_reported']),evidence})),limitations:array(string)}):object({
  claims:array(object({id:string,item:integer,text:string,support:label(['supported','contradicted','unsupported','uncertain']),citationSupport:label(['supported','unsupported','uncertain','missing']),evidence,explanation:string})),
  coverage:array(object({developmentId:string,status:label(['covered','omitted','uncertain','already_reported']),items:array(integer),explanation:string})),
  items:array(object({item:integer,relevance:label(['relevant','irrelevant','uncertain']),repetition:label(['novel','necessary_update','repeated','uncertain']),temporal:label(['correct','incorrect','uncertain']),language:label(['correct','incorrect','uncertain']),explanation:string})),
  findings:array(object({category:label(['factual','citation','coverage','relevance','repetition','temporal','language']),severity:label(['warning','error']),item:{type:['integer','null'],minimum:0},explanation:string,evidence})),limitations:array(string)
 });
 if(!inventory&&Array.isArray(packet?.independentInventory?.developments)){
  const ids=packet.independentInventory.developments.map((d:{id:string})=>d.id);
  const coverage=result.properties.coverage as {items:{properties:Record<string,unknown>}};
  Object.assign(coverage,{minItems:ids.length,maxItems:ids.length});
  if(ids.length)coverage.items.properties.developmentId=label(ids);
 }
 if(!inventory&&Array.isArray(packet?.case?.items)&&packet.case.items.length===0){
  Object.assign(result.properties.claims as object,{maxItems:0});Object.assign(result.properties.items as object,{maxItems:0});
  const coverage=result.properties.coverage as {items:{properties:Record<string,unknown>}};
  coverage.items.properties.items={...array(integer),maxItems:0};coverage.items.properties.status=label(['omitted','uncertain','already_reported']);
 }
 return result;
}

export function groundingSchema(input:string){const packet=JSON.parse(input),ids=packet.developments.map((d:{developmentId:string})=>d.developmentId);return object({results:{...array(object({developmentId:label(ids),support:label(['supported','unsupported','uncertain']),explanation:string})),minItems:ids.length,maxItems:ids.length},limitations:array(string)})}
export function groundedReviewSchema(input:string){const s=reviewSchema(false,input),packet=JSON.parse(input),priorIds=packet.case.prior.map((p:{id:string})=>p.id);const coverage=s.properties.coverage as any;coverage.items.properties.priorIds=priorIds.length?array(label(priorIds)):{...array(string),maxItems:0};coverage.items.required.push('priorIds');const findings=s.properties.findings as any;findings.items.properties.category=label(['factual','citation','relevance','repetition','temporal','language']);if(packet.case.items.length){findings.items.properties.item={type:'integer',minimum:0,maximum:packet.case.items.length-1}}else{findings.maxItems=0}return s}

export function sourceInventorySchema(input:string){const s=reviewSchema(true,input);const developments=s.properties.developments as any;developments.items.properties.relation=label(['new','update','correction']);return s}
