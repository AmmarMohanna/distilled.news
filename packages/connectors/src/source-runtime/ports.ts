import type { CollectionBounds, ConnectorHandoffRequest, ConnectorHandoffResponse } from '@distilled/contracts';

export interface SourceScope { feedId: string; feedSourceId: string; sourceId: string }
export interface FetchRun extends SourceScope {
  id: string;
  sequence: number;
  startedAt: string;
  configurationKey: string;
}
export interface RssCheckpoint {
  version: number;
  sequence: number;
  etag?: string;
  lastModified?: string;
  /** Exact previous completed HTTP 200 snapshot; only identical bytes can be skipped. */
  snapshotHash?: string;
  configurationKey: string;
}
export interface StoredRssBatch {
  request: ConnectorHandoffRequest;
  snapshotRef: string;
  nextOffset: number;
  totalItems: number;
  checkpointVersion: number;
  checkpoint?: Omit<RssCheckpoint, 'version'>;
  fetchTelemetry: FetchTelemetry;
  retryNotBefore?: string;
}
/** Storage is connector-owned. Intake owns its own receipts and canonical effects. */
export interface SourceRepository {
  allocate(scope: SourceScope, runId: string, configurationKey: string, startedAt: string): Promise<FetchRun>;
  loadRun(scope: SourceScope, runId: string): Promise<FetchRun | undefined>;
  claimFetch(scope: SourceScope, runId: string): Promise<boolean>;
  checkpoint(scope: SourceScope): Promise<RssCheckpoint | undefined>;
  knownItemHash(scope: SourceScope, key: string, revision: number): Promise<string | undefined>;
  rememberResolvedItem(scope: SourceScope, key: string, revision: number, fingerprint: string, sequence: number): Promise<void>;
  saveBatch(batch: StoredRssBatch): Promise<void>;
  loadBatch(scope: SourceScope, handoffId: string): Promise<StoredRssBatch | undefined>;
  recordReceipts(batch: StoredRssBatch, response: ConnectorHandoffResponse): Promise<void>;
  commitCheckpoint(scope: SourceScope, expectedVersion: number, checkpoint: Omit<RssCheckpoint, 'version'>): Promise<boolean>;
}
export interface ImmutablePayloadStore {
  put(scope: SourceScope, bytes: Uint8Array, contentType: string): Promise<{ ref: string; hash: string }>;
  get(scope: SourceScope, ref: string): Promise<Uint8Array>;
}
export interface RssRequest {
  configurationRevision?: number;
  scope: SourceScope;
  runId: string;
  url: string;
  requestedBounds?: CollectionBounds;
  maxItems?: number;
}
export interface FetchTelemetry {
  requests: number;
  latencyMs: number;
  providerCostUsd: number;
  status?: number;
}
export interface FeedResponse {
  status: number;
  headers: Record<string, string>;
  bytes: Uint8Array;
  telemetry: FetchTelemetry;
}
export interface FeedHttpPort {
  get(url: string, headers: Record<string, string>, bounds?: {attempts?:number;timeoutMs?:number}): Promise<FeedResponse>;
}
