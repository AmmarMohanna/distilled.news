import type {EditorialPlanBody,PlanStory} from './editorial-plan';
import type {ShortlistRecord} from './shortlist';
import {HandoffError} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
export const EDITORIAL_OUTPUT_CONTRACT='candidate-keyed-decisions-v1';
/** Compact transport references are request-local capabilities, never new facts. */
export function compactEditorialInput<T extends Pick<ShortlistRecord,'candidates'|'ledger'|'obligations'>>(state:T) {
 const forward=new Map<string,string>(),reverse=new Map<string,string>();
 const ref=(id:string)=>{let key=forward.get(id);if(!key){key=`R${forward.size}`;forward.set(id,key);reverse.set(key,id)}return key};
 const candidateIds=state.candidates.map(c=>ref(c.targetVersionId));
 const value={...state,transportVersion:'editorial-compact-references-v1',candidates:state.candidates.map((c,i)=>({readerState:c.readerState,publisherIds:c.publisherIds,sourceTitles:c.sourceTitles,targetType:c.targetType,targetVersionId:candidateIds[i],stableTargetId:ref(c.stableTargetId),storylineId:c.storylineId?ref(c.storylineId):undefined,facts:c.facts.map(f=>({id:ref(f.id),text:f.text,selfContained:f.selfContained,context:f.context?{field:f.context.field,text:f.context.text}:undefined,certainty:f.certainty,attribution:f.attribution,reportTime:f.reportTime,eventTime:f.eventTime,timing:f.timing})),ranking:c.ranking?{...c.ranking}:undefined,communicationCost:c.communicationCost,novelty:c.novelty,effects:c.effects,flags:c.flags,protectedReasons:c.protectedReasons,correctionObligationIds:c.correctionObligationIds.map(ref),priority:c.priority})),ledger:state.ledger.map(e=>({...e,id:ref(e.id),eventIds:e.eventIds.map(ref),storylineIds:e.storylineIds.map(ref)})),obligations:state.obligations.map(o=>({...o,id:ref(o.id),ledgerEntryId:ref(o.ledgerEntryId)}))};
 const originalBytes=new TextEncoder().encode(canonicalJson(value)).length;
 let inputCompaction:{policyVersion:string;originalBytes:number;omittedRankingFields:string[]}|undefined;
 if(originalBytes>48000){
  // Tie-break text repeats approved facts; operation IDs are audit handles.
  // Smaller inputs remain byte-identical to preserve billed call identities.
  for(const c of value.candidates)if(c.ranking){const ranking=c.ranking as Partial<typeof c.ranking>;delete ranking.semanticKey;delete ranking.operationId}
  inputCompaction={policyVersion:'oversized-ranking-audit-elision-v1',originalBytes,omittedRankingFields:['semanticKey','operationId']};
 }
 const translate=(body:EditorialPlanBody,map:(id:string)=>string):EditorialPlanBody=>({stories:body.stories.map(s=>({...s,targetVersionId:map(s.targetVersionId),...Object.fromEntries(['newUnderstandingFactIds','contextFactIds','mustIncludeFactIds','attributionFactIds','certaintyFactIds','disagreementFactIds','openQuestionFactIds','correctionObligationIds','previousLedgerEntryIds'].map(k=>[k,s[k as keyof PlanStory] instanceof Array?(s[k as keyof PlanStory] as string[]).map(map):[]]))})),obligations:body.obligations.map(o=>({...o,obligationId:map(o.obligationId),targetVersionId:o.targetVersionId===null?null:map(o.targetVersionId)}))});
 const encode=(body:EditorialPlanBody)=>translate(body,id=>{const key=forward.get(id);if(!key)throw new HandoffError('SCOPE_DENIED');return key});
 const decode=(body:EditorialPlanBody)=>translate(body,id=>{const original=reverse.get(id);if(!original)throw new HandoffError('SCOPE_DENIED');return original});
 const encodeKeyed=(body:EditorialPlanBody)=>{const compact=encode(body);return {stories:Object.fromEntries(compact.stories.map(({targetVersionId,...story})=>[targetVersionId,story])),obligations:Object.fromEntries(compact.obligations.map(({obligationId,...obligation})=>[obligationId,obligation]))}};
 const decodeKeyed=(raw:unknown):EditorialPlanBody=>{
  const body=raw as {stories:Record<string,Omit<PlanStory,'targetVersionId'>>;obligations:Record<string,EditorialPlanBody['obligations'][number]>};
  const exact=(object:unknown,keys:string[])=>{if(!object||typeof object!=='object'||Array.isArray(object)||Object.keys(object).length!==keys.length||keys.some(k=>!Object.prototype.hasOwnProperty.call(object,k)))throw new HandoffError('SCOPE_DENIED')};
  exact(raw,['stories','obligations']);exact(body.stories,candidateIds);exact(body.obligations,value.obligations.map(o=>o.id));
  for(const story of Object.values(body.stories))if(!story||typeof story!=='object'||'targetVersionId' in story)throw new HandoffError('SCOPE_DENIED');
  for(const obligation of Object.values(body.obligations))if(!obligation||typeof obligation!=='object'||'obligationId' in obligation)throw new HandoffError('SCOPE_DENIED');
  return decode({stories:candidateIds.map(targetVersionId=>({...body.stories[targetVersionId],targetVersionId})),obligations:value.obligations.map(({id:obligationId})=>({...body.obligations[obligationId],obligationId}))});
 };
 return {state:{...value,...(inputCompaction?{inputCompaction}:{})},encode,decode,encodeKeyed,decodeKeyed};
}
/** Exact duplicated history prose may be elided only from new oversized wire
 * inputs, never from retained ledger records or an existing call identity. */
