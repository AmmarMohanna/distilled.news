// Normative wire types from Architecture v1 Appendix C. Runtime validation is in schemas.ts.

export type Id = string;

export type ISODateTime = string;          // RFC 3339 / ISO-8601 UTC timestamp

export type Score01 = number;              // finite number in [0, 1]

export type PositiveInt = number;          // integer >= 1 and <= Number.MAX_SAFE_INTEGER

export type TargetType = "EVENT" | "STORYLINE";

export type RepresentationKind =
  | "FULL_ARTICLE"
  | "ARTICLE_EXCERPT"
  | "TELEGRAM_MESSAGE"
  | "SOCIAL_POST"
  | "LISTING_RESULT"
  | "API_RECORD";

export type ContentCompleteness = "COMPLETE" | "PARTIAL" | "UNKNOWN";

export type CoverageStatus = "COMPLETE" | "PARTIAL" | "UNKNOWN";

export type ObservationOperation = "UPSERT" | "DELETE";

export type IntakeDecision =
  | "ACCEPTED"
  | "REPLAY"
  | "IGNORED"
  | "DELETION_ACCEPTED"
  | "REJECTED"
  | "QUARANTINED";

export type EvidenceAcceptanceDecision =
  | "PROMOTED_NEW_REVISION"
  | "REPLAY_CURRENT_CONTENT"
  | "IGNORED_STALE_OBSERVATION"
  | "QUARANTINED_REVISION_CONFLICT";

export type EvidenceConflictState =
  | "PENDING_AUTHORITATIVE_RECHECK"
  | "RESOLVED_KEEP_CURRENT"
  | "RESOLVED_BY_LATER_OBSERVATION";

export type CheckpointResolution = "RESOLVED" | "UNRESOLVED";

export interface CollectionBounds {
  startTime?: ISODateTime;
  endTime?: ISODateTime;
  startCursor?: string;
  endCursor?: string;
}

export interface CollectionCoverage {
  id: Id;
  feedId: Id;
  feedSourceId: Id;
  fetchRunId: Id;
  fetchStartSequence: PositiveInt;
  requestedBounds: CollectionBounds;
  observedBounds: CollectionBounds;
  status: CoverageStatus;
  continuationState: "NONE" | "PENDING" | "EXHAUSTED";
  continuationToken?: string;
  safeCheckpointCursor?: string;
  failureReason?:
    | "NONE"
    | "RATE_LIMIT"
    | "TRANSIENT_PROVIDER_FAILURE"
    | "AUTH_REQUIRED"
    | "CHALLENGE"
    | "PARTIAL_PAGE"
    | "UNKNOWN";
  createdAt: ISODateTime;
}

export interface SourceRevision {
  scheme: string;                    // e.g. telegram_edit_date, provider_revision
  value: string;
  comparability: "COMPARABLE" | "OPAQUE";
  authority: "ORIGIN" | "PROVIDER";
}

export interface SourceObservation {
  id: Id;
  feedId: Id;
  feedSourceId: Id;
  sourceId: Id;
  fetchRunId: Id;
  fetchStartSequence: PositiveInt;

  sourceItemKey: string;             // stable within this FeedSource
  operation: ObservationOperation;

  representation: RepresentationKind;
  contentCompleteness: ContentCompleteness;
  contentHash?: string;              // required for UPSERT when usable content bytes/text exist

  sourceRevision?: SourceRevision;
  authoritativeCurrentState: boolean;

  upstreamId?: string;
  canonicalUrl?: string;
  publisherId?: string;
  titleHint?: string;
  publishedAtHint?: ISODateTime;
  languageHint?: string;
  suppliedPayloadRef?: string;

  observedAt: ISODateTime;
}

export interface CandidateProposal {
  observationId: Id;
  feedId: Id;
  feedSourceId: Id;
  sourceId: Id;
  sourceItemKey: string;
  connectorType: string;
  upstreamId?: string;
  url?: string;
  titleHint?: string;
  publishedAtHint?: ISODateTime;
  languageHint?: string;
  representation: RepresentationKind;
  contentCompleteness: ContentCompleteness;
  suppliedPayloadRef?: string;
  payloadHash?: string;
  discoveredAt: ISODateTime;
  discoveryRunId: Id;
}

export interface IntakeReceipt {
  id: Id;
  observationId: Id;
  feedId: Id;
  feedSourceId: Id;
  sourceItemKey: string;
  decision: IntakeDecision;
  reasonCode:
    | "ACCEPTED_NEW_ITEM"
    | "ACCEPTED_NEW_OBSERVATION"
    | "REPLAY_IDENTICAL"
    | "IGNORED_STALE_OBSERVATION"
    | "ACCEPTED_DELETION"
    | "REJECT_QUERY_RESTRICTION"
    | "REJECT_INVALID_IDENTITY"
    | "REJECT_UNSUPPORTED"
    | "QUARANTINE_MISSING_VALIDATION_FIELDS"
    | "QUARANTINE_REVISION_CONFLICT";
  checkpointResolution: CheckpointResolution;
  candidateItemId?: Id;
  tombstoneId?: Id;
  decidedAt: ISODateTime;
  intakePolicyVersion: string;
}

export interface NormalizedEvidenceItem {
  id: Id;
  feedId: Id;
  feedSourceId: Id;
  sourceId: Id;
  sourceItemKey: string;

