import {generateBriefing,openAiCompatibleModel,type BriefingInput,type BriefingModels,type BriefingResult,type ModelPort,type ModelRequest} from '@distilled/briefing';
import {HandoffError,sha256,type EvidenceRevision} from '@distilled/contracts';
import type {Env} from '../types';
import {canonicalJson} from '../v1-intake/canonical';
import {captureProviderReceipt,providerBodyReceipt,providerResponseReceipt} from '../provider-receipt';
import {V1FeedStore,feedTransact,type FeedTransaction} from './store';
import {durableSemanticOperation} from './semantic-operations';
import {withSemanticWorkLease} from './semantic-work-lease';
import {admitModelOperation,modelCapability} from './model-capacity';
import {configuredProviderLimits} from './provider-routing';
import {newsWindowEligibility} from './window-delivery';
import {windowIntakeCoverage} from './window-coverage';
import {ModelSpendingWait} from './model-spending';
import type {PublicationWindow} from './scoring';
import type {BriefingEditionRecord} from './publication';
import type {BriefingRequest} from './runtime';

const POLICY='v3-fixed-window-editor-verifier-v1';
export interface V3WindowInput {promptVersion?:1|2|3|4;id:string;fingerprint:string;feedId:string;feedRevision:number;input:BriefingInput;models:BriefingModels;evidenceRevisionIds:string[]}
interface V3WindowResult {id:string;feedId:string;inputId:string;windowEnd:string;result:BriefingResult;operationIds:string[]}
export const productV3Enabled=(env:Pick<Env,'BRIEFING_ENGINE'>)=>env.BRIEFING_ENGINE==='v3';
export const productV3Ready=(env:Env)=>Boolean(env.OPENROUTER_API_KEY);
export const productV3Models=(env:Env):BriefingModels=>({editor:env.BRIEFING_EDITOR_MODEL??'openai/gpt-4.1',verifier:env.BRIEFING_VERIFIER_MODEL??'openai/gpt-4.1-mini'});

/** Read-through preparation is mechanical. The window is frozen only at close,
 * so arrivals during preparation are included without paying twice. */
