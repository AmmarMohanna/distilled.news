import {HandoffError,type EventVersion,type EventMembership,type EvidenceRevision,type NormalizedEvidenceItem} from '@distilled/contracts';
import {V1IntakeStore} from '../v1-intake/store';
import type {AcceptedInput,DownstreamJob} from '../v1-intake/types';
import {feedTransact,V1FeedStore,type FeedTransaction} from './store';
import {INTELLIGENCE_POLICY,classifyRole,duplicateSimilarity,features} from './policies';
import {deterministicMatchers,validateEventMatch,validateStorylineMatch,type IntelligenceMatchers,type EventMatchInput} from './matchers';
import {persistClaimMentions,isNewsMention,type ClaimMention} from './claims';
import {validateConstruction,persistEventSemanticState,persistStorylineMemory,type SemanticGroup,type EventSemanticState,type Proposition} from './semantic-state';
import {refreshSourceCorrectionObligations,recordCorrectionObligation,type LedgerEntry} from './ledger';
import {scheduleRematch} from './rematch';
import type {DuplicateDecision,EventRecord,IntelligenceReceipt,RoleDecision,StorylineRecord,StorylineVersion,SupportedFact} from './types';

function revisionText(revision:EvidenceRevision):string {return [revision.title,revision.body].filter(Boolean).join('\n')}
export async function eventMemberships(tx:FeedTransaction,versionId:string):Promise<EventMembership[]> {
 return (await tx.list<EventMembership>('memberships')).filter(m=>m.eventVersionId===versionId);
}
async function versionEvent(tx:FeedTransaction,event:EventRecord,revisions:EvidenceRevision[],now:string,binding?:{group:SemanticGroup;provenance:import('./matchers').MatchProvenance}):Promise<EventVersion> {
 const old=await tx.read<EventVersion>('event_versions',event.currentVersionId);
 const ordered=[...revisions].sort((a,b)=>(b.publishedAt??b.acceptedAt).localeCompare(a.publishedAt??a.acceptedAt)||a.id.localeCompare(b.id));
 if(old){
  const previous=await tx.read<EventSemanticState>('event_semantic_states',old.id),activeIds=new Set(revisions.map(r=>r.id)),surviving:string[]=[];
  for(const id of previous?.propositionIds??[]){const p=await tx.read<Proposition>('propositions',id);if(p&&p.evidenceRevisionIds.every(id=>activeIds.has(id)))surviving.push(...p.claimMentionIds)}
  if(!binding&&previous&&previous.provenance.scorer!=='DETERMINISTIC_FOUNDATION')binding={group:{claimMentionIds:[...new Set(surviving)],eventId:previous.provisional?null:event.id,storylineId:null,structuralRelation:previous.provisional?'DEFER':'SAME_EVENT',epistemicEffects:[],entities:[],slots:[]},provenance:previous.provenance};
  if(binding){
   binding.group.claimMentionIds=[...new Set([...binding.group.claimMentionIds,...surviving])];const allowed=new Set(binding.group.claimMentionIds);
   for(const id of previous?.entityIds??[]){const e=await tx.read<import('./semantic-state').Entity>('entities',id);if(e&&e.claimMentionIds.every(id=>allowed.has(id))&&!binding.group.entities.some(item=>item.canonicalLabel===e.canonicalLabel))binding.group.entities.push({canonicalLabel:e.canonicalLabel,aliases:e.aliases,claimMentionIds:e.claimMentionIds})}
   for(const id of previous?.stateSlotIds??[]){const slot=await tx.read<import('./semantic-state').StateSlot>('state_slots',id);if(slot&&allowed.has(slot.claimMentionId)&&!binding.group.slots.some(item=>item.claimMentionId===slot.claimMentionId&&item.kind===slot.attribute)){
    const e=slot.entityId?await tx.read<import('./semantic-state').Entity>('entities',slot.entityId):undefined;binding.group.slots.push({kind:slot.attribute,claimMentionId:slot.claimMentionId,entityLabel:e?.canonicalLabel??null,value:slot.value,asOf:slot.asOf??null});
   }}
  }
 }
 const exact=binding?(await tx.list<ClaimMention>('claim_mentions')).filter(m=>binding.group.claimMentionIds.includes(m.id)):[];
 const text=binding?exact.map(m=>m.sourceText).join('\n'):ordered.map(r=>r.body??r.title??'').join('\n').slice(0,2400);
 const value:EventVersion={id:crypto.randomUUID(),eventId:event.id,feedId:tx.snapshot.feed.id,version:(old?.version??0)+1,title:ordered[0]?.title??ordered[0]?.body?.slice(0,120)??old?.title,type:ordered.length?features(revisionText(ordered[0])).development:'WITHDRAWN',entities:[...new Set(ordered.flatMap(r=>features(revisionText(r)).entities))],geography:[],state:text,confidence:ordered.length?.6:0,algorithmVersion:INTELLIGENCE_POLICY,createdAt:now};
 await tx.write('event_versions',value.id,value);
 for(const r of ordered) {
  const membership:EventMembership={id:JSON.stringify([value.id,r.id]),eventVersionId:value.id,evidenceRevisionId:r.id,confidence:.6,algorithmVersion:INTELLIGENCE_POLICY,createdAt:now};
  await tx.write('memberships',membership.id,membership);
 }
 await tx.write('events',event.id,{...event,currentVersionId:value.id});await persistEventSemanticState(tx,value,now,binding);return value;
}
async function supportingRevisions(tx:FeedTransaction,event:EventRecord):Promise<EvidenceRevision[]> {
 const members=await eventMemberships(tx,event.currentVersionId),rows=await Promise.all(members.map(m=>tx.revision(m.evidenceRevisionId)));
 return rows.filter((r):r is EvidenceRevision=>Boolean(r));
}
async function updateStorylines(tx:FeedTransaction,changed:EventVersion[],now:string,matchers:IntelligenceMatchers,preferred:Map<string,string>):Promise<string[]> {
 const roots=await tx.list<StorylineRecord>('storylines'),changedIds:string[]=[];
 const groups=new Map<string,{root:StorylineRecord;old?:StorylineVersion;original:EventVersion[];events:Map<string,EventVersion>;changed:Set<string>}>();
 for(const root of roots) {
  const old=await tx.read<StorylineVersion>('storyline_versions',root.currentVersionId);
  const original=(await Promise.all((old?.eventVersionIds??[]).map(id=>tx.read<EventVersion>('event_versions',id)))).filter((e):e is EventVersion=>Boolean(e));
  groups.set(root.id,{root,old,original,events:new Map(original.map(e=>[e.eventId,e])),changed:new Set()});
 }
 for(const event of changed) {
  let group:ReturnType<typeof groups.get>;
  const input={event,candidates:[...groups.values()].map(candidate=>({id:candidate.root.id,events:[...candidate.original,...candidate.events.values()]}))};
  const known=preferred.get(event.eventId);
  const semantic=await tx.read<EventSemanticState>('event_semantic_states',event.id),forceNew=semantic?.structuralRelation==='NEW_STORYLINE' && !known;
  const decision=validateStorylineMatch(known?{relation:'CONTINUES',storylineId:known,confidence:1,provenance:{scorer:'PREPARED',policyVersion:'event-structure-continuity-v1'}}:forceNew?{relation:'NEW',confidence:1,provenance:semantic!.provenance}:matchers.storyline.match(input),input);
  if(decision.relation==='CONTINUES')group=groups.get(decision.storylineId!);
  if(!group) {
   if(event.type==='WITHDRAWN') continue;
   const root={id:crypto.randomUUID(),feedId:tx.snapshot.feed.id,currentVersionId:'',createdAt:now};
   group={root,original:[],events:new Map(),changed:new Set()};groups.set(root.id,group);
  }
  if(event.type==='WITHDRAWN') group.events.delete(event.eventId);else group.events.set(event.eventId,event);
  group.changed.add(event.id);
 }
 for(const group of groups.values()) {
  if(!group.changed.size) continue;
  const {root,old}=group,exact=[...group.events.values()];
  const facts:SupportedFact[]=[],chronology:StorylineVersion['chronology']=[];
  for(const e of exact) {
   const members=await eventMemberships(tx,e.id),revisions=await Promise.all(members.map(m=>tx.revision(m.evidenceRevisionId)));
   const first=revisions.filter((r):r is EvidenceRevision=>Boolean(r)).sort((a,b)=>(a.publishedAt??a.acceptedAt).localeCompare(b.publishedAt??b.acceptedAt))[0];
   const state=await tx.read<EventSemanticState>('event_semantic_states',e.id);
   if(state && state.provenance.scorer!=='DETERMINISTIC_FOUNDATION'){for(const id of state.propositionIds){const p=await tx.read<Proposition>('propositions',id);if(p)facts.push({text:p.text,eventVersionId:e.id,evidenceRevisionIds:p.evidenceRevisionIds})}}
   else if(first?.body) facts.push({text:first.body.slice(0,500),eventVersionId:e.id,evidenceRevisionIds:[first.id]});
   chronology.push({eventVersionId:e.id,observedAt:first?.publishedAt??e.createdAt,title:e.title??''});
  }
  chronology.sort((a,b)=>a.observedAt.localeCompare(b.observedAt)||a.eventVersionId.localeCompare(b.eventVersionId));
  const version:StorylineVersion={id:crypto.randomUUID(),storylineId:root.id,feedId:tx.snapshot.feed.id,version:(old?.version??0)+1,eventVersionIds:chronology.map(c=>c.eventVersionId),entities:[...new Set(exact.flatMap(e=>e.entities))],chronology,supportedFacts:facts,previousState:old?.currentState,currentState:facts.map(f=>f.text).join('\n'),turningPoints:facts.filter(f=>group.changed.has(f.eventVersionId)),confidence:exact.length?.6:0,algorithmVersion:INTELLIGENCE_POLICY,createdAt:now};
  await tx.write('storyline_versions',version.id,version);await tx.write('storylines',root.id,{...root,currentVersionId:version.id});
  await persistStorylineMemory(tx,version,now);
  root.currentVersionId=version.id;changedIds.push(version.id);
 }
 return changedIds;
}
/** Atomic deterministic reassessment. Feed and every source epoch fence source changes/deletions.
 * No model call, external acquisition or source checkpoint mutation occurs in this transaction. */
