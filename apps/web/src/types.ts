import type { BriefingConfig, BriefingEdition, SourceKind, SourceProvider } from "@distilled/core";

export type AccountRole = "admin" | "user";

export interface ExploreChannel {
  username: string;
  publicFeedCount: number;
  followerCount: number;
  viewerFollowing?: boolean;
}

export interface AccountRecord {
  id: string;
  email: string;
  username: string;
  role: AccountRole;
  emailVerifiedAt?: string;
  disabledAt?: string;
}

export interface AccountWithStats extends AccountRecord {
  briefingCount: number;
  createdAt?: string;
}

export interface SourceRecord {
  id: string;
  briefingId: string;
  title: string;
  type: "channel" | "group";
  provider: SourceProvider;
  kind: SourceKind;
  username?: string;
  input?: string;
  url?: string;
  sourceUrl?: string;
  actorId?: string;
  enabled: boolean;
  lastSeenAt: string;
  lastCheckedAt?: string;
  lastError?: string;
}

export interface HealthStatus {
  lastSourceEventAt?: string;
  lastSourceFetchAt?: string;
  lastImportedMessageAt?: string;
  latestPublishedAt?: string;
  nextBriefingAt?: string;
  processing: {
    queued: number;
    completed: number;
    failed: number;
  };
}

export interface SessionStatus {
  authenticated: boolean;
  setupRequired: boolean;
  account?: AccountRecord;
  turnstileSiteKey?: string;
}

export type PublicBriefing = Omit<BriefingConfig, "interestProfile" | "styleInstruction">;

export interface PublicationProgress {
  stage:'COLLECTING'|'PROCESSING'|'PUBLISHING';
  acquisition:{completed:number;total:number;failed:number};
  review:{completed:number;total:number;failed:number};
  pending:number;
}

export interface FeedTimelinePage {
  editions: BriefingEdition[];
  timelineNextCursor?: string | null;
  timelineSince?: string;
  /** Changes when the published records may have changed. */
  publicationVersion?: string;
}

export interface FeedPayload extends FeedTimelinePage {
  /** Whether editions covers the complete searchable publication set. */
  editionsComplete?: boolean;
  catchUpAvailable?: boolean;
  readerIntervalMinutes?: number;
  hasPublishedBriefings?: boolean;
  publicationProgress?: PublicationProgress;
  publicationState?: 'waiting'|'checking'|'quiet'|'failed'|'published'|'correction_pending'|'setup_required'|'partial'|'service_blocked';
  sourceHealthUnavailable?: boolean;
  sourceAvailability?: {sourceId:string;title:string;state:'AVAILABLE'|'UNAVAILABLE';providers:string[];reason?:string;acquisition?:{completed:number;pending:number;failed:number;issues?:{reason:string;count:number}[]};warning?:string;collectionError?:string;collectionAlerts?:('SOURCE_NO_RECENT_SUCCESS'|'SOURCE_NEVER_COLLECTED')[]}[];
  briefing: PublicBriefing;
  viewerHasStarred: boolean;
}

export interface FeedCardMetadata {viewerHasStarred?: boolean; latestUpdatedAt?: string}
