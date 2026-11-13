import {campaignInterruptAfterResult} from '../agentops-campaign-fault';
import {CUTOFF_EDITION_POLICY,atScheduledCutoff,cutoffEvidenceAuthorized} from './cutoff-edition';
import {generateBriefing,openAiCompatibleModel,priorMemoryCutoff,type BriefingInput,type BriefingModels,type BriefingResult,type ModelPort,type ModelRequest} from '@distilled/briefing';
import {HandoffError,sha256,type EvidenceRevision} from '@distilled/contracts';
import type {Env} from '../types';
import {canonicalJson} from '../v1-intake/canonical';
import {captureProviderReceipt,providerBodyReceipt,providerResponseReceipt} from '../provider-receipt';
import {V1FeedStore,feedTransact,type FeedTransaction} from './store';
import {durableSemanticOperation,type SemanticIntent} from './semantic-operations';
import {saveV3Response,recoverV3Response,ResponseCheckpointPending,type ResponseCheckpoint} from './v3-response-checkpoint';
import {withSemanticWorkLease} from './semantic-work-lease';
import {admitModelOperation,modelCapability} from './model-capacity';
import {configuredProviderLimits} from './provider-routing';
import {newsWindowEligibility} from './window-delivery';
import {windowIntakeCoverage} from './window-coverage';
import {pendingWindowCollections} from '../connector-publication-coverage';
import {ModelSpendingWait} from './model-spending';
import type {PublicationWindow} from './scoring';
import type {BriefingEditionRecord} from './publication';
import type {BriefingRequest} from './runtime';
import {buildEditionDeliveryPayload} from './public-read';
import {stageVerifiedArchive} from '../verified-archives';

export const V3_ADMISSION_POLICY='PUBLICATION_DATE_WITH_EXPLICIT_RECOVERY_V1' as const;
export type V3AdmissionReason='PUBLICATION_WINDOW'|'LATE_DISCOVERY'|'SOURCE_REVISION'|'VERIFICATION_RETRY'|'EDITORIAL_OVERFLOW'|'VERIFIED_UNPUBLISHED'|'UNRESOLVED_WINDOW';
export interface V3EvidenceAdmission {revisionId:string;reason:V3AdmissionReason;publishedAt:string|null;originWindowEnd?:string}
const POLICY='v3-fixed-window-editor-verifier-v1';
/** A settled unusable response or explicitly isolated UNKNOWN call is immutable,
 * not an admission wait. Neither case permits resending the same request. */
export class SettledV3CallFailure extends Error {
 constructor(readonly operationId:string,reason='SEMANTIC_PROVIDER_FAILURE'){super(reason);}
}
export interface V3WindowInput {editorAccountingPolicy?:'complete-source-decisions-v1';editorFailurePolicy?:'isolate-unusable-chunks-v1';admissionPolicy?:typeof V3_ADMISSION_POLICY;admissions?:V3EvidenceAdmission[];cutoffPolicy?:typeof CUTOFF_EDITION_POLICY;citationCoverage?:boolean;noveltyGuard?:boolean;architecture?:'evidence-first-v1'|'evidence-first-v2';scheduledFor?:string;promptVersion?:1|2|3|4|5|6;id:string;fingerprint:string;feedId:string;feedRevision:number;input:BriefingInput;models:BriefingModels;evidenceRevisionIds:string[];recovery?:{priorInputId:string;recoveredAt:string;reason:'SUPERSEDED_UNSTARTED_EVIDENCE'}}
export interface V3WindowResult {id:string;feedId:string;inputId:string;windowEnd:string;result:BriefingResult;operationIds:string[]}
export const productV3Enabled=(env:Pick<Env,'BRIEFING_ENGINE'>)=>env.BRIEFING_ENGINE==='v3';
export const productV3Ready=(env:Env)=>Boolean(env.OPENROUTER_API_KEY);
export function productV3PromptVersion(env:Pick<Env,'BRIEFING_PROMPT_VERSION'>):4|5|6 {
 if(env.BRIEFING_PROMPT_VERSION===undefined||env.BRIEFING_PROMPT_VERSION==='4')return 4;
 if(env.BRIEFING_PROMPT_VERSION==='5')return 5;
 if(env.BRIEFING_PROMPT_VERSION==='6')return 6;
 throw Error('INVALID_BRIEFING_PROMPT_VERSION');
}
export const productV3Models=(env:Env):BriefingModels=>({editor:env.BRIEFING_EDITOR_MODEL??'openai/gpt-4.1',verifier:env.BRIEFING_VERIFIER_MODEL??'openai/gpt-4.1-mini'});

