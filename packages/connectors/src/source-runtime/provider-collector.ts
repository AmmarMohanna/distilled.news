import { CONTRACT_VERSION, handoffConnectorBatch, hashContent, isIntakePrefixResolved, sha256, idSchema, collectionBoundsSchema } from '@distilled/contracts';
import type { CandidateIntakePort, CandidateProposal, SourceObservation } from '@distilled/contracts';
import type { ImmutablePayloadStore,FetchRun } from './ports';
import { D1ProviderSourceRepository, type StoredProviderBatch, type StoredProviderSnapshot } from './provider-storage';
import { DEFAULT_SOURCE_ORDER, SourceProviderError, type SourceFetchRequest, type SourceProvider, type ProviderAttempt } from './provider-types';
import {itemFingerprint} from './item-fingerprint';

export class FallbackSourceCollector {
  private providers:Map<string,SourceProvider>;
  constructor(private readonly repository:D1ProviderSourceRepository,private readonly payloads:ImmutablePayloadStore,
    private readonly intake:CandidateIntakePort,providers:SourceProvider[],private readonly now=()=>new Date().toISOString()) {
    if(new Set(providers.map(p=>p.id)).size!==providers.length)throw new Error('DUPLICATE_PROVIDER');
    this.providers=new Map(providers.map(p=>[p.id,p]));
  }
  async collect(request:SourceFetchRequest,order:readonly string[]=DEFAULT_SOURCE_ORDER[request.source.family],offset=0) {
    if(!order || order.length<1 || order.length>3 || new Set(order).size!==order.length || !Number.isInteger(request.limit) || request.limit<1 || request.limit>500)throw new Error('INVALID_SOURCE_POLICY');
    for(const id of [request.scope.feedId,request.scope.feedSourceId,request.scope.sourceId,request.runId,request.source.locator])idSchema.parse(id);
    collectionBoundsSchema.parse(request.requestedBounds);
    if(request.continuation&&(!order.includes(request.continuation.providerId)||!request.continuation.token))throw new Error('INVALID_PROVIDER_CONTINUATION');
    if(request.recheckItemKeys&&(!request.recheckItemKeys.length||request.recheckItemKeys.length>request.limit||new Set(request.recheckItemKeys).size!==request.recheckItemKeys.length))throw new Error('INVALID_RECHECK_KEYS');
    request.recheckItemKeys?.forEach(key=>idSchema.parse(key));
    if(!Number.isSafeInteger(offset)||offset<0||offset%request.limit!==0)throw new Error('INVALID_SNAPSHOT_OFFSET');
    const keyFor=(n:number)=>sha256(JSON.stringify([request.scope,request.runId,'provider-batch',n]));
    const batchKey=await keyFor(offset);
    const configurationKey=await sha256(JSON.stringify([request.scope,request.source,request.requestedBounds,request.limit,order]));
    const existing=await this.repository.loadProviderBatch(request.scope,batchKey);
    if(existing){if(existing.configurationKey!==configurationKey || JSON.stringify(existing.originalRequest)!==JSON.stringify(request))throw new Error('IDEMPOTENCY_CONFLICT');return this.deliver(existing,[]);}
    if(offset>0){
      const previous=await this.repository.loadProviderBatch(request.scope,await keyFor(offset-request.limit));
      const receipts=previous&&await this.repository.loadProviderReceipts(request.scope,previous.request.handoffId);
      if(!previous||previous.nextOffset!==offset||!receipts||!isIntakePrefixResolved(receipts,previous.request.observations.map(o=>o.id)))throw new Error('UNRESOLVED_SNAPSHOT_PREFIX');
    }
    const snapshotId=await keyFor(-1);
    const snapshot=await this.repository.loadSnapshot(request.scope,snapshotId);
    if(snapshot){
      if(snapshot.configurationKey!==configurationKey||JSON.stringify(snapshot.originalRequest)!==JSON.stringify(request))throw new Error('IDEMPOTENCY_CONFLICT');
      return this.materialize(snapshot,batchKey,offset,[]);
    }
    if(offset)throw new Error('SNAPSHOT_MISSING');
    const attempts:ProviderAttempt[]=[];
    for(const id of order) {
      // A continuation belongs to one provider. Changing provider starts a new collection;
      // it cannot quietly reinterpret the previous provider's cursor.
      if(request.continuation&&request.continuation.providerId!==id)continue;
      const provider=this.providers.get(id);
      if(!provider) {attempts.push({providerId:id,runId:request.runId,sequence:0,failure:'UNAVAILABLE'});continue;}
      if(!provider.families.includes(request.source.family))throw new Error('PROVIDER_FAMILY_MISMATCH');
      const runId=await sha256(JSON.stringify([request.scope,request.runId,id]));
      // Never refetch an uncertain run under the same sequence, especially a paid actor submission.
      if(await this.repository.loadRun(request.scope,runId)){
        const failed=await this.repository.loadAttempt(request.scope,runId);
        if(!failed)throw new SourceProviderError('UNCERTAIN_PAID_SUBMISSION');
        attempts.push(failed);
        if(['POLICY_REFUSAL','UNCERTAIN_PAID_SUBMISSION','BUDGET_EXCEEDED'].includes(failed.failure!))throw new SourceProviderError(failed.failure!);
        continue;
      }
      const run=await this.repository.allocate(request.scope,runId,configurationKey,this.now());
      if(!await this.repository.claimFetch(request.scope,runId))throw new SourceProviderError('UNCERTAIN_PAID_SUBMISSION');
      const cursor=await this.repository.cursor(request.scope,id,configurationKey);
      const actual={...request,continuation:request.continuation?.providerId===id?request.continuation:undefined,
        requestedBounds:{...request.requestedBounds,startCursor:request.requestedBounds.startCursor??cursor?.cursor}};
      try {
        const page=await provider.fetch(actual,run);
        if(page.items.length>10000 || !Number.isFinite(page.latencyMs) || page.latencyMs<0 || !Number.isSafeInteger(page.requests) || page.requests<0 || (page.complete&&page.continuationToken))throw new SourceProviderError('MALFORMED');
        // Validate the entire snapshot before committing it, including later slices.
        // Otherwise a malformed provider page permanently poisons replay and bypasses fallback.
        const keys=new Set<string>(),observationKeys=new Set<string>();
        for(const item of page.items){
          const key=item.identityValid?item.sourceItemKey:`invalid:${run.id}:${item.sourceItemKey}`;
          if(keys.has(item.sourceItemKey)||observationKeys.has(key)||
            (item.operation==='DELETE'&&item.authoritativeCurrentState!==true))throw new SourceProviderError('MALFORMED');
          keys.add(item.sourceItemKey);observationKeys.add(key);
        }
        const raw=await this.payloads.put(request.scope,page.raw,'application/octet-stream');
        const {raw:ignored,...savedPage}=page;
        const savedPayload=await this.payloads.put(request.scope,new TextEncoder().encode(JSON.stringify(savedPage)),'application/json');
        const saved:StoredProviderSnapshot={originalRequest:request,configurationKey,providerId:id,run,checkpointVersion:cursor?.version??0,
          actualBounds:actual.requestedBounds,rawRef:raw.ref,pageRef:savedPayload.ref};
        await this.repository.saveSnapshot(request.scope,snapshotId,saved);
        return await this.materialize(saved,batchKey,offset,attempts);
      } catch(error) {
        if(await this.repository.loadSnapshot(request.scope,snapshotId))throw error;
        if(!(error instanceof SourceProviderError))throw error;
        const a={providerId:id,runId:run.id,sequence:run.sequence,failure:error.code,retryNotBefore:error.retryNotBefore};
        attempts.push(a);await this.repository.attempt(request.scope,a);
        await this.failureCoverage(request,run,error.code);
        if(['POLICY_REFUSAL','UNCERTAIN_PAID_SUBMISSION','BUDGET_EXCEEDED'].includes(error.code))throw error;
      }
    }
    if(attempts.every(a=>a.sequence===0)){
      const failureRun=await this.repository.allocate(request.scope,await sha256(request.runId+':unavailable'),configurationKey,this.now());
      await this.failureCoverage(request,failureRun,'UNAVAILABLE');
    }
    return {state:'FETCH_FAILED' as const,attempts};
  }
  private async failureCoverage(request:SourceFetchRequest,run:FetchRun,failure:string){
    const reason=failure==='RATE_LIMIT'?'RATE_LIMIT':failure==='AUTH_REQUIRED'?'AUTH_REQUIRED':failure==='CHALLENGE'?'CHALLENGE':failure==='TRANSIENT'?'TRANSIENT_PROVIDER_FAILURE':'UNKNOWN';
    await this.repository.recordFailureCoverage({id:await sha256(run.id+':failure'),feedId:request.scope.feedId,feedSourceId:request.scope.feedSourceId,
      fetchRunId:run.id,fetchStartSequence:run.sequence,requestedBounds:request.requestedBounds,observedBounds:{},
      status:'UNKNOWN',continuationState:request.continuation?'PENDING':'NONE',continuationToken:request.continuation?.token,
      failureReason:reason,createdAt:run.startedAt});
  }
  private async materialize(snapshot:StoredProviderSnapshot,batchKey:string,offset:number,attempts:ProviderAttempt[]) {
        const {originalRequest:request,run,providerId:id,configurationKey}=snapshot;
        const page:Omit<import('./provider-types').ProviderPage,'raw'>=JSON.parse(new TextDecoder().decode(await this.payloads.get(request.scope,snapshot.pageRef)));
        const last=offset+request.limit>=page.items.length;
        if(offset>0&&offset>=page.items.length)throw new Error('INVALID_SNAPSHOT_OFFSET');
        const observations:SourceObservation[]=[],proposals:CandidateProposal[]=[];
        const seen=new Set<string>();
        for(const item of page.items){if(seen.has(item.sourceItemKey))throw new SourceProviderError('MALFORMED');seen.add(item.sourceItemKey);}
        seen.clear();
        for(const item of page.items.slice(offset,offset+request.limit)) {
          const op=item.operation??'UPSERT', key=item.identityValid?item.sourceItemKey:`invalid:${run.id}:${item.sourceItemKey}`;
          if(seen.has(key))throw new SourceProviderError('MALFORMED');seen.add(key);
          const o:SourceObservation={id:await sha256(JSON.stringify([request.scope,run.sequence,key,op])),...request.scope,
            fetchRunId:run.id,fetchStartSequence:run.sequence,sourceItemKey:key,operation:op,
            representation:item.representation,contentCompleteness:item.contentCompleteness,sourceRevision:item.sourceRevision,
            authoritativeCurrentState:item.authoritativeCurrentState??false,upstreamId:item.upstreamId,canonicalUrl:item.url,
            publisherId:item.publisherId,titleHint:item.title,publishedAtHint:item.publishedAt,languageHint:item.language,observedAt:run.startedAt};
          if(op==='DELETE' && !o.authoritativeCurrentState)throw new SourceProviderError('MALFORMED');
          if(op==='DELETE' && item.identityValid && await this.repository.knownItemHash(request.scope,key,request.configurationRevision??0)===await itemFingerprint(o))continue;
          if(op==='UPSERT' && (item.body || item.title)) {
            o.contentHash=await hashContent({representation:item.representation,title:item.title,body:item.body??''});
            // Only suppress an exact item fingerprint durably accepted in an earlier
            // run of this feed revision. Coverage still describes the fetched page.
            if(item.identityValid && await this.repository.knownItemHash(request.scope,key,request.configurationRevision??0)===await itemFingerprint(o))continue;
            const p=await this.payloads.put(request.scope,new TextEncoder().encode(JSON.stringify({
              body:item.body??'',title:item.title,canonicalUrl:item.url,publishedAt:item.publishedAt,language:item.language,
              representation:item.representation,contentCompleteness:item.contentCompleteness,publisherId:item.publisherId,
              sourceTitle:item.sourceTitle,excerpt:item.excerpt,author:item.author,updatedAt:item.updatedAt,firstSeenAt:run.startedAt
            })),'application/json');
            o.suppliedPayloadRef=p.ref;
            if(item.identityValid)proposals.push({observationId:o.id,...request.scope,sourceItemKey:key,connectorType:id,
              upstreamId:o.upstreamId,url:o.canonicalUrl,titleHint:o.titleHint,publishedAtHint:o.publishedAtHint,languageHint:o.languageHint,
              representation:o.representation,contentCompleteness:o.contentCompleteness,suppliedPayloadRef:p.ref,payloadHash:p.hash,
              discoveredAt:run.startedAt,discoveryRunId:run.id});
          }
          observations.push(o);
        }
        const batch:StoredProviderBatch={request:{contractVersion:CONTRACT_VERSION,handoffId:batchKey,observations,proposals,
          coverage:{id:await sha256(run.id+':coverage:'+offset),feedId:request.scope.feedId,feedSourceId:request.scope.feedSourceId,
            fetchRunId:run.id,fetchStartSequence:run.sequence,requestedBounds:snapshot.actualBounds,observedBounds:page.observedBounds??{},
            status:last&&page.complete?'COMPLETE':'PARTIAL',continuationState:!last||page.continuationToken?'PENDING':'NONE',
            continuationToken:!last?`snapshot:${offset+request.limit}`:page.continuationToken,safeCheckpointCursor:last&&!request.recheckItemKeys?page.provenSafeCursor:undefined,failureReason:'NONE',createdAt:run.startedAt}},
          originalRequest:request,providerId:id,configurationKey,checkpointVersion:snapshot.checkpointVersion,rawRef:snapshot.rawRef,
          nextOffset:last?undefined:offset+request.limit,
          telemetry:{requests:offset===0?page.requests:0,latencyMs:offset===0?page.latencyMs:0,providerCostUsd:offset===0?page.providerCostUsd:0}};
        await this.repository.saveProviderBatch(batchKey,batch);
        // Intake failures are outside the provider fallback boundary: replay saved data, not another fetch.
        return await this.deliver(batch,attempts);
  }
  private async deliver(batch:StoredProviderBatch,attempts:ProviderAttempt[]) {
    const response=await handoffConnectorBatch(this.intake,batch.request);
    await this.repository.saveProviderReceipts(batch,response);
    const receiptByObservation=new Map(response.receipts.map(r=>[r.observationId,r]));
    for(const observation of batch.request.observations){
      const receipt=receiptByObservation.get(observation.id);
      if((observation.operation==='DELETE'||observation.contentHash)&&receipt?.checkpointResolution==='RESOLVED'&&
        (receipt.decision==='ACCEPTED'||receipt.decision==='REPLAY'||receipt.decision==='DELETION_ACCEPTED'))
        await this.repository.rememberResolvedItem(batch.originalRequest.scope,observation.sourceItemKey,
          batch.originalRequest.configurationRevision??0,await itemFingerprint(observation),observation.fetchStartSequence);
    }
    const c=batch.request.coverage;
    const resolved=isIntakePrefixResolved(response,batch.request.observations.map(o=>o.id));
    let checkpoint:'BLOCKED'|'UNCHANGED'|'ADVANCED'|'CAS_CONFLICT'=resolved?'UNCHANGED':'BLOCKED';
    if(resolved&&c.safeCheckpointCursor) {
      const current=await this.repository.cursor(batch.originalRequest.scope,batch.providerId,batch.configurationKey);
      if(current?.sequence!==c.fetchStartSequence)checkpoint=await this.repository.advanceCursor(batch.originalRequest.scope,batch.providerId,
        batch.configurationKey,batch.checkpointVersion,c.fetchStartSequence,c.safeCheckpointCursor)?'ADVANCED':'CAS_CONFLICT';
    }
    return {state:'HANDED_OFF' as const,providerId:batch.providerId,request:batch.request,response,checkpoint,attempts,
      nextOffset:resolved?batch.nextOffset:undefined,
      continuation:resolved&&batch.nextOffset===undefined&&c.continuationToken?{providerId:batch.providerId,token:c.continuationToken}:undefined,telemetry:batch.telemetry};
  }
}
