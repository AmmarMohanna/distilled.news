/** Exhaustive bookkeeping in the existing editor response, never a relevance verdict. */
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export function editorAccountingSchema(refs:string[],historyIds?:string[]){
 const string={type:'string'},decision=object({decision:{type:'string',enum:['selected','excluded']},why:string});
 return object({items:{type:'array',items:object({headline:string,body:string,sources:{type:'array',minItems:1,items:{type:'string',enum:refs}},relation:{type:'string',enum:['new','update','correction']},updates:historyIds?.length ? {type:['string','null'],enum:[null,...historyIds]} : historyIds ? {type:'null'} : {type:['string','null']},importance:{type:'integer',enum:[1,2,3]}})},source_decisions:object(Object.fromEntries(refs.map(ref=>[ref,decision])))});
}
export const STRUCTURED_ACCOUNTING_CONTRACT='\n\nEXHAUSTIVE SOURCE DECISIONS: Return items plus source_decisions, an object with EVERY supplied source label as a required key. Each value is {decision:"selected"|"excluded",why:"actual concise reason"}. selected means that exact source directly supports at least one returned item and appears in its sources. excluded means it supports no returned item. Do not select marginal material merely to fill a key. An omitted development is an editorial decision, not a factual error in other stories. All labels must be decided, including when items:[]. Do not return left_out: it is derived from source_decisions. Do not merge distinct occurrences. Keep all directly supporting citations. Keep the same reader interests, novelty rules, language and factual safeguards.';
export function normalizeEditorAccounting(raw:unknown,refs:string[]){
 const value=raw as {items?:Array<{sources?:unknown[]}>;source_decisions?:Record<string,{decision?:unknown;why?:unknown}>};
 const decisions=value?.source_decisions;
 if(!Array.isArray(value?.items)||!decisions||typeof decisions!=='object'||Array.isArray(decisions)||Object.keys(decisions).some(ref=>!refs.includes(ref)))throw Error('INVALID_STRUCTURED_EDITOR_ACCOUNTING: source decisions must be an object with no invented keys');
 const selected=new Set(value.items.flatMap(item=>Array.isArray(item?.sources)?item.sources:[]));
 if([...selected].some(ref=>typeof ref!=='string'||!refs.includes(ref)))throw Error('INVALID_STRUCTURED_EDITOR_ACCOUNTING: invalid selected source');
 const left_out:Array<{sources:string[];why:string}>=[];
 for(const ref of refs){const row=decisions[ref];
  // A provider violating the required-key schema must not erase valid sibling
  // decisions. Missing unselected refs stay unaccounted for existing recovery.
  if(row===undefined&&!selected.has(ref))continue;
  if(!row||!['selected','excluded'].includes(row.decision as string)||typeof row.why!=='string'||!row.why.trim()||(row.decision==='selected')!==selected.has(ref))throw Error('INVALID_STRUCTURED_EDITOR_ACCOUNTING: source decision conflicts with selected citations or lacks a reason');
  if(row.decision==='excluded')left_out.push({sources:[ref],why:row.why.trim()});
 }
 return {items:value.items,left_out};
}
