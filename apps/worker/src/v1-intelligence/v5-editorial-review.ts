import {readingBudgetWords,type ModelResponse} from '@distilled/briefing';
import {HandoffError} from '@distilled/contracts';
import type {Env} from '../types';
import type {BriefingEditionRecord} from './publication';
import type {BriefingRequest} from './runtime';
import type {SemanticOperationResult} from './semantic-operations';
import {feedTransact,V1FeedStore,type FeedTransaction} from './store';
import {writeV3EditionForDelivery,type V3WindowInput,type V3WindowResult} from './v3-window';
import {
  approvedStories,currentReviewHistory,reviewDigest,reviewEvidenceAllowed,validateReviewCopy,V5ReviewError,
  type ReviewAction,type V5ReviewCase,type V5ReviewCheckpoint,type V5ReviewDecision,type V5ReviewRevision,type V5ReviewState,
} from './v5-review-contract';

function requireOwner(ownerId:string|undefined,editorId:string){
  if(!ownerId||ownerId!==editorId)throw new V5ReviewError('REVIEW_NOT_FOUND',404);
}
function requireReview(env:Env){
  if(env.BRIEFING_V5_EDITOR_REVIEW_ENABLED!=='true')throw new V5ReviewError('REVIEW_NOT_FOUND',404);
}

export async function listV5Reviews(env:Env,feedId:string,editorId:string){
  requireReview(env);
  const store=new V1FeedStore(env.DB),feed=await store.getFeed(feedId);
  requireOwner(feed?.deletedAt?undefined:feed?.ownerId,editorId);
  const rows=await env.DB.prepare("SELECT id,json_extract(json,'$.openedAt') openedAt,json_extract(json,'$.failure') failure FROM v1_feed_documents WHERE feed_id=? AND kind='v5_review_cases' ORDER BY openedAt DESC,id LIMIT 30").bind(feedId).all<{id:string;openedAt:string;failure:string|null}>();
  const states=await store.readMany<V5ReviewState>(feedId,'v5_review_states',rows.results.map(row=>row.id));
  return rows.results.map(row=>({...row,status:states.get(row.id)?.status??'editing'}));
}

async function reviewOperations(store:V1FeedStore,review:V5ReviewCase){
  const results=await store.readMany<SemanticOperationResult<ModelResponse>>(review.feedId,'semantic_results',review.operationIds);
  const reservations=new Map<string,{model:string;reserved_cost_usd:number;cost_usd:number|null;reported:number|null}>();
  for(let offset=0;offset<review.operationIds.length;offset+=80){
    const ids=review.operationIds.slice(offset,offset+80).map(id=>'semantic_intents:'+id);
    const rows=await store.db.prepare(
      'SELECT r.id,r.model,r.reserved_cost_usd,s.cost_usd,s.reported FROM v1_model_spending_reservations r '+
      'LEFT JOIN v1_model_spending_settlements s ON s.id=r.id AND s.token=r.token WHERE r.feed_id=? AND r.id IN ('+
      ids.map(()=>'?').join(',')+')',
    ).bind(review.feedId,...ids).all<{id:string;model:string;reserved_cost_usd:number;cost_usd:number|null;reported:number|null}>();
    for(const row of rows.results)reservations.set(row.id,row);
  }
  const operations=review.operationIds.map(id=>{
    const result=results.get(id),reservation=reservations.get('semantic_intents:'+id);
    const confirmed=reservation?.reported===1||Boolean(result?.usage.reported);
    const request=(result?.input.state as {inputId?:string;request?:{generation?:unknown;stageRoute?:{stage:string}}}|undefined);
    if(result&&request?.inputId!==review.fingerprint)throw new HandoffError('SCOPE_DENIED');
    return {
      id,model:result?.input.model??reservation?.model,stage:request?.request?.generation?'writer':request?.request?.stageRoute?.stage,
      reported:confirmed,calls:result?.usage.calls??Number(Boolean(reservation)),
      input:result?.usage.tokensIn??0,output:result?.usage.tokensOut??0,
      billedUsd:reservation?.reported===1?reservation.cost_usd??undefined:result?.usage.reported?result.usage.costUsd:undefined,
      unresolvedReserveUsd:confirmed?undefined:reservation?.reserved_cost_usd,
      originalWriterReply:request?.request?.generation?result?.value?.text:undefined,
    };
  });
  return {operations,
    usage:operations.reduce((sum,row)=>({calls:sum.calls+row.calls,input:sum.input+row.input,output:sum.output+row.output,
      knownBilledUsd:sum.knownBilledUsd+(row.billedUsd??0),unresolved:sum.unresolved+Number(!row.reported),
      unresolvedReserveUsd:sum.unresolvedReserveUsd+(row.unresolvedReserveUsd??0)}),
    {calls:0,input:0,output:0,knownBilledUsd:0,unresolved:0,unresolvedReserveUsd:0})};
}

