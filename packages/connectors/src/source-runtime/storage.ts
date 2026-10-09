import { sha256, connectorHandoffRequestSchema, validateHandoffResponse, HandoffError } from '@distilled/contracts';
import type { ConnectorHandoffResponse } from '@distilled/contracts';
import type { FetchRun, ImmutablePayloadStore, RssCheckpoint, SourceRepository, SourceScope, StoredRssBatch } from './ports';

// Structural ports accept D1/R2 bindings without coupling connectors to a Worker entry point.
export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface SqlDatabase { prepare(sql: string): SqlStatement; batch(statements: SqlStatement[]): Promise<unknown> }
/** Preserves native D1 statements for transactional batch execution. */
export function sourceSqlFromD1<S extends SqlStatement>(db: {
  prepare(sql: string): S;
  batch(statements: S[]): Promise<unknown>;
}): SqlDatabase {
  return {prepare:sql=>db.prepare(sql),batch:statements=>db.batch(statements as S[])};
}
export function sourceRepositoryFromD1<S extends SqlStatement>(db: {
  prepare(sql: string): S;
  batch(statements: S[]): Promise<unknown>;
}): D1SourceRepository {
  return new D1SourceRepository(sourceSqlFromD1(db));
}
export interface ObjectBucket {
  put(key: string, value: Uint8Array, options: { onlyIf: { etagDoesNotMatch: string }; httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

/** Schema proposal, not an installed/numbered worker migration. Coordinate migration ownership. */
export const SOURCE_STORAGE_SCHEMA = `
CREATE TABLE IF NOT EXISTS connector_item_fingerprints (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, source_id TEXT NOT NULL, source_item_key TEXT NOT NULL,
 configuration_revision INTEGER NOT NULL, fingerprint TEXT NOT NULL, fetch_sequence INTEGER NOT NULL,
 PRIMARY KEY(feed_id,feed_source_id,source_item_key));
CREATE TABLE IF NOT EXISTS connector_source_sequences (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, sequence INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(feed_id, feed_source_id));
CREATE TABLE IF NOT EXISTS connector_fetch_runs (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, run_id TEXT NOT NULL,
 source_id TEXT NOT NULL, sequence INTEGER NOT NULL, started_at TEXT NOT NULL, configuration_key TEXT NOT NULL, fetch_claimed INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(feed_id, feed_source_id, run_id), UNIQUE(feed_id, feed_source_id, sequence));
CREATE TABLE IF NOT EXISTS connector_batches (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, handoff_id TEXT NOT NULL,
 data TEXT NOT NULL, receipts TEXT, PRIMARY KEY(feed_id, feed_source_id, handoff_id));
CREATE TABLE IF NOT EXISTS connector_checkpoints (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, version INTEGER NOT NULL,
 sequence INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(feed_id, feed_source_id));
`;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).filter(([,v]) => v !== undefined)
    .sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}

export class D1SourceRepository implements SourceRepository {
  constructor(private readonly db: SqlDatabase) {}
  async knownItemHash(scope:SourceScope,key:string,revision:number):Promise<string|undefined> {
    const row=await this.db.prepare('SELECT source_id,configuration_revision,fingerprint FROM connector_item_fingerprints WHERE feed_id=? AND feed_source_id=? AND source_item_key=?')
      .bind(scope.feedId,scope.feedSourceId,key).first<{source_id:string;configuration_revision:number;fingerprint:string}>();
    return row?.source_id===scope.sourceId&&row.configuration_revision===revision?row.fingerprint:undefined;
  }
  async rememberResolvedItem(scope:SourceScope,key:string,revision:number,fingerprint:string,sequence:number):Promise<void> {
    await this.db.prepare(`INSERT INTO connector_item_fingerprints(feed_id,feed_source_id,source_id,source_item_key,configuration_revision,fingerprint,fetch_sequence)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(feed_id,feed_source_id,source_item_key) DO UPDATE SET
      source_id=excluded.source_id,configuration_revision=excluded.configuration_revision,
      fingerprint=excluded.fingerprint,fetch_sequence=excluded.fetch_sequence
      WHERE excluded.fetch_sequence>=connector_item_fingerprints.fetch_sequence`)
      .bind(scope.feedId,scope.feedSourceId,scope.sourceId,key,revision,fingerprint,sequence).run();
  }
  async loadRun(scope: SourceScope, id: string): Promise<FetchRun | undefined> {
    const row = await this.db.prepare('SELECT source_id, sequence, started_at, configuration_key FROM connector_fetch_runs WHERE feed_id=? AND feed_source_id=? AND run_id=?')
      .bind(scope.feedId, scope.feedSourceId, id).first<{source_id:string;sequence:number;started_at:string;configuration_key:string}>();
    if (!row) return undefined;
    if (row.source_id !== scope.sourceId) throw new HandoffError('SCOPE_DENIED');
    return { ...scope, id, sequence: row.sequence, startedAt: row.started_at, configurationKey: row.configuration_key };
  }
  async allocate(scope: SourceScope, id: string, configurationKey: string, startedAt: string): Promise<FetchRun> {
    // D1 batch is atomic. Existing runs are idempotent and do not allocate another sequence.
    await this.db.batch([
      this.db.prepare('INSERT INTO connector_source_sequences(feed_id,feed_source_id) VALUES(?,?) ON CONFLICT DO NOTHING').bind(scope.feedId, scope.feedSourceId),
      this.db.prepare(`UPDATE connector_source_sequences SET sequence=sequence+1 WHERE feed_id=? AND feed_source_id=? AND sequence < 9007199254740991 AND NOT EXISTS
        (SELECT 1 FROM connector_fetch_runs WHERE feed_id=? AND feed_source_id=? AND run_id=?)`).bind(scope.feedId, scope.feedSourceId, scope.feedId, scope.feedSourceId, id),
      this.db.prepare(`INSERT INTO connector_fetch_runs(feed_id,feed_source_id,run_id,source_id,sequence,started_at,configuration_key)
        SELECT ?,?,?,?,sequence,?,? FROM connector_source_sequences WHERE feed_id=? AND feed_source_id=? ON CONFLICT DO NOTHING`)
        .bind(scope.feedId, scope.feedSourceId, id, scope.sourceId, startedAt, configurationKey, scope.feedId, scope.feedSourceId)
    ]);
    const run = await this.loadRun(scope, id);
    if (!run) throw new Error('SEQUENCE_EXHAUSTED');
    if (run.configurationKey !== configurationKey) throw new HandoffError('IDEMPOTENCY_CONFLICT');
    return run;
  }
  async checkpoint(scope: SourceScope): Promise<RssCheckpoint | undefined> {
    const row = await this.db.prepare('SELECT version, sequence, data FROM connector_checkpoints WHERE feed_id=? AND feed_source_id=?')
      .bind(scope.feedId, scope.feedSourceId).first<{version:number;sequence:number;data:string}>();
    return row ? { ...JSON.parse(row.data), version: row.version, sequence: row.sequence } : undefined;
  }
  async claimFetch(scope: SourceScope, runId: string): Promise<boolean> {
    return await this.db.prepare('UPDATE connector_fetch_runs SET fetch_claimed=1 WHERE feed_id=? AND feed_source_id=? AND run_id=? AND source_id=? AND fetch_claimed=0 RETURNING sequence')
      .bind(scope.feedId,scope.feedSourceId,runId,scope.sourceId).first() !== null;
  }
  async saveBatch(batch: StoredRssBatch): Promise<void> {
    connectorHandoffRequestSchema.parse(batch.request);
    const { feedId, feedSourceId } = batch.request.coverage;
    const data = canonical(batch);
    await this.db.prepare('INSERT INTO connector_batches(feed_id,feed_source_id,handoff_id,data) VALUES(?,?,?,?) ON CONFLICT DO NOTHING')
      .bind(feedId, feedSourceId, batch.request.handoffId, data).run();
    const row = await this.db.prepare('SELECT data FROM connector_batches WHERE feed_id=? AND feed_source_id=? AND handoff_id=?')
      .bind(feedId, feedSourceId, batch.request.handoffId).first<{data:string}>();
    if (row?.data !== data) throw new HandoffError('IDEMPOTENCY_CONFLICT');
  }
  async loadBatch(scope: SourceScope, id: string): Promise<StoredRssBatch | undefined> {
    const row = await this.db.prepare('SELECT data FROM connector_batches WHERE feed_id=? AND feed_source_id=? AND handoff_id=?')
      .bind(scope.feedId, scope.feedSourceId, id).first<{data:string}>();
    if (!row) return undefined;
    const batch: StoredRssBatch = JSON.parse(row.data);
    if (batch.request.observations.some(o => o.sourceId !== scope.sourceId)) throw new HandoffError('SCOPE_DENIED');
    return batch;
  }
  async recordReceipts(batch: StoredRssBatch, response: ConnectorHandoffResponse): Promise<void> {
    validateHandoffResponse(batch.request, response);
    await this.saveBatch(batch);
    const c = batch.request.coverage;
    await this.db.prepare('UPDATE connector_batches SET receipts=? WHERE feed_id=? AND feed_source_id=? AND handoff_id=?')
      .bind(canonical(response), c.feedId, c.feedSourceId, batch.request.handoffId).run();
  }
  async commitCheckpoint(scope: SourceScope, expectedVersion: number, checkpoint: Omit<RssCheckpoint,'version'>): Promise<boolean> {
    const data = canonical(checkpoint);
    const statement = expectedVersion === 0
      ? this.db.prepare('INSERT INTO connector_checkpoints(feed_id,feed_source_id,version,sequence,data) VALUES(?,?,1,?,?) ON CONFLICT DO NOTHING RETURNING version')
          .bind(scope.feedId, scope.feedSourceId, checkpoint.sequence, data)
      : this.db.prepare('UPDATE connector_checkpoints SET version=version+1,sequence=?,data=? WHERE feed_id=? AND feed_source_id=? AND version=? AND sequence<=? RETURNING version')
          .bind(checkpoint.sequence, data, scope.feedId, scope.feedSourceId, expectedVersion, checkpoint.sequence);
    return (await statement.first()) !== null;
  }
}

export class R2SourcePayloadStore implements ImmutablePayloadStore {
  constructor(private readonly bucket: ObjectBucket) {}
  private async prefix(scope: SourceScope) { return 'source-payloads/' + await sha256(JSON.stringify([scope.feedId,scope.feedSourceId,scope.sourceId])) + '/'; }
  async put(scope: SourceScope, bytes: Uint8Array, contentType: string) {
    const hash = await sha256(bytes), ref = await this.prefix(scope) + hash;
    await this.bucket.put(ref, bytes, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType } });
    // Verify existing objects as well as newly written ones before handing out a reference.
    const stored = await this.get(scope, ref);
    if (await sha256(stored) !== hash) throw new Error('PAYLOAD_INTEGRITY_FAILURE');
    return {ref,hash};
  }
  async get(scope: SourceScope, ref: string) {
    const prefix = await this.prefix(scope);
    if (!ref.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(ref.slice(prefix.length))) throw new HandoffError('SCOPE_DENIED');
    const object = await this.bucket.get(ref);
    if (!object) throw new Error('PAYLOAD_MISSING');
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (await sha256(bytes) !== ref.slice(prefix.length)) throw new Error('PAYLOAD_INTEGRITY_FAILURE');
    return bytes;
  }
}