export async function prepareV3Window(store:V1FeedStore,feedId:string,window:PublicationWindow,now:string,models:BriefingModels={editor:'openai/gpt-4.1',verifier:'openai/gpt-4.1-mini'}):Promise<V3WindowInput>{
 const feed=await store.getFeed(feedId);if(!feed||feed.paused||feed.deletedAt)throw new HandoffError('SCOPE_DENIED');
 if(!['en','ar','fr'].includes(feed.outputLanguage))throw Error('V3_UNSUPPORTED_LANGUAGE');
 const editions=(await store.publishedEditionHistory(feedId)).filter(e=>Date.parse(e.windowEnd)<=Date.parse(window.start));
 const prior=editions.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).flatMap(e=>e.stories.map(s=>({id:`${e.id}:${s.candidateId}`,at:e.createdAt,headline:s.claims[0]?.text??'',body:s.claims.map(c=>c.text).join('\n')})));
 const previouslyUsed=new Set(editions.flatMap(e=>e.evidenceRevisionIds));
 const evidence=await store.currentEvidence(feedId);
 const previousEvidenceIds=evidence.length?new Set((await store.revisionEvidenceIds(feedId,[...previouslyUsed])).values()):new Set<string>();
 const previousResults=evidence.length?await store.list<V3WindowResult>(feedId,'v3_window_results'):[];
 const retryIds=new Set<string>();
 for(const previous of previousResults.sort((a,b)=>a.windowEnd.localeCompare(b.windowEnd))){
  for(const id of [...previous.result.items.flatMap(i=>i.sourceIds),...previous.result.skipped.map(s=>s.id),...previous.result.omitted.flatMap(o=>o.sourceIds),...previous.result.dropped.flatMap(d=>d.sourceIds)])retryIds.delete(id);
  for(const dropped of previous.result.dropped.filter(d=>d.carry))for(const id of dropped.sourceIds)retryIds.add(id);
 }
 const observedAt=new Map<string,string|null>();
 const ids=[...new Set(evidence.map(e=>e.revision.id))];
 for(let offset=0;offset<ids.length;offset+=90){
  const page=ids.slice(offset,offset+90);
  const observations=await store.db.prepare(`SELECT r.id,json_extract(i.json,'$.observation.observedAt') observedAt FROM v1_revisions r JOIN v1_intake_scopes s ON s.id=r.feed_source_id LEFT JOIN v1_inputs i ON i.id=json_extract(r.json,'$.sourceObservationId') AND i.feed_source_id=r.feed_source_id WHERE s.feed_id=? AND r.id IN (${page.map(()=>'?').join(',')})`).bind(feedId,...page).all<{id:string;observedAt:string|null}>();
  for(const row of observations.results)observedAt.set(row.id,row.observedAt);
 }
 const beforeClose=(r:EvidenceRevision)=>Date.parse(observedAt.get(r.id)??r.acceptedAt)<Date.parse(window.end);
 const active=evidence.filter(({revision:r})=>{
  if(!beforeClose(r))return false;
  if(previouslyUsed.has(r.id)&&!retryIds.has(r.id))return false;
  const eligibility=newsWindowEligibility([r],window,feed.createdAt);
  const revised=previousEvidenceIds.has(r.evidenceId)&&Date.parse(r.acceptedAt)>=Date.parse(window.start);
  return eligibility==='IN_WINDOW'||eligibility==='LATE_DISCOVERY'||eligibility!=='AFTER_WINDOW'&&(revised||retryIds.has(r.id));
 });
 const pending=(await store.unresolvedPublicationWindows(feedId)).filter(r=>Date.parse(r.window.end)<=Date.parse(window.start)&&Date.parse(r.window.start)>=Date.parse(feed.createdAt));
 const carried=evidence.filter(({revision:r})=>!active.some(a=>a.revision.id===r.id)&&!previouslyUsed.has(r.id)&&beforeClose(r)&&pending.some(p=>newsWindowEligibility([r],p.window,feed.createdAt)==='IN_WINDOW'));
 active.push(...carried);active.sort((a,b)=>a.revision.id.localeCompare(b.revision.id));
 const input:BriefingInput={feed:{interest:feed.interests.join('\n'),language:feed.outputLanguage as 'en'|'ar'|'fr',windowMinutes:(Date.parse(window.end)-Date.parse(window.start))/60000,style:'Use the original source publication dates. Label late discoveries and source revisions with accurate temporal context; acquisition time is not event time.'},articles:active.map(({item,revision:r})=>({id:r.id,source:item.sourceId,title:r.title,url:r.canonicalUrl,publishedAt:r.publishedAt??'',text:r.body??r.title??''})),prior,windowStart:window.start,windowEnd:window.end};
 const value={promptVersion:4 as const,feedId,feedRevision:feed.revision,input,models,evidenceRevisionIds:active.map(e=>e.revision.id)};
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
   const transport=openAiCompatibleModel({url:'https://openrouter.ai/api/v1/chat/completions',apiKey:env.OPENROUTER_API_KEY!,retries:0,reportCost:true,prices:{},fetcher:async(url,init)=>{
    const response=await fetcher(url,init),header=providerResponseReceipt(response,'OPENROUTER',request.model);await captureProviderReceipt(header);
    if(response.ok){
     const reader=response.body?.getReader();if(!reader)throw Error('SEMANTIC_PROVIDER_BODY_MISSING');let raw='',bytes=0;const decoder=new TextDecoder();try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2_000_000)throw Error('SEMANTIC_PROVIDER_RESPONSE_TOO_LARGE');raw+=decoder.decode(part.value,{stream:true})}raw+=decoder.decode()}finally{await reader.cancel().catch(()=>{})}
     const body=JSON.parse(raw) as {id?:string;usage?:{cost?:number;prompt_tokens?:number;completion_tokens?:number}};const receipt=providerBodyReceipt(header,body.id);await captureProviderReceipt({...receipt,stage:'GENERATION'});
     const cost=body.usage?.cost;if(typeof cost==='number'&&Number.isFinite(cost)&&cost>=0){usage={calls:1,costUsd:cost,reported:true,tokensIn:body.usage?.prompt_tokens??0,tokensOut:body.usage?.completion_tokens??0};await captureProviderReceipt({...receipt,stage:'USAGE',reportedCostUsd:cost,inputTokens:usage.tokensIn,outputTokens:usage.tokensOut})}
     return new Response(raw,{status:response.status,headers:response.headers});
    }return response;
   }});
   const result=await durableSemanticOperation(store,{feedId:snapshot.feedId,feedRevision:snapshot.feedRevision,evidenceRevisionIds:snapshot.evidenceRevisionIds,kind:'V3_EDITOR_VERIFIER',policyVersion:POLICY,model:request.model,budgetKey:`v3:${windowId}`,state:{inputId:snapshot.fingerprint,request:state}},async()=>{
    const value=await transport.complete(request);if(!usage.reported)throw Error('SEMANTIC_OUTCOME_UNKNOWN');return {value,usage};
   },now(),()=>usage,{operationAdmission:admission});
   operations.add(result.id);
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
  const existing=await store.read<BriefingEditionRecord>(feedId,'editions',id);if(existing)return existing;
  let snapshot=await store.read<V3WindowInput>(feedId,'v3_window_inputs',id);
  if(!snapshot){const prepared=await prepareV3Window(store,feedId,window,now(),productV3Models(env));snapshot=await feedTransact(store,feedId,async tx=>{
   const prior=await tx.read<V3WindowInput>('v3_window_inputs',id);if(prior)return prior;
   if(tx.snapshot.feed.revision!==prepared.feedRevision)throw new HandoffError('TEMPORARY_UNAVAILABLE');
   const frozen={...prepared,id};await tx.write('v3_window_inputs',id,frozen);return frozen;
  })}
  const frozen=snapshot;
  let saved=await store.read<V3WindowResult>(feedId,'v3_window_results',id);
  if(!saved){const operations=new Set<string>(),port=durableV3Port(store,env,frozen,id,now,fetcher,operations);let result:BriefingResult;
   try{result=await generateBriefing(frozen.input,port,frozen.models,{promptVersion:frozen.promptVersion??1,now:()=>new Date(window.end),prepare:{maxArticleChars:Number.MAX_SAFE_INTEGER,minChars:1,nearDuplicate:1.01}})}finally{await port.drain()}
   saved={id,feedId,inputId:frozen.fingerprint,windowEnd:window.end,result,operationIds:[...operations].sort()};
   await feedTransact(store,feedId,tx=>tx.write('v3_window_results',id,saved!));
  }
  const completed=saved;
  return feedTransact(store,feedId,async tx=>{
   const prior=await tx.read<BriefingEditionRecord>('editions',id);if(prior)return prior;
   const request=await tx.read<BriefingRequest>('briefing_requests',id);if(!request||request.engine!=='v3'||tx.snapshot.feed.revision!==frozen.feedRevision)throw new HandoffError('SCOPE_DENIED');
   const coverage=await windowIntakeCoverage(env.DB,feedId,window.end);if(coverage.pendingJobs)throw new HandoffError('TEMPORARY_UNAVAILABLE');
   const active=await store.activeEvidenceRevisionIds(feedId);if(frozen.evidenceRevisionIds.some(r=>!active.has(r)))throw new HandoffError('SCOPE_DENIED');
   const result=completed.result;
   if(result.status!=='published'){
    await tx.write('briefing_requests',id,{...request,coverage,state:'DONE',result:result.status==='rejected'||coverage.state!=='COMPLETE'?'DEFERRED':'QUIET',reason:result.status==='rejected'?'V3_VERIFICATION_REJECTED':coverage.state!=='COMPLETE'?'INCOMPLETE_INTAKE_COVERAGE':'NO_SELECTED_DEVELOPMENTS',completedAt:now()});return undefined;
   }
   const edition=await v3Edition(tx,id,frozen,completed,now());
   await tx.write('editions',id,edition);await tx.write('publication_status',id,{id,feedId,status:'PUBLISHED',publishedAt:edition.createdAt});
   await tx.write('fidelity_results',id,{id,feedId,passed:true,protocol:POLICY,resultId:completed.id});
   await tx.write('delivery_jobs',id,{id,feedId,editionId:id,state:'PENDING',attempts:0,createdAt:edition.createdAt});
   // The edition itself is V3's reader memory. Do not fabricate canonical Events.
   await tx.write('ledger_projections',JSON.stringify([id,'grounded-communication-ledger-v1']),{id:JSON.stringify([id,'grounded-communication-ledger-v1']),feedId,editionId:id,entryIds:[],policyVersion:POLICY});
   await tx.write('briefing_requests',id,{...request,coverage,state:'DONE',result:'PUBLISHED',reason:undefined,completedAt:edition.createdAt});return edition;
  });
 });
}

