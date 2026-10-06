import {HandoffError,sha256,type BriefingCandidate,type EventVersion,type EventMembership,type EvidenceRevision} from '@distilled/contracts';
import {z} from 'zod';
import {V1IntakeStore} from '../v1-intake/store';
import type {AcceptedInput} from '../v1-intake/types';
import {extractiveLanguageCompatibility,SynthesisCompatibilityError} from './language';
import {canonicalJson} from '../v1-intake/canonical';
import {feedTransact,V1FeedStore,type FeedTransaction} from './store';
import type {SelectionRecord} from './scoring';
import {communicationFingerprint,boundedEditorialContext,supportedSentences,equivalentFact,type EditorialDecision} from './editorial';
import type {EventRecord,FeedRecord,StorylineRecord,StorylineVersion} from './types';
import type {EditorialPlanRecord,PlanStory} from './editorial-plan';
import type {ShortlistRecord,ShortlistFact} from './shortlist';
import {checkReaderFidelity,verifiedCorrectionDelivery,faithfulFact,hasReaderWitness,type SemanticFactCheck} from './fidelity';
import {DraftVerificationError,inspectWriterDraft,type WriterFeedback,type WriterIssue} from './writer-feedback';

export interface ClaimSupport {evidenceRevisionId:string;quote:string}
export interface DraftClaim {text:string;support:ClaimSupport[];communicatedFactIds?:string[]}
export interface BriefingDraft {language:string;stories:{candidateId:string;claims:DraftClaim[]}[]}
export interface ModelUsage {tokensIn:number;tokensOut:number;cost:number;confirmed:boolean}
export interface SelectedPlanStory extends PlanStory {facts:ShortlistFact[];previousLedgerEntries:ShortlistRecord['ledger'];correctionObligations:ShortlistRecord['obligations']}
export interface SynthesisInput {feed:Pick<FeedRecord,'id'|'revision'|'title'|'interests'|'outputLanguage'>;selectionId:string;window?:SelectionRecord['window'];editorialPlan?:{id:string;route:EditorialPlanRecord['route']};stories:{candidate:BriefingCandidate;eventVersions:EventVersion[];storylineVersion?:StorylineVersion;editorial?:EditorialDecision;plan?:SelectedPlanStory;evidence:(EvidenceRevision & {excerptTruncated:boolean;publisherId?:string})[]}[]}
export interface PreservationFact {id:string;text:string;evidenceRevisionIds:string[];attribution?:string}
export interface ApprovedWriterFact extends ShortlistFact {support:ClaimSupport[]}
export type WriterFact=Omit<ApprovedWriterFact,'claimMentionIds'|'evidenceRevisionIds'|'propositionId'>;
export interface SynthesisWriterInput {feed:SynthesisInput['feed'];selectionId:string;window?:SynthesisInput['window'];editorialPlan?:SynthesisInput['editorialPlan'];stories:{candidate:Pick<BriefingCandidate,'id'|'targetType'|'targetVersionId'>;plan?:Omit<SelectedPlanStory,'facts'>;editorial?:EditorialDecision;approvedFacts?:WriterFact[];approvedSpans?:ClaimSupport[];evidence:{id:string;body?:string;language?:string;publisherId?:string}[]}[]}
export interface VerificationClaim {id:string;candidateId?:string;text:string;support:ClaimSupport[];context:{evidenceRevisionId:string;title?:string;text:string;truncated:boolean;publisherId?:string}[];requiredFacts?:PreservationFact[];allowedFacts?:PreservationFact[];previousLedgerFacts?:string[];newUnderstandingFacts?:PreservationFact[];correctionObligations?:ShortlistRecord['obligations']}
export interface BriefingModelPort {
 model:string;provider:string;maxCallCostUsd:number;promptVersion?:string;
 synthesize(input:SynthesisWriterInput,limits:{maxOutputTokens:number;signal:AbortSignal}):Promise<{draft:BriefingDraft;usage:ModelUsage}>;
 synthesisPayload?(input:SynthesisWriterInput):unknown;
 repair?(input:SynthesisWriterInput,draft:BriefingDraft,feedback:WriterFeedback,limits:{maxOutputTokens:number;signal:AbortSignal}):Promise<{draft:BriefingDraft;usage:ModelUsage}>;
 repairPayload?(input:SynthesisWriterInput,draft:BriefingDraft,feedback:WriterFeedback):unknown;
 verificationPayload?(claims:VerificationClaim[]):unknown;
 verify?(claims:VerificationClaim[],limits:{maxOutputTokens:number;signal:AbortSignal}):Promise<{supportedClaimIds:string[];preservedFactIds?:string[];addressedCorrectionObligationIds?:string[];novelFactIds?:string[];semanticChecks?:SemanticFactCheck[];usage:ModelUsage}>;
}
interface PublicationJob {id:string;feedId:string;selectionId:string;state:'PENDING'|'RUNNING'|'DONE'|'FAILED';attempts:number;token:string;leaseUntil:string;callsUsed:number;tokensIn:number;tokensOut:number;cost:number;pendingCall?:string;repairRequested?:boolean;failure?:string}
interface StoredDraft {id:string;feedId:string;draft:BriefingDraft;model:string;provider:string;promptVersion?:string;createdAt:string}
interface GroundedClaim extends DraftClaim {id:string}
interface GroundingResult {id:string;feedId:string;stories:{candidateId:string;claims:GroundedClaim[]}[];rejectedClaims:number;policyVersion:string;createdAt:string}
export interface BriefingEditionRecord {
 id:string;feedId:string;feedRevision:number;windowStart:string;windowEnd:string;language:string;selectionId:string;
 selectedCandidateIds:string[];eventVersionIds:string[];storylineVersionIds:string[];evidenceRevisionIds:string[];
 stories:{candidateId:string;claims:GroundedClaim[]}[];
 generation:{model:string;provider:string;promptVersion:string;routerVersion:string;tokensIn:number;tokensOut:number;cost:number;latencyMs:number;usageConfirmed:boolean;repairCount?:number;draftId?:string;verificationId?:string};
 selectionPolicyVersion:string;groundingPolicyVersion:string;createdAt:string;
}
const draftSchema=z.object({language:z.string().min(1),stories:z.array(z.object({candidateId:z.string().min(1),claims:z.array(z.object({text:z.string().min(1).max(1000),communicatedFactIds:z.array(z.string().min(1)).max(100).optional(),support:z.array(z.object({evidenceRevisionId:z.string().min(1),quote:z.string().min(1).max(1800)}).strict()).min(1).max(3)}).strict()).max(4)}).strict()).max(20)}).strict();
const usageSchema=z.object({tokensIn:z.number().int().nonnegative(),tokensOut:z.number().int().nonnegative(),cost:z.number().finite().nonnegative(),confirmed:z.boolean()}).strict();
const normalize=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
function preservationFacts(story:SynthesisInput['stories'][number]):PreservationFact[] {
 if(story.plan){const ids=new Set([...story.plan.mustIncludeFactIds,...story.plan.attributionFactIds,...story.plan.certaintyFactIds,...story.plan.disagreementFactIds,...story.plan.openQuestionFactIds]);return story.plan.facts.filter(f=>ids.has(f.id)).map(f=>({id:f.id,text:f.text,evidenceRevisionIds:f.evidenceRevisionIds,attribution:f.attribution}))}
 const facts:PreservationFact[]=[];
 for(const evidence of story.evidence) for(const text of supportedSentences(evidence.body??'')) {
  // Quantities, qualification and open outcomes are conservative preservation
  // requirements. Semantic importance of other details remains an evaluation task.
  if(evidence.language==='en' && !/\p{N}|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|trillions?|dozens|several|few|half|quarter|majority|minority|all|none|some|many|most|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|june|july|august|september|october|november|december|not|no|never|without|may|might|could|uncertain|uncertainty|disputed|discrepancy|unresolved|estimated|alleged|however|but|postponed|no new date|not confirmed|at least|more than|less than|up to)\b/iu.test(text)) continue;
  const same=facts.find(f=>equivalentFact(f.text,text));
  if(same) same.evidenceRevisionIds.push(evidence.id);else facts.push({id:`${story.candidate.id}:fact:${facts.length}`,text,evidenceRevisionIds:[evidence.id]});
 }
 return facts;
}
async function assertCommunicationCurrent(tx:FeedTransaction,selection:SelectionRecord):Promise<void> {
 if(selection.communicationFingerprint && selection.communicationFingerprint!==await communicationFingerprint(tx,selection.window.end)) throw new HandoffError('TEMPORARY_UNAVAILABLE');
}
async function selectionInput(tx:FeedTransaction,selection:SelectionRecord):Promise<SynthesisInput> {
 if(selection.feedRevision!==tx.snapshot.feed.revision) throw new HandoffError('SCOPE_DENIED');
 await assertCommunicationCurrent(tx,selection);
 const active=new Set((await tx.store.currentEvidence(tx.snapshot.feed.id)).map(e=>e.revision.id)),stories:SynthesisInput['stories']=[];
 const plan=selection.editorialPlanId?await tx.read<EditorialPlanRecord>('editorial_plans',selection.editorialPlanId):undefined,shortlist=plan?await tx.read<ShortlistRecord>('shortlists',plan.shortlistId):undefined;
 if(selection.editorialPlanId && (!plan||!shortlist||plan.communicationFingerprint!==selection.communicationFingerprint||plan.feedRevision!==selection.feedRevision))throw new HandoffError('SCOPE_DENIED');
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
   const origin=await new V1IntakeStore(tx.store.db).read<AcceptedInput>('inputs',revision.sourceObservationId);
   if(origin&&origin.value.observation.feedId!==tx.snapshot.feed.id)throw new HandoffError('SCOPE_DENIED');
   evidence.push({...revision,excerptTruncated:false,publisherId:origin?.value.observation.publisherId});inspected++;
  }
  if(!evidence.length) throw new HandoffError('INVALID_REQUEST');
  const editorial=selection.editorialByCandidate?.[id];
  const planned=plan?.stories.find(s=>s.targetVersionId===candidate.targetVersionId),scope=shortlist?.candidates.find(c=>c.targetVersionId===candidate.targetVersionId);
  if(plan && (!planned||planned.decision!=='SELECT'||!scope))throw new HandoffError('SCOPE_DENIED');
  const approvedIds=planned?new Set([...planned.newUnderstandingFactIds,...planned.contextFactIds,...planned.mustIncludeFactIds,...planned.attributionFactIds,...planned.certaintyFactIds,...planned.disagreementFactIds,...planned.openQuestionFactIds]):undefined;
  const writerPlan:SelectedPlanStory|undefined=planned&&scope?{...planned,facts:scope.facts.filter(f=>approvedIds!.has(f.id)),previousLedgerEntries:shortlist!.ledger.filter(e=>planned.previousLedgerEntryIds.includes(e.id)),correctionObligations:shortlist!.obligations.filter(o=>planned.correctionObligationIds.includes(o.id)&&plan!.obligations.some(p=>p.obligationId===o.id&&p.handling==='ADDRESS'&&p.targetVersionId===scope.targetVersionId))}:undefined;
  if(writerPlan && preservationFacts({candidate,eventVersions,evidence,plan:writerPlan}).some(f=>!f.evidenceRevisionIds.some(id=>evidence.some(e=>e.id===id))))throw new HandoffError('SCOPE_DENIED');
  stories.push({candidate,eventVersions,editorial:editorial?boundedEditorialContext(editorial):undefined,plan:writerPlan,storylineVersion:storyline?{...storyline,currentState:storyline.currentState.slice(0,1800),previousState:storyline.previousState?.slice(0,1000),supportedFacts:storyline.supportedFacts.slice(0,10),turningPoints:storyline.turningPoints.slice(0,10)}:undefined,evidence});
 }
 if(inspected>selection.budget.maxEvidenceInspections || stories.length>selection.budget.maxStories) throw new HandoffError('INVALID_REQUEST');
 const f=tx.snapshot.feed;return {feed:{id:f.id,revision:f.revision,title:f.title,interests:f.interests,outputLanguage:f.outputLanguage},selectionId:selection.id,window:selection.window,editorialPlan:plan?{id:plan.id,route:plan.route}:undefined,stories};
}
export function approvedWriterFacts(story:SynthesisInput['stories'][number]):ApprovedWriterFact[] {
 if(!story.plan) return [];
 const p=story.plan,ids=new Set([...p.newUnderstandingFactIds,...p.contextFactIds,...p.mustIncludeFactIds,...p.attributionFactIds,...p.certaintyFactIds,...p.disagreementFactIds,...p.openQuestionFactIds]);
 return p.facts.filter(f=>ids.has(f.id)).map(f=>({...f,support:story.evidence.filter(e=>f.evidenceRevisionIds.includes(e.id)).flatMap(e=>{
  const body=e.body??'',quote=body.includes(f.text)?f.text:body.trim().split(/(?<=[.!?])\s+|\n+/u).find(s=>normalize(s)===normalize(f.text));
  return quote?[{evidenceRevisionId:e.id,quote}]:[];
 })}));
}
/** Join only adjacent approved spans, preserving abbreviations/dates split into propositions. */
export function approvedSupportSpans(story:SynthesisInput['stories'][number]):ClaimSupport[] {
 const facts=approvedWriterFacts(story),out:ClaimSupport[]=[];
 for(const e of story.evidence){const body=e.body??'',parts=facts.flatMap(f=>f.support.filter(s=>s.evidenceRevisionId===e.id).map(s=>({start:body.indexOf(s.quote),end:body.indexOf(s.quote)+s.quote.length}))).sort((a,b)=>a.start-b.start||a.end-b.end),merged:{start:number;end:number}[]=[];
  for(const part of parts){const last=merged.at(-1);if(last&&part.start<=last.end || last&&/^\s*$/.test(body.slice(last.end,part.start)))last.end=Math.max(last.end,part.end);else merged.push({...part});}
  for(const p of merged){const quote=body.slice(p.start,p.end),abbreviation=/\b(?:Oct|Nov|Dec|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Mr|Mrs|Dr|etc|a\.m|p\.m)\.$/i;
   const prefix=body.slice(0,p.start),suffix=body.slice(p.end);
   if(abbreviation.test(quote)||abbreviation.test(prefix.trim())||prefix.trim()&&!/[.!?]$/.test(prefix.trim())&&!/\n\s*$/.test(prefix)||suffix.trim()&&!/[.!?]$/.test(quote)&&!/^\s*\n/.test(suffix))throw new SynthesisCompatibilityError('EXTRACTIVE_CAPACITY_UNSUPPORTED');
   out.push({evidenceRevisionId:e.id,quote});
  }
 }
 return out;
}
/** The writer sees approved facts and their literal spans, never unselected source prose or graph state. */
export function synthesisWriterInput(input:SynthesisInput):SynthesisWriterInput {
 return {...input,stories:input.stories.map(s=>{
  const approvedFacts=s.plan?approvedWriterFacts(s):undefined;
  if(approvedFacts?.some(f=>!f.support.length))throw new SynthesisCompatibilityError('EXTRACTIVE_CAPACITY_UNSUPPORTED');
  const spans=s.plan?approvedSupportSpans(s):undefined;
  const {facts:unusedFacts,...selectedPlan}=s.plan??{facts:[]};
  const plan=s.plan?{...selectedPlan,rationale:'Selected by EditorialPlan.',relevanceRationale:'Communicate approved facts only.'} as Omit<SelectedPlanStory,'facts'>:undefined;
  // The support references carry provenance. Do not repeat internal graph IDs
  // or a second copy of every proposition in the communication payload.
  const writerFacts=approvedFacts?.map(({claimMentionIds,evidenceRevisionIds,propositionId,...fact})=>fact);
  return {candidate:{id:s.candidate.id,targetType:s.candidate.targetType,targetVersionId:s.candidate.targetVersionId},plan,editorial:s.plan?undefined:s.editorial,approvedFacts:writerFacts,approvedSpans:spans,evidence:s.evidence.map(e=>({id:e.id,language:e.language,publisherId:e.publisherId,body:spans?spans.filter(p=>p.evidenceRevisionId===e.id).map(p=>p.quote).join('\n'):e.body}))};
 })};
}
/** One reader-facing claim per supported meaning. Equivalent claims collapse
 * into the first one and keep up to three distinct supports, so citations from
 * every independent source survive while the prose is never repeated. */
