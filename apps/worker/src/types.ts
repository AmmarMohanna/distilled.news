import type {
  BriefingConfig,
  BriefingEdition,
  BriefingEvidence,
  BriefingItem,
  NormalizedMessage,
  SourceKind,
  SourceProvider,
  SourceType
} from "@distilled/core";

export type ProcessingJobState = "queued" | "completed" | "failed";
export type SourceRunState = "queued" | "running" | "succeeded" | "failed";
export type SourceHealthState = "healthy" | "degraded" | "backoff" | "disabled_by_user";
export type BriefingWindowState = "running" | "published" | "empty" | "failed";
export type BriefingWindowQuality = "ready" | "degraded";
export type AccountRole = "admin" | "user";
export type AuthTokenPurpose = "email_verification" | "password_reset";
export type SpendCategory = "collection" | "llm";
export type SpendProvider = "apify" | "brave" | "openai";
export type RuntimeProvider =
  | "rss"
  | "telegram"
  | "google_news"
  | "x"
  | "linkedin"
  | "generic_apify"
  | "brave";

export interface AccountRecord {
  id: string;
  email: string;
  username: string;
  role: AccountRole;
  emailVerifiedAt?: string;
  disabledAt?: string;
  sessionVersion: number;
  termsAcceptedAt?: string;
  termsVersion?: string;
  privacyVersion?: string;
  acceptableUseVersion?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountWithStats extends AccountRecord {
  briefingCount: number;
}

export interface UsernameAliasRecord {
  username: string;
  accountId: string;
  isCurrent: boolean;
  createdAt: string;
}

export interface AuthTokenRecord {
  id: string;
  accountId: string;
  purpose: AuthTokenPurpose;
  tokenHash: string;
  expiresAt: string;
  consumedAt?: string;
  createdAt: string;
}

export interface ProcessingJobRecord {
  id: string;
  briefingId: string;
  rawMessageId: string;
  state: ProcessingJobState;
  error?: string;
  leaseToken?: string;
  leaseUntil?: string;
  attemptCount: number;
  availableAt?: string;
  completedAt?: string;
  lastEnqueuedAt?: string;
  updatedAt: string;
}

export interface ProcessingJobClaim extends ProcessingJobRecord {
  leaseToken: string;
  leaseUntil: string;
}

export interface BriefingWindowClaim {
  id: string;
  briefingId: string;
  cadence: "hourly" | "daily" | "weekly" | "monthly";
  windowStart: string;
  windowEnd: string;
  leaseToken: string;
  leaseUntil: string;
}

export interface RecoverableBriefingWindow {
  id: string;
  briefingId: string;
  cadence: "hourly" | "daily" | "weekly" | "monthly";
  windowStart: string;
  windowEnd: string;
  contentCutoffAt: string;
  messageCount: number;
}

export interface Env {
  DB: D1Database;
  RAW_ARCHIVE: R2Bucket;
  PROCESSING_QUEUE: Queue<DistilledQueueMessage>;
  SOURCE_QUEUE?: Queue<DistilledQueueMessage>;
  EDITION_QUEUE?: Queue<DistilledQueueMessage>;
  EMAIL?: SendEmail;
  ASSETS?: Fetcher;
  CF_VERSION_METADATA?: { id: string; tag?: string; timestamp: string };
  ADMIN_SESSION_SECRET?: string;
  ADMIN_SETUP_TOKEN?: string;
  INTERNAL_MAINTENANCE_SECRET?: string;
  EMAIL_FROM?: string;
  EMAIL_CANARY_RECIPIENT?: string;
  PUBLIC_API_BASE_URL?: string;
  PUBLIC_WEB_BASE_URL?: string;
  ENVIRONMENT?: string;
  REGISTRATION_MODE?: string;
  RELEASE_SHA?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_EXPECTED_HOSTNAMES?: string;
  TURNSTILE_EXPECTED_ACTION?: string;
  PROVIDER_RSS_ENABLED?: string;
  PROVIDER_TELEGRAM_ENABLED?: string;
  PROVIDER_GOOGLE_NEWS_ENABLED?: string;
  PROVIDER_X_ENABLED?: string;
  PROVIDER_LINKEDIN_ENABLED?: string;
  PROVIDER_GENERIC_APIFY_ENABLED?: string;
  PROVIDER_BRAVE_ENABLED?: string;
  BRAVE_SEARCH_API_KEY?: string;
  BRAVE_SEARCH_DAILY_BUDGET_USD?: string;
  BRAVE_SEARCH_STORAGE_RIGHTS_CONFIRMED?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_AI_GATEWAY_ID?: string;
  CLOUDFLARE_AI_GATEWAY_TOKEN?: string;
  OPENAI_API_KEY?: string;
  OPENAI_PROJECT_ID?: string;
  OPENAI_MODEL?: string;
  OPENAI_EDITION_MODEL?: string;
  OPENAI_EDITION_FALLBACK_MODEL?: string;
  OPENAI_INPUT_PRICE_USD_PER_MILLION_TOKENS?: string;
  OPENAI_OUTPUT_PRICE_USD_PER_MILLION_TOKENS?: string;
  OPENAI_SUMMARY_MAX_INPUT_TOKENS?: string;
  OPENAI_IMPORTANCE_REVIEW_MAX_INPUT_TOKENS?: string;
  OPENAI_EVENT_REVIEW_MAX_INPUT_TOKENS?: string;
  OPENAI_EDITION_MAX_INPUT_TOKENS?: string;
  OPENAI_SUMMARY_MAX_OUTPUT_TOKENS?: string;
  OPENAI_REVIEW_MAX_OUTPUT_TOKENS?: string;
  OPENAI_EDITION_MAX_OUTPUT_TOKENS?: string;
  EDITION_SYNTHESIS_MODE?: string;
  APIFY_API_TOKEN?: string;
  APIFY_EXPECTED_USER_ID?: string;
  APIFY_EXPECTED_PLAN_TIER?: string;
  APIFY_EXPECTED_MAX_MONTHLY_USAGE_USD?: string;
  APIFY_GOOGLE_NEWS_ACTOR_ID?: string;
  APIFY_GOOGLE_NEWS_FALLBACK_ACTOR_ID?: string;
  APIFY_X_ACTOR_ID?: string;
  APIFY_X_ACTOR_BUILD?: string;
  APIFY_GOOGLE_NEWS_ACTOR_BUILD?: string;
  APIFY_GOOGLE_NEWS_FALLBACK_ACTOR_BUILD?: string;
  APIFY_LINKEDIN_COMPANY_ACTOR_ID?: string;
  APIFY_LINKEDIN_PROFILE_ACTOR_ID?: string;
  APIFY_X_PRICE_USD_PER_1000_RESULTS?: string;
  APIFY_GOOGLE_NEWS_PRICE_USD_PER_1000_RESULTS?: string;
  APIFY_GOOGLE_NEWS_FALLBACK_PRICE_USD_PER_1000_RESULTS?: string;
  GLOBAL_LLM_DAILY_BUDGET_USD?: string;
  GLOBAL_LLM_MONTHLY_BUDGET_USD?: string;
  HOSTED_LLM_ACCOUNT_DAILY_BUDGET_USD?: string;
  HOSTED_LLM_ACCOUNT_MONTHLY_BUDGET_USD?: string;
  GLOBAL_COLLECTION_DAILY_BUDGET_USD?: string;
  GLOBAL_COLLECTION_MONTHLY_BUDGET_USD?: string;
  TOTAL_MONTHLY_BUDGET_USD?: string;
  HOSTED_ACCOUNT_CAP?: string;
  HOSTED_PENDING_ACCOUNT_CAP?: string;
}

export interface ProcessingJobMessage {
  type?: "process_raw_message";
  jobId: string;
  briefingId: string;
  rawMessageId: string;
}

export interface SourceRefreshJobMessage {
  type: "refresh_source";
  briefingId: string;
  sourceId: string;
  force?: boolean;
  canonicalLeaseToken?: string;
}

export interface PublishEditionJobMessage {
  type: "publish_due_edition";
  briefingId: string;
}

export type DistilledQueueMessage = ProcessingJobMessage | SourceRefreshJobMessage | PublishEditionJobMessage;

export interface SourceRecord {
  id: string;
  briefingId: string;
  title: string;
  type: SourceType;
  provider: SourceProvider;
  kind: SourceKind;
  username?: string;
  input?: string;
  url?: string;
  sourceUrl?: string;
  actorId?: string;
  actorInput?: unknown;
  cursor?: unknown;
  enabled: boolean;
  lastSeenAt: string;
  lastCheckedAt?: string;
  lastError?: string;
  healthState?: SourceHealthState;
  failureClass?: string;
  consecutiveFailures?: number;
  lastSuccessAt?: string;
  lastNewItemAt?: string;
  nextRetryAt?: string;
  canonicalKey?: string;
}

export interface SourceRefreshCandidate {
  briefingId: string;
  sourceId: string;
  provider: SourceProvider;
  kind: SourceKind;
  briefingCadence: BriefingConfig["briefingCadence"];
}

export interface SourceRunRecord {
  id: string;
  sourceId: string;
  briefingId: string;
  provider: SourceProvider;
  actorId?: string;
  actorRunId?: string;
  datasetId?: string;
  state: SourceRunState;
  itemCount: number;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  idempotencyKey?: string;
  archiveKey?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
}

export interface ExploreBriefingRecord extends BriefingConfig {
  latestPublishedAt: string;
}

export interface SpendBudgetLimits {
  accountDailyUsd: number;
  accountMonthlyUsd: number;
  globalDailyUsd: number;
  globalMonthlyUsd: number;
  totalMonthlyUsd: number;
}

export interface SpendReservationResult {
  status: "created" | "duplicate" | "denied";
  idempotencyKey: string;
  reservedUsd: number;
  reason?: "account_daily" | "account_monthly" | "global_daily" | "global_monthly" | "total_monthly";
}

export interface SpendUsage {
  collection: { dayUsd: number; monthUsd: number };
  llm: { dayUsd: number; monthUsd: number };
  totalMonthUsd: number;
}

export interface BriefingQuota {
  maxFeeds: number;
  maxHourlyFeeds: number;
}

export interface AccountQuota {
  maxAccounts: number;
  maxPendingAccounts?: number;
}

export interface SourceQuota {
  accountId: string;
  maxPerFeed: number;
  maxPerAccount: number;
  maxPaidPerAccount: number;
  maxPaidProviderAccounts: number;
  maxGoogleNewsPerAccount: number;
  maxXPerAccount: number;
}

export interface PaidProviderSeatCapacity {
  accountCap: number;
  claimedAccounts: number;
  remainingAccounts: number;
  capacityReached: boolean;
}

export interface AccountPayloadDeletionPlan {
  exclusiveKeys: string[];
  sharedKeysRetained: number;
  totalReferencedKeys: number;
}

export interface ProviderHealthSummary {
  enabledSources: number;
  freshSources: number;
  degradedSources: number;
  backoffSources: number;
  recentSucceededRuns: number;
  recentFailedRuns: number;
  recentDlq: boolean;
}

export interface OperationalEvent {
  id: string;
  category: "maintenance" | "dlq" | "model";
  subsystem: string;
  status: "started" | "succeeded" | "failed";
  bodyType?: string;
  bodyId?: string;
  releaseSha?: string;
  detail?: string;
  occurredAt: string;
}

export interface RetentionDeleteResult {
  deleted: number;
  hasMore: boolean;
}

export interface SpendReconciliationResult {
  reconciled: number;
  hasMore: boolean;
}

export interface SpendRetentionResult {
  archivedOperations: number;
  detailRowsDeleted: number;
  aggregatesDeleted: number;
  tombstonesDeleted: number;
  hasMore: boolean;
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
  sources: {
    enabled: number;
    degraded: number;
    backoff: number;
    disabled: number;
  };
  spendToday: {
    llmUsd: number;
    collectionUsd: number;
  };
}

export interface Repository {
  createAccount(input: {
    email: string;
    username: string;
    role: AccountRole;
    passwordHash: string;
    emailVerifiedAt?: string;
    termsAcceptedAt?: string;
    termsVersion?: string;
    privacyVersion?: string;
    acceptableUseVersion?: string;
  }, now?: Date, quota?: AccountQuota): Promise<AccountRecord>;
  bootstrapAdmin(input: {
    email: string;
    username: string;
    passwordHash: string;
    emailVerifiedAt: string;
    briefing: BriefingConfig;
  }, now?: Date): Promise<AccountRecord | null>;
  deleteAccount(
    id: string,
    now?: Date,
    options?: { retireUsernames?: boolean }
  ): Promise<void>;
  listAccountRawPayloadKeys(id: string): Promise<string[]>;
  planAccountPayloadDeletion(id: string): Promise<AccountPayloadDeletionPlan>;
  planBriefingPayloadDeletion(briefingId: string): Promise<AccountPayloadDeletionPlan>;
  listAccounts(): Promise<AccountWithStats[]>;
  countAccounts(): Promise<number>;
  countPendingAccounts(): Promise<number>;
  deleteStaleUnverifiedAccounts(
    createdBefore: string,
    tokenExpiredBefore: string,
    absoluteCreatedBefore: string,
    limit: number
  ): Promise<number>;
  getAccountById(id: string): Promise<AccountRecord | null>;
  getAccountByEmail(email: string): Promise<(AccountRecord & { passwordHash: string }) | null>;
  getAccountByUsername(username: string): Promise<AccountRecord | null>;
  resolveUsernameAlias(username: string): Promise<{ account: AccountRecord; alias: UsernameAliasRecord } | null>;
  isUsernameRetired(username: string): Promise<boolean>;
  updateAccount(input: {
    id: string;
    username?: string;
    role?: AccountRole;
    disabled?: boolean;
    emailVerifiedAt?: string;
    passwordHash?: string;
  }, now?: Date): Promise<AccountRecord>;
  acceptLegalTerms(input: {
    accountId: string;
    termsVersion: string;
    privacyVersion: string;
    acceptableUseVersion: string;
  }, now?: Date): Promise<AccountRecord>;
  countAdmins(): Promise<number>;
  createAuthToken(input: {
    accountId: string;
    purpose: AuthTokenPurpose;
    tokenHash: string;
    expiresAt: string;
  }, now?: Date): Promise<AuthTokenRecord>;
  getAuthToken(tokenHash: string, purpose: AuthTokenPurpose): Promise<AuthTokenRecord | null>;
  consumeAuthToken(id: string, now?: Date): Promise<boolean>;
  consumePasswordResetToken(input: {
    tokenHash: string;
    passwordHash: string;
  }, now?: Date): Promise<AccountRecord | null>;
  countRecentAuthAttempts(input: { key: string; action: string; since: string }): Promise<number>;
  recordAuthAttempt(input: { key: string; action: string }, now?: Date): Promise<void>;
  consumeRateLimit(input: {
    key: string;
    action: string;
    since: string;
    limit: number;
  }, now?: Date): Promise<boolean>;
  ensureDefaultBriefing(account: AccountRecord, now?: Date): Promise<BriefingConfig>;
  listBriefings(accountId?: string): Promise<BriefingConfig[]>;
  listBriefingsDue(before: string, limit: number): Promise<BriefingConfig[]>;
  listDueSourceRefreshCandidates(now: string, limit: number): Promise<SourceRefreshCandidate[]>;
  listBriefingsWithRecoverableEmptyWindows(sinceWindowEnd: string, limit: number): Promise<BriefingConfig[]>;
  listExploreBriefings(limit: number, now?: Date): Promise<ExploreBriefingRecord[]>;
  getBriefingById(id: string): Promise<BriefingConfig | null>;
  getBriefingBySlug(ownerAccountId: string, slug: string): Promise<BriefingConfig | null>;
  hasBriefingStar(briefingId: string, voterId: string): Promise<boolean>;
  setBriefingStar(briefingId: string, voterId: string, starred: boolean, now?: Date): Promise<number>;
  upsertBriefing(input: BriefingConfig, now?: Date, quota?: BriefingQuota): Promise<BriefingConfig>;
  deleteBriefing(id: string, now?: Date): Promise<void>;
  listSources(briefingId: string): Promise<SourceRecord[]>;
  countPaidProviderSeats(): Promise<number>;
  getSource(sourceId: string): Promise<SourceRecord | null>;
  setSourceEnabled(sourceId: string, enabled: boolean, now?: Date): Promise<void>;
  deleteSource(sourceId: string): Promise<void>;
  upsertConfiguredSource(input: {
    briefingId: string;
    title: string;
    type?: SourceType;
    provider: SourceProvider;
    kind: SourceKind;
    username?: string;
    input?: string;
    url?: string;
    sourceUrl?: string;
    actorId?: string;
    actorInput?: unknown;
    enabled?: boolean;
  }, now?: Date, quota?: SourceQuota): Promise<SourceRecord>;
  updateSourceState(input: {
    sourceId: string;
    title?: string;
    username?: string;
    url?: string;
    sourceUrl?: string;
    lastSeenAt?: string;
    lastCheckedAt?: string;
    lastError?: string;
    cursor?: unknown;
  }, now?: Date): Promise<void>;
  recordSourceSuccess(sourceId: string, newItemAt?: string, now?: Date): Promise<void>;
  recordSourceFailure(input: {
    sourceId: string;
    error: string;
    failureClass: string;
    nextRetryAt: string;
  }, now?: Date): Promise<void>;
  listEquivalentSources(sourceId: string): Promise<SourceRecord[]>;
  claimCanonicalSourceRefresh(sourceId: string, intervalMs: number, leaseMs: number, now?: Date): Promise<string | null>;
  activateCanonicalSourceRefresh(sourceId: string, dispatchLeaseToken: string, leaseMs: number, now?: Date): Promise<string | null>;
  releaseCanonicalSourceRefresh(sourceId: string, leaseToken: string, now?: Date): Promise<void>;
  completeCanonicalSourceRefresh(sourceId: string, leaseToken: string, nextRefreshAt: string, newItemAt?: string, now?: Date, markHealthy?: boolean): Promise<void>;
  failCanonicalSourceRefresh(sourceId: string, leaseToken: string, error: string, failureClass: string, backoffMs: number, now?: Date): Promise<void>;
  rescheduleCanonicalSourceRefresh(sourceId: string, nextRefreshAt: string, error?: string, now?: Date): Promise<void>;
  upsertSourceFromMessage(briefingId: string, message: NormalizedMessage, now?: Date): Promise<SourceRecord>;
  saveRawMessage(briefingId: string, message: NormalizedMessage, now?: Date): Promise<void>;
  saveRawMessageAndCreateProcessingJob(briefingId: string, message: NormalizedMessage, now?: Date): Promise<string>;
  getRawMessage(id: string): Promise<NormalizedMessage | null>;
  listRecentRawMessages(briefingId: string, now?: Date, limit?: number): Promise<NormalizedMessage[]>;
  listRawMessagesForWindow(briefingId: string, windowStart: string, windowEnd: string, limit?: number): Promise<NormalizedMessage[]>;
  listRawMessagesReceivedBetween(briefingId: string, receivedAfter: string, receivedThrough: string, postedAfter: string, limit?: number): Promise<NormalizedMessage[]>;
  createProcessingJob(briefingId: string, rawMessageId: string, now?: Date): Promise<string>;
  claimProcessingJob(jobId: string, leaseMs: number, now?: Date): Promise<ProcessingJobClaim | null>;
  completeProcessingJob(jobId: string, now?: Date, leaseToken?: string): Promise<void>;
  failProcessingJob(jobId: string, error: string, now?: Date, leaseToken?: string): Promise<void>;
  releaseProcessingJob(jobId: string, error: string, delayMs: number, now?: Date, leaseToken?: string): Promise<void>;
  listProcessingJobs(input?: {
    briefingId?: string;
    states?: ProcessingJobState[];
    limit?: number;
    updatedBefore?: string;
    order?: "newest" | "oldest";
  }): Promise<ProcessingJobRecord[]>;
  listRecoverableProcessingJobs(input: {
    orphanedBefore: string;
    enqueuedBefore: string;
    abandonedLeaseBefore: string;
    limit: number;
  }): Promise<ProcessingJobRecord[]>;
  requeueProcessingJob(jobId: string, now?: Date): Promise<void>;
  markProcessingJobEnqueued(jobId: string, now?: Date): Promise<void>;
  claimBriefingWindow(input: {
    briefingId: string;
    cadence: "hourly" | "daily" | "weekly" | "monthly";
    windowStart: string;
    windowEnd: string;
    leaseMs: number;
  }, now?: Date): Promise<BriefingWindowClaim | null>;
  completeBriefingWindow(input: {
    id: string;
    leaseToken: string;
    state: "published" | "empty";
    messageCount: number;
    editionId?: string;
    contentCutoffAt: string;
    qualityState: BriefingWindowQuality;
  }, now?: Date): Promise<void>;
  getLatestBriefingWindowCutoff(briefingId: string, cadence: "hourly" | "daily" | "weekly" | "monthly", beforeWindowEnd: string): Promise<string | undefined>;
  listRecoverableEmptyBriefingWindows(briefingId: string, cadence: "hourly" | "daily" | "weekly" | "monthly", sinceWindowEnd: string, limit?: number): Promise<RecoverableBriefingWindow[]>;
  claimRecoverableEmptyBriefingWindow(id: string, leaseMs: number, now?: Date): Promise<BriefingWindowClaim | null>;
  failBriefingWindow(id: string, leaseToken: string, error: string, now?: Date): Promise<void>;
  getExistingItems(briefingId: string, now?: Date): Promise<BriefingItem[]>;
  saveBriefingItems(briefingId: string, items: BriefingItem[], now?: Date): Promise<void>;
  repairDuplicateBriefingItems(briefingId: string, now?: Date): Promise<number>;
  listFeedItems(ownerAccountId: string, slug: string, includeEvidence: boolean, now?: Date): Promise<BriefingItem[]>;
  getFeedItemEvidence(briefingId: string, itemId: string, now?: Date): Promise<BriefingEvidence[]>;
  saveBriefingEdition(edition: BriefingEdition, now?: Date): Promise<void>;
  listBriefingEditions(briefingId: string, includeSections: boolean, now?: Date, limit?: number): Promise<BriefingEdition[]>;
  getBriefingEdition(briefingId: string, editionId: string, now?: Date): Promise<BriefingEdition | null>;
  getHealth(briefingId?: string, now?: Date): Promise<HealthStatus>;
  createSourceRun(input: {
    sourceId: string;
    briefingId: string;
    provider: SourceProvider;
    actorId?: string;
    actorRunId?: string;
    datasetId?: string;
    state: SourceRunState;
    estimatedCostUsd?: number;
    idempotencyKey?: string;
    startedAt?: string;
  }, now?: Date): Promise<SourceRunRecord>;
  updateSourceRun(input: {
    id: string;
    actorRunId?: string;
    datasetId?: string;
    state?: SourceRunState;
    itemCount?: number;
    estimatedCostUsd?: number;
    actualCostUsd?: number;
    archiveKey?: string;
    error?: string;
    completedAt?: string;
  }, now?: Date): Promise<void>;
  listSourceRuns(input?: {
    briefingId?: string;
    sourceId?: string;
    provider?: SourceProvider;
    states?: SourceRunState[];
    limit?: number;
  }): Promise<SourceRunRecord[]>;
  hasActiveCanonicalSourceRun(sourceId: string): Promise<boolean>;
  getProviderHealthSummary(provider: RuntimeProvider, now?: Date): Promise<ProviderHealthSummary>;
  sumSourceRunCosts(input: {
    briefingId?: string;
    sourceId?: string;
    actorId?: string;
    since: string;
  }): Promise<number>;
  reserveSpend(input: {
    idempotencyKey: string;
    accountId: string;
    briefingId?: string;
    category: SpendCategory;
    provider: SpendProvider;
    amountUsd: number;
    limits: SpendBudgetLimits;
    metadata?: Record<string, unknown>;
  }, now?: Date): Promise<SpendReservationResult>;
  settleSpend(input: {
    idempotencyKey: string;
    actualUsd: number;
    metadata?: Record<string, unknown>;
  }, now?: Date): Promise<void>;
  releaseSpend(input: {
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }, now?: Date): Promise<void>;
  getSpendUsage(accountId?: string, now?: Date): Promise<SpendUsage>;
  countStaleSpendReservations(before: string): Promise<number>;
  reconcileStaleSpendReservations(
    before: string,
    now?: Date,
    limit?: number
  ): Promise<SpendReconciliationResult>;
  archiveExpiredSpend(now?: Date, limit?: number): Promise<SpendRetentionResult>;
  recordLlmUsage(input: {
    briefingId: string;
    model: string;
    purpose: "summary" | "importance_review" | "event_review" | "edition_summary";
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  }, now?: Date): Promise<void>;
  sumLlmUsageCost(input: {
    briefingId?: string;
    since: string;
  }): Promise<number>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string, now?: Date): Promise<void>;
  saveRegistrationEmailReceipt(input: {
    nonceHash: string;
    releaseSha: string;
    recipientFingerprint: string;
    expiresAt: string;
  }, now?: Date): Promise<void>;
  consumeRegistrationEmailReceipt(input: {
    nonceHash: string;
    releaseSha: string;
    recipientFingerprint: string;
  }, now?: Date): Promise<boolean>;
  listExpiredRawPayloadKeys(now?: Date, limit?: number): Promise<string[]>;
  clearExpiredSourceRunArchiveKeys(before: string, archiveKeys?: string[]): Promise<number>;
  clearExpiredRawPayloadKeys(before: string, archiveKeys: string[]): Promise<number>;
  deleteExpired(now?: Date, limit?: number): Promise<RetentionDeleteResult>;
  recordOperationalEvent(
    input: Omit<OperationalEvent, "id" | "occurredAt">,
    now?: Date
  ): Promise<void>;
  listOperationalEvents(input: {
    since: string;
    category?: OperationalEvent["category"];
    status?: OperationalEvent["status"];
    limit?: number;
  }): Promise<OperationalEvent[]>;
  deleteOperationalEventsBefore(before: string, limit?: number): Promise<RetentionDeleteResult>;
}