async function v3Edition(tx:FeedTransaction,id:string,input:V3WindowInput,saved:V3WindowResult,now:string):Promise<BriefingEditionRecord>{
 const revisions=new Map<string,EvidenceRevision>();for(const ref of input.evidenceRevisionIds){const r=await tx.revision(ref);if(!r)throw new HandoffError('SCOPE_DENIED');revisions.set(ref,r)}
 const stories=saved.result.items.map((item,i)=>({candidateId:`${id}:${i}`,claims:[{id:`${id}:${i}:text`,text:`${item.headline}\n${item.body}`,support:item.sourceIds.map(ref=>{const r=revisions.get(ref);if(!r)throw new HandoffError('SCOPE_DENIED');return {evidenceRevisionId:ref,quote:r.body??r.title??''}})}]}));
 return {engine:'v3',id,feedId:input.feedId,feedRevision:input.feedRevision,windowStart:input.input.windowStart,windowEnd:input.input.windowEnd,language:input.input.feed.language,selectionId:id,selectedCandidateIds:stories.map(s=>s.candidateId),eventVersionIds:[],storylineVersionIds:[],evidenceRevisionIds:[...new Set(stories.flatMap(s=>s.claims.flatMap(c=>c.support.map(r=>r.evidenceRevisionId))))].sort(),stories,generation:{model:`${input.models.editor};${input.models.verifier}`,provider:'OPENROUTER',promptVersion:POLICY,routerVersion:POLICY,tokensIn:saved.result.usage.inputTokens,tokensOut:saved.result.usage.outputTokens,cost:saved.result.usage.costUsd??0,latencyMs:saved.result.timings.totalMs,usageConfirmed:true,verificationId:id},selectionPolicyVersion:POLICY,groundingPolicyVersion:POLICY,createdAt:now};
}