/** Read-through preparation is mechanical. The window is frozen only at close,
 * so arrivals during preparation are included without paying twice. */
export async function prepareV3Window(store:V1FeedStore,feedId:string,window:PublicationWindow,now:string,models:BriefingModels={editor:'openai/gpt-4.1',verifier:'openai/gpt-4.1-mini'},promptVersion:1|2|3|4|5|6=4,architecture?:'evidence-first-v1'|'evidence-first-v2',freezeAtCutoff=true):Promise<V3WindowInput>{
 const feed=await store.getFeed(feedId);if(!feed||feed.paused||feed.deletedAt)throw new HandoffError('SCOPE_DENIED');
 if(!['en','ar','fr'].includes(feed.outputLanguage))throw Error('V3_UNSUPPORTED_LANGUAGE');
 const editions=(await store.publicationPreparationHistory(feedId,priorMemoryCutoff(new Date(window.end)))).filter(e=>Date.parse(e.windowEnd)<=Date.parse(window.start));
 const prior=editions.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).flatMap(e=>e.stories.map(s=>({id:`${e.id}:${s.candidateId}`,at:e.createdAt,headline:s.claims[0]?.text??'',body:s.claims.map(c=>c.text).join('\n')})));
 const previouslyUsed=new Set(editions.flatMap(e=>e.evidenceRevisionIds));
 const cutoffPolicy=freezeAtCutoff&&atScheduledCutoff(window,now)?CUTOFF_EDITION_POLICY:undefined;
 const evidence=await store.currentEvidenceHeaders(feedId,cutoffPolicy?window.end:undefined);
 const previousEvidenceIds=evidence.length?new Set((await store.revisionEvidenceIds(feedId,[...previouslyUsed])).values()):new Set<string>();
 const decisions=await store.evidenceWindowDecisions(feedId,evidence.map(e=>e.revision.id),window.start);
 const retryIds=decisions.retry,unpublished=new Set([...decisions.selected].filter(id=>!previouslyUsed.has(id)));
 const observedAt=new Map(evidence.map(e=>[e.revision.id,e.observedAt]));
 const beforeClose=(r:Pick<EvidenceRevision,'id'|'acceptedAt'>)=>Date.parse(observedAt.get(r.id)??r.acceptedAt)<Date.parse(window.end)&&(!cutoffPolicy||Date.parse(r.acceptedAt)<Date.parse(window.end));
 const admissionReason=(r:Pick<EvidenceRevision,'id'|'publishedAt'|'acceptedAt'|'evidenceId'>,reporting:PublicationWindow):V3AdmissionReason|undefined=>{
  const eligibility=newsWindowEligibility([r],reporting,feed.createdAt);
  if(eligibility==='AFTER_WINDOW')return undefined;
  if(retryIds.has(r.id))return decisions.overflow.has(r.id)?'EDITORIAL_OVERFLOW':'VERIFICATION_RETRY';
  if(unpublished.has(r.id))return 'VERIFIED_UNPUBLISHED';
  if(eligibility==='IN_WINDOW')return 'PUBLICATION_WINDOW';
  if(previousEvidenceIds.has(r.evidenceId)&&Date.parse(r.acceptedAt)>=Date.parse(reporting.start))return 'SOURCE_REVISION';
  if(eligibility==='LATE_DISCOVERY')return 'LATE_DISCOVERY';
 };
 const pending=(await store.unresolvedPublicationWindows(feedId)).filter(r=>Date.parse(r.window.end)<=Date.parse(window.start)&&Date.parse(r.window.start)>=Date.parse(feed.createdAt));
 const admissions:V3EvidenceAdmission[]=[],active:typeof evidence=[];
 for(const entry of evidence){
  const r=entry.revision;
  if(!beforeClose(r)||((previouslyUsed.has(r.id)||decisions.resolved.has(r.id))&&!retryIds.has(r.id)))continue;
  let reason=admissionReason(r,window),originWindowEnd:string|undefined;
  if(!reason){const missed=pending.find(p=>admissionReason(r,p.window));if(missed){reason='UNRESOLVED_WINDOW';originWindowEnd=missed.window.end;}}
  if(!reason)continue;
  active.push(entry);admissions.push({revisionId:r.id,reason,publishedAt:r.publishedAt??null,...(originWindowEnd?{originWindowEnd}:{})});
 }
 active.sort((a,b)=>a.revision.id.localeCompare(b.revision.id));admissions.sort((a,b)=>a.revisionId.localeCompare(b.revisionId));
 const hydrated=new Map((await store.currentEvidenceByIds(feedId,active.map(e=>e.revision.id),cutoffPolicy?window.end:undefined)).map(e=>[e.revision.id,e]));
 const selected=active.map(e=>{const full=hydrated.get(e.revision.id);if(!full)throw new HandoffError('TEMPORARY_UNAVAILABLE');return full});
 const input:BriefingInput={feed:{interest:feed.interests.join('\n'),language:feed.outputLanguage as 'en'|'ar'|'fr',windowMinutes:(Date.parse(window.end)-Date.parse(window.start))/60000,style:'Use the original source publication dates. Label late discoveries and source revisions with accurate temporal context; acquisition time is not event time.'},articles:selected.map(({item,revision:r})=>({...(architecture?{revision:{evidenceId:r.evidenceId,version:r.revision,acceptedAt:r.acceptedAt,observedAt:observedAt.get(r.id)??undefined,contentHash:r.contentHash,sourceObservationId:r.sourceObservationId,acquiredContentId:r.acquiredContentId}}:{}),id:r.id,source:item.sourceId,title:r.title,url:r.canonicalUrl,publishedAt:r.publishedAt??'',text:r.representation==='LISTING_RESULT'?'[Source content: catalogue/listing snapshot. Descriptions, ratings and review excerpts are not full linked reviews. Do not infer a product release or news event date from this page timestamp.]\n'+(r.body??r.title??''):r.body??r.title??''})),prior,windowStart:window.start,windowEnd:window.end};
 const value={editorAccountingPolicy:'complete-source-decisions-v1' as const,editorFailurePolicy:'isolate-unusable-chunks-v1' as const,admissionPolicy:V3_ADMISSION_POLICY,admissions,...(cutoffPolicy?{cutoffPolicy}:{}),citationCoverage:true,noveltyGuard:true,...(architecture?{architecture}:{}),...(window.scheduledFor?{scheduledFor:window.scheduledFor}:{}),promptVersion,feedId,feedRevision:feed.revision,input,models,evidenceRevisionIds:active.map(e=>e.revision.id)};
 const fingerprint=await sha256(canonicalJson({policy:POLICY,...value}));return {id:fingerprint,fingerprint,...value};
}

