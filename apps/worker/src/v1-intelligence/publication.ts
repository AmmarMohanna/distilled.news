import {HandoffError,sha256,type BriefingCandidate,type EventVersion,type EventMembership,type EvidenceRevision} from '@distilled/contracts';
import {z} from 'zod';
import {canonicalJson} from '../v1-intake/canonical';
import {feedTransact,V1FeedStore,type FeedTransaction} from './store';
import type {SelectionRecord} from './scoring';
import {communicationFingerprint,boundedEditorialContext,type EditorialDecision} from './editorial';
import type {EventRecord,FeedRecord,StorylineRecord,StorylineVersion} from './types';

export interface ClaimSupport {evidenceRevisionId:string;quote:string}
export interface DraftClaim {text:string;support:ClaimSupport[]}
export interface BriefingDraft {language:string;stories:{candidateId:string;claims:DraftClaim[]}[]}
export interface ModelUsage {tokensIn:number;tokensOut:number;cost:number;confirmed:boolean}
export interface SynthesisInput {feed:Pick<FeedRecord,'id'|'revision'|'title'|'interests'|'outputLanguage'>;selectionId:string;window?:SelectionRecord['window'];stories:{candidate:BriefingCandidate;eventVersions:EventVersion[];storylineVersion?:StorylineVersion;editorial?:EditorialDecision;evidence:(EvidenceRevision & {excerptTruncated:boolean})[]}[]}
export interface VerificationClaim {id:string;text:string;support:ClaimSupport[];context:{evidenceRevisionId:string;title?:string;text:string;truncated:boolean}[]}
export interface BriefingModelPort {
 model:string;provider:string;maxCallCostUsd:number;
 synthesize(input:SynthesisInput,limits:{maxOutputTokens:number;signal:AbortSignal}):Promise<{draft:BriefingDraft;usage:ModelUsage}>;
 verify?(claims:VerificationClaim[],limits:{maxOutputTokens:number;signal:AbortSignal}):Promise<{supportedClaimIds:string[];usage:ModelUsage}>;
}
interface PublicationJob {id:string;feedId:string;selectionId:string;state:'PENDING'|'RUNNING'|'DONE'|'FAILED';attempts:number;token:string;leaseUntil:string;callsUsed:number;tokensIn:number;tokensOut:number;cost:number;pendingCall?:string;failure?:string}
interface StoredDraft {id:string;feedId:string;draft:BriefingDraft;model:string;provider:string;createdAt:string}
interface GroundedClaim extends DraftClaim {id:string}
interface GroundingResult {id:string;feedId:string;stories:{candidateId:string;claims:GroundedClaim[]}[];rejectedClaims:number;policyVersion:string;createdAt:string}
export interface BriefingEditionRecord {
 id:string;feedId:string;feedRevision:number;windowStart:string;windowEnd:string;language:string;selectionId:string;
 selectedCandidateIds:string[];eventVersionIds:string[];storylineVersionIds:string[];evidenceRevisionIds:string[];
 stories:{candidateId:string;claims:GroundedClaim[]}[];
 generation:{model:string;provider:string;promptVersion:string;routerVersion:string;tokensIn:number;tokensOut:number;cost:number;latencyMs:number;usageConfirmed:boolean};
 selectionPolicyVersion:string;groundingPolicyVersion:string;createdAt:string;
}
const draftSchema=z.object({language:z.string().min(1),stories:z.array(z.object({candidateId:z.string().min(1),claims:z.array(z.object({text:z.string().min(1).max(1000),support:z.array(z.object({evidenceRevisionId:z.string().min(1),quote:z.string().min(1).max(1800)}).strict()).min(1).max(3)}).strict()).max(4)}).strict()).max(20)}).strict();
const usageSchema=z.object({tokensIn:z.number().int().nonnegative(),tokensOut:z.number().int().nonnegative(),cost:z.number().finite().nonnegative(),confirmed:z.boolean()}).strict();
const normalize=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
async function assertCommunicationCurrent(tx:FeedTransaction,selection:SelectionRecord):Promise<void> {
 if(selection.communicationFingerprint && selection.communicationFingerprint!==await communicationFingerprint(tx,selection.window.end)) throw new HandoffError('TEMPORARY_UNAVAILABLE');
}
async function selectionInput(tx:FeedTransaction,selection:SelectionRecord):Promise<SynthesisInput> {
 if(selection.feedRevision!==tx.snapshot.feed.revision) throw new HandoffError('SCOPE_DENIED');
 await assertCommunicationCurrent(tx,selection);
 const active=new Set((await tx.store.currentEvidence(tx.snapshot.feed.id)).map(e=>e.revision.id)),stories:SynthesisInput['stories']=[];
 const roots=await tx.list<EventRecord>('events'),storylines=await tx.list<StorylineRecord>('storylines'),memberships=await tx.list<EventMembership>('memberships');
 let inspected=0;
 for(const id of selection.selectedCandidateIds) {
  const candidate=await tx.read<BriefingCandidate>('candidates',id);
  if(!candidate || candidate.feedId!==tx.snapshot.feed.id || candidate.feedRevision!==selection.feedRevision || candidate.selectionState!=='SELECTED') throw new HandoffError('SCOPE_DENIED');
  let storyline:StorylineVersion|undefined,versionIds:string[];
  if(candidate.targetType==='EVENT') {if(!roots.some(r=>r.currentVersionId===candidate.targetVersionId)) throw new HandoffError('SCOPE_DENIED');versionIds=[candidate.targetVersionId]}
  else {if(!storylines.some(r=>r.currentVersionId===candidate.targetVersionId)) throw new HandoffError('SCOPE_DENIED');storyline=await tx.read<StorylineVersion>('storyline_versions',candidate.targetVersionId);if(!storyline) throw new HandoffError('SCOPE_DENIED');versionIds=storyline.eventVersionIds}
  const eventVersions:EventVersion[]=[];
  for(const versionId of versionIds) {
   const version=await tx.read<EventVersion>('event_versions',versionId);
   if(!version || version.type==='WITHDRAWN' || !roots.some(r=>r.currentVersionId===versionId)) throw new HandoffError('SCOPE_DENIED');
   const support=memberships.filter(m=>m.eventVersionId===versionId);
   if(!support.length || support.some(m=>!active.has(m.evidenceRevisionId))) throw new HandoffError('SCOPE_DENIED');eventVersions.push({...version,state:version.state.slice(0,1800)});
  }
  const permitted=new Set(memberships.filter(m=>versionIds.includes(m.eventVersionId)).map(m=>m.evidenceRevisionId)),evidence:SynthesisInput['stories'][number]['evidence']=[];
  for(const revisionId of selection.evidenceByCandidate[id]??[]) {
   if(!permitted.has(revisionId) || !active.has(revisionId)) throw new HandoffError('SCOPE_DENIED');
   const revision=await tx.revision(revisionId);if(!revision?.body) throw new HandoffError('INVALID_REQUEST');
   evidence.push({...revision,excerptTruncated:false});inspected++;
  }
  if(!evidence.length) throw new HandoffError('INVALID_REQUEST');
  const editorial=selection.editorialByCandidate?.[id];
  stories.push({candidate,eventVersions,editorial:editorial?boundedEditorialContext(editorial):undefined,storylineVersion:storyline?{...storyline,currentState:storyline.currentState.slice(0,1800),previousState:storyline.previousState?.slice(0,1000),supportedFacts:storyline.supportedFacts.slice(0,10),turningPoints:storyline.turningPoints.slice(0,10)}:undefined,evidence});
 }
 if(inspected>selection.budget.maxEvidenceInspections || stories.length>selection.budget.maxStories) throw new HandoffError('INVALID_REQUEST');
 const f=tx.snapshot.feed;return {feed:{id:f.id,revision:f.revision,title:f.title,interests:f.interests,outputLanguage:f.outputLanguage},selectionId:selection.id,window:selection.window,stories};
}
function extractiveDraft(input:SynthesisInput):BriefingDraft {
 if(input.stories.some(s=>s.evidence.length>4 || s.evidence.some(e=>e.language!==input.feed.outputLanguage || e.excerptTruncated || e.body!.trim().length>600))) throw new HandoffError('TEMPORARY_UNAVAILABLE');
 return {language:input.feed.outputLanguage,stories:input.stories.map(s=>{
  return {candidateId:s.candidate.id,claims:s.evidence.flatMap(revision=>{
   const quote=revision.body!.trim();return quote?[{text:quote,support:[{evidenceRevisionId:revision.id,quote}]}]:[];
  })};
 })};
}
async function requireJob(tx:FeedTransaction,id:string,token:string,now:string):Promise<PublicationJob> {
 const job=await tx.read<PublicationJob>('synthesis_jobs',id);
 if(!job || job.state!=='RUNNING' || job.token!==token || Date.parse(job.leaseUntil)<=Date.parse(now)) throw new HandoffError('TEMPORARY_UNAVAILABLE');return job;
}
/** The port gets selected stored objects only. Durable call intents consume budget before any provider call. */
export async function publishSelection(store:V1FeedStore,feedId:string,selectionId:string,options:{now():string;model?:BriefingModelPort}):Promise<BriefingEditionRecord> {
 const selection=await store.read<SelectionRecord>(feedId,'selections',selectionId);if(!selection) throw new HandoffError('INVALID_REQUEST');
 const editionId=await sha256(canonicalJson({feedId,start:selection.window.start,end:selection.window.end}));
 const published=await store.read<BriefingEditionRecord>(feedId,'editions',editionId);if(published) return published;
 if(!selection.selectedCandidateIds.length) throw new HandoffError('INVALID_REQUEST');
 const started=Date.now(),token=crypto.randomUUID();
 const claimed=await feedTransact(store,feedId,async tx=>{
  const edition=await tx.read<BriefingEditionRecord>('editions',editionId);if(edition) return {edition};
  const prior=await tx.read<PublicationJob>('synthesis_jobs',editionId),now=options.now();
  if(prior?.state==='DONE') throw new HandoffError('INVALID_REQUEST');
  if(prior && prior.selectionId!==selectionId) {
   const old=await tx.read<SelectionRecord>('selections',prior.selectionId);
   // A known, settled call may be superseded after publication history changes.
   // Keep its consumed budget and attempts; unknown outcomes never reopen.
   if(prior.state!=='PENDING' || !old?.communicationFingerprint || old.communicationFingerprint===selection.communicationFingerprint || old.feedRevision!==selection.feedRevision || canonicalJson(old.budget)!==canonicalJson(selection.budget)) throw new HandoffError('INVALID_REQUEST');
  }
  if(prior?.state==='RUNNING' && Date.parse(prior.leaseUntil)>Date.parse(now)) throw new HandoffError('TEMPORARY_UNAVAILABLE');
  if(prior?.pendingCall || (prior?.attempts??0)>=5 || prior?.state==='FAILED') throw new HandoffError('INVALID_REQUEST');
  const input=await selectionInput(tx,selection);
  const job:PublicationJob={id:editionId,feedId,selectionId,state:'RUNNING',attempts:(prior?.attempts??0)+1,token,leaseUntil:new Date(Date.parse(now)+selection.budget.maxWallClockMs).toISOString(),callsUsed:prior?.callsUsed??0,tokensIn:prior?.tokensIn??0,tokensOut:prior?.tokensOut??0,cost:prior?.cost??0};
  await tx.write('synthesis_jobs',editionId,job);return {input,authorizationScopes:tx.snapshot.scopes};
 });
 if(claimed.edition) return claimed.edition;
 const input=claimed.input!;
 const authorizationScopes=canonicalJson(claimed.authorizationScopes!);
 const callModel=async<T extends {usage:ModelUsage}>(phase:string,payload:unknown,execute:(limits:{maxOutputTokens:number;signal:AbortSignal})=>Promise<T>):Promise<T>=>{
  const model=options.model!;
  const intent=await feedTransact(store,feedId,async tx=>{
   if(canonicalJson(tx.snapshot.scopes)!==authorizationScopes) await selectionInput(tx,selection);
   await assertCommunicationCurrent(tx,selection);
   const job=await requireJob(tx,editionId,token,options.now()),bytes=new TextEncoder().encode(JSON.stringify(payload)).length;
   if(!Number.isFinite(model.maxCallCostUsd) || model.maxCallCostUsd<0 || job.callsUsed>=selection.budget.maxModelCalls || job.cost+model.maxCallCostUsd>selection.budget.maxCostUsd || job.tokensIn+bytes>selection.budget.maxInputTokens || job.tokensOut>=selection.budget.maxOutputTokens) throw new HandoffError('INVALID_REQUEST');
   const id=crypto.randomUUID(),remaining=selection.budget.maxOutputTokens-job.tokensOut;
   await tx.write('model_intents',id,{id,feedId,editionId,selectionId,phase,model:model.model,provider:model.provider,reservedCost:model.maxCallCostUsd,reservedInputTokens:bytes,reservedOutputTokens:remaining,createdAt:options.now()});
   await tx.write('synthesis_jobs',editionId,{...job,callsUsed:job.callsUsed+1,cost:job.cost+model.maxCallCostUsd,tokensIn:job.tokensIn+bytes,tokensOut:job.tokensOut+remaining,pendingCall:id});
   return {id,bytes,remaining,previous:job};
  });
  const callStarted=Date.now(),signal=AbortSignal.timeout(Math.max(1,selection.budget.maxWallClockMs-(Date.now()-started)));
  let result:T;
  try {result=await Promise.race([execute({maxOutputTokens:intent.remaining,signal}),new Promise<never>((_,reject)=>signal.addEventListener('abort',()=>reject(new HandoffError('TEMPORARY_UNAVAILABLE')),{once:true}))])}
  catch {throw new HandoffError('TEMPORARY_UNAVAILABLE')}
  const usage=usageSchema.safeParse(result.usage);if(!usage.success || usage.data.tokensOut>intent.remaining || usage.data.tokensIn>selection.budget.maxInputTokens || usage.data.cost>model.maxCallCostUsd) throw new HandoffError('INVALID_REQUEST');
  await feedTransact(store,feedId,async tx=>{
   const job=await requireJob(tx,editionId,token,options.now());if(job.pendingCall!==intent.id) throw new HandoffError('TEMPORARY_UNAVAILABLE');
   const actual=usage.data.confirmed?usage.data:{tokensIn:intent.bytes,tokensOut:intent.remaining,cost:model.maxCallCostUsd,confirmed:false};
   await tx.write('model_executions',intent.id,{id:intent.id,feedId,editionId,phase,model:model.model,provider:model.provider,status:'SUCCEEDED',...actual,latencyMs:Date.now()-callStarted,createdAt:options.now()});
   // Persist the usable provider result in the same commit as settlement. A crash
   // after settlement must never require another paid synthesis/verification call.
   if(phase==='SYNTHESIS') {
    const parsed=draftSchema.safeParse((result as T & {draft?:unknown}).draft);
    if(!parsed.success || parsed.data.language!==input.feed.outputLanguage) throw new HandoffError('INVALID_REQUEST');
    await tx.write('drafts',selectionId,{id:selectionId,feedId,draft:parsed.data,model:model.model,provider:model.provider,createdAt:options.now()});
   } else if(phase==='GROUNDING') {
    const ids=z.array(z.string().min(1)).max(80).safeParse((result as T & {supportedClaimIds?:unknown}).supportedClaimIds);
    if(!ids.success) throw new HandoffError('INVALID_REQUEST');
    await tx.write('verification_results',selectionId,{id:selectionId,feedId,supportedClaimIds:ids.data,createdAt:options.now()});
   }
   await tx.write('synthesis_jobs',editionId,{...job,pendingCall:undefined,cost:intent.previous.cost+actual.cost,tokensIn:intent.previous.tokensIn+actual.tokensIn,tokensOut:intent.previous.tokensOut+actual.tokensOut});
  });return result;
 };
 try {
  let storedDraft=await store.read<StoredDraft>(feedId,'drafts',selectionId);
  if(!storedDraft) {
   if(options.model) {await callModel('SYNTHESIS',input,limits=>options.model!.synthesize(input,limits));storedDraft=await store.read<StoredDraft>(feedId,'drafts',selectionId)}
   else {
    storedDraft={id:selectionId,feedId,draft:extractiveDraft(input),model:'deterministic-extractive-v1',provider:'NONE',createdAt:options.now()};
    const value=storedDraft;await feedTransact(store,feedId,async tx=>{await requireJob(tx,editionId,token,options.now());await tx.write('drafts',selectionId,value)});
   }
  }
  if(!storedDraft) throw new HandoffError('TEMPORARY_UNAVAILABLE');
  let grounding=await store.read<GroundingResult>(feedId,'grounding_results',selectionId);
  if(!grounding) {
   const candidates=new Map(input.stories.map(s=>[s.candidate.id,s])),proposals:{candidateId:string;claim:GroundedClaim;exact:boolean}[]=[];let rejected=0;
   const seenStories=new Set<string>();
   for(const story of storedDraft.draft.stories) {
    const candidate=candidates.get(story.candidateId);if(!candidate || seenStories.has(story.candidateId)) {rejected+=story.claims.length;continue}seenStories.add(story.candidateId);
    for(const claim of story.claims) {
     const valid=claim.support.every(s=>candidate.evidence.some(e=>e.id===s.evidenceRevisionId && (normalize(e.body??'').includes(normalize(s.quote)) || normalize(e.title??'')===normalize(s.quote))));
     if(!valid) {rejected++;continue}
     // Only the runtime's full-context extractive fallback can bypass entailment.
     // A model-selected exact quote may be embedded in a refutation or warning.
     const exact=storedDraft.provider==='NONE' && claim.support.some(s=>normalize(s.quote)===normalize(claim.text) && candidate.evidence.some(e=>e.id===s.evidenceRevisionId && !e.excerptTruncated && normalize(e.body??'')===normalize(s.quote)));
     proposals.push({candidateId:story.candidateId,claim:{id:await sha256(canonicalJson({candidate:story.candidateId,claim})),...claim},exact});
    }
   }
   const nonextractive=proposals.filter(p=>!p.exact),supported=new Set(proposals.filter(p=>p.exact).map(p=>p.claim.id));
   if(nonextractive.length && options.model?.verify) {
    let result=await store.read<{supportedClaimIds:string[]}>(feedId,'verification_results',selectionId);
    if(!result) {const claims:VerificationClaim[]=nonextractive.map(p=>({...p.claim,context:candidates.get(p.candidateId)!.evidence.filter(e=>p.claim.support.some(s=>s.evidenceRevisionId===e.id)).map(e=>({evidenceRevisionId:e.id,title:e.title,text:e.body??'',truncated:e.excerptTruncated}))}));await callModel('GROUNDING',claims,limits=>options.model!.verify!(claims,limits));result=await store.read(feedId,'verification_results',selectionId)}
    for(const id of result?.supportedClaimIds??[]) if(nonextractive.some(p=>p.claim.id===id)) supported.add(id);
   }
   const stories:GroundingResult['stories']=[];let words=0;
   for(const id of selection.selectedCandidateIds) {
    const claims:GroundedClaim[]=[];
    for(const p of proposals.filter(p=>p.candidateId===id)) {
     const count=(p.claim.text.match(/\S+/g)??[]).length;
     if(supported.has(p.claim.id) && words+count<=selection.budget.maxReadingWords) {claims.push(p.claim);words+=count}else rejected++;
    }if(claims.length) stories.push({candidateId:id,claims});
   }
   grounding={id:selectionId,feedId,stories,rejectedClaims:rejected,policyVersion:'quotes-and-entailment-v1',createdAt:options.now()};
   const value=grounding;await feedTransact(store,feedId,async tx=>{await requireJob(tx,editionId,token,options.now());await tx.write('grounding_results',selectionId,value)});
  }
  if(selection.selectedCandidateIds.length && !grounding.stories.length) throw new HandoffError('INVALID_REQUEST');
  const finalDraft=storedDraft,finalGrounding=grounding;
  return await feedTransact(store,feedId,async tx=>{
   const existing=await tx.read<BriefingEditionRecord>('editions',editionId);if(existing) return existing;
   const job=await requireJob(tx,editionId,token,options.now());await selectionInput(tx,selection);
   const usedCandidates=finalGrounding.stories.map(s=>s.candidateId),selected=input.stories.filter(s=>usedCandidates.includes(s.candidate.id));
   const eventVersionIds=[...new Set(selected.flatMap(s=>s.eventVersions.map(v=>v.id)))],storylineVersionIds=selected.flatMap(s=>s.storylineVersion?[s.storylineVersion.id]:[]);
   const evidenceRevisionIds=[...new Set((await tx.list<EventMembership>('memberships')).filter(m=>eventVersionIds.includes(m.eventVersionId)).map(m=>m.evidenceRevisionId))];
   if(job.tokensIn>selection.budget.maxInputTokens || job.tokensOut>selection.budget.maxOutputTokens || job.cost>selection.budget.maxCostUsd || Date.now()-started>selection.budget.maxWallClockMs) throw new HandoffError('INVALID_REQUEST');
   const edition:BriefingEditionRecord={id:editionId,feedId,feedRevision:selection.feedRevision,windowStart:selection.window.start,windowEnd:selection.window.end,language:input.feed.outputLanguage,selectionId,selectedCandidateIds:usedCandidates,eventVersionIds,storylineVersionIds,evidenceRevisionIds,stories:finalGrounding.stories,generation:{model:finalDraft.model,provider:finalDraft.provider,promptVersion:'selected-evidence-v1',routerVersion:'stored-evidence-only-v1',tokensIn:job.tokensIn,tokensOut:job.tokensOut,cost:job.cost,latencyMs:Date.now()-started,usageConfirmed:(await tx.list<{id:string;editionId:string;confirmed:boolean}>('model_executions')).filter(e=>e.editionId===editionId).every(e=>e.confirmed)},selectionPolicyVersion:selection.policyVersion,groundingPolicyVersion:finalGrounding.policyVersion,createdAt:options.now()};
   await tx.write('editions',editionId,edition);await tx.write('publication_status',editionId,{id:editionId,feedId,status:'PUBLISHED',publishedAt:edition.createdAt});
   await tx.write('delivery_jobs',editionId,{id:editionId,feedId,editionId,state:'PENDING',attempts:0,createdAt:edition.createdAt});
   await tx.write('synthesis_jobs',editionId,{...job,state:'DONE'});return edition;
  });
 } catch(error) {
  try {await feedTransact(store,feedId,async tx=>{
   const job=await tx.read<PublicationJob>('synthesis_jobs',editionId);
   if(job?.state==='RUNNING' && job.token===token) {
    const transient=error instanceof HandoffError && error.code==='TEMPORARY_UNAVAILABLE' && !job.pendingCall && job.attempts<5;
    if(job.pendingCall) await tx.write('model_executions',job.pendingCall,{id:job.pendingCall,feedId,editionId,status:'OUTCOME_UNKNOWN',confirmed:false,reservationRetained:true,createdAt:options.now()});
    await tx.write('synthesis_jobs',editionId,{...job,state:transient?'PENDING':'FAILED',failure:job.pendingCall?'MODEL_OUTCOME_UNKNOWN':error instanceof HandoffError?error.code:'SYNTHESIS_FAILED'});
   }
  })} catch { /* A revoked Feed already prevents recovery/publication. */ }
  if(error instanceof HandoffError) throw error;throw new HandoffError('TEMPORARY_UNAVAILABLE');
 }
}