/** The V3 edition is a projection of an immutable verified result, never a
 * bypass around the V2 selection graph validator. Source scope remains live. */
export async function validateV3Edition(tx:FeedTransaction,edition:BriefingEditionRecord):Promise<void>{
 const input=await tx.read<V3WindowInput>('v3_window_inputs',edition.id),saved=await tx.read<V3WindowResult>('v3_window_results',edition.id);
 if(!input||!saved||saved.inputId!==input.fingerprint||saved.result.status!=='published'||input.feedRevision!==tx.snapshot.feed.revision)throw new HandoffError('SCOPE_DENIED');
 const active=await tx.store.activeEvidenceRevisionIds(edition.feedId);if(input.evidenceRevisionIds.some(id=>!active.has(id)))throw new HandoffError('SCOPE_DENIED');
 for(const id of saved.operationIds){const operation=await tx.read<{status:string;usage:{reported:boolean};input:{state:{inputId:string}}}>('semantic_results',id);if(operation?.status!=='SUCCEEDED'||!operation.usage.reported||operation.input.state.inputId!==input.fingerprint)throw new HandoffError('SCOPE_DENIED')}
 if(!saved.operationIds.length||canonicalJson(edition)!==canonicalJson(await v3Edition(tx,edition.id,input,saved,edition.createdAt)))throw new HandoffError('SCOPE_DENIED');
}
