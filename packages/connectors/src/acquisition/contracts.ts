/** Connector-facing v1.5 seam. Candidate Intake owns canonical CandidateItem creation. */
export type ConnectorKind = "rss" | "google_news" | "telegram_public" | "telethon";
export interface ConnectorScope { tenantId: string; resourceId: string }
export interface Coverage {
  completeness: "complete" | "partial" | "unknown";
  reason: string;
  /** Only explicit source evidence may prove a historical interval. */
  historicalBoundary?: string;
}
export interface Checkpoint {
  version: string;
  etag?: string;
  lastModified?: string;
  /** Numeric Telegram ID, not a username or timestamp. */
  afterMessageId?: number;
  historicalBoundary?: string;
}
export interface UpstreamObservation {
  upstreamId: string;
  operation: "upsert" | "delete";
  title?: string;
  text: string;
  url?: string;
  publishedAt?: string;
  editedAt?: string;
  timestampKind: "published" | "updated" | "unknown";
  representation: "feed_text" | "news_listing" | "telegram_message";
  contentCompleteness: "complete" | "partial" | "unknown";
}
export interface CandidateProposal extends ConnectorScope {
  schemaVersion: "connector-v1.5";
  /** Scope + upstream identity; shared across Telegram mechanisms. */
  candidateKey: string;
  /** Stable source revision key; replaying an observation cannot add another effect. */
  observationKey: string;
  upstreamId: string;
  connector: ConnectorKind;
  operation: "upsert" | "delete";
  suppliedPayloadRef: string;
  payloadSha256: string;
  representation: UpstreamObservation["representation"];
  contentCompleteness: UpstreamObservation["contentCompleteness"];
}
export interface ConnectorBatch {
  connector: ConnectorKind;
  observations: UpstreamObservation[];
  coverage: Coverage;
  checkpointProposal?: Omit<Checkpoint, "version">;
  retry: { kind: "none" | "transient" | "rate_limit" | "auth_required" | "permanent"; afterMs?: number; reason?: string };
  telemetry: { requests: number; latencyMs: number; providerCostUsd: number | null };
}
/** Must enforce egress policy, redirects, timeout and response-byte limits. */
export interface HttpPort {
  get(url: string, headers: Record<string, string>): Promise<{ status: number; body: string; headers: Record<string, string> }>;
}
/** Immutable, tenant-scoped storage. put resolves only after durable persistence. */
export interface PayloadStore {
  put(scope: ConnectorScope, sha256: string, payload: string): Promise<string>;
  get(scope: ConnectorScope, ref: string): Promise<string>;
}
export interface IntakeReceipt {
  durable: true;
  /** Includes accepted and already-accepted observation keys; excludes rejected work. */
  acceptedObservationKeys: string[];
}
export interface CandidateIntakePort {
  /** Must atomically deduplicate observationKey and upsert CandidateItem by candidateKey.
   * Preserve ordered revisions/tombstones; repeated delivery must not create canonical effects. */
  accept(proposals: CandidateProposal[]): Promise<IntakeReceipt>;
}
export interface CheckpointStore {
  /** Durable compare-and-set. Source lock is shared by poll/recheck/alternative providers. */
  advance(scope: ConnectorScope, expectedVersion: string, next: Omit<Checkpoint, "version">): Promise<boolean>;
}
