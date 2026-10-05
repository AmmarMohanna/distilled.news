import { HandoffError, connectorHandoffRequestSchema, collectionCoverageSchema, validateHandoffResponse } from '@distilled/contracts';
import type { ConnectorHandoffRequest, ConnectorHandoffResponse,CollectionCoverage } from '@distilled/contracts';
import type { SourceScope } from './ports';
import { D1SourceRepository, type SqlDatabase } from './storage';
import type { ProviderAttempt, SourceFetchRequest, ProviderPage } from './provider-types';

export const PROVIDER_SOURCE_SCHEMA=`
CREATE TABLE IF NOT EXISTS connector_provider_batches (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, batch_key TEXT NOT NULL, data TEXT NOT NULL, receipts TEXT,
 PRIMARY KEY(feed_id,feed_source_id,batch_key));
CREATE TABLE IF NOT EXISTS connector_provider_cursors (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, provider_id TEXT NOT NULL, configuration_key TEXT NOT NULL,
 version INTEGER NOT NULL, sequence INTEGER NOT NULL, cursor TEXT NOT NULL,
 PRIMARY KEY(feed_id,feed_source_id,provider_id,configuration_key));
CREATE TABLE IF NOT EXISTS connector_provider_attempts (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, run_id TEXT NOT NULL, data TEXT NOT NULL,
 PRIMARY KEY(feed_id,feed_source_id,run_id));
CREATE TABLE IF NOT EXISTS connector_provider_snapshots (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, data TEXT NOT NULL,
 PRIMARY KEY(feed_id,feed_source_id,snapshot_id));
CREATE TABLE IF NOT EXISTS connector_provider_failure_coverage (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, coverage_id TEXT NOT NULL, data TEXT NOT NULL,
 PRIMARY KEY(feed_id,feed_source_id,coverage_id));
`;
export interface StoredProviderBatch {
  request:ConnectorHandoffRequest;
  originalRequest:SourceFetchRequest;
  providerId:string;
  configurationKey:string;
  checkpointVersion:number;
  rawRef:string;
  telemetry:Pick<ProviderPage,'requests'|'latencyMs'|'providerCostUsd'>;
  nextOffset?:number;
}
export interface StoredProviderSnapshot {
  originalRequest:SourceFetchRequest; configurationKey:string; providerId:string;
  run:{id:string;sequence:number;startedAt:string;configurationKey:string};
  checkpointVersion:number; actualBounds:SourceFetchRequest['requestedBounds']; rawRef:string;
  pageRef:string;
}
export class D1ProviderSourceRepository extends D1SourceRepository {
  constructor(private readonly sql:SqlDatabase){super(sql);}
  async saveProviderBatch(key:string,batch:StoredProviderBatch) {
    // Round-trip strict wire validation drops undefined values deterministically.
    batch={...batch,request:connectorHandoffRequestSchema.parse(batch.request)};
    const data=JSON.stringify(batch), c=batch.request.coverage;
    await this.sql.prepare('INSERT INTO connector_provider_batches(feed_id,feed_source_id,batch_key,data) VALUES(?,?,?,?) ON CONFLICT DO NOTHING')
      .bind(c.feedId,c.feedSourceId,key,data).run();
    const current=await this.loadProviderBatch(batch.originalRequest.scope,key);
    if (JSON.stringify(current)!==data) throw new HandoffError('IDEMPOTENCY_CONFLICT');
  }
  async loadProviderBatch(scope:SourceScope,key:string):Promise<StoredProviderBatch|undefined> {
    const row=await this.sql.prepare('SELECT data FROM connector_provider_batches WHERE feed_id=? AND feed_source_id=? AND batch_key=?')
      .bind(scope.feedId,scope.feedSourceId,key).first<{data:string}>();
    if (!row) return undefined;
    const b:StoredProviderBatch=JSON.parse(row.data);
    if (b.originalRequest.scope.sourceId!==scope.sourceId) throw new HandoffError('SCOPE_DENIED');
    return b;
  }
  async saveProviderReceipts(batch:StoredProviderBatch,response:ConnectorHandoffResponse) {
    validateHandoffResponse(batch.request,response);
    const c=batch.request.coverage;
    await this.sql.prepare('UPDATE connector_provider_batches SET receipts=? WHERE feed_id=? AND feed_source_id=? AND batch_key=?')
      .bind(JSON.stringify(response),c.feedId,c.feedSourceId,batch.request.handoffId).run();
  }
  async loadProviderReceipts(scope:SourceScope,key:string):Promise<ConnectorHandoffResponse|undefined> {
    const row=await this.sql.prepare('SELECT receipts FROM connector_provider_batches WHERE feed_id=? AND feed_source_id=? AND batch_key=?')
      .bind(scope.feedId,scope.feedSourceId,key).first<{receipts:string|null}>();
    return row?.receipts?JSON.parse(row.receipts):undefined;
  }
  async attempt(scope:SourceScope,a:ProviderAttempt) {
    await this.sql.prepare('INSERT INTO connector_provider_attempts(feed_id,feed_source_id,run_id,data) VALUES(?,?,?,?) ON CONFLICT DO NOTHING')
      .bind(scope.feedId,scope.feedSourceId,a.runId,JSON.stringify(a)).run();
  }
  async loadAttempt(scope:SourceScope,runId:string):Promise<ProviderAttempt|undefined> {
    const row=await this.sql.prepare('SELECT data FROM connector_provider_attempts WHERE feed_id=? AND feed_source_id=? AND run_id=?')
      .bind(scope.feedId,scope.feedSourceId,runId).first<{data:string}>();
    return row?JSON.parse(row.data):undefined;
  }
  async recordFailureCoverage(coverage:CollectionCoverage) {
    const data=JSON.stringify(collectionCoverageSchema.parse(coverage));
    await this.sql.prepare('INSERT INTO connector_provider_failure_coverage(feed_id,feed_source_id,coverage_id,data) VALUES(?,?,?,?) ON CONFLICT DO NOTHING')
      .bind(coverage.feedId,coverage.feedSourceId,coverage.id,data).run();
  }
  async saveSnapshot(scope:SourceScope,id:string,snapshot:StoredProviderSnapshot) {
    const data=JSON.stringify(snapshot);
    await this.sql.prepare('INSERT INTO connector_provider_snapshots(feed_id,feed_source_id,snapshot_id,data) VALUES(?,?,?,?) ON CONFLICT DO NOTHING')
      .bind(scope.feedId,scope.feedSourceId,id,data).run();
    if(JSON.stringify(await this.loadSnapshot(scope,id))!==data)throw new HandoffError('IDEMPOTENCY_CONFLICT');
  }
  async loadSnapshot(scope:SourceScope,id:string):Promise<StoredProviderSnapshot|undefined> {
    const row=await this.sql.prepare('SELECT data FROM connector_provider_snapshots WHERE feed_id=? AND feed_source_id=? AND snapshot_id=?')
      .bind(scope.feedId,scope.feedSourceId,id).first<{data:string}>();
    if(!row)return undefined;
    const snapshot:StoredProviderSnapshot=JSON.parse(row.data);
    if(snapshot.originalRequest.scope.sourceId!==scope.sourceId)throw new HandoffError('SCOPE_DENIED');
    return snapshot;
  }
  async cursor(scope:SourceScope,provider:string,configurationKey:string) {
    return await this.sql.prepare('SELECT version,sequence,cursor FROM connector_provider_cursors WHERE feed_id=? AND feed_source_id=? AND provider_id=? AND configuration_key=?')
      .bind(scope.feedId,scope.feedSourceId,provider,configurationKey).first<{version:number;sequence:number;cursor:string}>();
  }
  async advanceCursor(scope:SourceScope,provider:string,configurationKey:string,version:number,sequence:number,cursor:string) {
    const q=version===0 ? this.sql.prepare('INSERT INTO connector_provider_cursors(feed_id,feed_source_id,provider_id,configuration_key,version,sequence,cursor) VALUES(?,?,?,?,1,?,?) ON CONFLICT DO NOTHING RETURNING version')
      .bind(scope.feedId,scope.feedSourceId,provider,configurationKey,sequence,cursor)
      : this.sql.prepare('UPDATE connector_provider_cursors SET version=version+1,sequence=?,cursor=? WHERE feed_id=? AND feed_source_id=? AND provider_id=? AND configuration_key=? AND version=? AND sequence<=? RETURNING version')
      .bind(sequence,cursor,scope.feedId,scope.feedSourceId,provider,configurationKey,version,sequence);
    return await q.first()!==null;
  }
}