export function mergeEquivalentClaims<T extends DraftClaim>(claims:T[]):T[] {
 const out:T[]=[];
 for(const claim of claims){
  const same=out.find(c=>equivalentFact(c.text,claim.text));
  if(!same){out.push({...claim,support:[...claim.support]});continue}
  for(const s of claim.support)if(same.support.length<3&&!same.support.some(x=>x.evidenceRevisionId===s.evidenceRevisionId&&x.quote===s.quote))same.support.push(s);
  if(claim.communicatedFactIds?.length)same.communicatedFactIds=[...new Set([...(same.communicatedFactIds??[]),...claim.communicatedFactIds])];
 }
 return out;
}
export function extractiveDraft(input:SynthesisInput):BriefingDraft {
 if(input.editorialPlan){
  const writer=synthesisWriterInput(input);
  return {language:input.feed.outputLanguage,stories:writer.stories.map((s,i)=>{
   const full=input.stories[i];
   if(!s.plan || !s.approvedFacts?.length || full.evidence.some(e=>extractiveLanguageCompatibility(e.language,input.feed.outputLanguage)==='TRANSLATION_REQUIRED'))throw new SynthesisCompatibilityError('EXTRACTIVE_CAPACITY_UNSUPPORTED');
   // Literal spans must not be extracted from a rebuttal or contrasting qualification.
   if(full.evidence.some(e=>/\b(verdict|false|misleading|refuted|retracted|correction|however|but)\b/i.test(e.body??'')))throw new SynthesisCompatibilityError('EXTRACTIVE_CAPACITY_UNSUPPORTED');
   const spans=approvedSupportSpans(full);
   if(!spans.length||spans.length>4||spans.some(p=>p.quote.length>1000))throw new SynthesisCompatibilityError('EXTRACTIVE_CAPACITY_UNSUPPORTED');
   return {candidateId:s.candidate.id,claims:mergeEquivalentClaims(spans.map(p=>({text:p.quote,support:[p]})))};
  })};
 }
 if(input.stories.some(s=>s.evidence.some(e=>extractiveLanguageCompatibility(e.language,input.feed.outputLanguage)==='TRANSLATION_REQUIRED'))) throw new SynthesisCompatibilityError('TRANSLATION_REQUIRED');
 if(input.stories.some(s=>s.evidence.length>4 || s.evidence.some(e=>e.excerptTruncated || e.body!.trim().length>600))) throw new SynthesisCompatibilityError('EXTRACTIVE_CAPACITY_UNSUPPORTED');
 return {language:input.feed.outputLanguage,stories:input.stories.map(s=>{
  return {candidateId:s.candidate.id,claims:mergeEquivalentClaims(s.evidence.flatMap(revision=>{
   const quote=revision.body!.trim();return quote?[{text:quote,support:[{evidenceRevisionId:revision.id,quote}]}]:[];
  }))};
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
 const token=crypto.randomUUID();
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
  const cachedFallback=prior?.pendingCall?await tx.read<StoredDraft>('drafts',selectionId):undefined;
  const safeFallback=cachedFallback?.provider==='NONE' && cachedFallback.promptVersion==='approved-fact-spans-v3';
  if(prior?.pendingCall && !safeFallback || (prior?.attempts??0)>=5 || prior?.state==='FAILED') throw new HandoffError('INVALID_REQUEST');
  const input=await selectionInput(tx,selection);
  const job:PublicationJob={id:editionId,feedId,selectionId,state:'RUNNING',attempts:(prior?.attempts??0)+1,token,leaseUntil:new Date(Date.parse(now)+selection.budget.maxWallClockMs).toISOString(),callsUsed:prior?.callsUsed??0,tokensIn:prior?.tokensIn??0,tokensOut:prior?.tokensOut??0,cost:prior?.cost??0,pendingCall:prior?.pendingCall,repairRequested:prior?.repairRequested};
  await tx.write('synthesis_jobs',editionId,job);return {input,authorizationScopes:tx.snapshot.scopes};
 });
 if(claimed.edition) return claimed.edition;
 // Source/current-plan validation and CAS contention precede the owned lease.
 // The execution clock measures synthesis under that lease, not preparation.
 const started=Date.now();
 const input=claimed.input!;
 const authorizationScopes=canonicalJson(claimed.authorizationScopes!);
 const callModel=async<T extends {usage:ModelUsage}>(phase:string,payload:unknown,execute:(limits:{maxOutputTokens:number;signal:AbortSignal})=>Promise<T>,resultKey=selectionId):Promise<T>=>{
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
   if(phase==='SYNTHESIS'||phase==='REPAIR') {
    const parsed=draftSchema.safeParse((result as T & {draft?:unknown}).draft);
    if(!parsed.success || parsed.data.language!==input.feed.outputLanguage) throw new HandoffError('INVALID_REQUEST');
    await tx.write('drafts',resultKey,{id:resultKey,feedId,draft:parsed.data,model:model.model,provider:model.provider,promptVersion:model.promptVersion??'selected-evidence-editorial-v2',createdAt:options.now()});
   } else if(phase==='GROUNDING') {
    const ids=z.array(z.string().min(1)).max(80).safeParse((result as T & {supportedClaimIds?:unknown}).supportedClaimIds);
    if(!ids.success) throw new HandoffError('INVALID_REQUEST');
    const preserved=z.array(z.string().min(1)).max(200).optional().safeParse((result as T & {preservedFactIds?:unknown}).preservedFactIds);
    if(!preserved.success) throw new HandoffError('INVALID_REQUEST');
    const novel=z.array(z.string().min(1)).max(200).optional().safeParse((result as T & {novelFactIds?:unknown}).novelFactIds);if(!novel.success)throw new HandoffError('INVALID_REQUEST');
    const addressed=z.array(z.string().min(1)).max(100).optional().safeParse((result as T & {addressedCorrectionObligationIds?:unknown}).addressedCorrectionObligationIds);if(!addressed.success)throw new HandoffError('INVALID_REQUEST');
    const semantic=z.array(z.object({factId:z.string().min(1),communicated:z.boolean(),attribution:z.boolean(),certainty:z.boolean(),temporal:z.boolean(),qualifiers:z.boolean(),reason:z.string().max(500),readerSpans:z.array(z.object({claimId:z.string().min(1),text:z.string().min(1)}).strict()).max(80).optional()}).strict()).max(200).optional().parse((result as T & {semanticChecks?:unknown}).semanticChecks);
    if(semantic&&(new Set(semantic.map(c=>c.factId)).size!==semantic.length||semantic.some(c=>!input.stories.some(s=>s.plan?.facts.some(f=>f.id===c.factId)||preservationFacts(s).some(f=>f.id===c.factId)))))throw new HandoffError('INVALID_REQUEST');
    await tx.write('verification_results',resultKey,{id:resultKey,feedId,supportedClaimIds:ids.data,preservedFactIds:preserved.data,addressedCorrectionObligationIds:addressed.data,novelFactIds:novel.data,semanticChecks:semantic,createdAt:options.now()});
   }
   await tx.write('synthesis_jobs',editionId,{...job,pendingCall:undefined,cost:intent.previous.cost+actual.cost,tokensIn:intent.previous.tokensIn+actual.tokensIn,tokensOut:intent.previous.tokensOut+actual.tokensOut});
  });return result;
 };
 try {
  let storedDraft=await store.read<StoredDraft>(feedId,'drafts',selectionId);
  if(!storedDraft) {
   if(options.model) {
    const writer=synthesisWriterInput(input);
    try {await callModel('SYNTHESIS',options.model.synthesisPayload?.(writer)??writer,limits=>options.model!.synthesize(writer,limits));}
    catch(error) {
     if(!input.editorialPlan)throw error;
     // Unknown provider outcome retains its reservation and audit record. Only a
     // locally safe approved-fact draft may recover; no second model call is made.
     const draft=extractiveDraft(input);
     await feedTransact(store,feedId,async tx=>{
      const job=await requireJob(tx,editionId,token,options.now());
      if(job.pendingCall)await tx.write('model_executions',job.pendingCall,{id:job.pendingCall,feedId,editionId,phase:'SYNTHESIS',status:'OUTCOME_UNKNOWN',confirmed:false,reservationRetained:true,createdAt:options.now()});
      await tx.write('drafts',selectionId,{id:selectionId,feedId,draft,model:'deterministic-approved-facts-v3',provider:'NONE',promptVersion:'approved-fact-spans-v3',createdAt:options.now()});
     });
    }
    storedDraft=await store.read<StoredDraft>(feedId,'drafts',selectionId);
   }
   else {
    storedDraft={id:selectionId,feedId,draft:extractiveDraft(input),model:'deterministic-approved-facts-v3',provider:'NONE',promptVersion:'approved-fact-spans-v3',createdAt:options.now()};
    const value=storedDraft;await feedTransact(store,feedId,async tx=>{await requireJob(tx,editionId,token,options.now());await tx.write('drafts',selectionId,value)});
   }
  }
  if(!storedDraft) throw new HandoffError('TEMPORARY_UNAVAILABLE');
  const rejectDraft=async(draftId:string,issues:WriterIssue[]):Promise<never>=>{
   const id=JSON.stringify([draftId,'writer-feedback-v1']),prior=await store.read<WriterFeedback>(feedId,'verification_feedback',id);
   const feedback:WriterFeedback=prior??{id,feedId,selectionId,draftId,editorialPlanId:input.editorialPlan?.id,issues,missingFactIds:[...new Set(issues.flatMap(i=>i.factId&&['MISSING_REQUIRED_FACT','MISSING_DECLARED_FACT'].includes(i.code)?[i.factId]:[]))],createdAt:options.now()};
   if(!prior)await feedTransact(store,feedId,async tx=>{await requireJob(tx,editionId,token,options.now());await assertCommunicationCurrent(tx,selection);await tx.write('verification_feedback',id,feedback)});
   throw new DraftVerificationError(feedback);
  };
  const verifyDraft=async(storedDraft:StoredDraft,draftKey:string):Promise<GroundingResult>=>{
   const problems=inspectWriterDraft(input,storedDraft.draft,s=>s.plan?approvedSupportSpans(s):s.evidence.map(e=>({evidenceRevisionId:e.id,quote:e.body??''})),storedDraft.provider!=='NONE'&&Boolean(options.model?.verify));
   if(problems.length){
    // Preserve the existing durable fidelity audit even when a deterministic
    // writer precheck rejects the draft before buying semantic verification.
    if(input.editorialPlan)await feedTransact(store,feedId,async tx=>{
     await requireJob(tx,editionId,token,options.now());await assertCommunicationCurrent(tx,selection);
     if(!await tx.read('fidelity_results',draftKey))await tx.write('fidelity_results',draftKey,{id:draftKey,feedId,editorialPlanId:input.editorialPlan!.id,passed:false,stage:'WRITER_PRECHECK',checks:input.stories.map(story=>({candidateId:story.candidate.id,passed:!problems.some(p=>p.candidateId===story.candidate.id),missingStory:!storedDraft.draft.stories.some(s=>s.candidateId===story.candidate.id),issues:problems.filter(p=>p.candidateId===story.candidate.id)})),policyVersion:'semantic-publication-fidelity-v4',createdAt:options.now()});
    });
    await rejectDraft(draftKey,problems);
   }
  let grounding=await store.read<GroundingResult>(feedId,'grounding_results',draftKey);
  if(!grounding) {
   const candidates=new Map(input.stories.map(s=>[s.candidate.id,s])),proposals:{candidateId:string;claim:GroundedClaim;exact:boolean}[]=[];let rejected=0;const issues:WriterIssue[]=[];
   const seenStories=new Set<string>();
   for(const story of storedDraft.draft.stories) {
    const candidate=candidates.get(story.candidateId);if(!candidate || seenStories.has(story.candidateId)) {rejected+=Math.max(1,story.claims.length);continue}seenStories.add(story.candidateId);
    for(const claim of story.claims) {
     const valid=claim.support.every(s=>candidate.evidence.some(e=>e.id===s.evidenceRevisionId && ((e.body??'').includes(s.quote) || e.title===s.quote)) && (!candidate.plan||approvedSupportSpans(candidate).some(p=>p.evidenceRevisionId===s.evidenceRevisionId&&p.quote.includes(s.quote))));
     if(!valid) {rejected++;continue}
     // Only the runtime's full-context extractive fallback can bypass entailment.
     // A model-selected exact quote may be embedded in a refutation or warning.
     const exact=storedDraft.provider==='NONE' && claim.support.some(s=>normalize(s.quote)===normalize(claim.text) && (candidate.plan?approvedSupportSpans(candidate).some(p=>p.evidenceRevisionId===s.evidenceRevisionId&&p.quote===s.quote):candidate.evidence.some(e=>e.id===s.evidenceRevisionId && !e.excerptTruncated && normalize(e.body??'')===normalize(s.quote))));
     proposals.push({candidateId:story.candidateId,claim:{id:await sha256(canonicalJson({candidate:story.candidateId,claim})),...claim},exact});
    }
   }
   if(input.editorialPlan && rejected)await rejectDraft(draftKey,[{code:'UNSUPPORTED_OR_INCOMPLETE_CLAIMS'},...issues]);
   let semanticChecks:SemanticFactCheck[]|undefined;
   const nonextractive=proposals.filter(p=>!p.exact),supported=new Set(proposals.filter(p=>p.exact).map(p=>p.claim.id)),preservedFacts=new Set<string>();
   if(nonextractive.length && options.model?.verify) {
    let result=await store.read<{supportedClaimIds:string[];preservedFactIds?:string[];semanticChecks?:SemanticFactCheck[]}>(feedId,'verification_results',draftKey);
    if(!result) {const seen=new Set<string>();const claims:VerificationClaim[]=nonextractive.map(p=>{
     const first=!seen.has(p.candidateId);seen.add(p.candidateId);
     const scope=candidates.get(p.candidateId)!;
     const facts=scope.plan?.facts.map(({id,text,evidenceRevisionIds,attribution})=>({id,text,evidenceRevisionIds,attribution}));
     return {...p.claim,candidateId:p.candidateId,requiredFacts:first?preservationFacts(scope):undefined,allowedFacts:facts,previousLedgerFacts:scope.plan?.previousLedgerEntries.flatMap(e=>e.claimFacts),newUnderstandingFacts:first?facts?.filter(f=>scope.plan!.newUnderstandingFactIds.includes(f.id)):undefined,correctionObligations:first?scope.plan?.correctionObligations:undefined,context:scope.evidence.filter(e=>p.claim.support.some(s=>s.evidenceRevisionId===e.id)).map(e=>({evidenceRevisionId:e.id,title:e.title,publisherId:e.publisherId,text:e.body??'',truncated:e.excerptTruncated}))};
    });await callModel('GROUNDING',options.model!.verificationPayload?.(claims)??claims,limits=>options.model!.verify!(claims,limits),draftKey);result=await store.read(feedId,'verification_results',draftKey)}
    for(const id of result?.supportedClaimIds??[]) if(nonextractive.some(p=>p.claim.id===id)) supported.add(id);
    semanticChecks=result?.semanticChecks;
    for(const id of result?.preservedFactIds??[])if(!semanticChecks||semanticChecks.some(c=>c.factId===id&&faithfulFact(c)))preservedFacts.add(id);
   }
   const stories:GroundingResult['stories']=[];let words=0;
   for(const id of selection.selectedCandidateIds) {
    const claims:GroundedClaim[]=[];let storyWords=0;
    for(const p of proposals.filter(p=>p.candidateId===id)) {
     const count=(p.claim.text.match(/\S+/g)??[]).length;
     if(supported.has(p.claim.id)) {claims.push(p.claim);storyWords+=count}else {rejected++;issues.push({code:'CLAIM_NOT_ENTAILED',candidateId:id,claimId:p.claim.id,value:p.claim.text});}
    }
    // A collective semantic preservation verdict applies to the verified claim
    // set. Never clip a side afterward to fit the reading ceiling.
    if(words+storyWords>selection.budget.maxReadingWords) {rejected+=claims.length;continue}
    const fullVerifiedSet=proposals.filter(p=>p.candidateId===id).every(p=>supported.has(p.claim.id));
    const required=preservationFacts(candidates.get(id)!);
    const missing=required.filter(f=>!claims.some(c=>{
     const quoted=c.support.some(s=>f.evidenceRevisionIds.includes(s.evidenceRevisionId) && normalize(s.quote).includes(normalize(f.text)));
     const literal=normalize(c.text).includes(normalize(f.text)) || supportedSentences(c.text).some(text=>equivalentFact(text,f.text));
     // A structured semantic verdict governs model coverage, including a
     // negative verdict on apparently literal prose. Writer IDs never count.
     return quoted && (semanticChecks?fullVerifiedSet&&preservedFacts.has(f.id):literal || fullVerifiedSet && preservedFacts.has(f.id));
    }));
    for(const f of missing){const verdict=semanticChecks?.find(c=>c.factId===f.id);issues.push({code:'MISSING_REQUIRED_FACT',candidateId:id,factId:f.id,value:verdict?.reason});}
    if(claims.length && !missing.length) {stories.push({candidateId:id,claims:mergeEquivalentClaims(claims)});words+=storyWords}else rejected+=claims.length;
   }
   if(input.editorialPlan && rejected)await rejectDraft(draftKey,[{code:'UNSUPPORTED_OR_INCOMPLETE_CLAIMS'},...issues]);
   grounding={id:draftKey,feedId,stories,rejectedClaims:rejected,policyVersion:'approved-spans-semantic-coverage-v4',createdAt:options.now()};
   const value=grounding;await feedTransact(store,feedId,async tx=>{await requireJob(tx,editionId,token,options.now());await tx.write('grounding_results',draftKey,value)});
  }
  if(selection.selectedCandidateIds.length && !grounding.stories.length)await rejectDraft(draftKey,[{code:'NO_SUPPORTED_STORIES'}]);
  if(input.editorialPlan){
   const verification=await store.read<{addressedCorrectionObligationIds?:string[];novelFactIds?:string[];semanticChecks?:SemanticFactCheck[]}>(feedId,'verification_results',draftKey);
   if(storedDraft.provider!=='NONE'&&verification?.semanticChecks){
    const missing=input.stories.flatMap(story=>preservationFacts(story).filter(f=>{const check=verification.semanticChecks!.find(c=>c.factId===f.id);return !check||!faithfulFact(check)||!hasReaderWitness(check,grounding!.stories.find(s=>s.candidateId===story.candidate.id)?.claims??[]);}).map(f=>({code:'MISSING_REQUIRED_FACT',candidateId:story.candidate.id,factId:f.id,value:'No faithful verdict with exact supported reader-prose witnesses.'})));
    if(missing.length)await rejectDraft(draftKey,missing);
   }
   const checks=input.stories.map(story=>{const actual=grounding!.stories.find(s=>s.candidateId===story.candidate.id),required=preservationFacts(story),fidelity=checkReaderFidelity(actual?.claims.map(c=>c.text)??[],required,story.plan!.facts,input.feed.outputLanguage==='en'&&story.evidence.every(e=>e.language==='en'),storedDraft.provider!=='NONE'&&verification?.semanticChecks?{checks:verification.semanticChecks}:undefined);
    const known=story.plan!.previousLedgerEntries.flatMap(e=>e.claimFacts),novel=story.plan!.newUnderstandingFactIds.some(id=>{const f=story.plan!.facts.find(f=>f.id===id);return f&&!known.some(k=>equivalentFact(k,f.text))&&(storedDraft!.provider==='NONE'||verification?.novelFactIds?.includes(id))}),addressed=story.plan!.correctionObligations.filter(o=>verifiedCorrectionDelivery(actual?.claims.map(c=>c.text)??[],o.id,verification?.addressedCorrectionObligationIds??[],input.feed.outputLanguage==='en')).map(o=>o.id),correction=story.plan!.correctionObligations.length>0&&addressed.length===story.plan!.correctionObligations.length;
    return {candidateId:story.candidate.id,passed:Boolean(actual)&&fidelity.passed&&novel&&(!story.plan!.correctionObligations.length||correction),addressedCorrectionObligationIds:addressed,fidelity,missingStory:!actual,novelty:novel?'NEW_SUPPORTED_FACT':correction?'CORRECTION_CONTEXT':'NO_SUPPORTED_DELTA',sourceSpan:'EXACT_STORED_QUOTE',entailment:storedDraft!.provider==='NONE'?'RUNTIME_FULL_CONTEXT_EXTRACTION':'MODEL_VERIFIED',mustInclude:'REQUIRED_COLLECTIVE_COVERAGE'};
   });
   await feedTransact(store,feedId,async tx=>{if(!await tx.read('fidelity_results',draftKey))await tx.write('fidelity_results',draftKey,{id:draftKey,feedId,editorialPlanId:input.editorialPlan!.id,checks,passed:checks.every(c=>c.passed),policyVersion:'semantic-publication-fidelity-v4',createdAt:options.now()})});
   if(checks.some(c=>!c.passed))await rejectDraft(draftKey,checks.filter(c=>!c.passed).flatMap(c=>[{code:c.novelty==='NO_SUPPORTED_DELTA'?'NO_SUPPORTED_DELTA':'PLAN_FIDELITY_FAILED',candidateId:c.candidateId},...c.fidelity.failures.map(f=>({...f,candidateId:c.candidateId}))]));
  }
   return grounding;
  };
  const repairKey=JSON.stringify([selectionId,'repair-1']);
  let draftKey=selectionId,grounding:GroundingResult|undefined;
  const repaired=await store.read<StoredDraft>(feedId,'drafts',repairKey);
  if(repaired){storedDraft=repaired;draftKey=repairKey;}
  for(let attempt=0;attempt<2;attempt++){
   try {grounding=await verifyDraft(storedDraft,draftKey);break;}
   catch(error){
    if(!(error instanceof DraftVerificationError)||draftKey===repairKey||storedDraft.provider==='NONE'||!options.model?.repair||!input.editorialPlan)throw error;
    const writer=synthesisWriterInput(input),failed=storedDraft.draft;
    await feedTransact(store,feedId,async tx=>{const job=await requireJob(tx,editionId,token,options.now());await selectionInput(tx,selection);await tx.write('synthesis_jobs',editionId,{...job,repairRequested:true})});
    await callModel('REPAIR',options.model!.repairPayload?.(writer,failed,error.feedback)??{input:writer,draft:failed,feedback:error.feedback},limits=>options.model!.repair!(writer,failed,error.feedback,limits),repairKey);
    const result=await store.read<StoredDraft>(feedId,'drafts',repairKey);if(!result)throw new HandoffError('TEMPORARY_UNAVAILABLE');
    storedDraft=result;draftKey=repairKey;
   }
  }
  if(!grounding)throw new HandoffError('INVALID_REQUEST');
  const finalDraft=storedDraft,finalGrounding=grounding;
  return await feedTransact(store,feedId,async tx=>{
   const existing=await tx.read<BriefingEditionRecord>('editions',editionId);if(existing) return existing;
   const job=await requireJob(tx,editionId,token,options.now());await selectionInput(tx,selection);
   const usedCandidates=finalGrounding.stories.map(s=>s.candidateId),selected=input.stories.filter(s=>usedCandidates.includes(s.candidate.id));
   const eventVersionIds=[...new Set(selected.flatMap(s=>s.eventVersions.map(v=>v.id)))],storylineVersionIds=selected.flatMap(s=>s.storylineVersion?[s.storylineVersion.id]:[]);
   const evidenceRevisionIds=[...new Set((await tx.list<EventMembership>('memberships')).filter(m=>eventVersionIds.includes(m.eventVersionId)).map(m=>m.evidenceRevisionId))];
   if(job.tokensIn>selection.budget.maxInputTokens || job.tokensOut>selection.budget.maxOutputTokens || job.cost>selection.budget.maxCostUsd || Date.now()-started>selection.budget.maxWallClockMs) throw new HandoffError('INVALID_REQUEST');
   const edition:BriefingEditionRecord={id:editionId,feedId,feedRevision:selection.feedRevision,windowStart:selection.window.start,windowEnd:selection.window.end,language:input.feed.outputLanguage,selectionId,selectedCandidateIds:usedCandidates,eventVersionIds,storylineVersionIds,evidenceRevisionIds,stories:finalGrounding.stories,generation:{model:finalDraft.model,provider:finalDraft.provider,promptVersion:finalDraft.promptVersion??'selected-evidence-v1',routerVersion:'stored-evidence-only-v1',tokensIn:job.tokensIn,tokensOut:job.tokensOut,cost:job.cost,latencyMs:Date.now()-started,repairCount:draftKey===repairKey?1:0,draftId:draftKey,verificationId:draftKey,usageConfirmed:(await tx.list<{id:string;editionId:string;confirmed:boolean}>('model_executions')).filter(e=>e.editionId===editionId).every(e=>e.confirmed)},selectionPolicyVersion:selection.policyVersion,groundingPolicyVersion:finalGrounding.policyVersion,createdAt:options.now()};
   await tx.write('editions',editionId,edition);await tx.write('publication_status',editionId,{id:editionId,feedId,status:'PUBLISHED',publishedAt:edition.createdAt});
   await tx.write('delivery_jobs',editionId,{id:editionId,feedId,editionId,state:'PENDING',attempts:0,createdAt:edition.createdAt});
   await tx.write('synthesis_jobs',editionId,{...job,state:'DONE'});return edition;
  });
 } catch(error) {
  try {await feedTransact(store,feedId,async tx=>{
   const job=await tx.read<PublicationJob>('synthesis_jobs',editionId);
   if(job?.state==='RUNNING' && job.token===token) {
    const fallback=job.pendingCall?await tx.read<StoredDraft>('drafts',selectionId):undefined;
    const safeFallback=fallback?.provider==='NONE'&&fallback.promptVersion==='approved-fact-spans-v3';
    const transient=error instanceof HandoffError && error.code==='TEMPORARY_UNAVAILABLE' && (!job.pendingCall||safeFallback) && job.attempts<5;
    if(job.pendingCall && !await tx.read('model_executions',job.pendingCall)) await tx.write('model_executions',job.pendingCall,{id:job.pendingCall,feedId,editionId,status:'OUTCOME_UNKNOWN',confirmed:false,reservationRetained:true,createdAt:options.now()});
    await tx.write('synthesis_jobs',editionId,{...job,state:transient?'PENDING':'FAILED',failure:job.pendingCall?'MODEL_OUTCOME_UNKNOWN':error instanceof SynthesisCompatibilityError?error.reason:error instanceof HandoffError?error.code:'SYNTHESIS_FAILED'});
   }
  })} catch { /* A revoked Feed already prevents recovery/publication. */ }
  if(error instanceof HandoffError) throw error;throw new HandoffError('TEMPORARY_UNAVAILABLE');
 }
}
