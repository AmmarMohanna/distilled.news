import type { BriefingConfig, BriefingEdition, SourceKind, SourceProvider } from "@distilled/core";

export type AccountRole = "admin" | "user";

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
  collection?:{pending:number;sources:string[]};
  acquisition:{completed:number;total:number;failed:number};
  review:{completed:number;total:number;failed:number};
  pending:number;
}

export interface FeedPayload {
  publicationProgress?: PublicationProgress;
  publicationState?: 'waiting'|'checking'|'quiet'|'failed'|'published'|'correction_pending'|'setup_required'|'service_blocked';
  sourceAvailability?: {sourceId:string;title:string;state:'AVAILABLE'|'UNAVAILABLE';providers:string[];reason?:string;acquisition?:{completed:number;pending:number;failed:number};warning?:string;collectionError?:string}[];
  briefing: PublicBriefing;
  editions: BriefingEdition[];
  viewerHasStarred: boolean;
}
