import {HandoffError,sha256,type EventVersion,type EventMembership} from '@distilled/contracts';
import {z} from 'zod';
import {canonicalJson} from '../v1-intake/canonical';
import {type ClaimMention,assertClaimSpan} from './claims';
import type {FeedTransaction} from './store';
import type {EventMatchDecision} from './matchers';
import type {StorylineVersion} from './types';
export const STATE_POLICY='exact-semantic-state-v1';
export const slotKinds=['count','role_holder','role_status','process_status','decision_outcome','vote_result','monetary_amount','percentage','date_time','score_result'] as const;
export const storylineDirectiveSchema=z.object({lifecycle:z.enum(['ACTIVE','WATCHING','DORMANT','CLOSED']),openQuestionMentionIds:z.array(z.string()).max(12),expectedNextDate:z.object({claimMentionId:z.string(),text:z.string().min(1).max(200)}).strict().nullable()}).strict();
export const semanticGroupSchema=z.object({claimMentionIds:z.array(z.string()).min(1).max(32),eventId:z.string().nullable(),storylineId:z.string().nullable(),structuralRelation:z.enum(['SAME_EVENT','NEW_EVENT_EXISTING_STORYLINE','NEW_STORYLINE','DEFER']),epistemicEffects:z.array(z.enum(['CORROBORATES','ADDS_DETAIL','CHANGES_STATE','CHANGES_CERTAINTY','CONTRADICTS','CORRECTS','RETRACTS'])).max(7),entities:z.array(z.object({canonicalLabel:z.string().min(1).max(120),aliases:z.array(z.string().min(1).max(120)).min(1).max(8),claimMentionIds:z.array(z.string()).min(1).max(8)}).strict()).max(8),slots:z.array(z.object({kind:z.enum(slotKinds),claimMentionId:z.string(),entityLabel:z.string().nullable(),value:z.string().min(1).max(200),asOf:z.string().nullable()}).strict()).max(12)}).strict();
export type SemanticGroup=z.infer<typeof semanticGroupSchema>&{storylineState?:z.infer<typeof storylineDirectiveSchema>};
export interface SemanticConstruction {groups:SemanticGroup[];backgroundMentionIds:string[];originDependencyLabel?:string|null;provenance:EventMatchDecision['provenance']}
export interface Entity {id:string;entityId:string;feedId:string;canonicalLabel:string;aliases:string[];claimMentionIds:string[];externalId?:string;provenance:EventMatchDecision['provenance'];policyVersion:string}
export interface Proposition {id:string;feedId:string;kind:'TEXT';text:string;claimMentionIds:string[];evidenceRevisionIds:string[];certainty:ClaimMention['certainty'];attribution?:string;reportingRole:ClaimMention['reportingRole'];eventTime?:string;reportTime:string;origin:ClaimMention['origin'];policyVersion:string}
export interface StateSlot {id:string;feedId:string;entityId?:string;attribute:typeof slotKinds[number];value:string;asOf?:string;propositionId:string;claimMentionId:string;certainty:ClaimMention['certainty'];attribution?:string;policyVersion:string}
export interface EventSemanticState {id:string;feedId:string;eventVersionId:string;propositionIds:string[];stateSlotIds:string[];entityIds:string[];storylineState?:z.infer<typeof storylineDirectiveSchema>;structuralRelation?:EventMatchDecision['structuralRelation'];epistemicEffects:EventMatchDecision['epistemicEffects'];provisional:boolean;provenance:EventMatchDecision['provenance'];policyVersion:string}
export interface StorylineMemory {id:string;feedId:string;storylineVersionId:string;storylineId:string;eventVersionIds:string[];propositionIds:string[];stateSlotIds:string[];entityIds:string[];lifecycle:'ACTIVE'|'WATCHING'|'DORMANT'|'CLOSED';lastMeaningfulChangeAt:string;openQuestions:{text:string;propositionId:string}[];expectedNextDate?:{text:string;propositionId:string};policyVersion:string}
export function validateConstruction(value:SemanticConstruction,mentions:ClaimMention[]):SemanticConstruction {
 const known=new Map(mentions.map(m=>[m.id,m])),covered=new Set(value.backgroundMentionIds);
 if(value.groups.length>6||!value.groups.length||value.backgroundMentionIds.some(id=>!known.has(id)))throw new HandoffError('SCOPE_DENIED');
 for(const raw of value.groups){const {storylineState,...base}=raw,group=semanticGroupSchema.parse(base);for(const id of group.claimMentionIds){if(!known.has(id))throw new HandoffError('SCOPE_DENIED');covered.add(id)}
  if(storylineState){const d=storylineDirectiveSchema.parse(storylineState);if(d.openQuestionMentionIds.some(id=>!group.claimMentionIds.includes(id)) || d.expectedNextDate && (!group.claimMentionIds.includes(d.expectedNextDate.claimMentionId)||!known.get(d.expectedNextDate.claimMentionId)?.sourceText.includes(d.expectedNextDate.text)))throw new HandoffError('SCOPE_DENIED')}
  for(const entity of group.entities){if(entity.claimMentionIds.some(id=>!group.claimMentionIds.includes(id)))throw new HandoffError('SCOPE_DENIED');const texts=entity.claimMentionIds.map(id=>known.get(id)!.sourceText);if(entity.aliases.some(alias=>!texts.some(t=>t.includes(alias))))throw new HandoffError('SCOPE_DENIED')}
  for(const slot of group.slots){const mention=known.get(slot.claimMentionId);if(!mention||!group.claimMentionIds.includes(mention.id)||!mention.sourceText.includes(slot.value)||slot.asOf && !mention.sourceText.includes(slot.asOf)||slot.entityLabel && !group.entities.some(e=>e.canonicalLabel===slot.entityLabel))throw new HandoffError('SCOPE_DENIED')}
 }
 if(mentions.some(m=>!covered.has(m.id)))throw new HandoffError('SCOPE_DENIED');return value;
}
/** Exact TEXT propositions are the lossless default; structured slots are only
 * accepted when the value and time scope occur in the supporting source span. */