/** Uses the product account ledger, rate limits, immutable operation identities,
 * provider receipt recovery and uncertain-charge fences. No V3 spend ledger. */
function durableV3Port(store:V1FeedStore,env:Env,snapshot:V3WindowInput,windowId:string,now:()=>string,fetcher:typeof fetch,operations:Set<string>):ModelPort&{drain():Promise<void>}{
 let active=0;const waiting:Array<()=>void>=[];const limit=configuredProviderLimits(env,'openrouter').maxConcurrent;
 const complete=async(request:ModelRequest)=>{
  if(active>=limit)await new Promise<void>(resolve=>waiting.push(resolve));active++;
  try{
   const {signal:_,...state}=request;
   const admission=admitModelOperation(request.model,state,{type:'object',properties:{},required:[],additionalProperties:false},modelCapability(request.model,env.V1_MODEL_CAPABILITIES_JSON),request.maxTokens);
   admission.providerLimits=configuredProviderLimits(env,'openrouter');
   let usage={calls:1,costUsd:admission.reservationCostUsd,reported:false,tokensIn:0,tokensOut:0};
   let intent:SemanticIntent|undefined,responseCheckpoint:ResponseCheckpoint|undefined,checkpointBookkeepingFailed=false;
   const transport=openAiCompatibleModel({url:'https://openrouter.ai/api/v1/chat/completions',apiKey:env.OPENROUTER_API_KEY!,retries:0,reportCost:true,prices:{},fetcher:async(url,init)=>{
    const response=await fetcher(url,init),header=providerResponseReceipt(response,'OPENROUTER',request.model);
    if(response.ok){
     // Save correlation concurrently, but a D1 refusal must not prevent reading
     // and checkpointing the complete body. Keep handles for genuinely lost bodies.
     let headerError:unknown;const headerSaved=captureProviderReceipt(header).catch(error=>{headerError=error});
     const reader=response.body?.getReader();if(!reader){await headerSaved;throw Error('SEMANTIC_PROVIDER_BODY_MISSING')}let raw='',bytes=0;const decoder=new TextDecoder();try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2_000_000)throw Error('SEMANTIC_PROVIDER_RESPONSE_TOO_LARGE');raw+=decoder.decode(part.value,{stream:true})}raw+=decoder.decode()}catch(error){await headerSaved;throw error}finally{await reader.cancel().catch(()=>{})}
     if(env.RAW_ARCHIVE&&intent)try{responseCheckpoint=await saveV3Response(env.RAW_ARCHIVE,intent,raw,header)}catch(error){if(error instanceof Error&&/^SEMANTIC_RESPONSE_CHECKPOINT_/.test(error.message))throw error;console.warn(JSON.stringify({type:'V3_RESPONSE_CHECKPOINT_WRITE_UNAVAILABLE',operationId:intent.id}));}
     try{
      await headerSaved;if(headerError)throw headerError;
      const body=JSON.parse(raw) as {id?:string;usage?:{cost?:number;prompt_tokens?:number;completion_tokens?:number}};const receipt=providerBodyReceipt(header,body.id);await captureProviderReceipt({...receipt,stage:'GENERATION'});
      const cost=body.usage?.cost;if(typeof cost==='number'&&Number.isFinite(cost)&&cost>=0){usage={calls:1,costUsd:cost,reported:true,tokensIn:body.usage?.prompt_tokens??0,tokensOut:body.usage?.completion_tokens??0};await captureProviderReceipt({...receipt,stage:'USAGE',reportedCostUsd:cost,inputTokens:usage.tokensIn,outputTokens:usage.tokensOut})}
     }catch(error){if(responseCheckpoint&&!(error instanceof Error&&/^SEMANTIC_PROVIDER_(RECEIPT|MODEL|RESPONSE)/.test(error.message))){checkpointBookkeepingFailed=true;throw new ResponseCheckpointPending()}throw error}
     return new Response(raw,{status:response.status,headers:response.headers});
    }await captureProviderReceipt(header);return response;
   }});
   const result=await durableSemanticOperation(store,{feedId:snapshot.feedId,feedRevision:snapshot.feedRevision,evidenceRevisionIds:snapshot.evidenceRevisionIds,kind:'V3_EDITOR_VERIFIER',policyVersion:POLICY,model:request.model,budgetKey:`v3:${windowId}`,state:{inputId:snapshot.fingerprint,...(snapshot.cutoffPolicy?{cutoffPolicy:snapshot.cutoffPolicy,cutoffInputId:snapshot.id}:{}),request:state}},async ownedIntent=>{
    intent=ownedIntent;let value;try{value=await transport.complete(request)}catch(error){if(checkpointBookkeepingFailed)throw new ResponseCheckpointPending();throw error}if(!usage.reported)throw Error('SEMANTIC_OUTCOME_UNKNOWN');return {value,usage,responseCheckpoint};
   },now(),()=>usage,{operationAdmission:admission,...(env.RAW_ARCHIVE?{recoverResponse:(owned:SemanticIntent)=>recoverV3Response(env.RAW_ARCHIVE,owned)}:{})});
   operations.add(result.id);
   if(result.status!=='SUCCEEDED'&&result.usage.calls===1&&!result.usage.reported){
    const isolated=await store.db.prepare("SELECT 1 FROM v1_feed_documents q JOIN v1_model_spending_reservations r ON r.id=q.id WHERE q.kind='model_execution_quarantines' AND q.id=? AND q.feed_id=? AND r.feed_id=q.feed_id AND json_extract(q.json,'$.accountId')=r.account_id AND json_extract(q.json,'$.reservationToken')=r.token").bind('semantic_intents:'+result.id,snapshot.feedId).first();
    if(isolated)throw new SettledV3CallFailure(result.id,'V3_UNCERTAIN_CALL_ISOLATED');
   }
   if(result.status==='DEFERRED'&&result.failure==='SEMANTIC_PROVIDER_FAILURE'&&result.usage.calls===1&&result.usage.reported)throw new SettledV3CallFailure(result.id);
   if(result.status!=='SUCCEEDED'||!result.value)throw new ModelSpendingWait(!result.usage.reported?'SEMANTIC_OUTCOME_UNKNOWN':result.failure??'SEMANTIC_PROVIDER_FAILURE');
   return result.value;
  }finally{active--;waiting.shift()?.()}
 };
 const inFlight=new Set<Promise<unknown>>();
 return {complete(request){const promise=complete(request);inFlight.add(promise);void promise.then(()=>inFlight.delete(promise),()=>inFlight.delete(promise));return promise},async drain(){await Promise.allSettled([...inFlight])}};
}

