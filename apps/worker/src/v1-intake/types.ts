import type { CandidateProposal, ContentCompleteness, OrderingPolicy, RepresentationKind, SourceObservation } from '@distilled/contracts';

export interface QueryRestrictions { startTime?: string; endTime?: string; publisherIds?: string[]; accountIds?: string[] }
export interface IntakeScope { feedId: string; feedSourceId: string; sourceId: string; feedRevision: number; enabled: boolean; deletedAt?: string; restrictions: QueryRestrictions }
export interface ValidationFacts { accountId?: string }
export interface VerifiedSuppliedContent { representation: RepresentationKind; contentCompleteness: ContentCompleteness; contentHash: string }
export interface PublicHttpRecoveryEvidence {url:string;status:200;bodyHash:string;textCharacters:number;observedAt:string}
export interface IntakePolicy {
  unpaidOnly?:true;
  expectedFeedRevision?: number;
  version: string;
  now(): string;
  factsFor(observation: SourceObservation): Promise<ValidationFacts>;
  orderingFor(observation: SourceObservation): Promise<OrderingPolicy>;
  verifySuppliedContent(observation: SourceObservation): Promise<VerifiedSuppliedContent | undefined>;
}
export interface DownstreamJob {
  unpaidOnly?:true;
  id: string; feedId: string; feedSourceId: string; observationId: string;
  kind: 'ACQUIRE' | 'REASSESS' | 'AUTHORITATIVE_RECHECK'; state: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'DEFERRED'; attempts: number;
  deferred?: {reason:'INITIAL_BACKLOG';policy:'initial-acquisition-backlog-v1';at:string;feedCreatedAt:string;publishedAtHint:string};
  backlogReview?: {policy:'initial-acquisition-backlog-v1';at:string;result:'RETAINED'};
  nextAttemptAt?: string; exhausted?: boolean; conflictId?: string;
  leaseToken?: string; leaseUntil?: string; failureCode?: string;
  resumeAttempts?: number;
    /** Explicit operator recovery; cumulative attempts and prior failures survive. */
    recoveryAuthorizations?: {unpaidOnly?:true;reviewedRedirect?:{from:string;to:string;headline:string};id:string;authorizedAt:string;priorAttempts:number;priorFailureCode:string;priorFailureDetail?:string;maxAttempts:number;redirectEvidence?:{from:string;to:string};canonicalEvidence?:{from:string;to:string};publicHttpEvidence?:PublicHttpRecoveryEvidence;redirectProof?:import('./article-redirect').ArticleRedirectEvidence}[];
  resourceWaits?: number;
  failureDetail?: string;
  priorFailureCode?: string;
  httpStatus?: number;
}
export interface AcceptedAcquiredContent {
  id: string; feedId: string; candidateId: string; sourceObservationId: string;
  representation: RepresentationKind; contentCompleteness: ContentCompleteness;
  title?: string; body: string; language?: string; publishedAt?: string; canonicalUrl?: string; acquiredAt: string;
  acquisitionMethod: 'supplied_payload' | 'platform_api' | 'direct_http' | 'browser'; acquisitionProvider?: string;
  sourceId?: string; resolvedUrl?: string;
  quality?: { transportSuccess: boolean; extractionSuccess: boolean; extractionComplete: boolean };
  provenance?: { redirectEvidence?:import('./article-redirect').ArticleRedirectEvidence; contentKind?:'PRODUCT_DETAIL'|'CATALOGUE'; routerVersion: string; stages: string[]; rawPayloadRef?: string; languageResolution?:import('../v1-intelligence/language').LanguageResolution;publicationDate?:ReturnType<typeof import('./publication-date').resolvePublicationDate>;browserEvidence?: {acceptanceId?:string;observationId?:string;rawArtifactRef?:string} };
}
export interface AcceptedInput { observation: SourceObservation; proposal?: CandidateProposal }
export interface CandidateRecord {
  id:string; feedId:string; feedSourceId:string; sourceId:string; sourceItemKey:string;
  latestObservationId:string; discoveredAt:string; intakePolicyVersion:string;
  firstObservationId?:string;
  acquisitionObservationId?:string;
}
