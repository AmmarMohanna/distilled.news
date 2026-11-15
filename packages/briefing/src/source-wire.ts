/** Narrow, opt-in source renderer. No general entity or world-truth guarantee. */
export interface SourceWireAudit{sourceId:string;rule:'arabic-airstrike-locality-v1';before:{headline:string;body:string};after:{headline:string;body:string};sourceText:string}
const wirePattern=/^مراسل\s+["“«][^"”»]+["”»]\s*:\s*(غارتان إسرائيليتان تستهدفان|غارة إسرائيلية تستهدف|غارات إسرائيلية تستهدف)\s+أطراف\s+بلدة\s+([\p{Script=Arabic}\p{M}]+(?:\s+[\p{Script=Arabic}\p{M}]+){0,3})\s+في\s+قضاء\s+([\p{Script=Arabic}\p{M}]+(?:\s+[\p{Script=Arabic}\p{M}]+){0,3})\s+جنوبي\s+لبنان[.!]?$/u;
export function anchorLocalityWire(draft:{headline:string;body:string;relation:string;refs:string[]},sources:Map<string,{id:string;text:string}>,language:'en'|'ar'|'fr'):{headline:string;body:string;sourceId:string;sourceText:string}|undefined{
 if(draft.relation!=='new'||draft.refs.length!==1)return;const source=sources.get(draft.refs[0]);if(!source)return;const text=source.text.replace(/\s+/gu,' ').trim(),match=wirePattern.exec(text);if(!match)return;
 const[,clause,town,district]=match;if([town,district].some(v=>v.trim().split(/\s+/u).length>4||/(?:^|\s)(?:إذا|قد|لم|لن|سوف|حيث|بعد|قبل|وذلك|التي|منذ|عند|بشرط)(?:\s|$)/u.test(v)))return;
 const count=clause.startsWith('غارتان')?2:clause.startsWith('غارة ')?1:0;let headline:string;
 if(language==='en')headline=(count===2?'Two Israeli airstrikes reportedly target':count===1?'An Israeli airstrike reportedly targets':'Israeli airstrikes reportedly target')+' the outskirts of '+town+', in the '+district+' district of southern Lebanon';
 else if(language==='fr')headline='Selon un correspondant, '+(count===2?'deux frappes aériennes israéliennes visent':count===1?'une frappe aérienne israélienne vise':'des frappes aériennes israéliennes visent')+' les abords de '+town+', dans le district de '+district+', au sud du Liban';
 else headline=clause+' أطراف بلدة '+town+' في قضاء '+district+' جنوبي لبنان، بحسب مراسل';
 return{headline,body:'',sourceId:source.id,sourceText:source.text};
}