/** Reuse the scheduler's window identity and lease. Provider work runs outside
 * exclusive feed write turns; final publication remains one fenced transaction. */
export async function publishProductV3Window(env:Env,feedId:string,window:PublicationWindow,id:string,now:()=>string,fetcher:typeof fetch):Promise<BriefingEditionRecord|undefined>{
 return withSemanticWorkLease(env.DB,feedId,async store=>{
  // Editor/verifier batches share this store. Serialize only their database
  // transactions so local siblings cannot starve one another's feed write turn.
  // Provider execution remains outside feedTransact and keeps its own limits.
  store.transactionQueue={tail:Promise.resolve()};
  const existing=await store.read<BriefingEditionRecord>(feedId,'editions',id);if(existing)return existing;
  const request=await store.read<BriefingRequest>(feedId,'briefing_requests',id);
  // A previously queued delivery may reach this callback after catch-up
  // deferred its unstarted request. Never freeze or pay for that old window.
  if(!request||request.state!=='PENDING'||request.engine!=='v3')return undefined;
  let snapshot=await store.read<V3WindowInput>(feedId,'v3_window_inputs',request?.v3InputId??id);
  if(!snapshot){const prepared=await prepareV3Window(store,feedId,window,now(),productV3Models(env),productV3PromptVersion(env));snapshot=await feedTransact(store,feedId,async tx=>{
   const prior=await tx.read<V3WindowInput>('v3_window_inputs',id);if(prior)return prior;
   if(tx.snapshot.feed.revision!==prepared.feedRevision)throw new HandoffError('TEMPORARY_UNAVAILABLE');
   const frozen={...prepared,id};await tx.write('v3_window_inputs',id,frozen);return frozen;
  })}
  // Refresh only unstarted work; retain the predecessor and its paid identity.
  // A deleted/revoked source never supplies authority for a replacement input.
  const activeIds=await store.activeEvidenceRevisionIds(feedId);
  if(snapshot.cutoffPolicy){
   if(!await cutoffEvidenceAuthorized(store,snapshot))throw new HandoffError('SCOPE_DENIED');
  }else if(snapshot.evidenceRevisionIds.some(ref=>!activeIds.has(ref))){
   const prepared=await prepareV3Window(store,feedId,window,now(),snapshot.models,snapshot.promptVersion??1,snapshot.architecture,false),priorSnapshot=snapshot;
   if(prepared.feedRevision!==priorSnapshot.feedRevision)throw new HandoffError('SCOPE_DENIED');
   for(const ref of priorSnapshot.evidenceRevisionIds.filter(ref=>!activeIds.has(ref))){
    const revision=await store.revision(feedId,ref);
    const replacement=revision&&await store.db.prepare("SELECT 1 FROM v1_evidence e JOIN v1_intake_scopes s ON s.id=e.feed_source_id WHERE e.id=? AND s.feed_id=? AND json_extract(e.json,'$.state')='ACTIVE' AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL").bind(revision.evidenceId,feedId).first();
    if(!replacement)throw new HandoffError('SCOPE_DENIED');
   }
   snapshot=await feedTransact(store,feedId,async tx=>{
    const current=await tx.read<BriefingRequest>('briefing_requests',id);
    if(!current||current.engine!=='v3'||(current.v3InputId??id)!==priorSnapshot.id||tx.snapshot.feed.revision!==prepared.feedRevision)throw new HandoffError('TEMPORARY_UNAVAILABLE');
    const started=await store.db.prepare("SELECT 1 FROM v1_feed_documents WHERE feed_id=? AND kind='semantic_intents' AND json_extract(json,'$.input.state.inputId')=? LIMIT 1").bind(feedId,priorSnapshot.fingerprint).first();
    if(started||await tx.read('v3_window_results',priorSnapshot.id))throw new ModelSpendingWait('V3_FROZEN_EVIDENCE_SUPERSEDED');
    const inputId=await sha256(canonicalJson([id,'unstarted-evidence-recovery-v1',prepared.fingerprint]));
    const next={...prepared,id:inputId,recovery:{priorInputId:priorSnapshot.id,recoveredAt:now(),reason:'SUPERSEDED_UNSTARTED_EVIDENCE' as const}};
    await tx.write('v3_window_inputs',inputId,next);
    await tx.write('briefing_requests',id,{...current,v3InputId:inputId});
    return next;
   });
  }
  const frozen=snapshot;
  let saved=await store.read<V3WindowResult>(feedId,'v3_window_results',frozen.id);
  if(!saved){const operations=new Set<string>(),port=durableV3Port(store,env,frozen,id,now,fetcher,operations);let result:BriefingResult;
   try{result=await generateBriefing(frozen.input,port,frozen.models,{editorAccountingPolicy:frozen.editorAccountingPolicy,editorFailurePolicy:frozen.editorFailurePolicy,citationCoverage:frozen.citationCoverage,noveltyGuard:frozen.noveltyGuard,...(frozen.architecture?{architecture:frozen.architecture}:{}),promptVersion:frozen.promptVersion??1,now:()=>new Date(window.end),prepare:{maxArticleChars:Number.MAX_SAFE_INTEGER,minChars:1,nearDuplicate:1.01}})}finally{await port.drain()}
   saved={id:frozen.id,feedId,inputId:frozen.fingerprint,windowEnd:window.end,result,operationIds:[...operations].sort()};
   await feedTransact(store,feedId,tx=>tx.write('v3_window_results',frozen.id,saved!));
  }
  const completed=saved;
  // Opt-in chaos test after the durable result: retries reuse original paid
  // operation identities. No hook query or behavior change in normal deployments.
  await campaignInterruptAfterResult(env,feedId);
  if(window.scheduledFor&&Date.parse(now())<Date.parse(window.scheduledFor)){
   await feedTransact(store,feedId,async tx=>{
    const request=await tx.read<BriefingRequest>('briefing_requests',id);
    if(request?.state==='PENDING'&&(request.reason!=='AWAITING_SCHEDULED_DELIVERY'||request.nextAttemptAt!==window.scheduledFor))await tx.write('briefing_requests',id,{...request,reason:'AWAITING_SCHEDULED_DELIVERY',nextAttemptAt:window.scheduledFor});
   });return undefined;
  }
  let stagedArtifact:{objectKey:string;createdAt:string}|null|undefined;
  return feedTransact(store,feedId,async tx=>{
   const prior=await tx.read<BriefingEditionRecord>('editions',id);if(prior)return prior;
   const request=await tx.read<BriefingRequest>('briefing_requests',id);if(!request||request.engine!=='v3'||tx.snapshot.feed.revision!==frozen.feedRevision)throw new HandoffError('SCOPE_DENIED');
   const coverage=await windowIntakeCoverage(env.DB,feedId,window.end,{v3:true,now:now(),deferIntake:frozen.cutoffPolicy===CUTOFF_EDITION_POLICY,deferAcquisition:completed.result.status==='published'&&Boolean(window.scheduledFor)&&Date.parse(now())>=Date.parse(window.scheduledFor!)});if(coverage.pendingJobs)throw new HandoffError('TEMPORARY_UNAVAILABLE');
   if(env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'){
    const collection=await pendingWindowCollections(env.DB,feedId,window.end,true,{scheduledFor:window.scheduledFor,now:Date.parse(now())});
    if(collection.pending)throw new HandoffError('TEMPORARY_UNAVAILABLE');
    if(collection.deadlineReleased){coverage.state='INCOMPLETE';coverage.failures.push({kind:'COLLECTION',code:'COLLECTION_DEFERRED_AT_REPORTING_CUTOFF',count:collection.deadlineReleased});}
    if(collection.continuing){coverage.state='INCOMPLETE';coverage.failures.push({kind:'COLLECTION',code:'COLLECTION_CONTINUING_AFTER_CUTOFF',count:collection.continuing});}
    if(collection.unavailable){coverage.state='INCOMPLETE';coverage.failures.push({kind:'COLLECTION',code:'COLLECTION_BACKPRESSURE_AT_DEADLINE',count:collection.unavailable});coverage.unavailableCollections=collection.unavailableSources;}
   }
   if(frozen.cutoffPolicy){if(!await cutoffEvidenceAuthorized(store,frozen))throw new HandoffError('SCOPE_DENIED');}
   else{const active=await store.activeEvidenceRevisionIds(feedId);if(frozen.evidenceRevisionIds.some(r=>!active.has(r)))throw new HandoffError('SCOPE_DENIED');}
   const result=completed.result;
   if(result.status!=='published'){
    await tx.write('briefing_requests',id,{...request,coverage,state:'DONE',result:result.status==='rejected'||coverage.state!=='COMPLETE'?'DEFERRED':'QUIET',reason:result.status==='rejected'?(result.dropped.some(d=>/EDITOR_ACCOUNTING/.test(d.reason))?'V3_EDITOR_ACCOUNTING_INCOMPLETE':'V3_VERIFICATION_REJECTED'):coverage.state!=='COMPLETE'?'INCOMPLETE_INTAKE_COVERAGE':'NO_SELECTED_DEVELOPMENTS',completedAt:now()});return undefined;
   }
   const edition=await v3Edition(tx,id,frozen,completed,now());
   if(env.EDITION_ARTIFACTS_ENABLED==='true'&&stagedArtifact===undefined){
    stagedArtifact=null;
    try{
     const payload=await buildEditionDeliveryPayload(env.DB,edition);
     const ref=await stageVerifiedArchive(env,'EDITION',feedId,id,JSON.stringify(payload));
     stagedArtifact={objectKey:ref.objectKey,createdAt:edition.createdAt};
    }catch{console.warn('Edition artifact preparation deferred');}
   }
   if(stagedArtifact?.createdAt===edition.createdAt)tx.editionDelivery={id,...stagedArtifact};
   await tx.write('editions',id,edition);await tx.write('publication_status',id,{id,feedId,status:'PUBLISHED',publishedAt:edition.createdAt});
   await tx.write('fidelity_results',id,{id,feedId,passed:true,protocol:POLICY,resultId:completed.id});
   await tx.write('delivery_jobs',id,{id,feedId,editionId:id,state:'PENDING',attempts:0,createdAt:edition.createdAt});
   // The edition itself is V3's reader memory. Do not fabricate canonical Events.
   await tx.write('ledger_projections',JSON.stringify([id,'grounded-communication-ledger-v1']),{id:JSON.stringify([id,'grounded-communication-ledger-v1']),feedId,editionId:id,entryIds:[],policyVersion:POLICY});
   await tx.write('briefing_requests',id,{...request,coverage,state:'DONE',result:'PUBLISHED',reason:undefined,completedAt:edition.createdAt});return edition;
  // Artifact-enabled callbacks also stage R2 data; keep that preparation outside
  // canonical admission until artifact staging has its own preparation phase.
  },completed.result.status==='published',env.EDITION_ARTIFACTS_ENABLED!=='true');
 });
}