export async function processEvidenceIntelligence(store:V1FeedStore,jobId:string,now:string,matchers:IntelligenceMatchers=deterministicMatchers,rematchId?:string):Promise<IntelligenceReceipt> {
 const intake=new V1IntakeStore(store.db),initial=await intake.read<DownstreamJob>('jobs',jobId);
 if(!initial || initial.value.kind!=='REASSESS') throw new HandoffError('INVALID_REQUEST');
 return feedTransact(store,initial.value.feedId,async tx=>{
  const receiptId=rematchId?JSON.stringify([jobId,'REMATCH',rematchId]):jobId;
  const prior=await tx.read<IntelligenceReceipt>('intelligence_receipts',receiptId);if(prior) return prior;
  const row=await intake.read<DownstreamJob>('jobs',jobId),input=await intake.read<AcceptedInput>('inputs',initial.value.observationId);
  if(!row || !input || row.value.feedId!==tx.snapshot.feed.id || input.value.observation.feedId!==tx.snapshot.feed.id || row.feedSourceId!==input.feedSourceId) throw new HandoffError('SCOPE_DENIED');
  const job=row.value,o=input.value.observation,active=await store.currentEvidence(o.feedId);
  const current=await intake.read<NormalizedEvidenceItem>('evidence',JSON.stringify([o.feedSourceId,o.sourceItemKey]));
  const receipt:IntelligenceReceipt={id:receiptId,feedId:o.feedId,observationId:o.id,decision:'STALE',eventVersionIds:[],storylineVersionIds:[],computedAt:now};
  const target=active.find(r=>r.item.id===current?.value.id);
  // Identical-content replay may advance the observation watermark without emitting a new reassessment job.
  if(!current || (target?target.revision.sourceObservationId!==o.id:current.value.currentObservationId!==o.id)) {await tx.write('intelligence_receipts',receiptId,receipt);tx.completeJob(job);return receipt}
  const events=await tx.list<EventRecord>('events'),changed:EventVersion[]=[];
  const preferredStorylines=new Map<string,string>();
  let selected:EventRecord|undefined;
  const selectedEvents:EventRecord[]=[],bindings=new Map<string,{group:SemanticGroup;provenance:import('./matchers').MatchProvenance}>();
  if(target) {
   await persistClaimMentions(tx,target.revision);
   const text=revisionText(target.revision),classification=classifyRole(text);
   const roleId=JSON.stringify([target.revision.id,INTELLIGENCE_POLICY]);
   const savedRole=await tx.read<RoleDecision>('roles',roleId);
   const role:RoleDecision=savedRole??{id:roleId,feedId:o.feedId,evidenceId:target.item.id,evidenceRevisionId:target.revision.id,...classification,policyVersion:INTELLIGENCE_POLICY,computedAt:now};
   if(!savedRole)await tx.write('roles',role.id,role);
   const savedDuplicate=await tx.read<DuplicateDecision>('duplicates',role.id);
   const duplicate:DuplicateDecision=savedDuplicate??{id:role.id,feedId:o.feedId,evidenceRevisionId:target.revision.id,kind:'UNIQUE',similarity:0,policyVersion:INTELLIGENCE_POLICY,computedAt:now};
   if(!savedDuplicate)for(const other of active) {
    if(other.revision.id===target.revision.id) continue;
    if(other.item.id===target.item.id) continue;
    // A representative must already have an immutable decision. Feed serialization
    // fixes first-processed identity even when acceptance timestamps tie; no cycles.
    if(!await tx.read<DuplicateDecision>('duplicates',JSON.stringify([other.revision.id,INTELLIGENCE_POLICY]))) continue;
    const similarity=duplicateSimilarity(text,revisionText(other.revision));
    const sameDevelopment=features(text).development===features(revisionText(other.revision)).development;
    if(target.revision.contentHash===other.revision.contentHash || similarity>=.9 && sameDevelopment) {duplicate.kind=target.revision.contentHash===other.revision.contentHash?'EXACT':'NEAR';duplicate.similarity=similarity;duplicate.duplicateOfRevisionId=other.revision.id;break}
   }
   if(!savedDuplicate)await tx.write('duplicates',duplicate.id,duplicate);
   const candidates:EventMatchInput['candidates']=[];
    for(const event of events) {
     const version=await tx.read<EventVersion>('event_versions',event.currentVersionId);if(!version || version.type==='WITHDRAWN') continue;
     const members=await eventMemberships(tx,version.id);
     const revisions=await supportingRevisions(tx,event);
     const newest=revisions.map(r=>r.publishedAt??r.acceptedAt).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)??version.createdAt;
     candidates.push({id:event.id,version,evidenceRevisionIds:members.map(m=>m.evidenceRevisionId),newestAt:newest});
    }
   const storylineRoots=await tx.list<StorylineRecord>('storylines');
   const matchInput={revision:target.revision,role:role.role,duplicateOfRevisionId:duplicate.duplicateOfRevisionId,candidates,storylineIds:storylineRoots.map(s=>s.id),storylineVersions:Object.fromEntries(storylineRoots.map(s=>[s.id,s.currentVersionId]))};
   const decision=validateEventMatch(matchers.event.match(matchInput),matchInput);
   receipt.semanticDeferred=decision.structuralRelation==='DEFER'&&decision.provenance.scorer!=='DETERMINISTIC';
   if(decision.structuralRelation==='SAME_EVENT')selected=events.find(e=>e.id===decision.eventId);
   else if(decision.structuralRelation!=='DEFER')selected={id:crypto.randomUUID(),feedId:o.feedId,currentVersionId:'',createdAt:now};
   else if(decision.provenance.scorer!=='DETERMINISTIC'){
    // Uncertain evidence remains a conservative provisional Event. Its normal
    // REASSESS job completes; semantic repair is separate nonblocking work.
    const existing=events.find(e=>candidates.find(c=>c.id===e.id)?.evidenceRevisionIds.includes(target.revision.id));
    selected=existing??{id:crypto.randomUUID(),feedId:o.feedId,currentVersionId:'',createdAt:now};
    await scheduleRematch(tx,jobId,target.revision.id,now);
   }
   if(selected && decision.storylineId)preferredStorylines.set(selected.id,decision.storylineId);
   const construction=matchers.construction?.(matchInput);
   if(construction){
    if(construction.groups.some(group=>group.structuralRelation==='DEFER')){receipt.semanticDeferred=true;await scheduleRematch(tx,jobId,target.revision.id,now)}
    if(construction.originDependencyLabel){const id=JSON.stringify([target.revision.id,construction.provenance.judgmentId??construction.provenance.policyVersion]);await tx.write('source_origins',id,{id,feedId:o.feedId,evidenceRevisionId:target.revision.id,dependencyLabel:construction.originDependencyLabel,provenance:construction.provenance,policyVersion:'information-origin-v1'})}
    const mentions=(await tx.list<ClaimMention>('claim_mentions')).filter(m=>m.evidenceRevisionId===target.revision.id);validateConstruction(construction,mentions.filter(isNewsMention));
    for(const group of construction.groups){
     const d=validateEventMatch({structuralRelation:group.structuralRelation,eventId:group.eventId??undefined,storylineId:group.storylineId??undefined,epistemicEffects:group.epistemicEffects,confidence:decision.confidence,provenance:construction.provenance},matchInput);
     const root=d.structuralRelation==='SAME_EVENT'?events.find(e=>e.id===d.eventId)!:{id:crypto.randomUUID(),feedId:o.feedId,currentVersionId:'',createdAt:now};
     if(selectedEvents.some(e=>e.id===root.id))throw new HandoffError('SCOPE_DENIED');selectedEvents.push(root);bindings.set(root.id,{group:structuredClone(group),provenance:construction.provenance});
     if(d.storylineId)preferredStorylines.set(root.id,d.storylineId);
    }
   }else if(selected){selectedEvents.push(selected);if(decision.provenance.scorer!=='DETERMINISTIC')bindings.set(selected.id,{group:{claimMentionIds:(await tx.list<ClaimMention>('claim_mentions')).filter(m=>m.evidenceRevisionId===target.revision.id).map(m=>m.id),structuralRelation:decision.structuralRelation,eventId:decision.eventId??null,storylineId:decision.storylineId??null,epistemicEffects:decision.epistemicEffects,entities:[],slots:[]},provenance:decision.provenance})}
  }
  // Replace old support from this stable evidence identity, including reassignment/withdrawal.
  for(const event of events) {
   const previous=await supportingRevisions(tx,event),removed=previous.filter(r=>r.evidenceId!==current.value.id);
   if(removed.length!==previous.length && !selectedEvents.some(e=>e.id===event.id)) changed.push(await versionEvent(tx,event,removed,now));
  }
  for(const selected of selectedEvents)if(target) {
   const previous=selected.currentVersionId?await supportingRevisions(tx,selected):[];
   changed.push(await versionEvent(tx,selected,[...previous.filter(r=>r.evidenceId!==target.item.id),target.revision],now,bindings.get(selected.id)));
  }
  receipt.decision=target?'PROCESSED':'WITHDRAWN';receipt.eventVersionIds=changed.map(e=>e.id);receipt.storylineVersionIds=await updateStorylines(tx,changed,now,matchers,preferredStorylines);
  await refreshSourceCorrectionObligations(tx,now);
  for(const [eventId,binding] of bindings)for(const entry of await tx.list<LedgerEntry>('ledger_entries'))if(entry.eventIds.includes(eventId) || preferredStorylines.has(eventId) && entry.storylineIds.includes(preferredStorylines.get(eventId)!)){
   const trigger=binding.provenance.judgmentId??target?.revision.id??jobId;
   if(binding.group.epistemicEffects.includes('CONTRADICTS'))await recordCorrectionObligation(tx,entry,'CONTRADICTED',trigger,now);
   if(binding.group.epistemicEffects.includes('CORRECTS'))await recordCorrectionObligation(tx,entry,'CORRECTED',trigger,now);
   if(binding.group.epistemicEffects.includes('RETRACTS'))await recordCorrectionObligation(tx,entry,'RETRACTED',trigger,now);
  }
  await tx.write('intelligence_receipts',receiptId,receipt);tx.completeJob(job);return receipt;
 });
}