export async function getV5Review(env:Env,feedId:string,windowId:string,editorId:string){
  requireReview(env);
  const store=new V1FeedStore(env.DB),feed=await store.getFeed(feedId);
  requireOwner(feed?.deletedAt?undefined:feed?.ownerId,editorId);
  const review=await store.read<V5ReviewCase>(feedId,'v5_review_cases',windowId);
  const input=review?await store.read<V3WindowInput>(feedId,'v3_window_inputs',review.inputId):undefined;
  if(!review||!input?.models.generation||input.fingerprint!==review.fingerprint)throw new V5ReviewError('REVIEW_NOT_FOUND',404);
  const [history,state,saved,accounting,checkpoints,revisions,decisions]=await Promise.all([
    currentReviewHistory(store,input),store.read<V5ReviewState>(feedId,'v5_review_states',windowId),
    store.read<V3WindowResult>(feedId,'v3_window_results',input.id),reviewOperations(store,review),
    env.DB.prepare("SELECT json FROM v1_feed_documents WHERE feed_id=? AND kind='v5_review_checkpoints' AND id>=? AND id<? ORDER BY id").bind(feedId,input.id+':',input.id+';').all<{json:string}>(),
    env.DB.prepare("SELECT json FROM v1_feed_documents WHERE feed_id=? AND kind='v5_review_revisions' AND id>=? AND id<? ORDER BY id").bind(feedId,windowId+':',windowId+';').all<{json:string}>(),
    env.DB.prepare("SELECT json FROM v1_feed_documents WHERE feed_id=? AND kind='v5_review_decisions' AND id>=? AND id<? ORDER BY id").bind(feedId,windowId+':',windowId+';').all<{json:string}>(),
  ]);
  const allSourcesAllowed=await reviewEvidenceAllowed(store,input,input.evidenceRevisionIds);
  // A revoked source remains in the protected audit record. Do not expose that
  // body or dependent text through the workbench after its authority lapses.
  const sources=allSourcesAllowed?input.input.articles:(await Promise.all(input.input.articles.map(async article=>
    await reviewEvidenceAllowed(store,input,[article.id])?article:undefined))).filter(article=>article!==undefined);
  const allowed=new Set(sources.map(article=>article.id));
  const candidates=checkpoints.results.map(row=>(JSON.parse(row.json) as V5ReviewCheckpoint).event).map(event=>({
    ...event,candidates:event.candidates?.filter(item=>item.sourceIds.every(id=>allowed.has(id))),
    reasons:event.reasons?.filter(item=>item.sourceIds.every(id=>allowed.has(id))),
  }));
  const allowedCopy=(revision:V5ReviewRevision)=>revision.stories.every(item=>item.support.every(binding=>allowed.has(binding.evidenceRevisionId)));
  const editHistory=revisions.results.map(row=>JSON.parse(row.json) as V5ReviewRevision);
  return {
    review,state:state??{id:windowId,feedId,version:0,status:'editing'},sources,candidates,
    revision:editHistory.find(revision=>revision.id===state?.revisionId&&allowedCopy(revision)),
    revisions:editHistory.map(revision=>allowedCopy(revision)?revision:{...revision,stories:undefined}),
    decisions:decisions.results.map(row=>JSON.parse(row.json) as V5ReviewDecision),
    result:allSourcesAllowed?saved?.result:undefined,
    operations:accounting.operations.map(row=>allSourcesAllowed?row:{...row,originalWriterReply:undefined}),
    usage:accounting.usage,inputHistory:input.input.prior??[],currentHistory:history.prior,historyDigest:history.digest,
    language:input.input.feed.language,interests:input.input.feed.interest,ceiling:readingBudgetWords(input.input.feed.windowMinutes),
    publicationEnabled:env.BRIEFING_V5_EDITOR_PUBLICATION_ENABLED==='true',newerEdition:history.newer,
  };
}

