import { CONTRACT_VERSION, handoffConnectorBatch, hashContent, isIntakePrefixResolved, sha256, idSchema, collectionBoundsSchema } from '@distilled/contracts';
import type { CandidateIntakePort, CandidateProposal, SourceObservation, CollectionCoverage } from '@distilled/contracts';
import type { FeedHttpPort, FetchTelemetry, ImmutablePayloadStore, RssRequest, SourceRepository, StoredRssBatch } from './ports';
import { normalizeRssSnapshot,rssEvidenceText } from './rss-normalize';
import {itemFingerprint} from './item-fingerprint';

export interface RssCollectionResult {
  handoffId: string;
  coverage: CollectionCoverage;
  checkpoint: 'ADVANCED' | 'UNCHANGED' | 'CAS_CONFLICT' | 'BLOCKED';
  nextOffset?: number;
  telemetry: FetchTelemetry;
  retryNotBefore?: string;
}

/** One bounded batch per call. Resume using the same request plus returned nextOffset.
 * Persisted batches, not reconstructed live responses, are redelivered after uncertain handoffs. */
export class RssSourceCollector {
  constructor(private readonly repository: SourceRepository, private readonly payloads: ImmutablePayloadStore,
    private readonly http: FeedHttpPort, private readonly intake: CandidateIntakePort,
    private readonly now: () => string = () => new Date().toISOString()) {}

