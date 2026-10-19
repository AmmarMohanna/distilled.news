import {z} from 'zod';
import {assertClaimSpan} from './claims';
import {semanticGroupSchema} from './semantic-state';
import {constructionSchema} from './semantic-construction';
import {HandoffError} from '@distilled/contracts';
import {scopedConstructionWireSchema} from './semantic-construction';
import type {ClaimMention} from './claims';
import type {EventMatchInput} from './matchers';
export const GROUP_OWNERSHIP_VERSION='group-owned-passages-v1';
const ownedResponseSchema=constructionSchema.extend({groups:z.array(semanticGroupSchema.omit({claimMentionIds:true}).extend({groupId:z.string(),ownedPassages:z.array(z.object({passageId:z.string(),openQuestion:z.boolean(),expectedNextDateText:z.string().min(1).nullable()}).strict()).min(1),storylineState:z.object({lifecycle:z.enum(['ACTIVE','WATCHING','DORMANT','CLOSED'])}).strict()}).strict()).min(1)}).strict();
/** Operation-local aliases change identities on the wire, never source wording.
 * They make exact reference schemas economical without truncating any fact. */
export function constructionTransport(mentions:ClaimMention[],input:EventMatchInput,state:Record<string,any>){
 const owned=state.constructionOwnershipVersion===GROUP_OWNERSHIP_VERSION;
 if(owned)for(const mention of mentions)assertClaimSpan(mention,input.revision);
 const forward=new Map<string,string>(),reverse=new Map<string,string>();
 const add=(id:string,alias:string)=>{if(forward.has(id)||reverse.has(alias))throw new HandoffError('SCOPE_DENIED');forward.set(id,alias);reverse.set(alias,id)};
 mentions.forEach((m,i)=>add(m.id,'C'+i));input.candidates.forEach((c,i)=>add(c.id,'E'+i));input.storylineIds?.forEach((id,i)=>add(id,'L'+i));
 const keys=new Set(['id','eventId','storylineId','claimMentionId','claimMentionIds','backgroundMentionIds','openQuestionMentionIds','passageId','unassignedIncomingPassageIds','backgroundEligiblePassageIds','allowedIncomingPassageIds','proposedOwnedPassageIds']);
 const encode=(value:any,key=''):any=>Array.isArray(value)?value.map(v=>encode(v,key)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v,k)])):typeof value==='string'&&keys.has(key)?forward.get(value)??value:value;
 const scoped={...input,candidates:input.candidates.map(c=>({...c,id:forward.get(c.id)!})),storylineIds:input.storylineIds?.map(id=>forward.get(id)!)};
 const schema=scopedConstructionWireSchema(mentions.map(m=>({...m,id:forward.get(m.id)!})),scoped);
 const groups=mentions.map((_,i)=>'G'+i),background=owned?mentions.filter(backgroundEligible).map(m=>forward.get(m.id)!):[];
 if(owned){
  const branches=((schema.properties.groups as any).items as any).anyOf;
  for(const branch of branches){const p=branch.properties;
   p.groupId={type:'string',enum:groups};
   p.ownedPassages={type:'array',minItems:1,maxItems:mentions.length,items:{type:'object',additionalProperties:false,required:['passageId','openQuestion','expectedNextDateText'],properties:{passageId:p.claimMentionIds.items,openQuestion:{type:'boolean'},expectedNextDateText:{type:['string','null']}}}};
   delete p.claimMentionIds;branch.required=branch.required.filter((k:string)=>k!=='claimMentionIds');branch.required.push('groupId','ownedPassages');
   delete p.storylineState.properties.openQuestionMentionIds;delete p.storylineState.properties.expectedNextDate;p.storylineState.required=['lifecycle'];
  }
  (schema.properties.groups as any).maxItems=mentions.length;
  schema.properties.backgroundMentionIds=background.length?{type:'array',items:{type:'string',enum:background}}:{type:'array',maxItems:0,items:{type:'string'}};
 }
 const decode=(original:any):any=>{
  let raw=original;
  if(owned){
   const parsed=ownedResponseSchema.parse(original),seenGroups=new Set<string>();
   raw={...parsed,groups:parsed.groups.map(g=>{
    if(!groups.includes(g.groupId)||seenGroups.has(g.groupId))throw new HandoffError('SCOPE_DENIED');seenGroups.add(g.groupId);
    const ids=g.ownedPassages.map(p=>p.passageId),dates=g.ownedPassages.filter(p=>p.expectedNextDateText!==null);
    if(new Set(ids).size!==ids.length||ids.some(id=>!/^C\d+$/.test(id)||!reverse.has(id))||dates.length>1)throw new HandoffError('SCOPE_DENIED');
    const {groupId:_,ownedPassages,...base}=g;
    return {...base,claimMentionIds:ids,storylineState:{lifecycle:g.storylineState.lifecycle,openQuestionMentionIds:ownedPassages.filter(p=>p.openQuestion).map(p=>p.passageId),expectedNextDate:dates.length?{claimMentionId:dates[0].passageId,text:dates[0].expectedNextDateText}:null}};
   })};
   if(raw.backgroundMentionIds.some((id:string)=>!background.includes(id)||raw.groups.some((g:any)=>g.claimMentionIds.includes(id))))throw new HandoffError('SCOPE_DENIED');
  }
  const ref=(id:unknown)=>{if(typeof id!=='string'||!reverse.has(id))throw new HandoffError('SCOPE_DENIED');return reverse.get(id)!};
  if(!raw||!Array.isArray(raw.groups)||!Array.isArray(raw.backgroundMentionIds))throw new HandoffError('SCOPE_DENIED');
  return {...raw,backgroundMentionIds:raw.backgroundMentionIds.map(ref),groups:raw.groups.map((g:any)=>({...g,claimMentionIds:g.claimMentionIds?.map(ref),eventId:g.eventId===null?null:ref(g.eventId),storylineId:g.storylineId===null?null:ref(g.storylineId),entities:g.entities?.map((e:any)=>({...e,claimMentionIds:e.claimMentionIds?.map(ref)})),slots:g.slots?.map((s:any)=>({...s,claimMentionId:ref(s.claimMentionId)})),...(g.storylineState?{storylineState:{...g.storylineState,openQuestionMentionIds:g.storylineState.openQuestionMentionIds?.map(ref),expectedNextDate:g.storylineState.expectedNextDate?{...g.storylineState.expectedNextDate,claimMentionId:ref(g.storylineState.expectedNextDate.claimMentionId)}:null}}:{})}))};
 };
 const enriched=owned?{...state,claimMentions:mentions.map(m=>({id:m.id,text:m.sourceText,sourceField:m.span.field,span:m.span,evidenceRevisionId:m.evidenceRevisionId,sourceDocumentId:m.sourceDocumentId,reportTime:m.reportTime,eventTime:m.eventTime,certainty:m.certainty,attribution:m.attribution,reportingRoleHint:m.reportingRole})),passageOwnership:{version:GROUP_OWNERSHIP_VERSION,sourceRevisionId:input.revision.id,canonicalUrl:input.revision.canonicalUrl,evidenceId:input.revision.evidenceId,sourceObservationId:input.revision.sourceObservationId,acquiredContentId:input.revision.acquiredContentId,contentHash:input.revision.contentHash,representation:input.revision.representation,contentCompleteness:input.revision.contentCompleteness,unassignedIncomingPassageIds:mentions.map(m=>m.id),outputGroupIds:groups,backgroundEligiblePassageIds:mentions.filter(backgroundEligible).map(m=>m.id),existingStorylines:(state.memory??[]).map((m:any)=>({storylineId:m.id,versionId:m.versionId??m.version?.id,allowedPassageIdsRef:'passageOwnership.unassignedIncomingPassageIds',existingEventVersionIds:input.candidates.filter(c=>m.version?.eventVersionIds?.includes(c.version.id)).map(c=>c.version.id)})),instruction:'Incoming passages are authorized source evidence, NOT an already-approved partition. Choose explicit ownedPassages for each G group from the incoming passage catalog using meaning. G IDs are local output handles, not canonical Event/Storyline IDs. Each owned passage carries its own openQuestion flag and optional exact expectedNextDateText; no separate passage references are allowed in storylineState. Never copy source text, move an ID during decoding, or infer ownership from a shared entity/topic. Preserve independent developments/stages, contradictions and corrections. Consolidate overlapping accounts of the same development; ownership is not a requirement to publish every context fact. Existing L/E identities retain their supplied history/version ownership; the new source does not rewrite historical passage ownership. Material quantities, attribution, hedges and qualifiers cannot be discarded as background. Every incoming passage must remain explicitly owned or eligible background. Keep otherwise valid assignments during repair; rejected proposals are NOT authoritative canonical assignments. Any regrouping must be an explicit model-ownedPassages decision justified by source meaning, never an automatic repair of foreign references.'}}:state;
 return {state:{...encode(enriched),referenceEncoding:'C references are scoped ClaimMentions, E references are offered Events, L references are offered Storylines. Text and meaning are unchanged; return only offered references.'},schema,decode};
}

/** Mirrors the existing canonical MATERIAL_BACKGROUND gate; no new factual rule. */
export function backgroundEligible(m:ClaimMention){return !m.quantities.length&&!m.certainty.hedges.length&&!m.qualifiers.length&&!m.attribution;}