function verifyWindow(tx:FeedTransaction,review:V5ReviewCase|undefined,input:V3WindowInput|undefined,request:BriefingRequest|undefined){
  if(!review||!input?.models.generation||input.fingerprint!==review.fingerprint||
    request?.state!=='DONE'||request.result!=='DEFERRED'||request.reason!=='V5_SHADOW_REVIEW_REQUIRED'||
    (request.v3InputId??request.id)!==input.id||tx.snapshot.feed.revision!==input.feedRevision)
    throw new V5ReviewError('REVIEW_STALE_OR_UNAVAILABLE',409);
  return {input,review,request,generation:input.models.generation};
}

export async function updateV5Review(env:Env,feedId:string,windowId:string,editorId:string,action:ReviewAction,now:string){
  requireReview(env);
  if(action.action==='publish'&&env.BRIEFING_V5_EDITOR_PUBLICATION_ENABLED!=='true')
    throw new V5ReviewError('EDITOR_PUBLICATION_DISABLED',403);
  const store=new V1FeedStore(env.DB);
  requireOwner((await store.getFeed(feedId))?.ownerId,editorId);
  return feedTransact(store,feedId,async tx=>{
    requireOwner(tx.snapshot.feed.deletedAt?undefined:tx.snapshot.feed.ownerId,editorId);
    const [current,review,request]=await Promise.all([
      tx.read<V5ReviewState>('v5_review_states',windowId),tx.read<V5ReviewCase>('v5_review_cases',windowId),
      tx.read<BriefingRequest>('briefing_requests',windowId),
    ]);
    const state:V5ReviewState=current??{id:windowId,feedId,version:0,status:'editing'};
    const revision=state.revisionId?await tx.read<V5ReviewRevision>('v5_review_revisions',state.revisionId):undefined;
    if(state.status==='published'){
      if(action.action==='publish'&&action.version+1===state.version&&action.digest===revision?.digest)return state;
      throw new V5ReviewError('EDITION_ALREADY_PUBLISHED',409);
    }
    if(action.version!==state.version)throw new V5ReviewError('STALE_REVIEW_VERSION',409);
    const frozen=review?await tx.read<V3WindowInput>('v3_window_inputs',review.inputId):undefined;
    const {input,review:closedCase,request:shadowRequest,generation}=verifyWindow(tx,review,frozen,request);
    const version=state.version+1;
    if(action.action==='reject'){
      const decision:V5ReviewDecision={id:windowId+':'+version,feedId,windowId,version,editorId,at:now,
        decision:'reject',revisionId:revision?.id,digest:revision?.digest,note:action.note};
      await tx.write('v5_review_decisions',decision.id,decision);
      const next:V5ReviewState={...state,version,status:'rejected',decisionId:decision.id};
      await tx.write('v5_review_states',windowId,next);
      return next;
    }
    const history=await currentReviewHistory(store,input);
    if(history.newer)throw new V5ReviewError('MORE_RECENT_EDITION_EXISTS',409);
    if(action.action==='save'){
      if(action.historyDigest!==history.digest)throw new V5ReviewError('READER_HISTORY_CHANGED',409);
      await validateReviewCopy(tx,input,action.stories,history.prior);
      const content={inputId:input.id,historyDigest:history.digest,stories:action.stories};
      const nextRevision:V5ReviewRevision={...content,id:windowId+':'+version,feedId,windowId,
        digest:await reviewDigest(content),editorId,savedAt:now};
      await tx.write('v5_review_revisions',nextRevision.id,nextRevision);
      const next:V5ReviewState={id:windowId,feedId,version,status:'editing',revisionId:nextRevision.id};
      await tx.write('v5_review_states',windowId,next);
      return next;
    }
    if(!revision||revision.digest!==action.digest||revision.historyDigest!==history.digest)
      throw new V5ReviewError('STALE_REVIEW_TEXT_OR_HISTORY',409);
    await validateReviewCopy(tx,input,revision.stories,history.prior);
    if(action.action==='approve'){
      if(state.status!=='editing')throw new V5ReviewError('SAVE_NEW_REVISION_BEFORE_APPROVAL',409);
      const approved:V5ReviewDecision={id:windowId+':'+version,feedId,windowId,version,editorId,at:now,
        decision:'approve',revisionId:revision.id,digest:revision.digest};
      await tx.write('v5_review_decisions',approved.id,approved);
      const next:V5ReviewState={...state,version,status:'approved',decisionId:approved.id};
      await tx.write('v5_review_states',windowId,next);
      return next;
    }
    if(state.status!=='approved'||!state.decisionId)throw new V5ReviewError('EXACT_APPROVAL_REQUIRED',409);
    if(tx.snapshot.feed.paused)throw new V5ReviewError('FEED_PAUSED',409);
    if(Date.parse(input.scheduledFor??input.input.windowEnd)>Date.parse(now))throw new V5ReviewError('DELIVERY_WINDOW_NOT_OPEN',409);
    if(await tx.read('editions',windowId))throw new V5ReviewError('EDITION_ALREADY_PUBLISHED',409);
    const stories=approvedStories(windowId,revision.stories);
    const accounting=await reviewOperations(store,closedCase);
    const edition:BriefingEditionRecord={
      engine:'v3',id:windowId,feedId,feedRevision:input.feedRevision,v3InputId:input.id,editorialApprovalId:state.decisionId,
      scheduledFor:input.scheduledFor,windowStart:input.input.windowStart,windowEnd:input.input.windowEnd,
      language:input.input.feed.language,selectionId:windowId,createdAt:now,selectedCandidateIds:stories.map(story=>story.candidateId),
      eventVersionIds:[],storylineVersionIds:[],evidenceRevisionIds:[...new Set(revision.stories.flatMap(story=>story.support.map(ref=>ref.evidenceRevisionId)))].sort(),stories,
      generation:{model:generation.model,provider:'OPENROUTER',promptVersion:generation.prompt,
        routerVersion:'v5-editor-approved-v1',tokensIn:accounting.usage.input,tokensOut:accounting.usage.output,cost:accounting.usage.knownBilledUsd,
        latencyMs:0,usageConfirmed:accounting.usage.unresolved===0},
      selectionPolicyVersion:'v5-editor-approved-v1',groundingPolicyVersion:'v5-editor-attestation-v1',
    };
    const next:V5ReviewState={...state,version,status:'published',publishedDigest:await reviewDigest(edition)};
    await tx.write('v5_review_states',windowId,next);
    await writeV3EditionForDelivery(tx,edition);
    await tx.write('briefing_requests',windowId,{...shadowRequest,result:'PUBLISHED',reason:undefined,completedAt:now});
    return next;
  },action.action==='publish',true);
}