export async function persistEventSemanticState(tx:FeedTransaction,event:EventVersion,now:string,binding?:{group:SemanticGroup;provenance:EventMatchDecision['provenance']}):Promise<EventSemanticState> {
 const members=(await tx.list<EventMembership>('memberships')).filter(m=>m.eventVersionId===event.id),support=new Set(members.map(m=>m.evidenceRevisionId));
 const all=(await tx.list<ClaimMention>('claim_mentions')).filter(m=>support.has(m.evidenceRevisionId));
 const mentions=binding?all.filter(m=>binding.group.claimMentionIds.includes(m.id)):all;
 if(binding && binding.group.claimMentionIds.some(id=>!mentions.some(m=>m.id===id)))throw new HandoffError('SCOPE_DENIED');
 const propositionIds:string[]=[],stateSlotIds:string[]=[],entityIds:string[]=[],propositions=new Map<string,Proposition>();
 const mentionIds=new Map(await Promise.all(mentions.map(async mention=>[mention.id,await sha256(canonicalJson({feedId:tx.snapshot.feed.id,mentionId:mention.id,policy:STATE_POLICY}))] as const)));
 await tx.preload('propositions',[...mentionIds.values()]);
 for(const mention of mentions){const revision=await tx.revision(mention.evidenceRevisionId);if(!revision)throw new HandoffError('SCOPE_DENIED');assertClaimSpan(mention,revision);
  const id=mentionIds.get(mention.id)!;
  const p:Proposition={id,feedId:tx.snapshot.feed.id,kind:'TEXT',text:mention.sourceText,claimMentionIds:[mention.id],evidenceRevisionIds:[mention.evidenceRevisionId],certainty:mention.certainty,attribution:mention.attribution,reportingRole:mention.reportingRole,eventTime:mention.eventTime,reportTime:mention.reportTime,origin:mention.origin,policyVersion:STATE_POLICY};await tx.write('propositions',id,p);propositionIds.push(id);propositions.set(mention.id,p);
 }
 for(const e of binding?.group.entities??[]){const entityId=await sha256(canonicalJson({feedId:tx.snapshot.feed.id,label:e.canonicalLabel.normalize('NFKC').toLowerCase()})),id=await sha256(canonicalJson({entityId,aliases:[...e.aliases].sort(),support:e.claimMentionIds,policy:STATE_POLICY}));await tx.write('entities',id,{id,entityId,feedId:tx.snapshot.feed.id,...e,provenance:binding!.provenance,policyVersion:STATE_POLICY} satisfies Entity);entityIds.push(id)}
 for(const slot of binding?.group.slots??[]){const p=propositions.get(slot.claimMentionId)!;const entityIndex=binding!.group.entities.findIndex(e=>e.canonicalLabel===slot.entityLabel);const id=await sha256(canonicalJson({feedId:tx.snapshot.feed.id,slot,propositionId:p.id,policy:STATE_POLICY}));const s:StateSlot={id,feedId:tx.snapshot.feed.id,entityId:entityIndex<0?undefined:entityIds[entityIndex],attribute:slot.kind,value:slot.value,asOf:slot.asOf??undefined,propositionId:p.id,claimMentionId:slot.claimMentionId,certainty:p.certainty,attribution:p.attribution,policyVersion:STATE_POLICY};await tx.write('state_slots',id,s);stateSlotIds.push(id)}
 const state:EventSemanticState={id:event.id,feedId:tx.snapshot.feed.id,eventVersionId:event.id,propositionIds,stateSlotIds,entityIds,storylineState:binding?.group.storylineState,structuralRelation:binding?.group.structuralRelation,epistemicEffects:binding?.group.epistemicEffects??[],provisional:binding?.group.structuralRelation==='DEFER',provenance:binding?.provenance??{scorer:'DETERMINISTIC_FOUNDATION',policyVersion:STATE_POLICY},policyVersion:STATE_POLICY};await tx.write('event_semantic_states',state.id,state);return state;
}
export async function persistStorylineMemory(tx:FeedTransaction,version:StorylineVersion,now:string):Promise<StorylineMemory> {
 const states=(await Promise.all(version.eventVersionIds.map(id=>tx.read<EventSemanticState>('event_semantic_states',id)))).filter((s):s is EventSemanticState=>Boolean(s)),propositionIds=[...new Set(states.flatMap(s=>s.propositionIds))],props=(await Promise.all(propositionIds.map(id=>tx.read<Proposition>('propositions',id)))).filter((p):p is Proposition=>Boolean(p));
 const directive=[...states].reverse().find(s=>s.storylineState)?.storylineState;
 const openQuestions=props.filter(p=>directive?directive.openQuestionMentionIds.some(id=>p.claimMentionIds.includes(id)):/[?]|\b(uncertain|unresolved|disputed|no new date|not confirmed)\b/i.test(p.text)).map(p=>({text:p.text,propositionId:p.id}));
 const expected=props.find(p=>p.certainty.kind==='EXPECTED' && /\p{N}|\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/iu.test(p.text));
 const prior=(await tx.list<StorylineMemory>('storyline_memories')).filter(m=>m.storylineId===version.storylineId).sort((a,b)=>b.lastMeaningfulChangeAt.localeCompare(a.lastMeaningfulChangeAt))[0];
 const changed=states.some(s=>s.epistemicEffects.some(e=>['CHANGES_STATE','CHANGES_CERTAINTY','CONTRADICTS','CORRECTS','RETRACTS','ADDS_DETAIL'].includes(e)));
 const next=directive?.expectedNextDate,expectedProp=next?props.find(p=>p.claimMentionIds.includes(next.claimMentionId)):undefined;
 const memory:StorylineMemory={id:version.id,feedId:tx.snapshot.feed.id,storylineVersionId:version.id,storylineId:version.storylineId,eventVersionIds:version.eventVersionIds,propositionIds,stateSlotIds:[...new Set(states.flatMap(s=>s.stateSlotIds))],entityIds:[...new Set(states.flatMap(s=>s.entityIds))],lifecycle:directive?.lifecycle??(version.eventVersionIds.length?openQuestions.length?'WATCHING':'ACTIVE':'CLOSED'),lastMeaningfulChangeAt:prior && !changed?prior.lastMeaningfulChangeAt:now,openQuestions,expectedNextDate:next&&expectedProp?{text:next.text,propositionId:expectedProp.id}:!directive&&expected?{text:expected.text,propositionId:expected.id}:undefined,policyVersion:directive?STATE_POLICY:'deterministic-memory-foundation-v1'};await tx.write('storyline_memories',memory.id,memory);return memory;
}