async function v3Edition(tx:FeedTransaction,id:string,input:V3WindowInput,saved:V3WindowResult,now:string):Promise<BriefingEditionRecord>{
 // Preserve every frozen revision check while avoiding one D1 round trip per source.
 await tx.preloadRevisions(input.evidenceRevisionIds);
 const revisions=new Map<string,EvidenceRevision>();for(const ref of input.evidenceRevisionIds){const r=await tx.revision(ref);if(!r)throw new HandoffError('SCOPE_DENIED');revisions.set(ref,r)}
 const stories=saved.result.items.map((item,i)=>({candidateId:`${id}:${i}`,claims:[{id:`${id}:${i}:text`,text:`${item.headline}\n${item.body}`,support:item.sourceIds.map(ref=>{const r=revisions.get(ref);if(!r)throw new HandoffError('SCOPE_DENIED');return {evidenceRevisionId:ref,quote:r.body??r.title??''}})}]}));
 return {engine:'v3',id,...(input.id!==id?{v3InputId:input.id}:{}),feedId:input.feedId,feedRevision:input.feedRevision,windowStart:input.input.windowStart,windowEnd:input.input.windowEnd,...(input.scheduledFor?{scheduledFor:input.scheduledFor}:{}),language:input.input.feed.language,selectionId:id,selectedCandidateIds:stories.map(s=>s.candidateId),eventVersionIds:[],storylineVersionIds:[],evidenceRevisionIds:[...new Set(stories.flatMap(s=>s.claims.flatMap(c=>c.support.map(r=>r.evidenceRevisionId))))].sort(),stories,generation:{model:`${input.models.editor};${input.models.verifier}`,provider:'OPENROUTER',promptVersion:POLICY,routerVersion:POLICY,tokensIn:saved.result.usage.inputTokens,tokensOut:saved.result.usage.outputTokens,cost:saved.result.usage.costUsd??0,latencyMs:saved.result.timings.totalMs,usageConfirmed:true,verificationId:id},selectionPolicyVersion:POLICY,groundingPolicyVersion:POLICY,createdAt:now};
}

