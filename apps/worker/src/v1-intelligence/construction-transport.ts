import {HandoffError} from '@distilled/contracts';
import {scopedConstructionWireSchema} from './semantic-construction';
import type {ClaimMention} from './claims';
import type {EventMatchInput} from './matchers';
/** Operation-local aliases change identities on the wire, never source wording.
 * They make exact reference schemas economical without truncating any fact. */
export function constructionTransport(mentions:ClaimMention[],input:EventMatchInput,state:Record<string,any>){
 const forward=new Map<string,string>(),reverse=new Map<string,string>();
 const add=(id:string,alias:string)=>{if(forward.has(id)||reverse.has(alias))throw new HandoffError('SCOPE_DENIED');forward.set(id,alias);reverse.set(alias,id)};
 mentions.forEach((m,i)=>add(m.id,'C'+i));input.candidates.forEach((c,i)=>add(c.id,'E'+i));input.storylineIds?.forEach((id,i)=>add(id,'L'+i));
 const keys=new Set(['id','eventId','storylineId','claimMentionId','claimMentionIds','backgroundMentionIds','openQuestionMentionIds']);
 const encode=(value:any,key=''):any=>Array.isArray(value)?value.map(v=>encode(v,key)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v,k)])):typeof value==='string'&&keys.has(key)?forward.get(value)??value:value;
 const scoped={...input,candidates:input.candidates.map(c=>({...c,id:forward.get(c.id)!})),storylineIds:input.storylineIds?.map(id=>forward.get(id)!)};
 const schema=scopedConstructionWireSchema(mentions.map(m=>({...m,id:forward.get(m.id)!})),scoped);
 const decode=(raw:any):any=>{
  const ref=(id:unknown)=>{if(typeof id!=='string'||!reverse.has(id))throw new HandoffError('SCOPE_DENIED');return reverse.get(id)!};
  if(!raw||!Array.isArray(raw.groups)||!Array.isArray(raw.backgroundMentionIds))throw new HandoffError('SCOPE_DENIED');
  return {...raw,backgroundMentionIds:raw.backgroundMentionIds.map(ref),groups:raw.groups.map((g:any)=>({...g,claimMentionIds:g.claimMentionIds?.map(ref),eventId:g.eventId===null?null:ref(g.eventId),storylineId:g.storylineId===null?null:ref(g.storylineId),entities:g.entities?.map((e:any)=>({...e,claimMentionIds:e.claimMentionIds?.map(ref)})),slots:g.slots?.map((s:any)=>({...s,claimMentionId:ref(s.claimMentionId)})),...(g.storylineState?{storylineState:{...g.storylineState,openQuestionMentionIds:g.storylineState.openQuestionMentionIds?.map(ref),expectedNextDate:g.storylineState.expectedNextDate?{...g.storylineState.expectedNextDate,claimMentionId:ref(g.storylineState.expectedNextDate.claimMentionId)}:null}}:{})}))};
 };
 return {state:{...encode(state),referenceEncoding:'C references are scoped ClaimMentions, E references are offered Events, L references are offered Storylines. Text and meaning are unchanged; return only offered references.'},schema,decode};
}
