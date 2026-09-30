/** Connector-facing news discovery. Workflow candidates live in agent-runtime. */
export interface CandidateProposal {
  upstreamResourceId: string;
  accessScope: string;
  connectorType: string;
  sourceId: string;
  upstreamId?: string;
  url?: string;
  titleHint?: string;
  publishedAtHint?: string;
  languageHint?: string;
  payloadHash?: string;
  discoveredAt: string;
  discovery: {provider: string; runId: string; queryId?: string};
  suppliedPayloadRef?: string;
}

export interface CandidateEligibilityDecision {
  id: string;
  candidateId: string;
  eligible: boolean;
  reason: string;
  method: "RULES_V1";
  decidedAt: string;
}

export interface CandidateItem extends CandidateProposal {
  id: string;
  tenantId: string;
  canonicalUrl?: string;
  status: "PENDING" | "ACQUIRED";
}

export type AcquisitionMethod = "supplied_payload" | "platform_api" | "direct_http" | "web_fetch" | "browser";
export interface AcquiredContent {
  id: string;
  candidateId: string;
  sourceId: string;
  accessScope: string;
  resolvedUrl?: string;
  title?: string;
  text: string;
  publishedAt?: string;
  author?: string;
  acquisitionMethod: AcquisitionMethod;
  acquisitionProvider?: string;
  rawPayloadRef?: string;
  acquiredAt: string;
  quality: {transportSuccess: boolean; extractionSuccess: boolean; extractionComplete: boolean; confidence?: number};
}

export interface NormalizedEvidenceItem {
  id: string;
  sourceId: string;
  canonicalUrl?: string;
  title: string;
  body: string;
  language: string;
  publishedAt?: string;
  firstSeenAt: string;
  contentHash: string;
  accessScope: string;
  provenance: {candidateId: string; acquiredContentId: string; originalUrl?: string; acquisitionMethod: AcquisitionMethod; acquisitionProvider?: string};
}
