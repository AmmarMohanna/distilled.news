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
  healthState?: "healthy" | "degraded" | "backoff" | "disabled_by_user";
  failureClass?: string;
  consecutiveFailures?: number;
  lastSuccessAt?: string;
  lastNewItemAt?: string;
  nextRetryAt?: string;
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
    staleQueued: number;
  };
  sources: { enabled: number; degraded: number; backoff: number; disabled: number };
  spendToday: { llmUsd: number; collectionUsd: number };
}

export interface SourceSuggestion {
  id: string;
  title: string;
  description: string;
  provider: "rss";
  kind: "rss_feed" | "google_news";
  input: string;
  homepageUrl: string;
  language: "en" | "ar" | "fr";
  region: string;
  reason: string;
  origin: "curated" | "gdelt" | "google_news";
  confidence: "high" | "medium";
  alreadyAdded: boolean;
}

export interface SessionStatus {
  authenticated: boolean;
  setupRequired: boolean;
  account?: AccountRecord;
  turnstileSiteKey?: string;
}

export type PublicBriefing = Omit<BriefingConfig, "interestProfile" | "styleInstruction">;

export interface FeedPayload {
  briefing: PublicBriefing;
  editions: BriefingEdition[];
  viewerHasStarred: boolean;
}
