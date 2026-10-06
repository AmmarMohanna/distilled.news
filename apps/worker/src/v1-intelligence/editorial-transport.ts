import type {EditorialPlanBody,PlanStory} from './editorial-plan';
import type {ShortlistRecord} from './shortlist';
import {HandoffError} from '@distilled/contracts';
/** Compact transport references are request-local capabilities, never new facts. */
export function compactEditorialInput<T extends Pick<ShortlistRecord,'candidates'|'ledger'|'obligations'>>(state:T) {
 const forward=new Map<string,string>(),reverse=new Map<string,string>();
 const ref=(id:string)=>{let key=forward.get(id);if(!key){key=`R${forward.size}`;forward.set(id,key);reverse.set(key,id)}return key};
 const candidateIds=state.candidates.map(c=>ref(c.targetVersionId));
 const value={...state,transportVersion:'editorial-compact-references-v1',candidates:state.candidates.map((c,i)=>({targetType:c.targetType,targetVersionId:candidateIds[i],stableTargetId:ref(c.stableTargetId),storylineId:c.storylineId?ref(c.storylineId):undefined,facts:c.facts.map(f=>({id:ref(f.id),text:f.text,selfContained:f.selfContained,context:f.context?{field:f.context.field,text:f.context.text}:undefined,certainty:f.certainty,attribution:f.attribution,reportTime:f.reportTime,eventTime:f.eventTime,timing:f.timing})),novelty:c.novelty,effects:c.effects,flags:c.flags,protectedReasons:c.protectedReasons,correctionObligationIds:c.correctionObligationIds.map(ref),priority:c.priority})),ledger:state.ledger.map(e=>({...e,id:ref(e.id),eventIds:e.eventIds.map(ref),storylineIds:e.storylineIds.map(ref)})),obligations:state.obligations.map(o=>({...o,id:ref(o.id),ledgerEntryId:ref(o.ledgerEntryId)}))};
 const translate=(body:EditorialPlanBody,map:(id:string)=>string):EditorialPlanBody=>({stories:body.stories.map(s=>({...s,targetVersionId:map(s.targetVersionId),...Object.fromEntries(['newUnderstandingFactIds','contextFactIds','mustIncludeFactIds','attributionFactIds','certaintyFactIds','disagreementFactIds','openQuestionFactIds','correctionObligationIds','previousLedgerEntryIds'].map(k=>[k,s[k as keyof PlanStory] instanceof Array?(s[k as keyof PlanStory] as string[]).map(map):[]]))})),obligations:body.obligations.map(o=>({...o,obligationId:map(o.obligationId),targetVersionId:o.targetVersionId===null?null:map(o.targetVersionId)}))});
 return {state:value,encode:(body:EditorialPlanBody)=>translate(body,id=>{const key=forward.get(id);if(!key)throw new HandoffError('SCOPE_DENIED');return key}),decode:(body:EditorialPlanBody)=>translate(body,id=>{const original=reverse.get(id);if(!original)throw new HandoffError('SCOPE_DENIED');return original})};
}