  state: "ACTIVE" | "DELETED";
  currentRevisionId?: Id;             // present for ACTIVE content; exact historical revisions remain immutable
  currentTombstoneId?: Id;            // present when DELETED

  currentObservationId: Id;
  currentFetchStartSequence: PositiveInt;
  currentSourceRevision?: SourceRevision;

  firstSeenAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface EvidenceRevision {
  id: Id;
  evidenceId: Id;
  feedId: Id;
  revision: PositiveInt;
  sourceObservationId: Id;
  acquiredContentId: Id;
  canonicalUrl?: string;
  title?: string;
  body?: string;
  language?: string;
  publishedAt?: ISODateTime;
  representation: RepresentationKind;
  contentCompleteness: ContentCompleteness;
  contentHash: string;
  sourceRevision?: SourceRevision;
  fetchStartSequence: PositiveInt;
  acceptedAt: ISODateTime;
}

export interface EvidenceTombstone {
  id: Id;
  evidenceId: Id;
  feedId: Id;
  sourceObservationId: Id;
  sourceRevision?: SourceRevision;
  fetchStartSequence: PositiveInt;
  acceptedAt: ISODateTime;
}

export interface EvidenceAcceptanceReceipt {
  id: Id;
  evidenceId: Id;
  sourceObservationId: Id;
  acquiredContentId: Id;
  decision: EvidenceAcceptanceDecision;
  resultingRevisionId?: Id;
  conflictId?: Id;
  decidedAt: ISODateTime;
}

export interface EvidenceRevisionConflict {
  id: Id;
  evidenceId: Id;
  sourceObservationId: Id;
  acquiredContentId: Id;
  currentRevisionId?: Id;
  currentTombstoneId?: Id;
  incomingContentHash?: string;
  currentContentHash?: string;
  reason:
    | "EQUAL_COMPARABLE_SOURCE_REVISION_DIFFERENT_STATE"
    | "EQUAL_FETCH_SEQUENCE_DIFFERENT_STATE"
    | "INCOMPARABLE_REVISION_REQUIRES_AUTHORITATIVE_CHECK";
  state: EvidenceConflictState;
  resolutionObservationId?: Id;
  createdAt: ISODateTime;
  resolvedAt?: ISODateTime;
}

export interface EventVersionRef {
  eventId: Id;
  eventVersionId: Id;
  version: PositiveInt;
}

export interface StorylineVersionRef {
  storylineId: Id;
  storylineVersionId: Id;
  version: PositiveInt;
}

export interface EventVersion {
  id: Id;
  eventId: Id;
  feedId: Id;
  version: PositiveInt;
  title?: string;
  type?: string;
  occurredAt?: ISODateTime;
  entities: string[];
  geography: string[];
  state: string;
  confidence: Score01;
  algorithmVersion: string;
  createdAt: ISODateTime;
}

export interface EventMembership {
  id: Id;
  eventVersionId: Id;
  evidenceRevisionId: Id;
  confidence: Score01;
  algorithmVersion: string;
  createdAt: ISODateTime;
}

export interface AssessmentTarget {
  targetType: TargetType;
  targetVersionId: Id;               // EventVersion.id or StorylineVersion.id
}

export interface EventSalienceAssessment extends AssessmentTarget {
  id: Id;
  feedId: Id;
  feedRevision: PositiveInt;
  impact: Score01;
  novelty: Score01;
  changeMagnitude: Score01;
  institutionalSignificance: Score01;
  corroboration: Score01;
  persistence: Score01;
  recency: Score01;
  overallScore: Score01;
  policyVersion: string;
  computedAt: ISODateTime;
}

export interface UserRelevance extends AssessmentTarget {
  id: Id;
  feedId: Id;
  feedRevision: PositiveInt;
  topicMatch: Score01;
  geographyMatch: Score01;
  entityMatch: Score01;
  sourcePreference: Score01;
  languageFit: Score01;
  overallScore: Score01;
  policyVersion: string;
  computedAt: ISODateTime;
}

export type WindowReasonCode =
  | "NEW_DEVELOPMENT"
  | "MAJOR_CHANGE"
  | "HIGH_IMPACT"
  | "HIGH_RELEVANCE"
  | "HIGH_RECENCY"
  | "PERSISTENT_STORYLINE"
  | "TURNING_POINT"
  | "LOW_NOVELTY"
  | "REDUNDANT_UPDATE";

export interface WindowScore extends AssessmentTarget {
  id: Id;
  feedId: Id;
  feedRevision: PositiveInt;
  windowStart: ISODateTime;
  windowEnd: ISODateTime;
  windowKind: "30M" | "HOURLY" | "DAILY" | "WEEKLY";
  components: {
    recency: Score01;
    novelty: Score01;
    changeMagnitude: Score01;
    impact: Score01;
    persistence: Score01;
    turningPoint: Score01;
  };
  finalScore: Score01;
  reasonCodes: WindowReasonCode[];
  changeBoundaryVersionId?: Id;
  policyVersion: string;
  computedAt: ISODateTime;
}

export interface BriefingCandidate {
  id: Id;
  feedId: Id;
  feedRevision: PositiveInt;
  targetType: TargetType;
  targetVersionId: Id;
  salienceAssessmentId: Id;
  relevanceAssessmentId: Id;
  windowScoreId: Id;
  initialScore: Score01;
  reasons: string[];
  selectionState: "ELIGIBLE" | "SELECTED" | "OMITTED";
  selectionPolicyVersion: string;
}