  async collect(input: RssRequest, offset = 0): Promise<RssCollectionResult> {
    for (const id of [input.scope.feedId,input.scope.feedSourceId,input.scope.sourceId,input.runId]) idSchema.parse(id);
    collectionBoundsSchema.parse(input.requestedBounds ?? {});
    const sourceUrl=new URL(input.url);
    if (!['http:','https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error('INVALID_SOURCE_URL');
    const maxItems = input.maxItems ?? 100;
    if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 500 || !Number.isInteger(offset) || offset < 0) throw new Error('INVALID_BATCH_LIMIT');
    const configurationKey = await sha256(JSON.stringify([input.scope, input.url, input.requestedBounds ?? {}, maxItems]));
    const handoffId = await sha256(JSON.stringify([input.scope, input.runId, offset]));
    const saved = await this.repository.loadBatch(input.scope,handoffId);
    if (saved) {
      const run = await this.repository.loadRun(input.scope,input.runId);
      if (!run || run.configurationKey !== configurationKey) throw new Error('IDEMPOTENCY_CONFLICT');
      return this.deliver(input,saved,{requests:0,latencyMs:0,providerCostUsd:0});
    }
    if (offset !== 0) {
      // The previous batch is the independently proven contiguous snapshot prefix.
      const previousId = await sha256(JSON.stringify([input.scope,input.runId,Math.max(0,offset-maxItems)]));
      const previous = await this.repository.loadBatch(input.scope,previousId);
      const run = await this.repository.loadRun(input.scope,input.runId);
      if (!previous || previous.nextOffset !== offset || !run || run.configurationKey !== configurationKey || offset >= previous.totalItems) throw new Error('INVALID_CONTINUATION');
      const proof = await this.deliver(input,previous,{requests:0,latencyMs:0,providerCostUsd:0});
      if (proof.checkpoint === 'BLOCKED') return proof;
      const bytes = await this.payloads.get(input.scope,previous.snapshotRef);
      const snapshot = JSON.parse(new TextDecoder().decode(bytes));
      const batch = await this.build(input,run.sequence,run.startedAt,previous.checkpointVersion,previous.snapshotRef,snapshot,offset,maxItems);
      await this.repository.saveBatch(batch);
      return this.deliver(input,batch,{requests:0,latencyMs:0,providerCostUsd:0});
    }
    // A crash between allocation/fetch and batch persistence has an uncertain fetch outcome.
    // Do not fetch again under that sequence. Caller starts a fresh run; old content is unaffected.
    if (await this.repository.loadRun(input.scope,input.runId)) throw new Error('FETCH_OUTCOME_UNKNOWN_START_NEW_RUN');
    const run = await this.repository.allocate(input.scope,input.runId,configurationKey,this.now());
    if (!await this.repository.claimFetch(input.scope,input.runId)) throw new Error('FETCH_ALREADY_CLAIMED');
    const checkpoint = await this.repository.checkpoint(input.scope);
    const headers: Record<string,string> = {accept:'application/rss+xml, application/atom+xml, application/xml'};
    if (checkpoint?.configurationKey === configurationKey) {
      if (checkpoint.etag) headers['if-none-match'] = checkpoint.etag;
      if (checkpoint.lastModified) headers['if-modified-since'] = checkpoint.lastModified;
    }
    const response = await this.http.get(input.url,headers);
    let items: ReturnType<typeof normalizeRssSnapshot> = [], failure: CollectionCoverage['failureReason'] = 'NONE';
    const snapshotHash = response.status===200 ? await sha256(response.bytes) : undefined;
    if (response.status === 200) {
      try { if (checkpoint?.configurationKey!==configurationKey || checkpoint.snapshotHash!==snapshotHash)
        items = normalizeRssSnapshot(new TextDecoder('utf-8',{fatal:true}).decode(response.bytes),input.url); }
      catch { failure = 'UNKNOWN'; }
    } else if (response.status !== 304) {
      failure = response.status === 429 ? 'RATE_LIMIT' : [401,403].includes(response.status) ? 'AUTH_REQUIRED' : 'TRANSIENT_PROVIDER_FAILURE';
    }
    const raw = await this.payloads.put(input.scope,response.bytes,'application/xml');
    // Snapshot contains normalized entries AND raw reference; stored once before first handoff.
    const retryAfter=response.headers['retry-after'];
    const retryTime=retryAfter ? /^\d+$/.test(retryAfter) ? Date.parse(this.now())+Number(retryAfter)*1000 : Date.parse(retryAfter) : NaN;
    const snapshot = {items,rawRef:raw.ref,status:response.status,failure,etag:response.headers.etag,lastModified:response.headers['last-modified'],snapshotHash,telemetry:response.telemetry,
      retryNotBefore:Number.isFinite(retryTime) && retryTime <= 8.64e15 ? new Date(retryTime).toISOString() : undefined};
    const stored = await this.payloads.put(input.scope,new TextEncoder().encode(JSON.stringify(snapshot)),'application/json');
    const batch = await this.build(input,run.sequence,run.startedAt,checkpoint?.version ?? 0,stored.ref,snapshot,0,maxItems);
    await this.repository.saveBatch(batch);
    return this.deliver(input,batch,response.telemetry);
  }

  private async build(input:RssRequest,sequence:number,startedAt:string,checkpointVersion:number,snapshotRef:string,
    snapshot:{items:ReturnType<typeof normalizeRssSnapshot>;status:number;failure:CollectionCoverage['failureReason'];etag?:string;lastModified?:string;snapshotHash?:string;telemetry:FetchTelemetry;retryNotBefore?:string},offset:number,maxItems:number):Promise<StoredRssBatch> {
    const observations: SourceObservation[] = [], proposals: CandidateProposal[] = [];
    const processedRows=snapshot.items.slice(offset,offset+maxItems);
    for (const row of processedRows) {
      const evidenceBody=rssEvidenceText(row.title,row.body);
      const id = await sha256(JSON.stringify([input.scope,sequence,row.key,'UPSERT']));
      const observation: SourceObservation = {id,...input.scope,fetchRunId:input.runId,fetchStartSequence:sequence,
        sourceItemKey:row.identityValid ? row.key : `invalid:${input.runId}:${row.key}`,operation:'UPSERT',
        representation:'ARTICLE_EXCERPT',contentCompleteness:'UNKNOWN',authoritativeCurrentState:false,
        upstreamId:row.upstreamId,canonicalUrl:row.url,publisherId:row.publisherId,titleHint:row.title,
        publishedAtHint:row.publishedAt,languageHint:row.language,sourceRevision:row.sourceRevision,observedAt:startedAt};
      if (!row.conflictingDuplicate && evidenceBody) {
        observation.contentHash = await hashContent({representation:'ARTICLE_EXCERPT',title:row.title,body:evidenceBody});
        if(row.identityValid && await this.repository.knownItemHash(input.scope,row.key,input.configurationRevision??0)===await itemFingerprint(observation))continue;
        const payload = await this.payloads.put(input.scope,new TextEncoder().encode(JSON.stringify({
          representation:'ARTICLE_EXCERPT',contentCompleteness:'UNKNOWN',title:row.title,body:evidenceBody,
          canonicalUrl:row.url,publishedAt:row.publishedAt,language:row.language,
          sourceTitle:row.sourceTitle,excerpt:row.excerpt,author:row.author,updatedAt:row.updatedAt,firstSeenAt:startedAt
        })),'application/json');
        observation.suppliedPayloadRef = payload.ref;
        if (row.identityValid) proposals.push({observationId:id,...input.scope,sourceItemKey:row.key,connectorType:'rss',
          upstreamId:row.upstreamId,url:row.url,titleHint:row.title,publishedAtHint:row.publishedAt,languageHint:row.language,
          representation:observation.representation,contentCompleteness:observation.contentCompleteness,
          suppliedPayloadRef:payload.ref,payloadHash:payload.hash,discoveredAt:startedAt,discoveryRunId:input.runId});
      }
      observations.push(observation);
    }
    const nextOffset = offset + processedRows.length, pending = nextOffset < snapshot.items.length;
    const coverage: CollectionCoverage = {id:await sha256(JSON.stringify([input.scope,input.runId,offset,'coverage'])),
      feedId:input.scope.feedId,feedSourceId:input.scope.feedSourceId,fetchRunId:input.runId,fetchStartSequence:sequence,
      requestedBounds:input.requestedBounds ?? {},observedBounds:{},status:snapshot.failure === 'NONE' ? 'PARTIAL' : 'UNKNOWN',
      continuationState:pending ? 'PENDING' : 'NONE',continuationToken:pending ? String(nextOffset) : undefined,
      failureReason:snapshot.failure,createdAt:startedAt};
    const times = processedRows.flatMap(row => row.publishedAt ? [row.publishedAt] : []).sort();
    if (times.length) coverage.observedBounds = {startTime:times[0],endTime:times[times.length-1]};
    // RSS exposes a finite snapshot, not a proven historical cursor. Validators are safe
    // only after every batch of this saved snapshot has resolved receipts.
    const checkpoint = !pending && snapshot.failure === 'NONE' && snapshot.status === 200 ? {
      sequence,configurationKey:await sha256(JSON.stringify([input.scope,input.url,input.requestedBounds ?? {},maxItems])),
      etag:snapshot.etag,lastModified:snapshot.lastModified,snapshotHash:snapshot.snapshotHash
    } : undefined;
    return {request:{contractVersion:CONTRACT_VERSION,handoffId:await sha256(JSON.stringify([input.scope,input.runId,offset])),coverage,observations,proposals},
      snapshotRef,nextOffset,totalItems:snapshot.items.length,checkpointVersion,checkpoint,fetchTelemetry:snapshot.telemetry,retryNotBefore:snapshot.retryNotBefore};
  }

  private async deliver(input:RssRequest,batch:StoredRssBatch,telemetry:FetchTelemetry):Promise<RssCollectionResult> {
    const response = await handoffConnectorBatch(this.intake,batch.request);
    await this.repository.recordReceipts(batch,response);
    const receiptByObservation=new Map(response.receipts.map(r=>[r.observationId,r]));
    for(const observation of batch.request.observations){
      const receipt=receiptByObservation.get(observation.id);
      if(observation.operation==='UPSERT'&&observation.contentHash&&receipt?.checkpointResolution==='RESOLVED'&&
        (receipt.decision==='ACCEPTED'||receipt.decision==='REPLAY'))
        await this.repository.rememberResolvedItem(input.scope,observation.sourceItemKey,
          input.configurationRevision??0,await itemFingerprint(observation),observation.fetchStartSequence);
    }
    const base = {handoffId:batch.request.handoffId,coverage:batch.request.coverage,telemetry,retryNotBefore:batch.retryNotBefore};
    if (!isIntakePrefixResolved(response,batch.request.observations.map(o => o.id))) return {...base,checkpoint:'BLOCKED'};
    if (batch.nextOffset < batch.totalItems) return {...base,checkpoint:'UNCHANGED',nextOffset:batch.nextOffset};
    if (!batch.checkpoint) return {...base,checkpoint:'UNCHANGED'};
    const current = await this.repository.checkpoint(input.scope);
    if (current?.sequence === batch.checkpoint.sequence && current.configurationKey === batch.checkpoint.configurationKey) return {...base,checkpoint:'UNCHANGED'};
    const committed = await this.repository.commitCheckpoint(input.scope,batch.checkpointVersion,batch.checkpoint);
    return {...base,checkpoint:committed ? 'ADVANCED' : 'CAS_CONFLICT'};
  }
}
