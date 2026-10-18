import {z} from 'zod';
import type {ShortlistCandidate,ShortlistFact} from './shortlist';

export type EditorialContract='LEGACY'|'EVIDENCE_GROUNDED_V2';
export const editorialContract=(value:unknown):EditorialContract=>value===undefined||value==='LEGACY'?'LEGACY':value==='EVIDENCE_GROUNDED_V2'?value:(()=>{throw Error('UNKNOWN_PUBLICATION_VALIDATION_CONTRACT')})();
export const requirementReasonCodes=['CORE_DEVELOPMENT','MATERIAL_CHANGE','CORRECTION','DISAGREEMENT','NECESSARY_CONTEXT'] as const;
export const storyRequirementsSchema=z.object({
 policyVersion:z.literal('editorial-requirements-v2'),
 propositions:z.array(z.object({id:z.string().min(1),parentFactId:z.string().min(1),text:z.string().min(1),start:z.number().int().nonnegative(),end:z.number().int().positive()}).strict()),
 dispositions:z.array(z.object({propositionId:z.string().min(1),disposition:z.enum(['REQUIRED','OPTIONAL_CONTEXT','DEFERRED','NOT_NEWS']),reasonCode:z.enum(requirementReasonCodes).nullable(),justification:z.string().trim().min(1),obligationIds:z.array(z.string().min(1))}).strict())
}).strict();
export type StoryRequirements=z.infer<typeof storyRequirementsSchema>;
export function validateEditorialRequirements(raw:unknown,candidate:Pick<ShortlistCandidate,'facts'|'protectedReasons'|'correctionObligationIds'>,selected=true):StoryRequirements{
 const value=storyRequirementsSchema.parse(raw),ids=new Set(value.propositions.map(p=>p.id)),dispositions=new Map(value.dispositions.map(d=>[d.propositionId,d]));
 if(ids.size!==value.propositions.length||dispositions.size!==value.dispositions.length||ids.size!==dispositions.size||value.dispositions.some(d=>!ids.has(d.propositionId)))throw Error('PROPOSITION_DISPOSITION_COVERAGE');
 for(const p of value.propositions){
  const parent=candidate.facts.find(f=>f.id===p.parentFactId),d=dispositions.get(p.id)!;
  if(!parent||p.end<=p.start||p.end>parent.text.length||parent.text.slice(p.start,p.end)!==p.text)throw Error('PROPOSITION_SOURCE_OWNERSHIP');
  if(d.disposition==='REQUIRED'&&!d.reasonCode||d.disposition!=='REQUIRED'&&d.reasonCode!==null||d.obligationIds.some(id=>!candidate.correctionObligationIds.includes(id)))throw Error('REQUIREMENT_JUSTIFICATION');
  if(['REQUIRED','OPTIONAL_CONTEXT'].includes(d.disposition)&&parent.newsEligibility&&parent.newsEligibility.status!=='ELIGIBLE')throw Error('NEWS_ELIGIBILITY_UNRESOLVED');
  if(d.disposition==='NOT_NEWS'&&(parent as ShortlistFact & {newsEligibility?:{status:string}}).newsEligibility?.status!=='NOT_NEWS')throw Error('NAVIGATION_PROVENANCE_REQUIRED');
  if(selected&&candidate.protectedReasons.length&&(d.disposition!=='REQUIRED'||p.text!==parent.text))throw Error('PROTECTED_PROPOSITION_DEMOTION');
  if(!selected&&(candidate.protectedReasons.length||candidate.correctionObligationIds.length)&&(d.disposition!=='DEFERRED'||p.text!==parent.text))throw Error('PROTECTED_PROPOSITION_DEMOTION');
  if(!selected&&d.disposition==='REQUIRED')throw Error('UNDELIVERED_REQUIRED_PROPOSITION');
 }
 // Every character carrying source meaning gets a disposition. Splitting a
 // compound parent cannot silently drop a qualifier or independent development.
 for(const parent of candidate.facts){
  const props=value.propositions.filter(p=>p.parentFactId===parent.id);
  if(!props.length)throw Error('UNDISPOSED_PARENT_FACT');
  const covered=new Uint8Array(parent.text.length);for(const p of props)covered.fill(1,p.start,p.end);
  if(Array.from({length:parent.text.length},(_,i)=>i).some(i=>!covered[i]&&!/[\s,;:.!?]/u.test(parent.text[i])))throw Error('UNCLASSIFIED_PARENT_TEXT');
 }
 if(selected&&!value.dispositions.some(d=>d.disposition==='REQUIRED'))throw Error('SELECTED_REQUIREMENT_MISSING');
 for(const id of candidate.correctionObligationIds)if(selected&&!value.dispositions.some(d=>d.disposition==='REQUIRED'&&d.obligationIds.includes(id)&&d.reasonCode==='CORRECTION'))throw Error('CORRECTION_REQUIREMENT_MISSING');
 return value;
}
export function projectEditorialPropositions(value:StoryRequirements,parents:ShortlistFact[]){
 const dispositions=new Map(value.dispositions.map(d=>[d.propositionId,d]));
 const facts=value.propositions.filter(p=>['REQUIRED','OPTIONAL_CONTEXT'].includes(dispositions.get(p.id)!.disposition)).map(p=>{
  const parent=parents.find(f=>f.id===p.parentFactId);if(!parent)throw Error('PROPOSITION_SOURCE_OWNERSHIP');
  return {...parent,id:p.id,propositionId:p.id,text:p.text,parentFactId:parent.id,parentSpan:{start:p.start,end:p.end},parentFactText:parent.text};
 });
 return {facts,requiredIds:value.dispositions.filter(d=>d.disposition==='REQUIRED').map(d=>d.propositionId),deferredIds:value.dispositions.filter(d=>d.disposition==='DEFERRED').map(d=>d.propositionId)};
}