/** The V3 edition is a projection of an immutable verified result, never a
 * bypass around the V2 selection graph validator. Source scope remains live. */
export async function validateV3Edition(tx:FeedTransaction,edition:BriefingEditionRecord):Promise<void>{
 const inputId=edition.v3InputId??edition.id;
 const input=await tx.read<V3WindowInput>('v3_window_inputs',inputId),saved=await tx.read<V3WindowResult>('v3_window_results',inputId);
 if(!input||!saved||saved.inputId!==input.fingerprint||saved.result.status!=='published'||input.feedRevision!==tx.snapshot.feed.revision)throw new HandoffError('SCOPE_DENIED');
 if(input.cutoffPolicy){if(!await cutoffEvidenceAuthorized(tx.store,input))throw new HandoffError('SCOPE_DENIED');}
 else{const active=await tx.store.activeEvidenceRevisionIds(edition.feedId);if(input.evidenceRevisionIds.some(id=>!active.has(id)))throw new HandoffError('SCOPE_DENIED');}
 for(const id of saved.operationIds){const operation=await tx.read<{status:string;usage:{reported:boolean};input:{state:{inputId:string}}}>('semantic_results',id);if(operation?.status!=='SUCCEEDED'||!operation.usage.reported||operation.input.state.inputId!==input.fingerprint)throw new HandoffError('SCOPE_DENIED')}
 if(!saved.operationIds.length||canonicalJson(edition)!==canonicalJson(await v3Edition(tx,edition.id,input,saved,edition.createdAt)))throw new HandoffError('SCOPE_DENIED');
}
