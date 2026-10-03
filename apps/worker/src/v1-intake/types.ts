import type { CandidateProposal, ContentCompleteness, OrderingPolicy, RepresentationKind, SourceObservation } from '@distilled/contracts';

export interface QueryRestrictions { startTime?: string; endTime?: string; publisherIds?: string[]; accountIds?: string[] }
export interface IntakeScope { feedId: string; feedSourceId: string; sourceId: string; feedRevision: number; enabled: boolean; deletedAt?: string; restrictions: QueryRestrictions }
export interface ValidationFacts { accountId?: string }
export interface VerifiedSuppliedContent { representation: RepresentationKind; contentCompleteness: ContentCompleteness; contentHash: string }
export interface IntakePolicy {
  version: string;
  now(): string;
  factsFor(observation: SourceObservation): Promise<ValidationFacts>;
  orderingFor(observation: SourceObservation): Promise<OrderingPolicy>;
  verifySuppliedContent(observation: SourceObservation): Promise<VerifiedSuppliedContent | undefined>;
}
export interface DownstreamJob {
  id: string; feedId: string; feedSourceId: string; observationId: string;
  kind: 'ACQUIRE' | 'REASSESS' | 'AUTHORITATIVE_RECHECK'; state: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED'; attempts: number;
  nextAttemptAt?: string; exhausted?: boolean; conflictId?: string;
  leaseToken?: string; leaseUntil?: string; failureCode?: string;
  resumeAttempts?: number;
}
export interface AcceptedAcquiredContent {
  id: string; feedId: string; candidateId: string; sourceObservationId: string;
  representation: RepresentationKind; contentCompleteness: ContentCompleteness;
  title?: string; body: string; language?: string; publishedAt?: string; canonicalUrl?: string; acquiredAt: string;
  acquisitionMethod: 'supplied_payload' | 'platform_api' | 'direct_http' | 'browser'; acquisitionProvider?: string;
  sourceId?: string; resolvedUrl?: string;
  quality?: { transportSuccess: boolean; extractionSuccess: boolean; extractionComplete: boolean };
  provenance?: { routerVersion: string; stages: string[]; rawPayloadRef?: string };
}
export interface AcceptedInput { observation: SourceObservation; proposal?: CandidateProposal }
export interface CandidateRecord {
  id:string; feedId:string; feedSourceId:string; sourceId:string; sourceItemKey:string;
  latestObservationId:string; discoveredAt:string; intakePolicyVersion:string;
}