export function keyedEditorialState(state:ReturnType<typeof compactEditorialInput>['state'],options:{compact?:boolean}={}) {
 const value={...structuredClone(state),outputContract:EDITORIAL_OUTPUT_CONTRACT,outputInstruction:'Return stories as an object with exactly the offered targetVersionId keys, and obligations as an object with exactly the offered obligationId keys. Values omit those identity fields. Each key owns one decision; do not duplicate or omit keys. All fact references remain candidate-owned.'};
 const originalBytes=new TextEncoder().encode(canonicalJson(value)).length,elidedLedgerIds:string[]=[];
 if(originalBytes>48000){
  const protectedHistory=new Set(value.obligations.map(o=>o.ledgerEntryId));
  for(const entry of value.ledger){
   if(!protectedHistory.has(entry.id)&&entry.claimFacts.join(' ')===entry.claimText){delete (entry as Partial<typeof entry>).claimText;elidedLedgerIds.push(entry.id)}
  }
 }
 const expanded={...value,...(elidedLedgerIds.length?{historyCompaction:{policyVersion:'exact-duplicated-ledger-prose-v1',originalBytes,elidedLedgerIds}}:{})};
 return options.compact===false?expanded:aliasEditorialInput(expanded);
}


const inputBytes=(value:unknown)=>new TextEncoder().encode(canonicalJson(value)).length;
/** Input-only field aliases preserve EVERY value, including correction prose.
 * A reversible legend costs less than repeating long field names on every fact.
 * Small inputs remain byte-identical; output references/schema are untouched. */
function aliasEditorialInput<T extends {candidates:unknown[];ledger:unknown[];obligations:unknown[]}>(state:T):T {
 if(inputBytes(state)<=48000)return state;
 const counts=new Map<string,number>(),originalKeys=new Set<string>();
 const visit=(value:unknown)=>{if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){counts.set(key,(counts.get(key)??0)+1);originalKeys.add(key);visit(item)}};
 for(const key of ['candidates','ledger','obligations'] as const)visit(state[key]);
 const fields:Record<string,string>={},forward=new Map<string,string>();let next=0;
 for(const key of [...counts.keys()].sort())if(key.length>6&&counts.get(key)!>=3){let alias:string;do{alias=`k${next++}`}while(originalKeys.has(alias));fields[alias]=key;forward.set(key,alias)}
 const pack=(value:unknown):unknown=>Array.isArray(value)?value.map(pack):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[forward.get(key)??key,pack(item)])):value;
 return {...state,candidates:pack(state.candidates),ledger:pack(state.ledger),obligations:pack(state.obligations),inputEncoding:{policyVersion:'lossless-field-aliases-v1',fields,instruction:'Input-only aliases: expand field names using fields. All values and ownership are unchanged. Output uses the original JSON Schema field names.'}} as T;
}
/** Decoder is for audit/regressions; the provider reads the accompanying legend. */
export function expandEditorialInput<T>(state:T):T {
 const encoding=(state as {inputEncoding?:{fields:Record<string,string>}}).inputEncoding;if(!encoding)return structuredClone(state);
 const unpack=(value:unknown):unknown=>Array.isArray(value)?value.map(unpack):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[encoding.fields[key]??key,unpack(item)])):value;
 const {inputEncoding:_,...rest}=state as any;
 return {...rest,candidates:unpack(rest.candidates),ledger:unpack(rest.ledger),obligations:unpack(rest.obligations)};
}
export const EDITORIAL_INPUT_POLICY='lossless-bounded-editorial-input-v1';
/** Only ordinary candidates can overflow. No facts/history are shortened, and
 * overflow is system capacity deferral, never a model's editorial decision. */
export function boundedEditorialInput<T extends Pick<ShortlistRecord,'candidates'|'ledger'|'obligations'>>(state:T) {
 const offeredCandidates=[...state.candidates],overflowIds:string[]=[];
 let transport=compactEditorialInput(state),inputState=keyedEditorialState(transport.state);
 while(inputBytes(inputState)>48000){
  let index=-1;for(let i=offeredCandidates.length-1;i>=0;i--)if(!offeredCandidates[i].protectedReasons.length&&!offeredCandidates[i].correctionObligationIds.length){index=i;break}
  if(index<0)return {transport,inputState,offeredCandidates,overflowIds,failure:'PROTECTED_EDITORIAL_INPUT_TOO_LARGE' as const};
  overflowIds.unshift(offeredCandidates.splice(index,1)[0].targetVersionId);
  transport=compactEditorialInput({...state,candidates:offeredCandidates});inputState=keyedEditorialState(transport.state);
 }
 return {transport,inputState,offeredCandidates,overflowIds,failure:undefined};
}
