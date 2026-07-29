import {
  collapseDuplicateBriefingItems,
  defaultNextBriefingAt,
  eventKeysForItem,
  mergeBriefingItem,
  personalNewsBriefing,
  primaryEventKeyForEvidence,
  sanitizeSummary,
  type BriefingConfig,
  type BriefingEvidence,
  type BriefingEdition,
  type BriefingEditionSection,
  type BriefingItem,
  type MediaReference,
  type NormalizedMessage,
  type SourceKind,
  type SourceProvider,
  type SourceType
} from "@distilled/core";
import type {
  AccountRecord,
  AccountPayloadDeletionPlan,
  AccountQuota,
  AccountRole,
  AccountWithStats,
  BriefingQuota,
  BriefingWindowClaim,
  AuthTokenPurpose,
  AuthTokenRecord,
  ExploreBriefingRecord,
  HealthStatus,
  OperationalEvent,
  ProcessingJobRecord,
  ProcessingJobClaim,
  ProcessingJobState,
  ProviderHealthSummary,
  RecoverableBriefingWindow,
  Repository,
  RuntimeProvider,
  SourceRefreshCandidate,
  SourceQuota,
  SourceRecord,
  SourceRunRecord,
  SourceRunState,
  SpendBudgetLimits,
  SpendCategory,
  SpendProvider,
  SpendReservationResult,
  SpendRetentionResult,
  SpendUsage,
  UsernameAliasRecord
} from "./types";
import { normalizeUsername } from "./auth";
import { visibleNextBriefingAt } from "./editions";

const ORPHANED_PROCESSING_JOB_STALE_MS = 2 * 60 * 1000;
const ENQUEUED_PROCESSING_JOB_STALE_MS = 2 * 60 * 60 * 1000;

type DbValue = string | number | null;

const FIXED_RETENTION_DAYS = 15;
const DEFAULT_DAILY_BUDGET_USD = 1;
const PROCESSOR_EXISTING_ITEM_QUERY_LIMIT = 120;
const SPEND_DETAIL_RETENTION_DAYS = 90;
const SPEND_AGGREGATE_RETENTION_MONTHS = 13;
const SPEND_RETENTION_LEASE_MS = 5 * 60 * 1000;
const SPEND_RETENTION_BATCH_LIMIT = 25;
const USERNAME_RETIREMENT_DELETE_RETRIES = 3;

interface AccountRow {
  id: string;
  email: string;
  normalized_email: string;
  username: string;
  role: AccountRole;
  password_hash: string;
  email_verified_at: string | null;
  disabled_at: string | null;
  session_version?: number | null;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  privacy_version?: string | null;
  acceptable_use_version?: string | null;
  created_at: string;
  updated_at: string;
  briefing_count?: number;
}

interface UsernameAliasRow {
  username: string;
  account_id: string;
  is_current: number;
  created_at: string;
}

interface UsernameRetirementSnapshot {
  accountId: string;
  currentUsername: string;
  emailVerifiedAt?: string;
  hasBriefings: boolean;
  aliases: string[];
}

interface AuthTokenRow {
  id: string;
  account_id: string;
  purpose: AuthTokenPurpose;
  token_hash: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

interface BriefingRow {
  id: string;
  owner_account_id: string;
  owner_username: string;
  slug: string;
  title: string;
  stars?: number;
  interest_profile: string;
  style_instruction: string | null;
  public_feed_enabled: number;
  paused?: number;
  language?: "en" | "ar" | "fr" | null;
  intensity?: "low" | "medium" | "high" | null;
  briefing_cadence?: "hourly" | "daily" | "weekly" | "monthly" | null;
  briefing_time_of_day?: string | null;
  briefing_timezone?: string | null;
  next_briefing_at?: string | null;
  retention_days: number;
  created_at?: string;
}

interface BriefingEditionRow {
  id: string;
  briefing_id: string;
  cadence: "hourly" | "daily" | "weekly" | "monthly";
  window_start: string;
  window_end: string;
  title: string;
  summary: string;
  sections_json: string;
  status: "published" | "empty";
  generation_mode?: "ai" | "deterministic" | null;
  published_at: string;
  created_at: string;
  updated_at: string;
}

interface SourceRow {
  id: string;
  briefing_id: string;
  title: string;
  type: "channel" | "group";
  provider?: SourceProvider | null;
  kind?: SourceKind | null;
  username: string | null;
  input?: string | null;
  source_url?: string | null;
  actor_id?: string | null;
  actor_input_json?: string | null;
  cursor_json?: string | null;
  enabled: number;
  last_seen_at: string;
  last_checked_at?: string | null;
  last_error?: string | null;
  health_state?: "healthy" | "degraded" | "backoff" | "disabled_by_user" | null;
  failure_class?: string | null;
  consecutive_failures?: number | null;
  last_success_at?: string | null;
  last_new_item_at?: string | null;
  next_retry_at?: string | null;
  canonical_key?: string | null;
}

interface RawMessageRow {
  id: string;
  source_id: string;
  message_source_title?: string | null;
  message_source_type?: "channel" | "group" | null;
  message_source_provider?: SourceProvider | null;
  message_source_kind?: SourceKind | null;
  message_source_username?: string | null;
  message_id: string;
  text: string;
  links_json: string;
  media_json: string;
  posted_at: string;
  received_at: string;
  source_url: string | null;
  raw_payload_key: string | null;
  expires_at: string;
  title: string;
  type: "channel" | "group";
  provider?: SourceProvider | null;
  kind?: SourceKind | null;
  username: string | null;
}

interface BriefingItemRow {
  id: string;
  cluster_id: string;
  event_key?: string | null;
  summary: string;
  item_at: string;
  updated_at: string;
  expires_at: string;
  merged_update_count: number;
}

interface EvidenceRow {
  raw_message_id: string;
  source_id: string;
  source_title: string;
  source_type: "channel" | "group";
  source_provider?: SourceProvider | null;
  source_kind?: SourceKind | null;
  source_url: string | null;
  posted_at: string;
  text: string;
  links_json: string;
  media_json: string;
}

interface EvidenceWithItemRow extends EvidenceRow {
  briefing_item_id: string;
}

interface SourceRunRow {
  id: string;
  source_id: string;
  briefing_id: string;
  provider: SourceProvider;
  actor_id: string | null;
  actor_run_id: string | null;
  dataset_id: string | null;
  state: SourceRunState;
  item_count: number;
  estimated_cost_usd?: number | null;
  actual_cost_usd?: number | null;
  idempotency_key?: string | null;
  archive_key: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
}

interface SpendReservationRow {
  idempotency_key: string;
  account_id: string;
  briefing_id: string | null;
  category: SpendCategory;
  provider: SpendProvider;
  amount_usd: number;
}

export class QuotaExceededError extends Error {}

interface ProcessingJobRow {
  id: string;
  briefing_id: string;
  raw_message_id: string;
  state: ProcessingJobState;
  error: string | null;
  lease_token?: string | null;
  lease_until?: string | null;
  attempt_count?: number | null;
  available_at?: string | null;
  completed_at?: string | null;
  last_enqueued_at?: string | null;
  updated_at: string;
}

export class D1Repository implements Repository {
  constructor(private readonly db: D1Database) {}

  async createAccount(input: {
    email: string;
    username: string;
    role: AccountRole;
    passwordHash: string;
    emailVerifiedAt?: string;
    termsAcceptedAt?: string;
    termsVersion?: string;
    privacyVersion?: string;
    acceptableUseVersion?: string;
  }, now = new Date(), quota?: AccountQuota): Promise<AccountRecord> {
    const id = `account_${crypto.randomUUID()}`;
    const timestamp = now.toISOString();
    const username = normalizeUsername(input.username);
    const usernameHash = await usernameRetirementHash(username);
    const maxAccounts = quota?.maxAccounts ?? 2_147_483_647;
    const maxPendingAccounts = quota?.maxPendingAccounts ?? 2_147_483_647;
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO accounts (
            id, email, normalized_email, username, role, password_hash, email_verified_at,
            terms_accepted_at, terms_version, privacy_version, acceptable_use_version,
            created_at, updated_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE (SELECT COUNT(*) FROM accounts) < ?
            AND (
              ? IS NOT NULL
              OR (SELECT COUNT(*) FROM accounts WHERE email_verified_at IS NULL) < ?
            )
            AND NOT EXISTS (
              SELECT 1 FROM retired_username_hashes WHERE username_hash = ?
            )
            AND NOT EXISTS (
              SELECT 1 FROM accounts WHERE username = ?
            )
            AND NOT EXISTS (
              SELECT 1 FROM username_aliases WHERE username = ?
            )`
        )
        .bind(
          id,
          input.email,
          input.email,
          username,
          input.role,
          input.passwordHash,
          input.emailVerifiedAt ?? null,
          input.termsAcceptedAt ?? null,
          input.termsVersion ?? null,
          input.privacyVersion ?? null,
          input.acceptableUseVersion ?? null,
          timestamp,
          timestamp,
          maxAccounts,
          input.emailVerifiedAt ?? null,
          maxPendingAccounts,
          usernameHash,
          username,
          username
        ),
      this.db
        .prepare(
          `INSERT INTO username_aliases (username, account_id, is_current, created_at)
          SELECT ?, ?, 1, ?
          WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ?)`
        )
        .bind(username, id, timestamp, id)
    ]).catch(async (error) => {
      if (await this.getAccountByEmail(input.email)) {
        throw new Error("email is already registered");
      }
      if (await this.isUsernameRetired(username)) {
        throw new Error("username is permanently unavailable");
      }
      if (await this.resolveUsernameAlias(username) || await this.getAccountByUsername(username)) {
        throw new Error("username is already taken");
      }
      throw error;
    });
    if (Number(results[0]?.meta.changes ?? 0) === 0) {
      if (await this.getAccountByEmail(input.email)) {
        throw new Error("email is already registered");
      }
      if (await this.isUsernameRetired(username)) {
        throw new Error("username is permanently unavailable");
      }
      if (await this.resolveUsernameAlias(username) || await this.getAccountByUsername(username)) {
        throw new Error("username is already taken");
      }
      throw new QuotaExceededError("account capacity reached");
    }
    const account = await this.getAccountById(id);
    if (!account) throw new Error("Failed to create account");
    return account;
  }

  async bootstrapAdmin(input: {
    email: string;
    username: string;
    passwordHash: string;
    emailVerifiedAt: string;
    briefing: BriefingConfig;
  }, now = new Date()): Promise<AccountRecord | null> {
    const id = `account_${crypto.randomUUID()}`;
    const timestamp = now.toISOString();
    const username = normalizeUsername(input.username);
    const usernameHash = await usernameRetirementHash(username);
    const briefingId = `briefing_${id}_personal`;
    const results = await this.db.batch([
      this.db.prepare(
        `INSERT INTO accounts (
          id, email, normalized_email, username, role, password_hash, email_verified_at, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, 'admin', ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM accounts WHERE role = 'admin' AND disabled_at IS NULL
        )
          AND NOT EXISTS (
            SELECT 1 FROM retired_username_hashes WHERE username_hash = ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM accounts WHERE username = ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM username_aliases WHERE username = ?
          )`
      ).bind(
        id,
        input.email,
        input.email,
        username,
        input.passwordHash,
        input.emailVerifiedAt,
        timestamp,
        timestamp,
        usernameHash,
        username,
        username
      ),
      this.db.prepare(
        `INSERT INTO username_aliases (username, account_id, is_current, created_at)
        SELECT ?, ?, 1, ?
        WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ?)`
      ).bind(username, id, timestamp, id),
      this.db.prepare(
        `INSERT INTO briefings (
          id, owner_account_id, slug, title, stars, interest_profile, style_instruction,
          public_feed_enabled, paused, language, intensity, briefing_cadence, briefing_time_of_day,
          briefing_timezone, next_briefing_at, retention_days, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, 0, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ?)`
      ).bind(
        briefingId,
        id,
        input.briefing.slug,
        input.briefing.title,
        input.briefing.interestProfile,
        input.briefing.styleInstruction ?? null,
        input.briefing.language,
        input.briefing.intensity,
        normalizedBriefingCadence(input.briefing.briefingCadence),
        normalizedTimeOfDay(input.briefing.briefingTimeOfDay),
        input.briefing.briefingTimezone || "UTC",
        input.briefing.nextBriefingAt ?? null,
        FIXED_RETENTION_DAYS,
        timestamp,
        timestamp,
        id
      )
    ]).catch(async (error) => {
      if ((await this.countAdmins()) > 0) return [];
      if (await this.isUsernameRetired(username)) {
        throw new Error("username is permanently unavailable");
      }
      if (await this.resolveUsernameAlias(username) || await this.getAccountByUsername(username)) {
        throw new Error("username is already taken");
      }
      throw error;
    });
    if (Number(results[0]?.meta.changes ?? 0) === 0) {
      if ((await this.countAdmins()) > 0) return null;
      if (await this.isUsernameRetired(username)) {
        throw new Error("username is permanently unavailable");
      }
      if (await this.resolveUsernameAlias(username) || await this.getAccountByUsername(username)) {
        throw new Error("username is already taken");
      }
      return null;
    }
    return this.getAccountById(id);
  }

  async listAccounts(): Promise<AccountWithStats[]> {
    const rows = await all<AccountRow>(
      this.db.prepare(
        `SELECT accounts.*, COUNT(briefings.id) as briefing_count
        FROM accounts
        LEFT JOIN briefings ON briefings.owner_account_id = accounts.id
        GROUP BY accounts.id
        ORDER BY accounts.created_at ASC`
      )
    );
    return rows.map(rowToAccountWithStats);
  }

  async countAccounts(): Promise<number> {
    const row = await first<{ total: number }>(this.db.prepare("SELECT COUNT(*) AS total FROM accounts"));
    return Number(row?.total ?? 0);
  }

  async countPendingAccounts(): Promise<number> {
    const row = await first<{ total: number }>(
      this.db.prepare("SELECT COUNT(*) AS total FROM accounts WHERE email_verified_at IS NULL")
    );
    return Number(row?.total ?? 0);
  }

  async deleteStaleUnverifiedAccounts(
    createdBefore: string,
    tokenExpiredBefore: string,
    absoluteCreatedBefore: string,
    limit: number
  ): Promise<number> {
    if (limit <= 0) return 0;
    const result = await this.db.prepare(
      `DELETE FROM accounts
      WHERE id IN (
        SELECT accounts.id
        FROM accounts
        WHERE accounts.role = 'user'
          AND accounts.email_verified_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM briefings
            WHERE briefings.owner_account_id = accounts.id
          )
          AND (
            accounts.created_at <= ?
            OR (
              accounts.created_at <= ?
              AND NOT EXISTS (
                SELECT 1 FROM auth_tokens
                WHERE auth_tokens.account_id = accounts.id
                  AND auth_tokens.purpose = 'email_verification'
                  AND auth_tokens.consumed_at IS NULL
                  AND auth_tokens.expires_at > ?
              )
            )
          )
        ORDER BY accounts.created_at ASC, accounts.id ASC
        LIMIT ?
      )`
    ).bind(absoluteCreatedBefore, createdBefore, tokenExpiredBefore, limit).run();
    return Number(result.meta.changes ?? 0);
  }

  async deleteAccount(
    id: string,
    now = new Date(),
    options: { retireUsernames?: boolean } = {}
  ): Promise<void> {
    await this.archiveAccountSpendDetails(id, now);
    for (let attempt = 0; attempt < USERNAME_RETIREMENT_DELETE_RETRIES; attempt += 1) {
      const snapshot = await this.getUsernameRetirementSnapshot(id);
      if (!snapshot) return;
      const shouldRetire = options.retireUsernames !== false &&
        (Boolean(snapshot.emailVerifiedAt) || snapshot.hasBriefings);
      if (shouldRetire) {
        if (await this.retireUsernamesAndDeleteAccount(snapshot, now)) return;
        continue;
      }
      if (await this.deleteUnpublishedAccount(snapshot)) return;
      if (options.retireUsernames === false) return;
    }
    if (await this.getAccountById(id)) {
      throw new Error("account changed during deletion; retry");
    }
  }

  private async getUsernameRetirementSnapshot(
    accountId: string
  ): Promise<UsernameRetirementSnapshot | null> {
    const account = await first<{
      id: string;
      username: string;
      email_verified_at: string | null;
      has_briefings: number;
    }>(
      this.db.prepare(
        `SELECT accounts.id, accounts.username, accounts.email_verified_at,
          EXISTS (
            SELECT 1 FROM briefings WHERE briefings.owner_account_id = accounts.id
          ) AS has_briefings
        FROM accounts
        WHERE accounts.id = ?`
      ).bind(accountId)
    );
    if (!account) return null;
    const aliases = await all<{ username: string }>(
      this.db.prepare(
        `SELECT username
        FROM username_aliases
        WHERE account_id = ?
        ORDER BY username ASC`
      ).bind(accountId)
    );
    return {
      accountId,
      currentUsername: account.username,
      emailVerifiedAt: account.email_verified_at ?? undefined,
      hasBriefings: Number(account.has_briefings) === 1,
      aliases: aliases.map((alias) => alias.username)
    };
  }

  private async retireUsernamesAndDeleteAccount(
    snapshot: UsernameRetirementSnapshot,
    now: Date
  ): Promise<boolean> {
    const usernames = Array.from(new Set([
      snapshot.currentUsername,
      ...snapshot.aliases
    ])).sort();
    const hashes = await Promise.all(usernames.map((username) =>
      usernameRetirementHash(username)
    ));
    const aliasSetGuard = exactAccountAliasSetGuard(snapshot.aliases);
    const accountGuard =
      `accounts.id = ?
      AND accounts.username = ?
      AND (
        accounts.email_verified_at IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM briefings WHERE briefings.owner_account_id = accounts.id
        )
      )
      AND ${aliasSetGuard.sql}`;
    const accountGuardBindings = [
      snapshot.accountId,
      snapshot.currentUsername,
      ...aliasSetGuard.bindings
    ];
    const statements = usernames.map((username, index) =>
      this.db.prepare(
        `INSERT OR IGNORE INTO retired_username_hashes (username_hash, retired_at)
        SELECT ?, ?
        WHERE EXISTS (
          SELECT 1 FROM accounts
          WHERE ${accountGuard}
            AND (
              accounts.username = ?
              OR EXISTS (
                SELECT 1 FROM username_aliases
                WHERE username_aliases.account_id = accounts.id
                  AND username_aliases.username = ?
              )
            )
        )`
      ).bind(
        hashes[index],
        now.toISOString(),
        ...accountGuardBindings,
        username,
        username
      )
    );
    statements.push(
      this.db.prepare(
        `DELETE FROM briefing_stars
        WHERE voter_id = ?
          AND EXISTS (
            SELECT 1 FROM accounts WHERE ${accountGuard}
          )`
      ).bind(snapshot.accountId, ...accountGuardBindings),
      this.db.prepare(
        `DELETE FROM accounts
        WHERE ${accountGuard}`
      ).bind(...accountGuardBindings)
    );
    const results = await this.db.batch(statements);
    return Number(results.at(-1)?.meta.changes ?? 0) === 1;
  }

  private async deleteUnpublishedAccount(
    snapshot: UsernameRetirementSnapshot
  ): Promise<boolean> {
    const aliasSetGuard = exactAccountAliasSetGuard(snapshot.aliases);
    const accountGuard =
      `accounts.id = ?
      AND accounts.username = ?
      AND accounts.email_verified_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM briefings WHERE briefings.owner_account_id = accounts.id
      )
      AND ${aliasSetGuard.sql}`;
    const bindings = [
      snapshot.accountId,
      snapshot.currentUsername,
      ...aliasSetGuard.bindings
    ];
    const results = await this.db.batch([
      this.db.prepare(
        `DELETE FROM briefing_stars
        WHERE voter_id = ?
          AND EXISTS (
            SELECT 1 FROM accounts WHERE ${accountGuard}
          )`
      ).bind(snapshot.accountId, ...bindings),
      this.db.prepare(
        `DELETE FROM accounts
        WHERE ${accountGuard}`
      ).bind(...bindings)
    ]);
    return Number(results.at(-1)?.meta.changes ?? 0) === 1;
  }

  async listAccountRawPayloadKeys(id: string): Promise<string[]> {
    return (await this.planAccountPayloadDeletion(id)).exclusiveKeys;
  }

  async planAccountPayloadDeletion(id: string): Promise<AccountPayloadDeletionPlan> {
    const rows = await all<{ payload_key: string; shared: number }>(
      this.db.prepare(
        `WITH candidate_keys(payload_key) AS (
          SELECT raw_messages.raw_payload_key
          FROM raw_messages
          JOIN briefings ON briefings.id = raw_messages.briefing_id
          WHERE briefings.owner_account_id = ?
            AND raw_messages.raw_payload_key IS NOT NULL
          UNION
          SELECT source_runs.archive_key
          FROM source_runs
          JOIN briefings ON briefings.id = source_runs.briefing_id
          WHERE briefings.owner_account_id = ?
            AND source_runs.archive_key IS NOT NULL
        )
        SELECT candidate_keys.payload_key,
          CASE WHEN
            EXISTS (
              SELECT 1
              FROM raw_messages
              JOIN briefings ON briefings.id = raw_messages.briefing_id
              WHERE raw_messages.raw_payload_key = candidate_keys.payload_key
                AND briefings.owner_account_id <> ?
            )
            OR EXISTS (
              SELECT 1
              FROM source_runs
              JOIN briefings ON briefings.id = source_runs.briefing_id
              WHERE source_runs.archive_key = candidate_keys.payload_key
                AND briefings.owner_account_id <> ?
            )
          THEN 1 ELSE 0 END AS shared
        FROM candidate_keys`
      ).bind(id, id, id, id)
    );
    return {
      exclusiveKeys: rows.filter((row) => row.shared === 0).map((row) => row.payload_key),
      sharedKeysRetained: rows.filter((row) => row.shared !== 0).length,
      totalReferencedKeys: rows.length
    };
  }

  async planBriefingPayloadDeletion(briefingId: string): Promise<AccountPayloadDeletionPlan> {
    const rows = await all<{ payload_key: string; shared: number }>(
      this.db.prepare(
        `WITH candidate_keys(payload_key) AS (
          SELECT raw_payload_key
          FROM raw_messages
          WHERE briefing_id = ? AND raw_payload_key IS NOT NULL
          UNION
          SELECT archive_key
          FROM source_runs
          WHERE briefing_id = ? AND archive_key IS NOT NULL
        )
        SELECT candidate_keys.payload_key,
          CASE WHEN
            EXISTS (
              SELECT 1 FROM raw_messages
              WHERE raw_messages.raw_payload_key = candidate_keys.payload_key
                AND raw_messages.briefing_id <> ?
            )
            OR EXISTS (
              SELECT 1 FROM source_runs
              WHERE source_runs.archive_key = candidate_keys.payload_key
                AND source_runs.briefing_id <> ?
            )
          THEN 1 ELSE 0 END AS shared
        FROM candidate_keys`
      ).bind(briefingId, briefingId, briefingId, briefingId)
    );
    return {
      exclusiveKeys: rows.filter((row) => row.shared === 0).map((row) => row.payload_key),
      sharedKeysRetained: rows.filter((row) => row.shared !== 0).length,
      totalReferencedKeys: rows.length
    };
  }

  async getAccountById(id: string): Promise<AccountRecord | null> {
    const row = await first<AccountRow>(this.db.prepare("SELECT * FROM accounts WHERE id = ?").bind(id));
    return row ? rowToAccount(row) : null;
  }

  async getAccountByEmail(email: string): Promise<(AccountRecord & { passwordHash: string }) | null> {
    const row = await first<AccountRow>(this.db.prepare("SELECT * FROM accounts WHERE normalized_email = ?").bind(email));
    return row ? { ...rowToAccount(row), passwordHash: row.password_hash } : null;
  }

  async getAccountByUsername(username: string): Promise<AccountRecord | null> {
    const row = await first<AccountRow>(this.db.prepare("SELECT * FROM accounts WHERE username = ?").bind(username));
    return row ? rowToAccount(row) : null;
  }

  async resolveUsernameAlias(username: string): Promise<{ account: AccountRecord; alias: UsernameAliasRecord } | null> {
    const row = await first<UsernameAliasRow>(
      this.db.prepare("SELECT * FROM username_aliases WHERE username = ?").bind(username)
    );
    if (!row) return null;
    const account = await this.getAccountById(row.account_id);
    if (!account) return null;
    return { account, alias: rowToUsernameAlias(row) };
  }

  async isUsernameRetired(username: string): Promise<boolean> {
    const row = await first<{ username_hash: string }>(
      this.db
        .prepare("SELECT username_hash FROM retired_username_hashes WHERE username_hash = ?")
        .bind(await usernameRetirementHash(username))
    );
    return Boolean(row);
  }

  async updateAccount(input: {
    id: string;
    username?: string;
    role?: AccountRole;
    disabled?: boolean;
    emailVerifiedAt?: string;
    passwordHash?: string;
  }, now = new Date()): Promise<AccountRecord> {
    const existing = await this.getAccountById(input.id);
    if (!existing) throw new Error("account not found");

    const timestamp = now.toISOString();
    const requestedUsername = input.username ? normalizeUsername(input.username) : undefined;
    const nextUsername = requestedUsername ?? existing.username;
    const usernameChanged = Boolean(requestedUsername && requestedUsername !== existing.username);
    const nextUsernameHash = usernameChanged ? await usernameRetirementHash(nextUsername) : "";
    const accountUpdate = this.db.prepare(
        `UPDATE accounts
        SET username = ?,
          role = ?,
          disabled_at = ?,
          email_verified_at = COALESCE(?, email_verified_at),
          password_hash = COALESCE(?, password_hash),
          session_version = session_version + CASE
            WHEN ? IS NOT NULL OR ? IS NOT NULL OR ? IS NOT NULL THEN 1
            ELSE 0
          END,
          updated_at = ?
        WHERE id = ?
          AND (
            ? IS NULL
            OR (
              NOT EXISTS (
                SELECT 1 FROM retired_username_hashes WHERE username_hash = ?
              )
              AND NOT EXISTS (
                SELECT 1 FROM username_aliases
                WHERE username = ? AND account_id <> ?
              )
              AND NOT EXISTS (
                SELECT 1 FROM accounts AS username_owner
                WHERE username_owner.username = ? AND username_owner.id <> ?
              )
            )
          )`
      ).bind(
        nextUsername,
        input.role ?? existing.role,
        input.disabled === undefined ? existing.disabledAt ?? null : input.disabled ? timestamp : null,
        input.emailVerifiedAt ?? null,
        input.passwordHash ?? null,
        input.passwordHash ?? null,
        input.role ?? null,
        input.disabled === undefined ? null : input.disabled ? 1 : 0,
        timestamp,
        input.id,
        usernameChanged ? nextUsername : null,
        nextUsernameHash,
        nextUsername,
        input.id,
        nextUsername,
        input.id
      );
    if (usernameChanged) {
      const existingAlias = await first<UsernameAliasRow>(
        this.db.prepare("SELECT * FROM username_aliases WHERE username = ?").bind(nextUsername)
      );
      if (existingAlias && existingAlias.account_id !== input.id) {
        throw new Error("username is already taken");
      }
      const claimAlias = existingAlias
        ? this.db
            .prepare(
              `UPDATE username_aliases
              SET is_current = 1
              WHERE username = ? AND account_id = ?
                AND NOT EXISTS (
                  SELECT 1 FROM retired_username_hashes WHERE username_hash = ?
                )
                AND NOT EXISTS (
                  SELECT 1 FROM accounts
                  WHERE accounts.username = ? AND accounts.id <> ?
                )`
            )
            .bind(nextUsername, input.id, nextUsernameHash, nextUsername, input.id)
        : this.db
            .prepare(
              `INSERT INTO username_aliases (username, account_id, is_current, created_at)
              SELECT ?, ?, 1, ?
              WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ?)
                AND NOT EXISTS (
                  SELECT 1 FROM retired_username_hashes WHERE username_hash = ?
                )
                AND NOT EXISTS (
                  SELECT 1 FROM accounts
                  WHERE accounts.username = ? AND accounts.id <> ?
                )
                AND NOT EXISTS (
                  SELECT 1 FROM username_aliases WHERE username = ?
                )`
            )
            .bind(
              nextUsername,
              input.id,
              timestamp,
              input.id,
              nextUsernameHash,
              nextUsername,
              input.id,
              nextUsername
            );
      const statements = [
        this.db
          .prepare(
            `UPDATE username_aliases
            SET is_current = 0
            WHERE account_id = ? AND is_current = 1
              AND NOT EXISTS (
                SELECT 1 FROM retired_username_hashes WHERE username_hash = ?
              )
              AND NOT EXISTS (
                SELECT 1 FROM username_aliases AS username_owner
                WHERE username_owner.username = ? AND username_owner.account_id <> ?
              )
              AND NOT EXISTS (
                SELECT 1 FROM accounts AS username_owner
                WHERE username_owner.username = ? AND username_owner.id <> ?
              )`
          )
          .bind(
            input.id,
            nextUsernameHash,
            nextUsername,
            input.id,
            nextUsername,
            input.id
          ),
        claimAlias,
        accountUpdate
      ];
      if (input.disabled === true) {
        statements.push(this.db.prepare("DELETE FROM briefing_stars WHERE voter_id = ?").bind(input.id));
      }
      const results = await this.db.batch(statements).catch(async (error) => {
        if (await this.isUsernameRetired(nextUsername)) {
          throw new Error("username is permanently unavailable");
        }
        const owner = await this.resolveUsernameAlias(nextUsername);
        const currentOwner = await this.getAccountByUsername(nextUsername);
        if ((owner && owner.account.id !== input.id) ||
          (currentOwner && currentOwner.id !== input.id)) {
          throw new Error("username is already taken");
        }
        throw error;
      });
      if (
        Number(results[1]?.meta.changes ?? 0) !== 1 ||
        Number(results[2]?.meta.changes ?? 0) !== 1
      ) {
        if (await this.isUsernameRetired(nextUsername)) {
          throw new Error("username is permanently unavailable");
        }
        const owner = await this.resolveUsernameAlias(nextUsername);
        const currentOwner = await this.getAccountByUsername(nextUsername);
        if ((owner && owner.account.id !== input.id) ||
          (currentOwner && currentOwner.id !== input.id)) {
          throw new Error("username is already taken");
        }
        throw new Error("username changed during update; retry");
      }
    } else if (input.disabled === true) {
      await this.db.batch([
        accountUpdate,
        this.db.prepare("DELETE FROM briefing_stars WHERE voter_id = ?").bind(input.id)
      ]);
    } else {
      await accountUpdate.run();
    }
    const account = await this.getAccountById(input.id);
    if (!account) throw new Error("account not found");
    return account;
  }

  async acceptLegalTerms(input: {
    accountId: string;
    termsVersion: string;
    privacyVersion: string;
    acceptableUseVersion: string;
  }, now = new Date()): Promise<AccountRecord> {
    const timestamp = now.toISOString();
    const result = await this.db
      .prepare(
        `UPDATE accounts
        SET terms_accepted_at = ?, terms_version = ?, privacy_version = ?,
          acceptable_use_version = ?, updated_at = ?
        WHERE id = ? AND disabled_at IS NULL`
      )
      .bind(
        timestamp,
        input.termsVersion,
        input.privacyVersion,
        input.acceptableUseVersion,
        timestamp,
        input.accountId
      )
      .run();
    if (Number(result.meta.changes ?? 0) !== 1) throw new Error("account not found");
    const account = await this.getAccountById(input.accountId);
    if (!account) throw new Error("account not found");
    return account;
  }

  async countAdmins(): Promise<number> {
    const row = await first<{ count: number }>(
      this.db.prepare("SELECT COUNT(*) as count FROM accounts WHERE role = 'admin' AND disabled_at IS NULL")
    );
    return Number(row?.count ?? 0);
  }

  async createAuthToken(input: {
    accountId: string;
    purpose: AuthTokenPurpose;
    tokenHash: string;
    expiresAt: string;
  }, now = new Date()): Promise<AuthTokenRecord> {
    const id = `token_${crypto.randomUUID()}`;
    await this.db
      .prepare(
        `INSERT INTO auth_tokens (id, account_id, purpose, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, input.accountId, input.purpose, input.tokenHash, input.expiresAt, now.toISOString())
      .run();
    const token = await this.getAuthToken(input.tokenHash, input.purpose);
    if (!token) throw new Error("Failed to create auth token");
    return token;
  }

  async getAuthToken(tokenHash: string, purpose: AuthTokenPurpose): Promise<AuthTokenRecord | null> {
    const row = await first<AuthTokenRow>(
      this.db
        .prepare("SELECT * FROM auth_tokens WHERE token_hash = ? AND purpose = ?")
        .bind(tokenHash, purpose)
    );
    return row ? rowToAuthToken(row) : null;
  }

  async consumeAuthToken(id: string, now = new Date()): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE auth_tokens
        SET consumed_at = ?
        WHERE id = ?
          AND consumed_at IS NULL
          AND expires_at > ?`
      )
      .bind(now.toISOString(), id, now.toISOString())
      .run();
    return Number(result.meta.changes ?? 0) > 0;
  }

  async consumePasswordResetToken(input: {
    tokenHash: string;
    passwordHash: string;
  }, now = new Date()): Promise<AccountRecord | null> {
    const timestamp = now.toISOString();
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE accounts
        SET password_hash = ?, session_version = session_version + 1, updated_at = ?
        WHERE id = (
          SELECT account_id
          FROM auth_tokens
          WHERE token_hash = ?
            AND purpose = 'password_reset'
            AND consumed_at IS NULL
            AND expires_at > ?
        )
          AND disabled_at IS NULL`
      ).bind(input.passwordHash, timestamp, input.tokenHash, timestamp),
      this.db.prepare(
        `UPDATE auth_tokens
        SET consumed_at = ?
        WHERE token_hash = ?
          AND purpose = 'password_reset'
          AND consumed_at IS NULL
          AND expires_at > ?
          AND EXISTS (
            SELECT 1 FROM accounts
            WHERE accounts.id = auth_tokens.account_id
              AND accounts.disabled_at IS NULL
          )`
      ).bind(timestamp, input.tokenHash, timestamp)
    ]);
    if (Number(results[0]?.meta.changes ?? 0) === 0 ||
      Number(results[1]?.meta.changes ?? 0) === 0) return null;
    const row = await first<AccountRow>(
      this.db.prepare(
        `SELECT accounts.*
        FROM accounts
        JOIN auth_tokens ON auth_tokens.account_id = accounts.id
        WHERE auth_tokens.token_hash = ?`
      ).bind(input.tokenHash)
    );
    return row ? rowToAccount(row) : null;
  }

  async countRecentAuthAttempts(input: { key: string; action: string; since: string }): Promise<number> {
    const row = await first<{ count: number }>(
      this.db
        .prepare("SELECT COUNT(*) as count FROM auth_attempts WHERE key = ? AND action = ? AND created_at >= ?")
        .bind(input.key, input.action, input.since)
    );
    return Number(row?.count ?? 0);
  }

  async recordAuthAttempt(input: { key: string; action: string }, now = new Date()): Promise<void> {
    await this.db
      .prepare("INSERT INTO auth_attempts (id, key, action, created_at) VALUES (?, ?, ?, ?)")
      .bind(`attempt_${crypto.randomUUID()}`, input.key, input.action, now.toISOString())
      .run();
  }

  async consumeRateLimit(input: {
    key: string;
    action: string;
    since: string;
    limit: number;
  }, now = new Date()): Promise<boolean> {
    const result = await this.db.prepare(
      `INSERT INTO auth_attempts (id, key, action, created_at)
      SELECT ?, ?, ?, ?
      WHERE (
        SELECT COUNT(*)
        FROM auth_attempts
        WHERE key = ?
          AND action = ?
          AND created_at >= ?
      ) < ?`
    ).bind(
      `attempt_${crypto.randomUUID()}`,
      input.key,
      input.action,
      now.toISOString(),
      input.key,
      input.action,
      input.since,
      input.limit
    ).run();
    return Number(result.meta.changes ?? 0) > 0;
  }

  async ensureDefaultBriefing(account: AccountRecord, now = new Date()): Promise<BriefingConfig> {
    const existing = await this.getBriefingBySlug(account.id, personalNewsBriefing.slug);
    if (existing) return existing;
    return this.upsertBriefing(
      {
        ...personalNewsBriefing,
        id: `briefing_${account.id}_personal`,
        ownerAccountId: account.id,
        ownerUsername: account.username,
        nextBriefingAt: defaultNextBriefingAt({ now })
      },
      now
    );
  }

  async listBriefings(accountId?: string): Promise<BriefingConfig[]> {
    const sql =
      `SELECT briefings.*, accounts.username as owner_username
      FROM briefings
      JOIN accounts ON accounts.id = briefings.owner_account_id` +
      (accountId ? " WHERE briefings.owner_account_id = ?" : "") +
      " ORDER BY briefings.stars DESC, briefings.created_at ASC, briefings.id ASC";
    const rows = accountId
      ? await all<BriefingRow>(this.db.prepare(sql).bind(accountId))
      : await all<BriefingRow>(this.db.prepare(sql));
    return rows.map(rowToBriefing);
  }

  async listBriefingsDue(before: string, limit: number): Promise<BriefingConfig[]> {
    if (limit <= 0) return [];
    const rows = await all<BriefingRow>(
      this.db.prepare(
        `SELECT briefings.*, accounts.username as owner_username
        FROM briefings
        JOIN accounts ON accounts.id = briefings.owner_account_id
        WHERE briefings.paused = 0
          AND briefings.public_feed_enabled = 1
          AND accounts.disabled_at IS NULL
          AND briefings.next_briefing_at IS NOT NULL
          AND briefings.next_briefing_at <= ?
        ORDER BY briefings.next_briefing_at ASC
        LIMIT ?`
      ).bind(before, limit)
    );
    return rows.map(rowToBriefing);
  }

  async listDueSourceRefreshCandidates(now: string, limit: number): Promise<SourceRefreshCandidate[]> {
    if (limit <= 0) return [];
    const rows = await all<{
      briefing_id: string;
      source_id: string;
      provider: SourceProvider;
      kind: SourceKind;
      briefing_cadence: BriefingConfig["briefingCadence"] | null;
    }>(this.db.prepare(
      `WITH eligible AS (
        SELECT
          sources.briefing_id,
          sources.id AS source_id,
          COALESCE(sources.provider, 'telegram') AS provider,
          COALESCE(
            sources.kind,
            CASE WHEN sources.type = 'group' THEN 'telegram_group' ELSE 'telegram_channel' END
          ) AS kind,
          COALESCE(briefings.briefing_cadence, 'hourly') AS briefing_cadence,
          COALESCE(sources.canonical_key, sources.id) AS refresh_key,
          COALESCE(canonical_source_refreshes.next_refresh_at, sources.next_retry_at, sources.last_checked_at, '') AS due_at,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(sources.canonical_key, sources.id)
            ORDER BY
              COALESCE(canonical_source_refreshes.next_refresh_at, sources.next_retry_at, sources.last_checked_at, '') ASC,
              CASE COALESCE(briefings.briefing_cadence, 'hourly')
                WHEN 'hourly' THEN 0
                WHEN 'daily' THEN 1
                WHEN 'weekly' THEN 2
                ELSE 3
              END ASC,
              sources.id ASC
          ) AS refresh_rank
        FROM sources
        JOIN briefings ON briefings.id = sources.briefing_id
        JOIN accounts ON accounts.id = briefings.owner_account_id
        LEFT JOIN canonical_source_refreshes
          ON canonical_source_refreshes.canonical_key = sources.canonical_key
        WHERE sources.enabled = 1
          AND briefings.paused = 0
          AND briefings.public_feed_enabled = 1
          AND accounts.disabled_at IS NULL
          AND (
            sources.kind NOT IN ('google_news', 'x_profile', 'x_search')
            OR EXISTS (
              SELECT 1
              FROM paid_provider_seats
              WHERE paid_provider_seats.account_id = briefings.owner_account_id
            )
          )
          AND sources.id NOT LIKE 'source_canary_fixture_%'
          AND COALESCE(sources.input, '') <> 'synthetic:canary-fixture'
          AND (sources.next_retry_at IS NULL OR sources.next_retry_at <= ?)
          AND (
            canonical_source_refreshes.canonical_key IS NULL
            OR (
              COALESCE(canonical_source_refreshes.next_refresh_at, ?) <= ?
              AND (
                canonical_source_refreshes.lease_until IS NULL
                OR canonical_source_refreshes.lease_until <= ?
              )
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM source_runs
            JOIN sources AS active_source ON active_source.id = source_runs.source_id
            WHERE COALESCE(active_source.canonical_key, active_source.id) =
                COALESCE(sources.canonical_key, sources.id)
              AND source_runs.provider = 'apify'
              AND source_runs.state IN ('queued', 'running')
          )
          AND NOT EXISTS (
            SELECT 1
            FROM processing_jobs
            WHERE processing_jobs.briefing_id = briefings.id
              AND processing_jobs.state = 'queued'
            LIMIT 1 OFFSET 39
          )
      )
      SELECT briefing_id, source_id, provider, kind, briefing_cadence
      FROM eligible
      WHERE refresh_rank = 1
      ORDER BY due_at ASC, refresh_key ASC
      LIMIT ?`
    ).bind(now, now, now, now, limit));
    return rows.map((row) => ({
      briefingId: row.briefing_id,
      sourceId: row.source_id,
      provider: row.provider,
      kind: row.kind,
      briefingCadence: normalizedBriefingCadence(row.briefing_cadence ?? undefined)
    }));
  }

  async listBriefingsWithRecoverableEmptyWindows(
    sinceWindowEnd: string,
    limit: number
  ): Promise<BriefingConfig[]> {
    if (limit <= 0) return [];
    const rows = await all<BriefingRow & { first_recoverable_at: string }>(this.db.prepare(
      `SELECT briefings.*, accounts.username AS owner_username,
        MIN(briefing_windows.window_end) AS first_recoverable_at
      FROM briefing_windows
      JOIN briefings ON briefings.id = briefing_windows.briefing_id
      JOIN accounts ON accounts.id = briefings.owner_account_id
      WHERE briefing_windows.state = 'empty'
        AND briefing_windows.edition_id IS NULL
        AND briefing_windows.message_count > 0
        AND briefing_windows.content_cutoff_at IS NOT NULL
        AND briefing_windows.recovery_attempted_at IS NULL
        AND briefing_windows.window_end >= ?
        AND briefing_windows.cadence = briefings.briefing_cadence
        AND briefings.paused = 0
        AND briefings.public_feed_enabled = 1
        AND accounts.disabled_at IS NULL
      GROUP BY briefings.id
      ORDER BY first_recoverable_at ASC, briefings.id ASC
      LIMIT ?`
    ).bind(sinceWindowEnd, limit));
    return rows.map(rowToBriefing);
  }

  async listExploreBriefings(limit: number, now = new Date()): Promise<ExploreBriefingRecord[]> {
    if (limit <= 0) return [];
    const hourlyCutoff = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
    const dailyCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const weeklyCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const monthlyCutoff = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const retentionCutoff = new Date(now.getTime() - FIXED_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const rows = await all<BriefingRow & { latest_published_at: string }>(
      this.db
        .prepare(
          `SELECT briefings.*, accounts.username as owner_username,
            MAX(briefing_editions.published_at) as latest_published_at
          FROM briefings
          JOIN accounts ON accounts.id = briefings.owner_account_id
          JOIN briefing_editions ON briefing_editions.briefing_id = briefings.id
            AND briefing_editions.status = 'published'
            AND briefing_editions.sections_json <> '[]'
            AND briefing_editions.published_at > ?
            AND briefing_editions.published_at <= ?
          WHERE accounts.disabled_at IS NULL
            AND briefings.paused = 0
            AND briefings.public_feed_enabled = 1
            AND briefings.id NOT GLOB 'briefing_canary_*'
            AND briefings.id NOT GLOB 'launch_canary_briefing_*'
            AND EXISTS (
              SELECT 1 FROM sources
              WHERE sources.briefing_id = briefings.id
                AND sources.enabled = 1
            )
          GROUP BY briefings.id
          HAVING (
            (briefings.briefing_cadence = 'hourly' AND latest_published_at >= ?)
            OR (briefings.briefing_cadence = 'daily' AND latest_published_at >= ?)
            OR (briefings.briefing_cadence = 'weekly' AND latest_published_at >= ?)
            OR (briefings.briefing_cadence = 'monthly' AND latest_published_at >= ?)
          )
          ORDER BY latest_published_at DESC, briefings.stars DESC, briefings.created_at ASC
          LIMIT ?`
        )
        .bind(retentionCutoff, now.toISOString(), hourlyCutoff, dailyCutoff, weeklyCutoff, monthlyCutoff, limit)
    );
    return rows.map((row) => ({ ...rowToBriefing(row), latestPublishedAt: row.latest_published_at }));
  }

  async getBriefingById(id: string): Promise<BriefingConfig | null> {
    const row = await first<BriefingRow>(
      this.db
        .prepare(
          `SELECT briefings.*, accounts.username as owner_username
          FROM briefings
          JOIN accounts ON accounts.id = briefings.owner_account_id
          WHERE briefings.id = ?`
        )
        .bind(id)
    );
    return row ? rowToBriefing(row) : null;
  }

  async getBriefingBySlug(ownerAccountId: string, slug: string): Promise<BriefingConfig | null> {
    const row = await first<BriefingRow>(
      this.db
        .prepare(
          `SELECT briefings.*, accounts.username as owner_username
          FROM briefings
          JOIN accounts ON accounts.id = briefings.owner_account_id
          WHERE briefings.owner_account_id = ? AND briefings.slug = ?`
        )
        .bind(ownerAccountId, slug)
    );
    return row ? rowToBriefing(row) : null;
  }

  async hasBriefingStar(briefingId: string, voterId: string): Promise<boolean> {
    const row = await first<{ voter_id: string }>(
      this.db
        .prepare("SELECT voter_id FROM briefing_stars WHERE briefing_id = ? AND voter_id = ?")
        .bind(briefingId, voterId)
    );
    return Boolean(row?.voter_id);
  }

  async setBriefingStar(briefingId: string, voterId: string, starred: boolean, now = new Date()): Promise<number> {
    const timestamp = now.toISOString();
    const mutation = starred
      ? this.db
          .prepare(
            `INSERT OR IGNORE INTO briefing_stars (briefing_id, voter_id, created_at)
            SELECT ?, accounts.id, ?
            FROM accounts
            WHERE accounts.id = ?
              AND accounts.disabled_at IS NULL`
          )
          .bind(briefingId, timestamp, voterId)
      : this.db
          .prepare("DELETE FROM briefing_stars WHERE briefing_id = ? AND voter_id = ?")
          .bind(briefingId, voterId);
    await this.db.batch([
      mutation,
      this.db
        .prepare(
          `UPDATE briefings
          SET stars = (
            SELECT COUNT(*) FROM briefing_stars WHERE briefing_id = ?
          ), updated_at = ?
          WHERE id = ?`
        )
        .bind(briefingId, timestamp, briefingId)
    ]);
    const countRow = await first<{ stars: number }>(
      this.db.prepare("SELECT stars FROM briefings WHERE id = ?").bind(briefingId)
    );
    const nextStars = Number(countRow?.stars ?? 0);

    return nextStars;
  }

  async upsertBriefing(
    input: BriefingConfig,
    now = new Date(),
    quota?: BriefingQuota
  ): Promise<BriefingConfig> {
    const timestamp = now.toISOString();
    const result = await this.db
      .prepare(
        `INSERT INTO briefings (
          id, owner_account_id, slug, title, stars, interest_profile, style_instruction,
          public_feed_enabled, paused, language, intensity, briefing_cadence, briefing_time_of_day,
          briefing_timezone, next_briefing_at, retention_days, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ?)
          AND (
            SELECT COUNT(*) FROM briefings
            WHERE owner_account_id = ? AND id <> ?
          ) < ?
          AND (
            ? <> 'hourly'
            OR (
              SELECT COUNT(*) FROM briefings
              WHERE owner_account_id = ? AND briefing_cadence = 'hourly' AND id <> ?
            ) < ?
          )
        ON CONFLICT(id) DO UPDATE SET
          slug = excluded.slug,
          title = excluded.title,
          interest_profile = excluded.interest_profile,
          style_instruction = excluded.style_instruction,
          public_feed_enabled = excluded.public_feed_enabled,
          paused = excluded.paused,
          language = excluded.language,
          intensity = excluded.intensity,
          briefing_cadence = excluded.briefing_cadence,
          briefing_time_of_day = excluded.briefing_time_of_day,
          briefing_timezone = excluded.briefing_timezone,
          next_briefing_at = excluded.next_briefing_at,
          retention_days = excluded.retention_days,
          updated_at = excluded.updated_at`
      )
      .bind(
        input.id,
        input.ownerAccountId,
        input.slug,
        input.title,
        input.interestProfile,
        input.styleInstruction ?? null,
        1,
        input.paused ? 1 : 0,
        input.language,
        input.intensity,
        normalizedBriefingCadence(input.briefingCadence),
        normalizedTimeOfDay(input.briefingTimeOfDay),
        input.briefingTimezone || "UTC",
        input.nextBriefingAt ?? null,
        FIXED_RETENTION_DAYS,
        timestamp,
        timestamp,
        input.ownerAccountId,
        input.ownerAccountId,
        input.id,
        quota?.maxFeeds ?? 1_000_000,
        normalizedBriefingCadence(input.briefingCadence),
        input.ownerAccountId,
        input.id,
        quota?.maxHourlyFeeds ?? 1_000_000
      )
      .run();
    const saved = await this.getBriefingById(input.id);
    if (!saved || Number(result.meta.changes ?? 0) === 0) {
      throw new QuotaExceededError(
        normalizedBriefingCadence(input.briefingCadence) === "hourly"
          ? "Hosted accounts can have at most two feeds and one hourly feed."
          : "Hosted accounts can have at most two feeds."
      );
    }
    return saved;
  }

  async deleteBriefing(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM briefings WHERE id = ?").bind(id).run();
  }

  async listSources(briefingId: string): Promise<SourceRecord[]> {
    const rows = await all<SourceRow>(
      this.db
        .prepare(
          `SELECT id, briefing_id, title, type, provider, kind, username, input, source_url,
            actor_id, actor_input_json, cursor_json, enabled, last_seen_at, last_checked_at, last_error,
            health_state, failure_class, consecutive_failures, last_success_at, last_new_item_at, next_retry_at,
            canonical_key
          FROM sources
          WHERE briefing_id = ?
          ORDER BY last_seen_at DESC`
        )
        .bind(briefingId)
    );
    return rows.map(rowToSource);
  }

  async countPaidProviderSeats(): Promise<number> {
    const row = await first<{ count: number }>(
      this.db.prepare("SELECT COUNT(*) AS count FROM paid_provider_seats")
    );
    return Number(row?.count ?? 0);
  }

  async getSource(sourceId: string): Promise<SourceRecord | null> {
    const row = await first<SourceRow>(
      this.db
        .prepare(
          `SELECT id, briefing_id, title, type, provider, kind, username, input, source_url,
            actor_id, actor_input_json, cursor_json, enabled, last_seen_at, last_checked_at, last_error,
            health_state, failure_class, consecutive_failures, last_success_at, last_new_item_at, next_retry_at,
            canonical_key
          FROM sources
          WHERE id = ?`
        )
        .bind(sourceId)
    );
    return row ? rowToSource(row) : null;
  }

  async setSourceEnabled(sourceId: string, enabled: boolean, now = new Date()): Promise<void> {
    await this.db
      .prepare(`UPDATE sources SET enabled = ?, health_state = ?,
        failure_class = CASE
          WHEN ? = 1 AND last_success_at IS NULL THEN 'pending_first_success'
          WHEN ? = 1 THEN NULL
          ELSE failure_class
        END,
        consecutive_failures = CASE WHEN ? = 1 THEN 0 ELSE consecutive_failures END,
        last_error = CASE WHEN ? = 1 THEN NULL ELSE last_error END,
        next_retry_at = NULL, updated_at = ? WHERE id = ?`)
      .bind(
        enabled ? 1 : 0,
        enabled ? "degraded" : "disabled_by_user",
        enabled ? 1 : 0,
        enabled ? 1 : 0,
        enabled ? 1 : 0,
        enabled ? 1 : 0,
        now.toISOString(),
        sourceId
      )
      .run();
  }

  async deleteSource(sourceId: string): Promise<void> {
    await this.db.prepare("DELETE FROM sources WHERE id = ?").bind(sourceId).run();
  }

  async upsertConfiguredSource(input: {
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
  }, now = new Date(), quota?: SourceQuota): Promise<SourceRecord> {
    const sourceId = scopedSourceId(
      input.briefingId,
      stableSourceKey(input.provider, input.kind, input.username ?? input.sourceUrl ?? input.input ?? input.title)
    );
    const timestamp = now.toISOString();
    const ownerAccountId = quota?.accountId ?? (await this.getBriefingById(input.briefingId))?.ownerAccountId;
    const canonicalKey = canonicalSourceKey(
      input.provider,
      input.kind,
      input.username ?? input.sourceUrl ?? input.url ?? input.input ?? input.title,
      ownerAccountId
    );
    const sourceStatement = this.db
      .prepare(
        `INSERT INTO sources (
          id, briefing_id, title, type, provider, kind, username, input, source_url,
          actor_id, actor_input_json, enabled, last_seen_at, created_at, updated_at, canonical_key,
          health_state, failure_class
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'degraded', 'pending_first_success'
        WHERE (
          ? IS NULL
          OR EXISTS (
            SELECT 1 FROM briefings
            WHERE briefings.id = ? AND briefings.owner_account_id = ?
          )
        )
          AND (
            SELECT COUNT(*) FROM sources
            WHERE briefing_id = ? AND id <> ?
          ) < ?
          AND (
            SELECT COUNT(*)
            FROM sources
            JOIN briefings ON briefings.id = sources.briefing_id
            WHERE briefings.owner_account_id = ? AND sources.id <> ?
          ) < ?
          AND (
            ? NOT IN ('google_news', 'x_profile', 'x_search')
            OR (
              SELECT COUNT(*)
              FROM sources
              JOIN briefings ON briefings.id = sources.briefing_id
              WHERE briefings.owner_account_id = ?
                AND sources.kind IN ('google_news', 'x_profile', 'x_search')
                AND sources.id <> ?
            ) < ?
          )
          AND (
            ? <> 'google_news'
            OR (
              SELECT COUNT(*)
              FROM sources
              JOIN briefings ON briefings.id = sources.briefing_id
              WHERE briefings.owner_account_id = ?
                AND sources.kind = 'google_news'
                AND sources.id <> ?
            ) < ?
          )
          AND (
            ? NOT IN ('x_profile', 'x_search')
            OR (
              SELECT COUNT(*)
              FROM sources
              JOIN briefings ON briefings.id = sources.briefing_id
              WHERE briefings.owner_account_id = ?
                AND sources.kind IN ('x_profile', 'x_search')
                AND sources.id <> ?
            ) < ?
          )
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          type = excluded.type,
          provider = excluded.provider,
          kind = excluded.kind,
          username = excluded.username,
          input = excluded.input,
          source_url = excluded.source_url,
          actor_id = excluded.actor_id,
          actor_input_json = excluded.actor_input_json,
          canonical_key = excluded.canonical_key,
          enabled = excluded.enabled,
          updated_at = excluded.updated_at`
      )
      .bind(
        sourceId,
        input.briefingId,
        input.title,
        input.type ?? "channel",
        input.provider,
        input.kind,
        input.username ?? null,
        input.input ?? null,
        input.sourceUrl ?? input.url ?? null,
        input.actorId ?? null,
        input.actorInput === undefined ? null : JSON.stringify(input.actorInput),
        input.enabled === false ? 0 : 1,
        timestamp,
        timestamp,
        timestamp,
        canonicalKey,
        quota?.accountId ?? null,
        input.briefingId,
        quota?.accountId ?? "",
        input.briefingId,
        sourceId,
        quota?.maxPerFeed ?? 1_000_000,
        quota?.accountId ?? "",
        sourceId,
        quota?.maxPerAccount ?? 1_000_000,
        input.kind,
        quota?.accountId ?? "",
        sourceId,
        quota?.maxPaidPerAccount ?? 1_000_000,
        input.kind,
        quota?.accountId ?? "",
        sourceId,
        quota?.maxGoogleNewsPerAccount ?? 1_000_000,
        input.kind,
        quota?.accountId ?? "",
        sourceId,
        quota?.maxXPerAccount ?? 1_000_000
      );
    let result: D1Result;
    try {
      if (quota) {
        const results = await this.db.batch([
          this.db
            .prepare(
              `INSERT INTO settings (key, value, updated_at)
              VALUES ('hosted_paid_provider_account_cap', ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
            )
            .bind(String(quota.maxPaidProviderAccounts), timestamp),
          sourceStatement
        ]);
        result = results[1];
      } else {
        result = await sourceStatement.run();
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("paid provider beta capacity reached")) {
        throw new QuotaExceededError(
          `Paid-provider beta is full: all ${quota?.maxPaidProviderAccounts ?? "hosted"} account seats are claimed. ` +
          "RSS and Telegram remain available."
        );
      }
      throw error;
    }
    if (Number(result.meta.changes ?? 0) === 0) {
      throw new QuotaExceededError(
        "Hosted source limit reached: 5 per feed, 10 per account, and at most one Google News plus one X source."
      );
    }
    const source = await this.getSource(sourceId);
    if (!source) throw new Error("Failed to upsert source");
    return source;
  }

  async updateSourceState(input: {
    sourceId: string;
    title?: string;
    username?: string;
    url?: string;
    sourceUrl?: string;
    lastSeenAt?: string;
    lastCheckedAt?: string;
    lastError?: string;
    cursor?: unknown;
  }, now = new Date()): Promise<void> {
    await this.db
      .prepare(
        `UPDATE sources
        SET title = COALESCE(?, title),
          username = COALESCE(?, username),
          source_url = COALESCE(?, source_url),
          last_seen_at = COALESCE(?, last_seen_at),
          last_checked_at = COALESCE(?, last_checked_at),
          last_error = COALESCE(?, last_error),
          cursor_json = COALESCE(?, cursor_json),
          updated_at = ?
        WHERE id = ?`
      )
      .bind(
        input.title ?? null,
        input.username ?? null,
        input.sourceUrl ?? input.url ?? null,
        input.lastSeenAt ?? null,
        input.lastCheckedAt ?? null,
        input.lastError ?? null,
        input.cursor === undefined ? null : JSON.stringify(input.cursor),
        now.toISOString(),
        input.sourceId
      )
      .run();
  }

  async recordSourceSuccess(sourceId: string, newItemAt?: string, now = new Date()): Promise<void> {
    const timestamp = now.toISOString();
    await this.db
      .prepare(
        `UPDATE sources
        SET health_state = 'healthy', failure_class = NULL, consecutive_failures = 0,
          last_error = NULL, last_success_at = ?, last_new_item_at = COALESCE(?, last_new_item_at),
          next_retry_at = NULL, updated_at = ?
        WHERE id = ? AND enabled = 1`
      )
      .bind(timestamp, newItemAt ?? null, timestamp, sourceId)
      .run();
  }

  async recordSourceFailure(input: {
    sourceId: string;
    error: string;
    failureClass: string;
    nextRetryAt: string;
  }, now = new Date()): Promise<void> {
    await this.db
      .prepare(
        `UPDATE sources
        SET health_state = CASE WHEN consecutive_failures >= 1 THEN 'backoff' ELSE 'degraded' END,
          failure_class = ?, consecutive_failures = consecutive_failures + 1,
          last_error = ?, next_retry_at = ?, last_checked_at = ?, updated_at = ?
        WHERE id = ? AND enabled = 1`
      )
      .bind(
        input.failureClass,
        input.error,
        input.nextRetryAt,
        now.toISOString(),
        now.toISOString(),
        input.sourceId
      )
      .run();
  }

  async listEquivalentSources(sourceId: string): Promise<SourceRecord[]> {
    const rows = await all<SourceRow>(this.db.prepare(
      `SELECT equivalent.id, equivalent.briefing_id, equivalent.title, equivalent.type, equivalent.provider,
        equivalent.kind, equivalent.username, equivalent.input, equivalent.source_url, equivalent.actor_id,
        equivalent.actor_input_json, equivalent.cursor_json, equivalent.enabled, equivalent.last_seen_at,
        equivalent.last_checked_at, equivalent.last_error, equivalent.health_state, equivalent.failure_class,
        equivalent.consecutive_failures, equivalent.last_success_at, equivalent.last_new_item_at,
        equivalent.next_retry_at, equivalent.canonical_key
      FROM sources source
      JOIN sources equivalent ON equivalent.canonical_key = source.canonical_key
      JOIN briefings ON briefings.id = equivalent.briefing_id
      JOIN accounts ON accounts.id = briefings.owner_account_id
      WHERE source.id = ?
        AND equivalent.enabled = 1
        AND briefings.paused = 0
        AND briefings.public_feed_enabled = 1
        AND accounts.disabled_at IS NULL
        AND (
          equivalent.kind NOT IN ('google_news', 'x_profile', 'x_search')
          OR EXISTS (
            SELECT 1
            FROM paid_provider_seats
            WHERE paid_provider_seats.account_id = briefings.owner_account_id
          )
        )`
    ).bind(sourceId));
    return rows.map(rowToSource);
  }

  async claimCanonicalSourceRefresh(sourceId: string, intervalMs: number, leaseMs: number, now = new Date()): Promise<string | null> {
    const source = await this.getSource(sourceId);
    if (!source?.canonicalKey) return null;
    const leaseToken = crypto.randomUUID();
    const nowIso = now.toISOString();
    const leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
    await this.db.prepare(
      `INSERT OR IGNORE INTO canonical_source_refreshes (canonical_key, next_refresh_at, updated_at)
      VALUES (?, ?, ?)`
    ).bind(source.canonicalKey, new Date(now.getTime() - intervalMs).toISOString(), nowIso).run();
    const result = await this.db.prepare(
      `UPDATE canonical_source_refreshes SET lease_token = ?, lease_until = ?, updated_at = ?
      WHERE canonical_key = ? AND COALESCE(next_refresh_at, ?) <= ?
        AND (lease_until IS NULL OR lease_until <= ?)
        AND EXISTS (
          SELECT 1
          FROM sources
          JOIN briefings ON briefings.id = sources.briefing_id
          WHERE sources.id = ?
            AND (
              sources.kind NOT IN ('google_news', 'x_profile', 'x_search')
              OR EXISTS (
                SELECT 1
                FROM paid_provider_seats
                WHERE paid_provider_seats.account_id = briefings.owner_account_id
              )
            )
        )`
    ).bind(leaseToken, leaseUntil, nowIso, source.canonicalKey, nowIso, nowIso, nowIso, sourceId).run();
    return Number(result.meta.changes ?? 0) > 0 ? leaseToken : null;
  }

  async activateCanonicalSourceRefresh(sourceId: string, dispatchLeaseToken: string, leaseMs: number, now = new Date()): Promise<string | null> {
    const source = await this.getSource(sourceId);
    if (!source?.canonicalKey) return null;
    const executionLeaseToken = crypto.randomUUID();
    const nowIso = now.toISOString();
    const result = await this.db.prepare(
      `UPDATE canonical_source_refreshes SET lease_token = ?, lease_until = ?, updated_at = ?
      WHERE canonical_key = ? AND lease_token = ? AND lease_until > ?
        AND EXISTS (
          SELECT 1
          FROM sources
          JOIN briefings ON briefings.id = sources.briefing_id
          WHERE sources.id = ?
            AND (
              sources.kind NOT IN ('google_news', 'x_profile', 'x_search')
              OR EXISTS (
                SELECT 1
                FROM paid_provider_seats
                WHERE paid_provider_seats.account_id = briefings.owner_account_id
              )
            )
        )`
    ).bind(
      executionLeaseToken,
      new Date(now.getTime() + leaseMs).toISOString(),
      nowIso,
      source.canonicalKey,
      dispatchLeaseToken,
      nowIso,
      sourceId
    ).run();
    return Number(result.meta.changes ?? 0) > 0 ? executionLeaseToken : null;
  }

  async releaseCanonicalSourceRefresh(sourceId: string, leaseToken: string, now = new Date()): Promise<void> {
    const source = await this.getSource(sourceId);
    if (!source?.canonicalKey) return;
    await this.db.prepare(
      `UPDATE canonical_source_refreshes SET lease_token = NULL, lease_until = NULL, updated_at = ?
      WHERE canonical_key = ? AND lease_token = ?`
    ).bind(now.toISOString(), source.canonicalKey, leaseToken).run();
  }

  async completeCanonicalSourceRefresh(
    sourceId: string,
    leaseToken: string,
    nextRefreshAt: string,
    newItemAt?: string,
    now = new Date(),
    markHealthy = true
  ): Promise<void> {
    const source = await this.getSource(sourceId);
    if (!source?.canonicalKey) return;
    const result = await this.db.prepare(
      `UPDATE canonical_source_refreshes SET lease_token = NULL, lease_until = NULL, next_refresh_at = ?,
        last_success_at = ?, last_error = NULL, updated_at = ?
      WHERE canonical_key = ? AND lease_token = ?`
    ).bind(nextRefreshAt, now.toISOString(), now.toISOString(), source.canonicalKey, leaseToken).run();
    if (Number(result.meta.changes ?? 0) === 0) return;
    if (!markHealthy) {
      await this.db.prepare(
        `UPDATE sources SET last_checked_at = ?, updated_at = ?
        WHERE canonical_key = ? AND enabled = 1`
      ).bind(now.toISOString(), now.toISOString(), source.canonicalKey).run();
      return;
    }
    await this.db.prepare(
      `UPDATE sources SET health_state = 'healthy', failure_class = NULL, consecutive_failures = 0,
        last_error = NULL, last_success_at = ?, last_new_item_at = COALESCE(?, last_new_item_at),
        last_checked_at = ?, next_retry_at = NULL, updated_at = ?
      WHERE canonical_key = ? AND enabled = 1`
    ).bind(now.toISOString(), newItemAt ?? null, now.toISOString(), now.toISOString(), source.canonicalKey).run();
  }

  async failCanonicalSourceRefresh(
    sourceId: string,
    leaseToken: string,
    error: string,
    failureClass: string,
    backoffMs: number,
    now = new Date()
  ): Promise<void> {
    const source = await this.getSource(sourceId);
    if (!source?.canonicalKey) return;
    const nextRetryAt = new Date(now.getTime() + backoffMs).toISOString();
    const result = await this.db.prepare(
      `UPDATE canonical_source_refreshes SET lease_token = NULL, lease_until = NULL, next_refresh_at = ?,
        last_error = ?, updated_at = ? WHERE canonical_key = ? AND lease_token = ?`
    ).bind(nextRetryAt, error, now.toISOString(), source.canonicalKey, leaseToken).run();
    if (Number(result.meta.changes ?? 0) === 0) return;
    await this.db.prepare(
      `UPDATE sources SET health_state = CASE WHEN consecutive_failures >= 1 THEN 'backoff' ELSE 'degraded' END,
        failure_class = ?, consecutive_failures = consecutive_failures + 1, last_error = ?, next_retry_at = ?,
        last_checked_at = ?, updated_at = ? WHERE canonical_key = ? AND enabled = 1`
      ).bind(failureClass, error, nextRetryAt, now.toISOString(), now.toISOString(), source.canonicalKey).run();
  }

  async rescheduleCanonicalSourceRefresh(
    sourceId: string,
    nextRefreshAt: string,
    error?: string,
    now = new Date()
  ): Promise<void> {
    const source = await this.getSource(sourceId);
    if (!source?.canonicalKey) return;
    await this.db.prepare(
      `INSERT INTO canonical_source_refreshes (canonical_key, next_refresh_at, last_error, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(canonical_key) DO UPDATE SET
        lease_token = NULL,
        lease_until = NULL,
        next_refresh_at = excluded.next_refresh_at,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at`
    ).bind(source.canonicalKey, nextRefreshAt, error ?? null, now.toISOString()).run();
  }

  async upsertSourceFromMessage(
    briefingId: string,
    message: NormalizedMessage,
    now = new Date()
  ): Promise<SourceRecord> {
    const existingSourceId = await first<{ id: string }>(
      this.db
        .prepare(
          `SELECT id
          FROM sources
          WHERE briefing_id = ?
            AND (id = ? OR (
              provider = ?
              AND kind = ?
              AND ((username IS NOT NULL AND username = ?) OR source_url = ? OR title = ?)
            ))
          LIMIT 1`
        )
        .bind(
          briefingId,
          message.source.id,
          message.source.provider ?? "telegram",
          message.source.kind ?? (message.source.type === "group" ? "telegram_group" : "telegram_channel"),
          message.source.username ?? null,
          message.sourceUrl ?? null,
          message.source.title
        )
    );
    const sourceId = existingSourceId?.id ?? scopedSourceId(briefingId, message.source.id);
    const timestamp = now.toISOString();
    const sourceProvider = message.source.provider ?? "telegram";
    const sourceKind = message.source.kind ?? (message.source.type === "group" ? "telegram_group" : "telegram_channel");
    const ownerAccountId = (await this.getBriefingById(briefingId))?.ownerAccountId;
    const canonicalKey = canonicalSourceKey(
      sourceProvider,
      sourceKind,
      message.source.username ?? message.sourceUrl ?? message.source.title,
      ownerAccountId
    );
    await this.db
      .prepare(
        `INSERT INTO sources (
          id, briefing_id, title, type, provider, kind, username, input, source_url,
          enabled, last_seen_at, created_at, updated_at, canonical_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = sources.title,
          type = sources.type,
          provider = CASE WHEN sources.kind = 'google_news' THEN excluded.provider ELSE sources.provider END,
          kind = sources.kind,
          username = sources.username,
          input = sources.input,
          source_url = sources.source_url,
          canonical_key = sources.canonical_key,
          last_seen_at = excluded.last_seen_at,
          updated_at = excluded.updated_at`
      )
      .bind(
        sourceId,
        briefingId,
        message.source.title,
        message.source.type,
        sourceProvider,
        sourceKind,
        message.source.username ?? null,
        message.source.username ? `https://t.me/${message.source.username}` : message.sourceUrl ?? message.source.title,
        message.sourceUrl ?? (message.source.username ? `https://t.me/${message.source.username}` : null),
        message.receivedAt,
        timestamp,
        timestamp,
        canonicalKey
      )
      .run();

    const source = (await this.listSources(briefingId)).find((item) => item.id === sourceId);
    if (!source) throw new Error("Failed to upsert source");
    return source;
  }

  async saveRawMessage(briefingId: string, message: NormalizedMessage, now = new Date()): Promise<void> {
    const result = await this.db
      .prepare(
        `INSERT OR IGNORE INTO raw_messages (
          id, briefing_id, source_id, source_title, source_type, source_provider, source_kind, source_username,
          message_id, text, links_json, media_json, posted_at,
          received_at, source_url, raw_payload_key, expires_at, created_at
        )
        SELECT ?, briefings.id, sources.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM briefings
        JOIN sources ON sources.briefing_id = briefings.id
        WHERE briefings.id = ? AND sources.id = ?`
      )
      .bind(
        message.id,
        message.source.title,
        message.source.type,
        message.source.provider ?? null,
        message.source.kind ?? null,
        message.source.username ?? null,
        message.messageId,
        message.text,
        JSON.stringify(message.links),
        JSON.stringify(message.media),
        message.postedAt,
        message.receivedAt,
        message.sourceUrl ?? null,
        message.rawPayloadKey ?? null,
        message.expiresAt,
        now.toISOString(),
        briefingId,
        message.source.id
      )
      .run();
    if (Number(result.meta.changes ?? 0) > 0) return;

    const existing = await first<{ id: string }>(
      this.db.prepare("SELECT id FROM raw_messages WHERE id = ? AND briefing_id = ?").bind(message.id, briefingId)
    );
    if (!existing) {
      throw new Error(`Could not save raw message because its briefing or source is unavailable (briefing=${briefingId}, source=${message.source.id}, message=${message.id})`);
    }
  }

  async saveRawMessageAndCreateProcessingJob(
    briefingId: string,
    message: NormalizedMessage,
    now = new Date()
  ): Promise<string> {
    const jobId = `job_${crypto.randomUUID()}`;
    const timestamp = now.toISOString();
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT OR IGNORE INTO raw_messages (
            id, briefing_id, source_id, source_title, source_type, source_provider, source_kind, source_username,
            message_id, text, links_json, media_json, posted_at,
            received_at, source_url, raw_payload_key, expires_at, created_at
          )
          SELECT ?, briefings.id, sources.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          FROM briefings
          JOIN sources ON sources.briefing_id = briefings.id
          WHERE briefings.id = ? AND sources.id = ?`
        )
        .bind(
          message.id,
          message.source.title,
          message.source.type,
          message.source.provider ?? null,
          message.source.kind ?? null,
          message.source.username ?? null,
          message.messageId,
          message.text,
          JSON.stringify(message.links),
          JSON.stringify(message.media),
          message.postedAt,
          message.receivedAt,
          message.sourceUrl ?? null,
          message.rawPayloadKey ?? null,
          message.expiresAt,
          timestamp,
          briefingId,
          message.source.id
        ),
      this.db
        .prepare(
          `INSERT OR IGNORE INTO processing_jobs (id, briefing_id, raw_message_id, state, created_at, updated_at)
          SELECT ?, ?, raw_messages.id, 'queued', ?, ?
          FROM raw_messages
          WHERE raw_messages.id = ? AND raw_messages.briefing_id = ?`
        )
        .bind(jobId, briefingId, timestamp, timestamp, message.id, briefingId),
      this.db
        .prepare(
          `SELECT id
          FROM processing_jobs
          WHERE raw_message_id = ? AND briefing_id = ?
          ORDER BY created_at ASC
          LIMIT 1`
        )
        .bind(message.id, briefingId)
    ]);
    const persistedJob = (results[2]?.results as Array<{ id: string }> | undefined)?.[0];
    if (!persistedJob?.id) {
      throw new Error(
        `Could not atomically save raw message and processing job (briefing=${briefingId}, source=${message.source.id}, message=${message.id})`
      );
    }
    return persistedJob.id;
  }

  async getRawMessage(id: string): Promise<NormalizedMessage | null> {
    const row = await first<RawMessageRow>(
      this.db
        .prepare(
          `SELECT raw_messages.*,
            COALESCE(raw_messages.source_title, sources.title) as message_source_title,
            COALESCE(raw_messages.source_type, sources.type) as message_source_type,
            COALESCE(raw_messages.source_provider, sources.provider) as message_source_provider,
            COALESCE(raw_messages.source_kind, sources.kind) as message_source_kind,
            COALESCE(raw_messages.source_username, sources.username) as message_source_username,
            sources.title, sources.type, sources.provider, sources.kind, sources.username
          FROM raw_messages
          JOIN sources ON sources.id = raw_messages.source_id
          WHERE raw_messages.id = ?`
        )
        .bind(id)
    );
    return row ? rowToRawMessage(row) : null;
  }

  async listRecentRawMessages(briefingId: string, now = new Date(), limit = 50): Promise<NormalizedMessage[]> {
    const rows = await all<RawMessageRow>(
      this.db
        .prepare(
          `SELECT raw_messages.*,
            COALESCE(raw_messages.source_title, sources.title) as message_source_title,
            COALESCE(raw_messages.source_type, sources.type) as message_source_type,
            COALESCE(raw_messages.source_provider, sources.provider) as message_source_provider,
            COALESCE(raw_messages.source_kind, sources.kind) as message_source_kind,
            COALESCE(raw_messages.source_username, sources.username) as message_source_username,
            sources.title, sources.type, sources.provider, sources.kind, sources.username
          FROM raw_messages
          JOIN sources ON sources.id = raw_messages.source_id
          WHERE raw_messages.briefing_id = ? AND raw_messages.expires_at > ?
          ORDER BY raw_messages.posted_at DESC
          LIMIT ?`
        )
        .bind(briefingId, now.toISOString(), limit)
    );
    return rows.map(rowToRawMessage);
  }

  async listRawMessagesForWindow(
    briefingId: string,
    windowStart: string,
    windowEnd: string,
    limit = 500
  ): Promise<NormalizedMessage[]> {
    const rows = await all<RawMessageRow>(
      this.db
        .prepare(
          `SELECT raw_messages.*,
            COALESCE(raw_messages.source_title, sources.title) as message_source_title,
            COALESCE(raw_messages.source_type, sources.type) as message_source_type,
            COALESCE(raw_messages.source_provider, sources.provider) as message_source_provider,
            COALESCE(raw_messages.source_kind, sources.kind) as message_source_kind,
            COALESCE(raw_messages.source_username, sources.username) as message_source_username,
            sources.title, sources.type, sources.provider, sources.kind, sources.username
          FROM raw_messages
          JOIN sources ON sources.id = raw_messages.source_id
          WHERE raw_messages.briefing_id = ?
            AND raw_messages.posted_at >= ?
            AND raw_messages.posted_at < ?
            AND raw_messages.expires_at > ?
          ORDER BY raw_messages.posted_at ASC
          LIMIT ?`
        )
        .bind(briefingId, windowStart, windowEnd, new Date().toISOString(), limit)
    );
    return rows.map(rowToRawMessage);
  }

  async listRawMessagesReceivedBetween(
    briefingId: string,
    receivedAfter: string,
    receivedThrough: string,
    postedAfter: string,
    limit = 500
  ): Promise<NormalizedMessage[]> {
    const rows = await all<RawMessageRow>(
      this.db
        .prepare(
          `SELECT raw_messages.*,
            COALESCE(raw_messages.source_title, sources.title) as message_source_title,
            COALESCE(raw_messages.source_type, sources.type) as message_source_type,
            COALESCE(raw_messages.source_provider, sources.provider) as message_source_provider,
            COALESCE(raw_messages.source_kind, sources.kind) as message_source_kind,
            COALESCE(raw_messages.source_username, sources.username) as message_source_username,
            sources.title, sources.type, sources.provider, sources.kind, sources.username
          FROM raw_messages
          JOIN sources ON sources.id = raw_messages.source_id
          WHERE raw_messages.briefing_id = ?
            AND raw_messages.received_at > ?
            AND raw_messages.received_at <= ?
            AND raw_messages.posted_at >= ?
            AND raw_messages.expires_at > ?
          ORDER BY raw_messages.received_at ASC, raw_messages.posted_at ASC
          LIMIT ?`
        )
        .bind(briefingId, receivedAfter, receivedThrough, postedAfter, receivedThrough, limit)
    );
    return rows.map(rowToRawMessage);
  }

  async createProcessingJob(briefingId: string, rawMessageId: string, now = new Date()): Promise<string> {
    const id = `job_${crypto.randomUUID()}`;
    const timestamp = now.toISOString();
    const result = await this.db
      .prepare(
        `INSERT INTO processing_jobs (id, briefing_id, raw_message_id, state, created_at, updated_at)
        SELECT ?, ?, raw_messages.id, 'queued', ?, ?
        FROM raw_messages
        WHERE raw_messages.id = ? AND raw_messages.briefing_id = ?`
      )
      .bind(id, briefingId, timestamp, timestamp, rawMessageId, briefingId)
      .run();
    if (Number(result.meta.changes ?? 0) === 0) {
      throw new Error(`Could not create processing job because the raw message is unavailable (briefing=${briefingId}, message=${rawMessageId})`);
    }
    return id;
  }

  async claimProcessingJob(jobId: string, leaseMs: number, now = new Date()): Promise<ProcessingJobClaim | null> {
    const leaseToken = crypto.randomUUID();
    const nowIso = now.toISOString();
    const leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
    const result = await this.db
      .prepare(
        `UPDATE processing_jobs
        SET lease_token = ?, lease_until = ?, attempt_count = attempt_count + 1,
          error = NULL, updated_at = ?
        WHERE id = ? AND state = 'queued'
          AND (lease_until IS NULL OR lease_until <= ?)`
      )
      .bind(leaseToken, leaseUntil, nowIso, jobId, nowIso)
      .run();
    if (Number(result.meta.changes ?? 0) === 0) return null;

    const row = await first<ProcessingJobRow>(
      this.db.prepare(
        `SELECT id, briefing_id, raw_message_id, state, error, lease_token, lease_until,
          attempt_count, available_at, completed_at, last_enqueued_at, updated_at
        FROM processing_jobs WHERE id = ? AND lease_token = ?`
      ).bind(jobId, leaseToken)
    );
    if (!row?.lease_token || !row.lease_until) return null;
    await this.db.prepare(
      `INSERT INTO processing_attempts (
        id, job_id, lease_token, attempt_number, state, started_at
      )
      SELECT ?, id, ?, attempt_count, 'running', ?
      FROM processing_jobs
      WHERE id = ? AND lease_token = ?`
    ).bind(`attempt_${crypto.randomUUID()}`, leaseToken, nowIso, jobId, leaseToken).run();
    return rowToProcessingJob(row) as ProcessingJobClaim;
  }

  async completeProcessingJob(jobId: string, now = new Date(), leaseToken?: string): Promise<void> {
    const condition = leaseToken ? " AND lease_token = ?" : "";
    const bindings: DbValue[] = [now.toISOString(), now.toISOString(), jobId];
    if (leaseToken) bindings.push(leaseToken);
    await this.db
      .prepare(`UPDATE processing_jobs SET state = 'completed', completed_at = ?, lease_token = NULL, lease_until = NULL, updated_at = ? WHERE id = ?${condition}`)
      .bind(...bindings)
      .run();
    if (leaseToken) {
      await this.db.prepare("UPDATE processing_attempts SET state = 'completed', completed_at = ? WHERE job_id = ? AND lease_token = ? AND state = 'running'")
        .bind(now.toISOString(), jobId, leaseToken).run();
    }
  }

  async failProcessingJob(jobId: string, error: string, now = new Date(), leaseToken?: string): Promise<void> {
    const condition = leaseToken ? " AND lease_token = ?" : "";
    const bindings: DbValue[] = [error, now.toISOString(), jobId];
    if (leaseToken) bindings.push(leaseToken);
    await this.db
      .prepare(`UPDATE processing_jobs SET state = 'failed', error = ?, lease_token = NULL, lease_until = NULL, updated_at = ? WHERE id = ?${condition}`)
      .bind(...bindings)
      .run();
    if (leaseToken) {
      await this.db.prepare("UPDATE processing_attempts SET state = 'failed', error = ?, completed_at = ? WHERE job_id = ? AND lease_token = ? AND state = 'running'")
        .bind(error, now.toISOString(), jobId, leaseToken).run();
    }
  }

  async releaseProcessingJob(jobId: string, error: string, delayMs: number, now = new Date(), leaseToken?: string): Promise<void> {
    const condition = leaseToken ? " AND lease_token = ?" : "";
    const bindings: DbValue[] = [error, new Date(now.getTime() + delayMs).toISOString(), now.toISOString(), jobId];
    if (leaseToken) bindings.push(leaseToken);
    await this.db.prepare(
      `UPDATE processing_jobs SET state = 'queued', error = ?, available_at = ?, lease_token = NULL,
        lease_until = NULL, updated_at = ? WHERE id = ?${condition}`
    ).bind(...bindings).run();
    if (leaseToken) {
      await this.db.prepare("UPDATE processing_attempts SET state = 'released', error = ?, completed_at = ? WHERE job_id = ? AND lease_token = ? AND state = 'running'")
        .bind(error, now.toISOString(), jobId, leaseToken).run();
    }
  }

  async listProcessingJobs(input?: {
    briefingId?: string;
    states?: ProcessingJobState[];
    limit?: number;
    updatedBefore?: string;
    order?: "newest" | "oldest";
  }): Promise<ProcessingJobRecord[]> {
    const states = input?.states?.length ? input.states : ["queued", "completed", "failed"];
    const placeholders = states.map(() => "?").join(", ");
    const values: DbValue[] = [...states];
    let sql =
      `SELECT id, briefing_id, raw_message_id, state, error, lease_token, lease_until,
        attempt_count, available_at, completed_at, last_enqueued_at, updated_at
       FROM processing_jobs
       WHERE state IN (${placeholders})`;

    if (input?.briefingId) {
      sql += " AND briefing_id = ?";
      values.push(input.briefingId);
    }
    if (input?.updatedBefore) {
      sql += " AND updated_at < ?";
      values.push(input.updatedBefore);
    }

    sql += ` ORDER BY updated_at ${input?.order === "oldest" ? "ASC" : "DESC"} LIMIT ?`;
    values.push(input?.limit ?? 50);

    const rows = await all<ProcessingJobRow>(this.db.prepare(sql).bind(...values));
    return rows.map(rowToProcessingJob);
  }

  async requeueProcessingJob(jobId: string, now = new Date()): Promise<void> {
    await this.db
      .prepare("UPDATE processing_jobs SET state = 'queued', error = NULL, updated_at = ? WHERE id = ?")
      .bind(now.toISOString(), jobId)
      .run();
  }

  async markProcessingJobEnqueued(jobId: string, now = new Date()): Promise<void> {
    const timestamp = now.toISOString();
    await this.db.prepare(`UPDATE processing_jobs SET last_enqueued_at = ?,
      lease_token = CASE WHEN lease_until IS NOT NULL AND lease_until <= ? THEN NULL ELSE lease_token END,
      lease_until = CASE WHEN lease_until IS NOT NULL AND lease_until <= ? THEN NULL ELSE lease_until END,
      updated_at = ? WHERE id = ? AND state = 'queued'`)
      .bind(timestamp, timestamp, timestamp, timestamp, jobId).run();
    await this.db.prepare(`UPDATE processing_attempts
      SET state = 'released', error = COALESCE(error, 'Lease expired; job re-enqueued.'), completed_at = ?
      WHERE job_id = ? AND state = 'running'
        AND lease_token != COALESCE((SELECT lease_token FROM processing_jobs WHERE id = ?), '')`)
      .bind(timestamp, jobId, jobId).run();
  }

  async listRecoverableProcessingJobs(input: {
    orphanedBefore: string;
    enqueuedBefore: string;
    abandonedLeaseBefore: string;
    limit: number;
  }): Promise<ProcessingJobRecord[]> {
    const rows = await all<ProcessingJobRow>(this.db.prepare(`
      SELECT id, briefing_id, raw_message_id, state, error, lease_token, lease_until,
        attempt_count, available_at, completed_at, last_enqueued_at, updated_at
      FROM processing_jobs
      WHERE state = 'queued'
        AND (
          (lease_until IS NOT NULL AND lease_until < ?)
          OR (lease_until IS NULL AND last_enqueued_at IS NULL AND updated_at < ?)
          OR (lease_until IS NULL AND last_enqueued_at IS NOT NULL AND last_enqueued_at < ?)
        )
      ORDER BY updated_at ASC
      LIMIT ?
    `).bind(input.abandonedLeaseBefore, input.orphanedBefore, input.enqueuedBefore, input.limit));
    return rows.map(rowToProcessingJob);
  }

  async claimBriefingWindow(input: {
    briefingId: string;
    cadence: "hourly" | "daily" | "weekly" | "monthly";
    windowStart: string;
    windowEnd: string;
    leaseMs: number;
  }, now = new Date()) {
    const id = `window_${crypto.randomUUID()}`;
    const leaseToken = crypto.randomUUID();
    const timestamp = now.toISOString();
    const leaseUntil = new Date(now.getTime() + input.leaseMs).toISOString();
    await this.db.prepare(
      `INSERT OR IGNORE INTO briefing_windows (
        id, briefing_id, cadence, window_start, window_end, state, lease_token, lease_until, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, ?)`
    ).bind(
      id, input.briefingId, input.cadence, input.windowStart, input.windowEnd,
      leaseToken, leaseUntil, timestamp, timestamp
    ).run();

    let row = await first<{
      id: string; briefing_id: string; cadence: "hourly" | "daily" | "weekly" | "monthly";
      window_start: string; window_end: string; lease_token: string | null; lease_until: string | null;
    }>(this.db.prepare(
      `SELECT id, briefing_id, cadence, window_start, window_end, lease_token, lease_until
      FROM briefing_windows
      WHERE briefing_id = ? AND cadence = ? AND window_start = ? AND window_end = ? AND lease_token = ?`
    ).bind(input.briefingId, input.cadence, input.windowStart, input.windowEnd, leaseToken));

    if (!row) {
      const takeover = await this.db.prepare(
        `UPDATE briefing_windows SET state = 'running', lease_token = ?, lease_until = ?, error = NULL, updated_at = ?
        WHERE briefing_id = ? AND cadence = ? AND window_start = ? AND window_end = ?
          AND (state = 'failed' OR (state = 'running' AND lease_until <= ?))`
      ).bind(
        leaseToken, leaseUntil, timestamp, input.briefingId, input.cadence,
        input.windowStart, input.windowEnd, timestamp
      ).run();
      if (Number(takeover.meta.changes ?? 0) === 0) return null;
      row = await first(this.db.prepare(
        `SELECT id, briefing_id, cadence, window_start, window_end, lease_token, lease_until
        FROM briefing_windows WHERE briefing_id = ? AND cadence = ? AND window_start = ? AND window_end = ? AND lease_token = ?`
      ).bind(input.briefingId, input.cadence, input.windowStart, input.windowEnd, leaseToken));
    }
    if (!row?.lease_token || !row.lease_until) return null;
    return {
      id: row.id,
      briefingId: row.briefing_id,
      cadence: row.cadence,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      leaseToken: row.lease_token,
      leaseUntil: row.lease_until
    };
  }

  async completeBriefingWindow(input: {
    id: string;
    leaseToken: string;
    state: "published" | "empty";
    messageCount: number;
    editionId?: string;
    contentCutoffAt: string;
    qualityState: "ready" | "degraded";
  }, now = new Date()): Promise<void> {
    await this.db.prepare(
      `UPDATE briefing_windows SET state = ?, message_count = ?, edition_id = ?, lease_token = NULL,
        lease_until = NULL, error = NULL, content_cutoff_at = ?, quality_state = ?, prepared_at = ?,
        completed_at = ?, updated_at = ?
      WHERE id = ? AND state = 'running' AND lease_token = ?`
    ).bind(
      input.state, input.messageCount, input.editionId ?? null, input.contentCutoffAt, input.qualityState,
      now.toISOString(), now.toISOString(), now.toISOString(),
      input.id, input.leaseToken
    ).run();
  }

  async getLatestBriefingWindowCutoff(
    briefingId: string,
    cadence: "hourly" | "daily" | "weekly" | "monthly",
    beforeWindowEnd: string
  ): Promise<string | undefined> {
    const row = await first<{ content_cutoff_at: string | null }>(this.db.prepare(
      `SELECT content_cutoff_at
      FROM briefing_windows
      WHERE briefing_id = ? AND cadence = ? AND window_end <= ?
        AND state IN ('published', 'empty') AND content_cutoff_at IS NOT NULL
      ORDER BY window_end DESC
      LIMIT 1`
    ).bind(briefingId, cadence, beforeWindowEnd));
    return row?.content_cutoff_at ?? undefined;
  }

  async listRecoverableEmptyBriefingWindows(
    briefingId: string,
    cadence: "hourly" | "daily" | "weekly" | "monthly",
    sinceWindowEnd: string,
    limit = 2
  ): Promise<RecoverableBriefingWindow[]> {
    const rows = await all<{
      id: string; briefing_id: string; cadence: RecoverableBriefingWindow["cadence"];
      window_start: string; window_end: string; content_cutoff_at: string; message_count: number;
    }>(this.db.prepare(
      `SELECT id, briefing_id, cadence, window_start, window_end, content_cutoff_at, message_count
      FROM briefing_windows
      WHERE briefing_id = ? AND cadence = ? AND state = 'empty' AND edition_id IS NULL
        AND message_count > 0 AND content_cutoff_at IS NOT NULL
        AND recovery_attempted_at IS NULL AND window_end >= ?
      ORDER BY window_end ASC
      LIMIT ?`
    ).bind(briefingId, cadence, sinceWindowEnd, limit));
    return rows.map((row) => ({
      id: row.id,
      briefingId: row.briefing_id,
      cadence: row.cadence,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      contentCutoffAt: row.content_cutoff_at,
      messageCount: row.message_count
    }));
  }

  async claimRecoverableEmptyBriefingWindow(id: string, leaseMs: number, now = new Date()) {
    const leaseToken = crypto.randomUUID();
    const timestamp = now.toISOString();
    const leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
    const claimed = await this.db.prepare(
      `UPDATE briefing_windows
      SET state = 'running', lease_token = ?, lease_until = ?, error = NULL,
        recovery_attempted_at = ?, updated_at = ?
      WHERE id = ? AND state = 'empty' AND edition_id IS NULL
        AND message_count > 0 AND recovery_attempted_at IS NULL`
    ).bind(leaseToken, leaseUntil, timestamp, timestamp, id).run();
    if (Number(claimed.meta.changes ?? 0) === 0) return null;
    const row = await first<{
      id: string; briefing_id: string; cadence: BriefingWindowClaim["cadence"];
      window_start: string; window_end: string; lease_token: string | null; lease_until: string | null;
    }>(this.db.prepare(
      `SELECT id, briefing_id, cadence, window_start, window_end, lease_token, lease_until
      FROM briefing_windows WHERE id = ? AND lease_token = ?`
    ).bind(id, leaseToken));
    if (!row?.lease_token || !row.lease_until) return null;
    return {
      id: row.id,
      briefingId: row.briefing_id,
      cadence: row.cadence,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      leaseToken: row.lease_token,
      leaseUntil: row.lease_until
    };
  }

  async failBriefingWindow(id: string, leaseToken: string, error: string, now = new Date()): Promise<void> {
    await this.db.prepare(
      `UPDATE briefing_windows SET state = 'failed', error = ?, lease_token = NULL, lease_until = NULL,
        completed_at = ?, updated_at = ? WHERE id = ? AND state = 'running' AND lease_token = ?`
    ).bind(error, now.toISOString(), now.toISOString(), id, leaseToken).run();
  }

  async getExistingItems(briefingId: string, now = new Date()): Promise<BriefingItem[]> {
    return this.listBriefingItems(briefingId, true, now, true, PROCESSOR_EXISTING_ITEM_QUERY_LIMIT);
  }

  private async listBriefingItems(
    briefingId: string,
    includeEvidence: boolean,
    now = new Date(),
    collapseDuplicates = true,
    limit?: number
  ): Promise<BriefingItem[]> {
    const bindings: DbValue[] = [briefingId, now.toISOString()];
    if (limit) bindings.push(limit);
    const rows = await all<BriefingItemRow>(
      this.db
        .prepare(
          `SELECT id, cluster_id, event_key, summary, item_at, updated_at, expires_at, merged_update_count FROM briefing_items WHERE briefing_id = ? AND expires_at > ? ORDER BY item_at DESC${limit ? " LIMIT ?" : ""}`
        )
        .bind(...bindings)
    );
    if (!includeEvidence) {
      return collapseBriefingItemsByStoredEventKey(rows.map((row) => ({ ...rowToBriefingItem(row), evidence: [] })));
    }

    const evidenceByItemId =
      includeEvidence || collapseDuplicates ? await this.getEvidenceByItemIds(rows.map((row) => row.id)) : new Map<string, BriefingEvidence[]>();
    const items: BriefingItem[] = [];
    for (const row of rows) {
      items.push({ ...rowToBriefingItem(row), evidence: evidenceByItemId.get(row.id) ?? [] });
    }
    const briefing = collapseDuplicates ? await this.getBriefingById(briefingId) : null;
    const nextItems = briefing ? collapseDuplicateBriefingItems(items, briefing) : items;
    return includeEvidence ? nextItems : nextItems.map((item) => ({ ...item, evidence: [] }));
  }

  async saveBriefingItems(briefingId: string, items: BriefingItem[], now = new Date()): Promise<void> {
    const timestamp = now.toISOString();
    const briefing = await this.getBriefingById(briefingId);
    const collapsedItems = collapseDuplicateBriefingItems(items, briefing ?? undefined);
    const processedRawMessageIds = Array.from(new Set(
      collapsedItems.flatMap((item) => item.evidence.map((entry) => entry.messageId))
    ));
    for (const inputItem of collapsedItems) {
      const item = await this.resolveDuplicateTarget(briefingId, inputItem, briefing ?? undefined, now);
      await this.writeBriefingItem(briefingId, item, timestamp);
    }

    for (const batch of chunk(processedRawMessageIds, 50)) {
      if (batch.length === 0) continue;
      const placeholders = batch.map(() => "?").join(", ");
      await this.db
        .prepare(`UPDATE raw_messages SET processed_at = ? WHERE id IN (${placeholders})`)
        .bind(timestamp, ...batch)
        .run();
    }
  }

  async repairDuplicateBriefingItems(briefingId: string, now = new Date()): Promise<number> {
    const briefing = await this.getBriefingById(briefingId);
    const items = await this.listBriefingItems(briefingId, true, now, false);
    const survivors: BriefingItem[] = [];
    const loserIds: string[] = [];

    for (const item of items) {
      const existing = survivors.find((candidate) =>
        eventKeysForItem(candidate).some((key) => eventKeysForItem(item).includes(key))
      );
      const match = existing ?? survivors.find((candidate) => collapseDuplicateBriefingItems([candidate, item], briefing ?? undefined).length === 1);
      if (match) {
        mergeBriefingItem(match, item, briefing ?? undefined);
        loserIds.push(item.id);
      } else {
        survivors.push(item);
      }
    }

    if (loserIds.length === 0) return 0;
    await this.deleteBriefingItems(loserIds);
    const timestamp = now.toISOString();
    for (const survivor of survivors) await this.writeBriefingItem(briefingId, survivor, timestamp);
    return loserIds.length;
  }

  async listFeedItems(ownerAccountId: string, slug: string, includeEvidence: boolean, now = new Date()): Promise<BriefingItem[]> {
    const briefing = await this.getBriefingBySlug(ownerAccountId, slug);
    if (!briefing) return [];
    return this.listBriefingItems(briefing.id, includeEvidence, now);
  }

  async getFeedItemEvidence(briefingId: string, itemId: string, now = new Date()): Promise<BriefingEvidence[]> {
    const rows = await all<EvidenceRow>(
      this.db
        .prepare(
          `SELECT raw_message_id, source_id, source_title, source_type, source_provider, source_kind,
            source_url, posted_at, text, links_json, media_json
          FROM briefing_item_evidence
          JOIN briefing_items ON briefing_items.id = briefing_item_evidence.briefing_item_id
          WHERE briefing_item_evidence.briefing_item_id = ?
            AND briefing_items.briefing_id = ?
            AND briefing_items.expires_at > ?
          ORDER BY posted_at ASC`
        )
        .bind(itemId, briefingId, now.toISOString())
    );
    return rows.map(rowToEvidence);
  }

  async saveBriefingEdition(edition: BriefingEdition, now = new Date()): Promise<void> {
    const timestamp = now.toISOString();
    await this.db
      .prepare(
        `INSERT INTO briefing_editions (
          id, briefing_id, cadence, window_start, window_end, title, summary,
          sections_json, status, generation_mode, published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(briefing_id, cadence, window_start, window_end) DO UPDATE SET
          title = excluded.title,
          summary = excluded.summary,
          sections_json = excluded.sections_json,
          status = excluded.status,
          generation_mode = excluded.generation_mode,
          published_at = excluded.published_at,
          updated_at = excluded.updated_at`
      )
      .bind(
        edition.id,
        edition.briefingId,
        edition.cadence,
        edition.windowStart,
        edition.windowEnd,
        edition.title,
        edition.summary,
        JSON.stringify(edition.sections),
        edition.status,
        edition.generationMode ?? "deterministic",
        edition.publishedAt,
        edition.createdAt,
        timestamp
      )
      .run();
  }

  async listBriefingEditions(
    briefingId: string,
    includeSections: boolean,
    now = new Date(),
    limit = 50
  ): Promise<BriefingEdition[]> {
    const retentionCutoff = new Date(now.getTime() - FIXED_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const rows = await all<BriefingEditionRow>(
      this.db
        .prepare(
          `SELECT id, briefing_id, cadence, window_start, window_end, title, summary,
            sections_json, status, generation_mode, published_at, created_at, updated_at
          FROM briefing_editions
          WHERE briefing_id = ?
            AND published_at > ?
            AND published_at <= ?
          ORDER BY published_at DESC
          LIMIT ?`
        )
        .bind(briefingId, retentionCutoff, now.toISOString(), limit)
    );
    return rows.map((row) => rowToBriefingEdition(row, includeSections));
  }

  async getBriefingEdition(briefingId: string, editionId: string, now = new Date()): Promise<BriefingEdition | null> {
    const retentionCutoff = new Date(now.getTime() - FIXED_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const row = await first<BriefingEditionRow>(
      this.db
        .prepare(
          `SELECT id, briefing_id, cadence, window_start, window_end, title, summary,
            sections_json, status, generation_mode, published_at, created_at, updated_at
          FROM briefing_editions
          WHERE briefing_id = ?
            AND id = ?
            AND published_at > ?
            AND published_at <= ?`
        )
        .bind(briefingId, editionId, retentionCutoff, now.toISOString())
    );
    return row ? rowToBriefingEdition(row, true) : null;
  }

  async getHealth(briefingId?: string, now = new Date()): Promise<HealthStatus> {
    const lastImportedMessageAt = (
      briefingId
        ? await this.getSetting(`last_imported_message_at:${briefingId}`)
        : await this.getSetting("last_imported_message_at")
    ) ?? undefined;
    const lastSourceFetchAt = (
      briefingId
        ? await this.getSetting(`last_source_fetch_at:${briefingId}`)
        : await this.getSetting("last_source_fetch_at")
    ) ?? undefined;
    const lastSourceEventAt =
      lastImportedMessageAt ??
      (briefingId
        ? (await this.getSetting(`last_source_event_at:${briefingId}`)) ??
          (await this.getSetting(`last_telegram_event_at:${briefingId}`))
        : (await this.getSetting("last_source_event_at")) ??
          (await this.getSetting("last_telegram_event_at"))) ??
      undefined;
    const recentSince = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const rows = briefingId
      ? await all<{ state: "queued" | "completed" | "failed"; count: number }>(
          this.db
            .prepare("SELECT state, COUNT(*) as count FROM processing_jobs WHERE briefing_id = ? AND (state = 'queued' OR updated_at >= ?) GROUP BY state")
            .bind(briefingId, recentSince)
        )
      : await all<{ state: "queued" | "completed" | "failed"; count: number }>(
          this.db.prepare("SELECT state, COUNT(*) as count FROM processing_jobs WHERE state = 'queued' OR updated_at >= ? GROUP BY state").bind(recentSince)
        );
    const processing = { queued: 0, completed: 0, failed: 0, staleQueued: 0 };
    for (const row of rows) processing[row.state] = row.count;
    const orphanedBefore = new Date(now.getTime() - ORPHANED_PROCESSING_JOB_STALE_MS).toISOString();
    const enqueuedBefore = new Date(now.getTime() - ENQUEUED_PROCESSING_JOB_STALE_MS).toISOString();
    const abandonedLeaseBefore = new Date(now.getTime() - 60 * 1000).toISOString();
    const staleRow = briefingId
      ? await first<{ count: number }>(this.db.prepare(
          `SELECT COUNT(*) as count FROM processing_jobs WHERE briefing_id = ? AND state = 'queued'
            AND ((lease_until IS NOT NULL AND lease_until < ?)
              OR (lease_until IS NULL AND last_enqueued_at IS NULL AND updated_at < ?)
              OR (lease_until IS NULL AND last_enqueued_at IS NOT NULL AND last_enqueued_at < ?))`
        ).bind(briefingId, abandonedLeaseBefore, orphanedBefore, enqueuedBefore))
      : await first<{ count: number }>(this.db.prepare(
          `SELECT COUNT(*) as count FROM processing_jobs WHERE state = 'queued'
            AND ((lease_until IS NOT NULL AND lease_until < ?)
              OR (lease_until IS NULL AND last_enqueued_at IS NULL AND updated_at < ?)
              OR (lease_until IS NULL AND last_enqueued_at IS NOT NULL AND last_enqueued_at < ?))`
        ).bind(abandonedLeaseBefore, orphanedBefore, enqueuedBefore));
    processing.staleQueued = Number(staleRow?.count ?? 0);
    const sourceRows = briefingId
      ? await all<{ health_state: string; enabled: number; count: number }>(this.db.prepare(
          "SELECT health_state, enabled, COUNT(*) as count FROM sources WHERE briefing_id = ? GROUP BY health_state, enabled"
        ).bind(briefingId))
      : await all<{ health_state: string; enabled: number; count: number }>(this.db.prepare(
          "SELECT health_state, enabled, COUNT(*) as count FROM sources GROUP BY health_state, enabled"
        ));
    const sources = { enabled: 0, degraded: 0, backoff: 0, disabled: 0 };
    for (const row of sourceRows) {
      if (row.enabled === 0) sources.disabled += row.count;
      else {
        sources.enabled += row.count;
        if (row.health_state === "degraded") sources.degraded += row.count;
        if (row.health_state === "backoff") sources.backoff += row.count;
      }
    }
    const briefing = briefingId ? await this.getBriefingById(briefingId) : null;
    const usage = await this.getSpendUsage(
      briefingId ? briefing?.ownerAccountId ?? "__missing_account__" : undefined,
      now
    );
    const spendToday = {
      llmUsd: usage.llm.dayUsd,
      collectionUsd: usage.collection.dayUsd
    };
    const latestPublishedRow = briefingId
      ? await first<{ latest_published_at: string | null }>(
          this.db
            .prepare(
              `SELECT MAX(published_at) as latest_published_at
              FROM briefing_editions
              WHERE briefing_id = ?
                AND published_at > ?
                AND published_at <= ?`
            )
            .bind(
              briefingId,
              new Date(now.getTime() - FIXED_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
              now.toISOString()
            )
        )
      : await first<{ latest_published_at: string | null }>(
          this.db
            .prepare(
              "SELECT MAX(published_at) as latest_published_at FROM briefing_editions WHERE published_at > ? AND published_at <= ?"
            )
            .bind(
              new Date(now.getTime() - FIXED_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
              now.toISOString()
            )
        );
    return {
      lastSourceEventAt,
      lastSourceFetchAt,
      lastImportedMessageAt,
      latestPublishedAt: latestPublishedRow?.latest_published_at ?? undefined,
      nextBriefingAt: briefing ? visibleNextBriefingAt(briefing, now) : undefined,
      processing,
      sources,
      spendToday
    };
  }

  async createSourceRun(input: {
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
  }, now = new Date()): Promise<SourceRunRecord> {
    const id = `source_run_${crypto.randomUUID()}`;
    const timestamp = now.toISOString();
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO source_runs (
          id, source_id, briefing_id, provider, actor_id, actor_run_id, dataset_id,
          state, estimated_cost_usd, idempotency_key, started_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        input.sourceId,
        input.briefingId,
        input.provider,
        input.actorId ?? null,
        input.actorRunId ?? null,
        input.datasetId ?? null,
        input.state,
        input.estimatedCostUsd ?? null,
        input.idempotencyKey ?? null,
        input.startedAt ?? timestamp,
        timestamp,
        timestamp
      )
      .run();
    const run = input.idempotencyKey
      ? await this.getSourceRunByIdempotencyKey(input.idempotencyKey)
      : (await this.listSourceRuns({ sourceId: input.sourceId, limit: 1 })).find((item) => item.id === id) ?? null;
    if (!run) throw new Error("Failed to create source run");
    return run;
  }

  async updateSourceRun(input: {
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
  }, now = new Date()): Promise<void> {
    await this.db
      .prepare(
        `UPDATE source_runs
        SET actor_run_id = COALESCE(?, actor_run_id),
          dataset_id = COALESCE(?, dataset_id),
          state = COALESCE(?, state),
          item_count = COALESCE(?, item_count),
          estimated_cost_usd = COALESCE(?, estimated_cost_usd),
          actual_cost_usd = COALESCE(?, actual_cost_usd),
          archive_key = COALESCE(?, archive_key),
          error = ?,
          completed_at = COALESCE(?, completed_at),
          updated_at = ?
        WHERE id = ?`
      )
      .bind(
        input.actorRunId ?? null,
        input.datasetId ?? null,
        input.state ?? null,
        input.itemCount ?? null,
        input.estimatedCostUsd ?? null,
        input.actualCostUsd ?? null,
        input.archiveKey ?? null,
        input.error ?? null,
        input.completedAt ?? null,
        now.toISOString(),
        input.id
      )
      .run();
  }

  async listSourceRuns(input?: {
    briefingId?: string;
    sourceId?: string;
    provider?: SourceProvider;
    states?: SourceRunState[];
    limit?: number;
  }): Promise<SourceRunRecord[]> {
    const values: DbValue[] = [];
    let sql =
      `SELECT id, source_id, briefing_id, provider, actor_id, actor_run_id, dataset_id,
        state, item_count, estimated_cost_usd, actual_cost_usd, idempotency_key, archive_key, error, started_at, completed_at, updated_at
      FROM source_runs
      WHERE 1 = 1`;

    if (input?.briefingId) {
      sql += " AND briefing_id = ?";
      values.push(input.briefingId);
    }
    if (input?.sourceId) {
      sql += " AND source_id = ?";
      values.push(input.sourceId);
    }
    if (input?.provider) {
      sql += " AND provider = ?";
      values.push(input.provider);
    }
    if (input?.states?.length) {
      sql += ` AND state IN (${input.states.map(() => "?").join(", ")})`;
      values.push(...input.states);
    }

    sql += " ORDER BY updated_at DESC LIMIT ?";
    values.push(input?.limit ?? 50);

    const rows = await all<SourceRunRow>(this.db.prepare(sql).bind(...values));
    return rows.map(rowToSourceRun);
  }

  async hasActiveCanonicalSourceRun(sourceId: string): Promise<boolean> {
    const row = await first<{ active: number }>(
      this.db.prepare(
        `SELECT 1 AS active
        FROM sources AS target_source
        JOIN sources AS active_source
          ON COALESCE(active_source.canonical_key, active_source.id) =
            COALESCE(target_source.canonical_key, target_source.id)
        JOIN source_runs ON source_runs.source_id = active_source.id
        WHERE target_source.id = ?
          AND source_runs.provider = 'apify'
          AND source_runs.state IN ('queued', 'running')
        LIMIT 1`
      ).bind(sourceId)
    );
    return Boolean(row?.active);
  }

  async getProviderHealthSummary(provider: RuntimeProvider, now = new Date()): Promise<ProviderHealthSummary> {
    const sourcePredicate = runtimeProviderSourcePredicate(provider);
    if (!sourcePredicate) return emptyProviderHealthSummary();
    const hourlyCutoff = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
    const dailyCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const weeklyCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const monthlyCutoff = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const sourceRow = await first<{
      enabled_sources: number | null;
      fresh_sources: number | null;
      degraded_sources: number | null;
      backoff_sources: number | null;
    }>(this.db.prepare(
      `SELECT
        COUNT(*) AS enabled_sources,
        SUM(CASE WHEN sources.last_success_at IS NOT NULL AND sources.last_success_at >=
          CASE briefings.briefing_cadence
            WHEN 'hourly' THEN ?
            WHEN 'daily' THEN ?
            WHEN 'weekly' THEN ?
            ELSE ?
          END THEN 1 ELSE 0 END) AS fresh_sources,
        SUM(CASE WHEN sources.health_state = 'degraded' THEN 1 ELSE 0 END) AS degraded_sources,
        SUM(CASE WHEN sources.health_state = 'backoff' THEN 1 ELSE 0 END) AS backoff_sources
      FROM sources
      JOIN briefings ON briefings.id = sources.briefing_id
      JOIN accounts ON accounts.id = briefings.owner_account_id
      WHERE sources.enabled = 1
        AND briefings.paused = 0
        AND accounts.disabled_at IS NULL
        AND ${sourcePredicate}`
    ).bind(hourlyCutoff, dailyCutoff, weeklyCutoff, monthlyCutoff));
    const runSince = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const runRow = await first<{ succeeded: number | null; failed: number | null }>(this.db.prepare(
      `SELECT
        SUM(CASE WHEN source_runs.state = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
        SUM(CASE WHEN source_runs.state = 'failed' THEN 1 ELSE 0 END) AS failed
      FROM source_runs
      JOIN sources ON sources.id = source_runs.source_id
      JOIN briefings ON briefings.id = sources.briefing_id
      JOIN accounts ON accounts.id = briefings.owner_account_id
      WHERE source_runs.started_at >= ?
        AND sources.enabled = 1
        AND briefings.paused = 0
        AND accounts.disabled_at IS NULL
        AND ${sourcePredicate}`
    ).bind(runSince));
    const lastDlq = await this.getSetting("last_source_dlq_at");
    return {
      enabledSources: Number(sourceRow?.enabled_sources ?? 0),
      freshSources: Number(sourceRow?.fresh_sources ?? 0),
      degradedSources: Number(sourceRow?.degraded_sources ?? 0),
      backoffSources: Number(sourceRow?.backoff_sources ?? 0),
      recentSucceededRuns: Number(runRow?.succeeded ?? 0),
      recentFailedRuns: Number(runRow?.failed ?? 0),
      recentDlq: Boolean(lastDlq && lastDlq >= runSince)
    };
  }

  private async getSourceRunByIdempotencyKey(idempotencyKey: string): Promise<SourceRunRecord | null> {
    const row = await first<SourceRunRow>(
      this.db.prepare(
        `SELECT id, source_id, briefing_id, provider, actor_id, actor_run_id, dataset_id,
          state, item_count, estimated_cost_usd, actual_cost_usd, idempotency_key, archive_key, error,
          started_at, completed_at, updated_at
        FROM source_runs
        WHERE idempotency_key = ?`
      ).bind(idempotencyKey)
    );
    return row ? rowToSourceRun(row) : null;
  }

  async sumSourceRunCosts(input: {
    briefingId?: string;
    sourceId?: string;
    actorId?: string;
    since: string;
  }): Promise<number> {
    const values: DbValue[] = [input.since];
    let sql =
      `SELECT SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)) as total
      FROM source_runs
      WHERE started_at >= ?`;
    if (input.briefingId) {
      sql += " AND briefing_id = ?";
      values.push(input.briefingId);
    }
    if (input.sourceId) {
      sql += " AND source_id = ?";
      values.push(input.sourceId);
    }
    if (input.actorId) {
      sql += " AND actor_id = ?";
      values.push(input.actorId);
    }
    const row = await first<{ total: number | null }>(this.db.prepare(sql).bind(...values));
    return Number(row?.total ?? 0);
  }

  async reserveSpend(input: {
    idempotencyKey: string;
    accountId: string;
    briefingId?: string;
    category: SpendCategory;
    provider: SpendProvider;
    amountUsd: number;
    limits: SpendBudgetLimits;
    metadata?: Record<string, unknown>;
  }, now = new Date()): Promise<SpendReservationResult> {
    if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
      throw new Error("Spend reservation amount must be positive.");
    }
    const dayStart = startOfUtcDay(now).toISOString();
    const monthStart = startOfUtcMonth(now).toISOString();
    const dayKey = dayStart.slice(0, 10);
    const monthKey = monthStart.slice(0, 10);
    const timestamp = now.toISOString();
    const idempotencyKeyHash = await sha256Text(input.idempotencyKey);
    const result = await this.db.prepare(
      `WITH usage AS (
        SELECT
          COALESCE(SUM(CASE
            WHEN reservation.account_id = ? AND reservation.category = ? AND reservation.created_at >= ? THEN event.amount_usd
            ELSE 0 END), 0) AS account_day,
          COALESCE(SUM(CASE
            WHEN reservation.account_id = ? AND reservation.category = ? AND reservation.created_at >= ? THEN event.amount_usd
            ELSE 0 END), 0) AS account_month,
          COALESCE(SUM(CASE
            WHEN reservation.category = ? AND reservation.created_at >= ? THEN event.amount_usd
            ELSE 0 END), 0) + COALESCE((
              SELECT SUM(amount_usd)
              FROM spend_daily_aggregates
              WHERE category = ? AND day >= ?
            ), 0) AS global_day,
          COALESCE(SUM(CASE
            WHEN reservation.category = ? AND reservation.created_at >= ? THEN event.amount_usd
            ELSE 0 END), 0) + COALESCE((
              SELECT SUM(amount_usd)
              FROM spend_daily_aggregates
              WHERE category = ? AND day >= ?
            ), 0) AS global_month,
          COALESCE(SUM(CASE
            WHEN reservation.created_at >= ? THEN event.amount_usd
            ELSE 0 END), 0) + COALESCE((
              SELECT SUM(amount_usd)
              FROM spend_daily_aggregates
              WHERE day >= ?
            ), 0) AS total_month
        FROM spend_ledger event
        JOIN spend_ledger reservation
          ON reservation.idempotency_key = event.idempotency_key
          AND reservation.event_type = 'reservation'
      )
      INSERT INTO spend_ledger (
        id, idempotency_key, account_id, briefing_id, category, provider,
        event_type, amount_usd, metadata_json, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, 'reservation', ?, ?, ?
      FROM usage
      WHERE NOT EXISTS (
        SELECT 1 FROM spend_ledger
        WHERE idempotency_key = ? AND event_type = 'reservation'
      )
        AND NOT EXISTS (
          SELECT 1 FROM spend_idempotency_tombstones
          WHERE idempotency_key_hash = ? AND expires_at > ?
        )
        AND account_day + ? <= ?
        AND account_month + ? <= ?
        AND global_day + ? <= ?
        AND global_month + ? <= ?
        AND total_month + ? <= ?`
    ).bind(
      input.accountId,
      input.category,
      dayStart,
      input.accountId,
      input.category,
      monthStart,
      input.category,
      dayStart,
      input.category,
      dayKey,
      input.category,
      monthStart,
      input.category,
      monthKey,
      monthStart,
      monthKey,
      `spend_${crypto.randomUUID()}`,
      input.idempotencyKey,
      input.accountId,
      input.briefingId ?? null,
      input.category,
      input.provider,
      input.amountUsd,
      input.metadata ? JSON.stringify(input.metadata) : null,
      timestamp,
      input.idempotencyKey,
      idempotencyKeyHash,
      timestamp,
      input.amountUsd,
      input.limits.accountDailyUsd,
      input.amountUsd,
      input.limits.accountMonthlyUsd,
      input.amountUsd,
      input.limits.globalDailyUsd,
      input.amountUsd,
      input.limits.globalMonthlyUsd,
      input.amountUsd,
      input.limits.totalMonthlyUsd
    ).run();
    if (Number(result.meta.changes ?? 0) > 0) {
      return {
        status: "created",
        idempotencyKey: input.idempotencyKey,
        reservedUsd: input.amountUsd
      };
    }
    const existing = await first<{ amount_usd: number }>(
      this.db.prepare(
        `SELECT amount_usd
        FROM spend_ledger
        WHERE idempotency_key = ? AND event_type = 'reservation'`
      ).bind(input.idempotencyKey)
    );
    if (existing) {
      return {
        status: "duplicate",
        idempotencyKey: input.idempotencyKey,
        reservedUsd: Number(existing.amount_usd)
      };
    }
    const tombstone = await first<{ idempotency_key_hash: string }>(
      this.db.prepare(
        `SELECT idempotency_key_hash
        FROM spend_idempotency_tombstones
        WHERE idempotency_key_hash = ? AND expires_at > ?`
      ).bind(idempotencyKeyHash, timestamp)
    );
    if (tombstone) {
      return {
        status: "duplicate",
        idempotencyKey: input.idempotencyKey,
        reservedUsd: input.amountUsd
      };
    }
    const accountUsage = await this.getSpendUsage(input.accountId, now);
    const globalUsage = await this.getSpendUsage(undefined, now);
    const categoryAccount = accountUsage[input.category];
    const categoryGlobal = globalUsage[input.category];
    const reason = categoryAccount.dayUsd + input.amountUsd > input.limits.accountDailyUsd
      ? "account_daily"
      : categoryAccount.monthUsd + input.amountUsd > input.limits.accountMonthlyUsd
        ? "account_monthly"
        : categoryGlobal.dayUsd + input.amountUsd > input.limits.globalDailyUsd
          ? "global_daily"
          : categoryGlobal.monthUsd + input.amountUsd > input.limits.globalMonthlyUsd
            ? "global_monthly"
            : "total_monthly";
    return {
      status: "denied",
      idempotencyKey: input.idempotencyKey,
      reservedUsd: input.amountUsd,
      reason
    };
  }

  async settleSpend(input: {
    idempotencyKey: string;
    actualUsd: number;
    metadata?: Record<string, unknown>;
  }, now = new Date()): Promise<void> {
    if (!Number.isFinite(input.actualUsd) || input.actualUsd < 0) {
      throw new Error("Settled spend amount must be non-negative.");
    }
    await this.db.prepare(
      `INSERT OR IGNORE INTO spend_ledger (
        id, idempotency_key, account_id, briefing_id, category, provider,
        event_type, amount_usd, metadata_json, created_at
      )
      SELECT ?, reservation.idempotency_key, reservation.account_id, reservation.briefing_id,
        reservation.category, reservation.provider, 'settlement',
        ? - reservation.amount_usd, ?, ?
      FROM spend_ledger reservation
      WHERE reservation.idempotency_key = ?
        AND reservation.event_type = 'reservation'
        AND NOT EXISTS (
          SELECT 1 FROM spend_ledger terminal
          WHERE terminal.idempotency_key = reservation.idempotency_key
            AND terminal.event_type = 'release'
        )`
    ).bind(
      `spend_${crypto.randomUUID()}`,
      input.actualUsd,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now.toISOString(),
      input.idempotencyKey
    ).run();
  }

  async releaseSpend(input: {
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }, now = new Date()): Promise<void> {
    await this.db.prepare(
      `INSERT OR IGNORE INTO spend_ledger (
        id, idempotency_key, account_id, briefing_id, category, provider,
        event_type, amount_usd, metadata_json, created_at
      )
      SELECT ?, reservation.idempotency_key, reservation.account_id, reservation.briefing_id,
        reservation.category, reservation.provider, 'release',
        -reservation.amount_usd, ?, ?
      FROM spend_ledger reservation
      WHERE reservation.idempotency_key = ?
        AND reservation.event_type = 'reservation'
        AND NOT EXISTS (
          SELECT 1 FROM spend_ledger terminal
          WHERE terminal.idempotency_key = reservation.idempotency_key
            AND terminal.event_type = 'settlement'
        )`
    ).bind(
      `spend_${crypto.randomUUID()}`,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now.toISOString(),
      input.idempotencyKey
    ).run();
  }

  async getSpendUsage(accountId?: string, now = new Date()): Promise<SpendUsage> {
    const dayStart = startOfUtcDay(now).toISOString();
    const monthStart = startOfUtcMonth(now).toISOString();
    const values: DbValue[] = [dayStart, monthStart, dayStart, monthStart, monthStart];
    const accountFilter = accountId ? " AND reservation.account_id = ?" : "";
    if (accountId) values.push(accountId);
    const row = await first<{
      collection_day: number | null;
      collection_month: number | null;
      llm_day: number | null;
      llm_month: number | null;
      total_month: number | null;
    }>(this.db.prepare(
      `SELECT
        SUM(CASE WHEN reservation.category = 'collection' AND reservation.created_at >= ? THEN event.amount_usd ELSE 0 END) AS collection_day,
        SUM(CASE WHEN reservation.category = 'collection' AND reservation.created_at >= ? THEN event.amount_usd ELSE 0 END) AS collection_month,
        SUM(CASE WHEN reservation.category = 'llm' AND reservation.created_at >= ? THEN event.amount_usd ELSE 0 END) AS llm_day,
        SUM(CASE WHEN reservation.category = 'llm' AND reservation.created_at >= ? THEN event.amount_usd ELSE 0 END) AS llm_month,
        SUM(CASE WHEN reservation.created_at >= ? THEN event.amount_usd ELSE 0 END) AS total_month
      FROM spend_ledger event
      JOIN spend_ledger reservation
        ON reservation.idempotency_key = event.idempotency_key
        AND reservation.event_type = 'reservation'
      WHERE 1 = 1${accountFilter}`
    ).bind(...values));
    const aggregate = accountId
      ? null
      : await first<{
          collection_day: number | null;
          collection_month: number | null;
          llm_day: number | null;
          llm_month: number | null;
          total_month: number | null;
        }>(this.db.prepare(
          `SELECT
            SUM(CASE WHEN category = 'collection' AND day >= ? THEN amount_usd ELSE 0 END) AS collection_day,
            SUM(CASE WHEN category = 'collection' AND day >= ? THEN amount_usd ELSE 0 END) AS collection_month,
            SUM(CASE WHEN category = 'llm' AND day >= ? THEN amount_usd ELSE 0 END) AS llm_day,
            SUM(CASE WHEN category = 'llm' AND day >= ? THEN amount_usd ELSE 0 END) AS llm_month,
            SUM(CASE WHEN day >= ? THEN amount_usd ELSE 0 END) AS total_month
          FROM spend_daily_aggregates`
        ).bind(
          dayStart.slice(0, 10),
          monthStart.slice(0, 10),
          dayStart.slice(0, 10),
          monthStart.slice(0, 10),
          monthStart.slice(0, 10)
        ));
    return {
      collection: {
        dayUsd: Number(row?.collection_day ?? 0) + Number(aggregate?.collection_day ?? 0),
        monthUsd: Number(row?.collection_month ?? 0) + Number(aggregate?.collection_month ?? 0)
      },
      llm: {
        dayUsd: Number(row?.llm_day ?? 0) + Number(aggregate?.llm_day ?? 0),
        monthUsd: Number(row?.llm_month ?? 0) + Number(aggregate?.llm_month ?? 0)
      },
      totalMonthUsd: Number(row?.total_month ?? 0) + Number(aggregate?.total_month ?? 0)
    };
  }

  async countStaleSpendReservations(before: string): Promise<number> {
    const row = await first<{ count: number }>(this.db.prepare(
      `SELECT COUNT(*) AS count
      FROM spend_ledger reservation
      WHERE reservation.event_type = 'reservation'
        AND reservation.created_at < ?
        AND NOT EXISTS (
          SELECT 1 FROM spend_ledger terminal
          WHERE terminal.idempotency_key = reservation.idempotency_key
            AND terminal.event_type IN ('settlement', 'release')
        )`
    ).bind(before));
    return Number(row?.count ?? 0);
  }

  async reconcileStaleSpendReservations(
    before: string,
    now = new Date(),
    limit = 100
  ): Promise<{ reconciled: number; hasMore: boolean }> {
    const boundedLimit = Math.min(1_000, Math.max(1, Math.trunc(limit)));
    const result = await this.db.prepare(
      `WITH stale AS (
        SELECT reservation.*
        FROM spend_ledger reservation
        WHERE reservation.event_type = 'reservation'
          AND reservation.created_at < ?
          AND NOT EXISTS (
            SELECT 1 FROM spend_ledger terminal
            WHERE terminal.idempotency_key = reservation.idempotency_key
              AND terminal.event_type IN ('settlement', 'release')
          )
          AND NOT EXISTS (
            SELECT 1 FROM source_runs active_run
            WHERE active_run.idempotency_key = reservation.idempotency_key
              AND active_run.state IN ('queued', 'running')
              AND active_run.updated_at >= ?
          )
        ORDER BY reservation.created_at ASC, reservation.id ASC
        LIMIT ?
      )
      INSERT OR IGNORE INTO spend_ledger (
        id, idempotency_key, account_id, briefing_id, category, provider,
        event_type, amount_usd, metadata_json, created_at
      )
      SELECT
        'spend_reconcile_' || lower(hex(randomblob(16))),
        reservation.idempotency_key,
        reservation.account_id,
        reservation.briefing_id,
        reservation.category,
        reservation.provider,
        CASE WHEN reservation.category = 'collection' AND NOT EXISTS (
          SELECT 1 FROM source_runs
          WHERE source_runs.idempotency_key = reservation.idempotency_key
        ) THEN 'release' ELSE 'settlement' END,
        CASE WHEN reservation.category = 'collection' AND NOT EXISTS (
          SELECT 1 FROM source_runs
          WHERE source_runs.idempotency_key = reservation.idempotency_key
        ) THEN -reservation.amount_usd ELSE 0 END,
        CASE WHEN reservation.category = 'collection' AND NOT EXISTS (
          SELECT 1 FROM source_runs
          WHERE source_runs.idempotency_key = reservation.idempotency_key
        )
          THEN '{"reason":"stale_pre_provider_reservation_release"}'
          ELSE '{"reason":"stale_reservation_conservative_settlement"}'
        END,
        ?
      FROM stale reservation`
    ).bind(before, before, boundedLimit, now.toISOString()).run();
    const reconciled = Number(result.meta.changes ?? 0);
    return { reconciled, hasMore: reconciled >= boundedLimit };
  }

  async archiveExpiredSpend(now = new Date(), limit = SPEND_RETENTION_BATCH_LIMIT): Promise<SpendRetentionResult> {
    const leaseToken = await this.acquireSpendRetentionLease(now);
    if (!leaseToken) {
      return {
        archivedOperations: 0,
        detailRowsDeleted: 0,
        aggregatesDeleted: 0,
        tombstonesDeleted: 0,
        hasMore: true
      };
    }
    try {
      const cutoff = new Date(now.getTime() - SPEND_DETAIL_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const archived = await this.archiveSpendOperations({
        before: cutoff,
        requireTerminal: true,
        now,
        limit
      });
      const aggregateCutoff = subtractUtcMonths(now, SPEND_AGGREGATE_RETENTION_MONTHS).toISOString().slice(0, 10);
      const boundedLimit = Math.min(1_000, Math.max(1, Math.trunc(limit)));
      const cleanup = await this.db.batch([
        this.db.prepare(
          `DELETE FROM spend_daily_aggregates
          WHERE rowid IN (
            SELECT rowid
            FROM spend_daily_aggregates
            WHERE day < ?
            ORDER BY day ASC, category ASC, provider ASC
            LIMIT ?
          )`
        ).bind(aggregateCutoff, boundedLimit),
        this.db.prepare(
          `DELETE FROM spend_idempotency_tombstones
          WHERE idempotency_key_hash IN (
            SELECT idempotency_key_hash
            FROM spend_idempotency_tombstones
            WHERE expires_at <= ?
            ORDER BY expires_at ASC, idempotency_key_hash ASC
            LIMIT ?
          )`
        ).bind(now.toISOString(), boundedLimit)
      ]);
      const aggregatesDeleted = Number(cleanup[0]?.meta.changes ?? 0);
      const tombstonesDeleted = Number(cleanup[1]?.meta.changes ?? 0);
      return {
        ...archived,
        aggregatesDeleted,
        tombstonesDeleted,
        hasMore: archived.hasMore ||
          aggregatesDeleted >= boundedLimit ||
          tombstonesDeleted >= boundedLimit
      };
    } finally {
      await this.releaseSpendRetentionLease(leaseToken, now);
    }
  }

  private async archiveAccountSpendDetails(accountId: string, now: Date): Promise<void> {
    const leaseToken = await this.acquireSpendRetentionLease(now);
    if (!leaseToken) throw new Error("Spend retention is busy; retry account deletion.");
    try {
      let hasMore = true;
      while (hasMore) {
        const result = await this.archiveSpendOperations({
          accountId,
          requireTerminal: false,
          now,
          limit: SPEND_RETENTION_BATCH_LIMIT
        });
        hasMore = result.hasMore;
      }
    } finally {
      await this.releaseSpendRetentionLease(leaseToken, now);
    }
  }

  private async acquireSpendRetentionLease(now: Date): Promise<string | null> {
    const leaseToken = crypto.randomUUID();
    const leaseUntil = new Date(now.getTime() + SPEND_RETENTION_LEASE_MS).toISOString();
    const result = await this.db.prepare(
      `UPDATE spend_retention_lease
      SET lease_token = ?, lease_until = ?, updated_at = ?
      WHERE id = 1
        AND (lease_until IS NULL OR lease_until <= ?)`
    ).bind(leaseToken, leaseUntil, now.toISOString(), now.toISOString()).run();
    return Number(result.meta.changes ?? 0) > 0 ? leaseToken : null;
  }

  private async releaseSpendRetentionLease(leaseToken: string, now: Date): Promise<void> {
    await this.db.prepare(
      `UPDATE spend_retention_lease
      SET lease_token = NULL, lease_until = NULL, updated_at = ?
      WHERE id = 1 AND lease_token = ?`
    ).bind(now.toISOString(), leaseToken).run();
  }

  private async archiveSpendOperations(input: {
    accountId?: string;
    before?: string;
    requireTerminal: boolean;
    now: Date;
    limit: number;
  }): Promise<Pick<SpendRetentionResult, "archivedOperations" | "detailRowsDeleted" | "hasMore">> {
    const boundedLimit = Math.min(
      SPEND_RETENTION_BATCH_LIMIT,
      Math.max(1, Math.trunc(input.limit))
    );
    const filters = ["reservation.event_type = 'reservation'"];
    const values: DbValue[] = [];
    if (input.accountId) {
      filters.push("reservation.account_id = ?");
      values.push(input.accountId);
    }
    if (input.before) {
      filters.push("reservation.created_at < ?");
      values.push(input.before);
    }
    if (input.requireTerminal) {
      filters.push(
        `EXISTS (
          SELECT 1
          FROM spend_ledger terminal
          WHERE terminal.idempotency_key = reservation.idempotency_key
            AND terminal.event_type IN ('settlement', 'release')
        )`
      );
    }
    const rows = await all<{
      idempotency_key: string;
      category: SpendCategory;
      provider: SpendProvider;
      created_at: string;
      amount_usd: number;
      detail_rows: number;
    }>(this.db.prepare(
      `SELECT
        reservation.idempotency_key,
        reservation.category,
        reservation.provider,
        reservation.created_at,
        SUM(event.amount_usd) AS amount_usd,
        COUNT(event.id) AS detail_rows
      FROM spend_ledger reservation
      JOIN spend_ledger event
        ON event.idempotency_key = reservation.idempotency_key
      WHERE ${filters.join("\n        AND ")}
      GROUP BY reservation.idempotency_key, reservation.category, reservation.provider, reservation.created_at
      ORDER BY reservation.created_at ASC, reservation.idempotency_key ASC
      LIMIT ?`
    ).bind(...values, boundedLimit + 1));
    const hasMore = rows.length > boundedLimit;
    const candidates = rows.slice(0, boundedLimit);
    if (candidates.length === 0) {
      return { archivedOperations: 0, detailRowsDeleted: 0, hasMore: false };
    }

    const aggregateGroups = new Map<string, {
      day: string;
      category: SpendCategory;
      provider: SpendProvider;
      amountUsd: number;
      operationCount: number;
    }>();
    for (const candidate of candidates) {
      const day = candidate.created_at.slice(0, 10);
      const key = `${day}|${candidate.category}|${candidate.provider}`;
      const existing = aggregateGroups.get(key);
      if (existing) {
        existing.amountUsd += Number(candidate.amount_usd);
        existing.operationCount += 1;
      } else {
        aggregateGroups.set(key, {
          day,
          category: candidate.category,
          provider: candidate.provider,
          amountUsd: Number(candidate.amount_usd),
          operationCount: 1
        });
      }
    }

    const statements: D1PreparedStatement[] = [];
    for (const aggregate of aggregateGroups.values()) {
      statements.push(this.db.prepare(
        `INSERT INTO spend_daily_aggregates (
          day, category, provider, amount_usd, operation_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(day, category, provider) DO UPDATE SET
          amount_usd = spend_daily_aggregates.amount_usd + excluded.amount_usd,
          operation_count = spend_daily_aggregates.operation_count + excluded.operation_count,
          updated_at = excluded.updated_at`
      ).bind(
        aggregate.day,
        aggregate.category,
        aggregate.provider,
        aggregate.amountUsd,
        aggregate.operationCount,
        input.now.toISOString(),
        input.now.toISOString()
      ));
    }
    for (const candidate of candidates) {
      const expiresAt = addUtcMonths(new Date(candidate.created_at), SPEND_AGGREGATE_RETENTION_MONTHS).toISOString();
      statements.push(this.db.prepare(
        `INSERT OR IGNORE INTO spend_idempotency_tombstones (
          idempotency_key_hash, first_created_at, expires_at, created_at
        ) VALUES (?, ?, ?, ?)`
      ).bind(
        await sha256Text(candidate.idempotency_key),
        candidate.created_at,
        expiresAt,
        input.now.toISOString()
      ));
    }
    const placeholders = candidates.map(() => "?").join(", ");
    const deleteIndex = statements.length;
    statements.push(this.db.prepare(
      `DELETE FROM spend_ledger
      WHERE idempotency_key IN (${placeholders})`
    ).bind(...candidates.map((candidate) => candidate.idempotency_key)));
    const results = await this.db.batch(statements);
    return {
      archivedOperations: candidates.length,
      detailRowsDeleted: Number(results[deleteIndex]?.meta.changes ?? 0),
      hasMore
    };
  }

  async recordLlmUsage(input: {
    briefingId: string;
    model: string;
    purpose: "summary" | "importance_review" | "event_review" | "edition_summary";
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  }, now = new Date()): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO llm_usage_events (
          id, briefing_id, model, purpose, input_tokens, output_tokens, estimated_cost_usd, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        `llm_usage_${crypto.randomUUID()}`,
        input.briefingId,
        input.model,
        input.purpose,
        input.inputTokens,
        input.outputTokens,
        input.estimatedCostUsd,
        now.toISOString()
      )
      .run();
  }

  async sumLlmUsageCost(input: {
    briefingId?: string;
    since: string;
  }): Promise<number> {
    const row = input.briefingId
      ? await first<{ total: number | null }>(this.db.prepare(
          "SELECT SUM(estimated_cost_usd) as total FROM llm_usage_events WHERE briefing_id = ? AND created_at >= ?"
        ).bind(input.briefingId, input.since))
      : await first<{ total: number | null }>(this.db.prepare(
          "SELECT SUM(estimated_cost_usd) as total FROM llm_usage_events WHERE created_at >= ?"
        ).bind(input.since));
    return Number(row?.total ?? 0);
  }

  async getSetting(key: string): Promise<string | null> {
    const row = await first<{ value: string }>(this.db.prepare("SELECT value FROM settings WHERE key = ?").bind(key));
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string, now = new Date()): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      )
      .bind(key, value, now.toISOString())
      .run();
  }

  async saveRegistrationEmailReceipt(input: {
    nonceHash: string;
    releaseSha: string;
    recipientFingerprint: string;
    expiresAt: string;
  }, now = new Date()): Promise<void> {
    await this.db.batch([
      this.db
        .prepare("DELETE FROM registration_email_receipts WHERE expires_at <= ?")
        .bind(now.toISOString()),
      this.db
        .prepare(
          `INSERT INTO registration_email_receipts (
            nonce_hash, release_sha, recipient_fingerprint, expires_at
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(release_sha, recipient_fingerprint) DO UPDATE SET
            nonce_hash = excluded.nonce_hash,
            expires_at = excluded.expires_at`
        )
        .bind(
          input.nonceHash,
          input.releaseSha,
          input.recipientFingerprint,
          input.expiresAt
        )
    ]);
  }

  async consumeRegistrationEmailReceipt(input: {
    nonceHash: string;
    releaseSha: string;
    recipientFingerprint: string;
  }, now = new Date()): Promise<boolean> {
    const result = await this.db
      .prepare(
        `DELETE FROM registration_email_receipts
        WHERE nonce_hash = ?
          AND release_sha = ?
          AND recipient_fingerprint = ?
          AND expires_at > ?`
      )
      .bind(
        input.nonceHash,
        input.releaseSha,
        input.recipientFingerprint,
        now.toISOString()
      )
      .run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async recordOperationalEvent(
    input: Omit<OperationalEvent, "id" | "occurredAt">,
    now = new Date()
  ): Promise<void> {
    await this.db.prepare(
      `INSERT INTO operational_events (
        id, category, subsystem, status, body_type, body_id, release_sha, detail, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      `operation_${crypto.randomUUID()}`,
      input.category,
      input.subsystem.slice(0, 100),
      input.status,
      input.bodyType?.slice(0, 100) ?? null,
      input.bodyId?.slice(0, 200) ?? null,
      input.releaseSha?.slice(0, 100) ?? null,
      input.detail?.slice(0, 200) ?? null,
      now.toISOString()
    ).run();
  }

  async listOperationalEvents(input: {
    since: string;
    category?: OperationalEvent["category"];
    status?: OperationalEvent["status"];
    limit?: number;
  }): Promise<OperationalEvent[]> {
    const conditions = ["occurred_at >= ?"];
    const bindings: DbValue[] = [input.since];
    if (input.category) {
      conditions.push("category = ?");
      bindings.push(input.category);
    }
    if (input.status) {
      conditions.push("status = ?");
      bindings.push(input.status);
    }
    const limit = Math.min(500, Math.max(1, input.limit ?? 100));
    bindings.push(limit);
    const rows = await all<{
      id: string;
      category: OperationalEvent["category"];
      subsystem: string;
      status: OperationalEvent["status"];
      body_type: string | null;
      body_id: string | null;
      release_sha: string | null;
      detail: string | null;
      occurred_at: string;
    }>(this.db.prepare(
      `SELECT id, category, subsystem, status, body_type, body_id, release_sha, detail, occurred_at
      FROM operational_events
      WHERE ${conditions.join(" AND ")}
      ORDER BY occurred_at DESC, id DESC
      LIMIT ?`
    ).bind(...bindings));
    return rows.map((row) => ({
      id: row.id,
      category: row.category,
      subsystem: row.subsystem,
      status: row.status,
      bodyType: row.body_type ?? undefined,
      bodyId: row.body_id ?? undefined,
      releaseSha: row.release_sha ?? undefined,
      detail: row.detail ?? undefined,
      occurredAt: row.occurred_at
    }));
  }

  async deleteOperationalEventsBefore(before: string, limit = 1_000): Promise<{ deleted: number; hasMore: boolean }> {
    const boundedLimit = Math.min(5_000, Math.max(1, Math.trunc(limit)));
    const result = await this.db.prepare(
      `DELETE FROM operational_events
      WHERE id IN (
        SELECT id FROM operational_events
        WHERE occurred_at < ?
        ORDER BY occurred_at ASC, id ASC
        LIMIT ?
      )`
    ).bind(before, boundedLimit).run();
    const deleted = Number(result.meta.changes ?? 0);
    return { deleted, hasMore: deleted >= boundedLimit };
  }

  async listExpiredRawPayloadKeys(now = new Date(), limit = 1_000): Promise<string[]> {
    if (limit <= 0) return [];
    const sourceRunCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const rows = await all<{ payload_key: string }>(
      this.db
        .prepare(
          `WITH candidate_keys(payload_key) AS (
            SELECT raw_payload_key
            FROM raw_messages
            WHERE raw_payload_key IS NOT NULL
              AND raw_payload_key != ''
            GROUP BY raw_payload_key
            HAVING MAX(expires_at) <= ?
            UNION
            SELECT archive_key
            FROM source_runs
            WHERE archive_key IS NOT NULL
              AND archive_key != ''
              AND COALESCE(completed_at, started_at, created_at) <= ?
          )
          SELECT payload_key
          FROM candidate_keys
          WHERE NOT EXISTS (
            SELECT 1
            FROM raw_messages
            WHERE raw_messages.raw_payload_key = candidate_keys.payload_key
              AND raw_messages.expires_at > ?
          )
            AND NOT EXISTS (
              SELECT 1
              FROM source_runs
              WHERE source_runs.archive_key = candidate_keys.payload_key
                AND COALESCE(source_runs.completed_at, source_runs.started_at, source_runs.created_at) > ?
          )
          ORDER BY payload_key ASC
          LIMIT ?`
        )
        .bind(now.toISOString(), sourceRunCutoff, now.toISOString(), sourceRunCutoff, limit)
    );
    return rows.map((row) => row.payload_key);
  }

  async clearExpiredSourceRunArchiveKeys(before: string, archiveKeys?: string[]): Promise<number> {
    if (archiveKeys && archiveKeys.length === 0) return 0;
    const keyFilter = archiveKeys
      ? ` AND archive_key IN (${archiveKeys.map(() => "?").join(", ")})`
      : "";
    const result = await this.db.prepare(
      `UPDATE source_runs
      SET archive_key = NULL
      WHERE archive_key IS NOT NULL
        AND COALESCE(completed_at, started_at, created_at) <= ?${keyFilter}`
    ).bind(before, ...(archiveKeys ?? [])).run();
    return Number(result.meta.changes ?? 0);
  }

  async clearExpiredRawPayloadKeys(before: string, archiveKeys: string[]): Promise<number> {
    if (archiveKeys.length === 0) return 0;
    const placeholders = archiveKeys.map(() => "?").join(", ");
    const result = await this.db.prepare(
      `UPDATE raw_messages
      SET raw_payload_key = NULL
      WHERE raw_payload_key IN (${placeholders})
        AND expires_at <= ?`
    ).bind(...archiveKeys, before).run();
    return Number(result.meta.changes ?? 0);
  }

  async deleteExpired(now = new Date(), limit = 1_000): Promise<{ deleted: number; hasMore: boolean }> {
    const timestamp = now.toISOString();
    const editionCutoff = new Date(now.getTime() - FIXED_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const sourceRunCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const llmUsageCutoff = new Date(now.getTime() - SPEND_DETAIL_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const authAttemptCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const boundedLimit = Math.min(5_000, Math.max(1, Math.trunc(limit)));
    const results = await this.db.batch([
      this.db.prepare(
        `DELETE FROM raw_messages
        WHERE id IN (
          SELECT id FROM raw_messages
          WHERE expires_at <= ?
          ORDER BY expires_at ASC, id ASC
          LIMIT ?
        )`
      ).bind(timestamp, boundedLimit),
      this.db.prepare(
        `DELETE FROM briefing_items
        WHERE id IN (
          SELECT id FROM briefing_items
          WHERE expires_at <= ?
          ORDER BY expires_at ASC, id ASC
          LIMIT ?
        )`
      ).bind(timestamp, boundedLimit),
      this.db.prepare(
        `DELETE FROM clusters
        WHERE id IN (
          SELECT id FROM clusters
          WHERE expires_at <= ?
          ORDER BY expires_at ASC, id ASC
          LIMIT ?
        )`
      ).bind(timestamp, boundedLimit),
      this.db.prepare(
        `DELETE FROM briefing_editions
        WHERE id IN (
          SELECT id FROM briefing_editions
          WHERE published_at <= ?
          ORDER BY published_at ASC, id ASC
          LIMIT ?
        )`
      ).bind(editionCutoff, boundedLimit),
      this.db.prepare(
        `DELETE FROM briefing_windows
        WHERE id IN (
          SELECT id FROM briefing_windows
          WHERE window_end <= ?
          ORDER BY window_end ASC, id ASC
          LIMIT ?
        )`
      ).bind(editionCutoff, boundedLimit),
      this.db.prepare(
        `DELETE FROM source_runs
        WHERE id IN (
          SELECT id FROM source_runs
          WHERE state IN ('succeeded', 'failed')
            AND archive_key IS NULL
            AND completed_at IS NOT NULL
            AND completed_at <= ?
          ORDER BY completed_at ASC, id ASC
          LIMIT ?
        )`
      ).bind(sourceRunCutoff, boundedLimit),
      this.db.prepare(
        `DELETE FROM briefing_item_event_keys
        WHERE rowid IN (
          SELECT briefing_item_event_keys.rowid
          FROM briefing_item_event_keys
          LEFT JOIN briefing_items ON briefing_items.id = briefing_item_event_keys.briefing_item_id
          WHERE briefing_items.id IS NULL
          ORDER BY briefing_item_event_keys.created_at ASC
          LIMIT ?
        )`
      ).bind(boundedLimit),
      this.db.prepare(
        `DELETE FROM auth_tokens
        WHERE id IN (
          SELECT id FROM auth_tokens
          WHERE expires_at <= ?
          ORDER BY expires_at ASC, id ASC
          LIMIT ?
        )`
      ).bind(timestamp, boundedLimit),
      this.db.prepare(
        `DELETE FROM auth_attempts
        WHERE id IN (
          SELECT id FROM auth_attempts
          WHERE created_at <= ?
          ORDER BY created_at ASC, id ASC
          LIMIT ?
        )`
      ).bind(authAttemptCutoff, boundedLimit),
      this.db.prepare(
        `DELETE FROM llm_usage_events
        WHERE id IN (
          SELECT id FROM llm_usage_events
          WHERE created_at <= ?
          ORDER BY created_at ASC, id ASC
          LIMIT ?
        )`
      ).bind(llmUsageCutoff, boundedLimit)
    ]);
    const changes = results.map((result) => Number(result.meta.changes ?? 0));
    return {
      deleted: changes.reduce((total, count) => total + count, 0),
      // A full batch may be the last batch. Reporting more work is harmless and
      // keeps every invocation strictly bounded without extra count scans.
      hasMore: changes.some((count) => count >= boundedLimit)
    };
  }

  private async getEvidence(itemId: string): Promise<BriefingEvidence[]> {
    const rows = await all<EvidenceRow>(
      this.db
        .prepare(
          `SELECT raw_message_id, source_id, source_title, source_type, source_provider, source_kind,
            source_url, posted_at, text, links_json, media_json
          FROM briefing_item_evidence
          WHERE briefing_item_id = ?
          ORDER BY posted_at ASC`
        )
        .bind(itemId)
    );
    return rows.map(rowToEvidence);
  }

  private async getEvidenceByItemIds(itemIds: string[]): Promise<Map<string, BriefingEvidence[]>> {
    const evidenceByItemId = new Map<string, BriefingEvidence[]>();
    const uniqueItemIds = Array.from(new Set(itemIds));
    for (const itemId of uniqueItemIds) evidenceByItemId.set(itemId, []);

    const batchSize = 100;
    for (let index = 0; index < uniqueItemIds.length; index += batchSize) {
      const batch = uniqueItemIds.slice(index, index + batchSize);
      if (batch.length === 0) continue;
      const placeholders = batch.map(() => "?").join(", ");
      const rows = await all<EvidenceWithItemRow>(
        this.db
          .prepare(
            `SELECT briefing_item_id, raw_message_id, source_id, source_title, source_type, source_provider, source_kind,
              source_url, posted_at, text, links_json, media_json
            FROM briefing_item_evidence
            WHERE briefing_item_id IN (${placeholders})
            ORDER BY briefing_item_id ASC, posted_at ASC`
          )
          .bind(...batch)
      );

      for (const row of rows) evidenceByItemId.get(row.briefing_item_id)?.push(rowToEvidence(row));
    }

    return evidenceByItemId;
  }

  private async resolveDuplicateTarget(
    briefingId: string,
    inputItem: BriefingItem,
    briefing: BriefingConfig | undefined,
    now: Date
  ): Promise<BriefingItem> {
    const item = {
      ...inputItem,
      eventKey: inputItem.eventKey ?? primaryEventKeyForEvidence(inputItem.evidence)
    };
    const targetId = await this.findDuplicateItemId(briefingId, item);
    if (!targetId || targetId === item.id) return item;
    const target = await this.getBriefingItemById(briefingId, targetId, now);
    return target ? mergeBriefingItem(target, item, briefing) : item;
  }

  private async findDuplicateItemId(briefingId: string, item: BriefingItem): Promise<string | undefined> {
    const rawMessageIds = Array.from(new Set(item.evidence.map((entry) => entry.messageId)));
    if (rawMessageIds.length > 0) {
      const placeholders = rawMessageIds.map(() => "?").join(", ");
      const row = await first<{ briefing_item_id: string }>(
        this.db
          .prepare(
            `SELECT briefing_item_evidence.briefing_item_id
             FROM briefing_item_evidence
             JOIN briefing_items ON briefing_items.id = briefing_item_evidence.briefing_item_id
             WHERE briefing_items.briefing_id = ?
               AND briefing_item_evidence.raw_message_id IN (${placeholders})
             ORDER BY briefing_items.item_at DESC
             LIMIT 1`
          )
          .bind(briefingId, ...rawMessageIds)
      );
      if (row?.briefing_item_id) return row.briefing_item_id;
    }

    const eventKeys = eventKeysForItem(item);
    if (eventKeys.length === 0) return undefined;
    const placeholders = eventKeys.map(() => "?").join(", ");
    const row = await first<{ briefing_item_id: string }>(
      this.db
        .prepare(
          `SELECT briefing_item_id
           FROM briefing_item_event_keys
           WHERE briefing_id = ?
             AND event_key IN (${placeholders})
           LIMIT 1`
        )
        .bind(briefingId, ...eventKeys)
    );
    return row?.briefing_item_id;
  }

  private async getBriefingItemById(
    briefingId: string,
    itemId: string,
    now = new Date()
  ): Promise<BriefingItem | null> {
    const row = await first<BriefingItemRow>(
      this.db
        .prepare(
          `SELECT id, cluster_id, event_key, summary, item_at, updated_at, expires_at, merged_update_count
           FROM briefing_items
           WHERE briefing_id = ?
             AND id = ?
             AND expires_at > ?`
        )
        .bind(briefingId, itemId, now.toISOString())
    );
    return row ? { ...rowToBriefingItem(row), evidence: await this.getEvidence(row.id) } : null;
  }

  private async writeBriefingItem(
    briefingId: string,
    inputItem: BriefingItem,
    timestamp: string
  ): Promise<void> {
    const item = {
      ...inputItem,
      eventKey: inputItem.eventKey ?? primaryEventKeyForEvidence(inputItem.evidence),
      mergedUpdateCount: Math.max(0, inputItem.evidence.length - 1)
    };

    await this.db
      .prepare(
        `INSERT INTO clusters (id, briefing_id, status, first_seen_at, last_updated_at, expires_at)
        VALUES (?, ?, 'published', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = 'published',
          last_updated_at = excluded.last_updated_at,
          expires_at = excluded.expires_at`
      )
      .bind(item.clusterId, briefingId, item.itemAt, item.updatedAt, item.expiresAt)
      .run();

    await this.db
      .prepare(
        `INSERT INTO briefing_items (
          id, briefing_id, cluster_id, event_key, summary, item_at, updated_at, expires_at, merged_update_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          cluster_id = excluded.cluster_id,
          event_key = excluded.event_key,
          summary = excluded.summary,
          item_at = excluded.item_at,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at,
          merged_update_count = excluded.merged_update_count`
      )
      .bind(
        item.id,
        briefingId,
        item.clusterId,
        item.eventKey,
        item.summary,
        item.itemAt,
        item.updatedAt,
        item.expiresAt,
        item.mergedUpdateCount
      )
      .run();

    await this.db
      .prepare("DELETE FROM briefing_item_event_keys WHERE briefing_item_id = ?")
      .bind(item.id)
      .run();

    for (const eventKey of eventKeysForItem(item)) {
      await this.db
        .prepare(
          `INSERT OR IGNORE INTO briefing_item_event_keys (briefing_id, event_key, briefing_item_id, created_at)
           VALUES (?, ?, ?, ?)`
        )
        .bind(briefingId, eventKey, item.id, timestamp)
        .run();
    }

    for (const evidence of item.evidence) {
      await this.db
        .prepare(
          `INSERT OR IGNORE INTO briefing_item_evidence (
            id, briefing_item_id, raw_message_id, source_id, source_title, source_type,
            source_provider, source_kind, source_url, posted_at, text, links_json, media_json
          )
          SELECT ?, briefing_items.id, raw_messages.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          FROM briefing_items
          JOIN raw_messages ON raw_messages.id = ?
          WHERE briefing_items.id = ?`
        )
        .bind(
          `evidence_${item.id}_${evidence.messageId}`,
          evidence.sourceId,
          evidence.sourceTitle,
          evidence.sourceType,
          evidence.sourceProvider ?? null,
          evidence.sourceKind ?? null,
          evidence.sourceUrl ?? null,
          evidence.postedAt,
          evidence.text,
          JSON.stringify(evidence.links),
          JSON.stringify(evidence.media),
          evidence.messageId,
          item.id
        )
        .run();
    }
  }

  private async deleteBriefingItems(itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;
    const placeholders = itemIds.map(() => "?").join(", ");
    await this.db.prepare(`DELETE FROM briefing_item_event_keys WHERE briefing_item_id IN (${placeholders})`).bind(...itemIds).run();
    await this.db.prepare(`DELETE FROM briefing_item_evidence WHERE briefing_item_id IN (${placeholders})`).bind(...itemIds).run();
    await this.db.prepare(`DELETE FROM briefing_items WHERE id IN (${placeholders})`).bind(...itemIds).run();
  }
}

export class InMemoryRepository implements Repository {
  accounts = new Map<string, AccountRecord & { passwordHash: string }>();
  aliases = new Map<string, UsernameAliasRecord>();
  retiredUsernameHashes = new Set<string>();
  tokens = new Map<string, AuthTokenRecord>();
  attempts: Array<{ key: string; action: string; createdAt: string }> = [];
  briefings = new Map<string, BriefingConfig>();
  briefingCreatedAt = new Map<string, string>();
  sources = new Map<string, SourceRecord>();
  paidProviderSeats = new Set<string>();
  sourceRuns = new Map<string, SourceRunRecord>();
  spendLedger: Array<{
    idempotencyKey: string;
    accountId: string;
    briefingId?: string;
    category: SpendCategory;
    provider: SpendProvider;
    eventType: "reservation" | "settlement" | "release";
    amountUsd: number;
    createdAt: string;
  }> = [];
  spendDailyAggregates = new Map<string, {
    day: string;
    category: SpendCategory;
    provider: SpendProvider;
    amountUsd: number;
    operationCount: number;
  }>();
  spendIdempotencyTombstones = new Map<string, string>();
  canonicalRefreshes = new Map<string, {
    leaseToken?: string;
    leaseUntil?: string;
    nextRefreshAt?: string;
    lastError?: string;
  }>();
  llmUsageEvents: Array<{
    briefingId: string;
    model: string;
    purpose: "summary" | "importance_review" | "event_review" | "edition_summary";
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    createdAt: string;
  }> = [];
  rawMessages = new Map<string, NormalizedMessage>();
  itemsByBriefing = new Map<string, Map<string, BriefingItem>>();
  editionsByBriefing = new Map<string, Map<string, BriefingEdition>>();
  starsByBriefing = new Map<string, Set<string>>();
  jobs = new Map<string, {
    id: string;
    briefingId: string;
    rawMessageId: string;
    state: "queued" | "completed" | "failed";
    error?: string;
    leaseToken?: string;
    leaseUntil?: string;
    attemptCount: number;
    availableAt?: string;
    completedAt?: string;
    lastEnqueuedAt?: string;
    updatedAt: string;
  }>();
  briefingWindows = new Map<string, {
    id: string;
    briefingId: string;
    cadence: "hourly" | "daily" | "weekly" | "monthly";
    windowStart: string;
    windowEnd: string;
    state: "running" | "published" | "empty" | "failed";
    leaseToken?: string;
    leaseUntil?: string;
    messageCount: number;
    editionId?: string;
    contentCutoffAt?: string;
    qualityState?: "ready" | "degraded";
    preparedAt?: string;
    recoveryAttemptedAt?: string;
    error?: string;
  }>();
  settings = new Map<string, string>();
  registrationEmailReceipts = new Map<string, {
    nonceHash: string;
    releaseSha: string;
    recipientFingerprint: string;
    expiresAt: string;
  }>();
  operationalEvents: OperationalEvent[] = [];

  async createAccount(input: {
    email: string;
    username: string;
    role: AccountRole;
    passwordHash: string;
    emailVerifiedAt?: string;
    termsAcceptedAt?: string;
    termsVersion?: string;
    privacyVersion?: string;
    acceptableUseVersion?: string;
  }, now = new Date(), quota?: AccountQuota): Promise<AccountRecord> {
    const username = normalizeUsername(input.username);
    if (await this.isUsernameRetired(username)) {
      throw new Error("username is permanently unavailable");
    }
    const conflictingAlias = this.aliases.get(username);
    if (conflictingAlias || Array.from(this.accounts.values()).some((account) => account.username === username)) {
      throw new Error("username is already taken");
    }
    if (Array.from(this.accounts.values()).some((account) => account.email === input.email)) {
      throw new Error("email is already registered");
    }
    const pendingCount = Array.from(this.accounts.values()).filter((account) => !account.emailVerifiedAt).length;
    if (quota && (this.accounts.size >= quota.maxAccounts ||
      (!input.emailVerifiedAt && quota.maxPendingAccounts !== undefined && pendingCount >= quota.maxPendingAccounts))) {
      throw new QuotaExceededError("account capacity reached");
    }
    const id = `account_${this.accounts.size + 1}`;
    const timestamp = now.toISOString();
    const account = {
      id,
      email: input.email,
      username,
      role: input.role,
      passwordHash: input.passwordHash,
      emailVerifiedAt: input.emailVerifiedAt,
      termsAcceptedAt: input.termsAcceptedAt,
      termsVersion: input.termsVersion,
      privacyVersion: input.privacyVersion,
      acceptableUseVersion: input.acceptableUseVersion,
      sessionVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.accounts.set(id, account);
    this.aliases.set(username, { username, accountId: id, isCurrent: true, createdAt: timestamp });
    return rowlessAccount(account);
  }

  async bootstrapAdmin(input: {
    email: string;
    username: string;
    passwordHash: string;
    emailVerifiedAt: string;
    briefing: BriefingConfig;
  }, now = new Date()): Promise<AccountRecord | null> {
    if (await this.countAdmins()) return null;
    const account = await this.createAccount({
      email: input.email,
      username: input.username,
      role: "admin",
      passwordHash: input.passwordHash,
      emailVerifiedAt: input.emailVerifiedAt
    }, now);
    await this.upsertBriefing({
      ...input.briefing,
      id: `briefing_${account.id}_personal`,
      ownerAccountId: account.id,
      ownerUsername: account.username
    }, now);
    return account;
  }

  async listAccounts(): Promise<AccountWithStats[]> {
    return Array.from(this.accounts.values()).map((account) => ({
      ...rowlessAccount(account),
      briefingCount: Array.from(this.briefings.values()).filter((briefing) => briefing.ownerAccountId === account.id).length
    }));
  }

  async countAccounts(): Promise<number> {
    return this.accounts.size;
  }

  async countPendingAccounts(): Promise<number> {
    return Array.from(this.accounts.values()).filter((account) => !account.emailVerifiedAt).length;
  }

  async deleteStaleUnverifiedAccounts(
    createdBefore: string,
    tokenExpiredBefore: string,
    absoluteCreatedBefore: string,
    limit: number
  ): Promise<number> {
    const candidates = Array.from(this.accounts.values())
      .filter((account) =>
        account.role === "user" &&
        !account.emailVerifiedAt &&
        !Array.from(this.briefings.values()).some((briefing) => briefing.ownerAccountId === account.id) &&
        (account.createdAt <= absoluteCreatedBefore ||
          (account.createdAt <= createdBefore &&
            !Array.from(this.tokens.values()).some((token) =>
              token.accountId === account.id &&
              token.purpose === "email_verification" &&
              !token.consumedAt &&
              token.expiresAt > tokenExpiredBefore
            )))
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .slice(0, Math.max(0, limit));
    let deleted = 0;
    for (const account of candidates) {
      await this.deleteAccount(account.id, new Date(), { retireUsernames: false });
      if (!this.accounts.has(account.id)) deleted += 1;
    }
    return deleted;
  }

  async deleteAccount(
    id: string,
    now = new Date(),
    options: { retireUsernames?: boolean } = {}
  ): Promise<void> {
    await this.archiveAccountSpendDetailsInMemory(id, now);
    let accountToDelete: (AccountRecord & { passwordHash: string }) | undefined;
    for (let attempt = 0; attempt < USERNAME_RETIREMENT_DELETE_RETRIES; attempt += 1) {
      const account = this.accounts.get(id);
      if (!account) return;
      const aliases = Array.from(this.aliases.values())
        .filter((alias) => alias.accountId === id)
        .map((alias) => alias.username)
        .sort();
      const hasBriefings = Array.from(this.briefings.values()).some(
        (briefing) => briefing.ownerAccountId === id
      );
      const shouldRetire = options.retireUsernames !== false &&
        (Boolean(account.emailVerifiedAt) || hasBriefings);
      if (!shouldRetire && options.retireUsernames === false &&
        (account.emailVerifiedAt || hasBriefings)) {
        return;
      }
      const usernames = Array.from(new Set([account.username, ...aliases])).sort();
      const hashes = shouldRetire
        ? await Promise.all(usernames.map((username) => usernameRetirementHash(username)))
        : [];
      const current = this.accounts.get(id);
      const currentAliases = Array.from(this.aliases.values())
        .filter((alias) => alias.accountId === id)
        .map((alias) => alias.username)
        .sort();
      if (
        !current ||
        current.username !== account.username ||
        currentAliases.length !== aliases.length ||
        currentAliases.some((alias, index) => alias !== aliases[index])
      ) {
        continue;
      }
      const currentlyHasBriefings = Array.from(this.briefings.values()).some(
        (briefing) => briefing.ownerAccountId === id
      );
      if (shouldRetire !== (
        options.retireUsernames !== false &&
        (Boolean(current.emailVerifiedAt) || currentlyHasBriefings)
      )) {
        continue;
      }
      for (const hash of hashes) this.retiredUsernameHashes.add(hash);
      accountToDelete = current;
      break;
    }
    if (!accountToDelete) {
      if (this.accounts.has(id) && options.retireUsernames !== false) {
        throw new Error("account changed during deletion; retry");
      }
      return;
    }
    for (const [briefingId, votes] of this.starsByBriefing) {
      if (!votes.delete(id)) continue;
      const briefing = this.briefings.get(briefingId);
      if (briefing) briefing.stars = votes.size;
    }
    this.accounts.delete(id);

    for (const [username, alias] of this.aliases) {
      if (alias.accountId === id) this.aliases.delete(username);
    }

    for (const [tokenId, token] of this.tokens) {
      if (token.accountId === id) this.tokens.delete(tokenId);
    }

    for (const briefing of Array.from(this.briefings.values())) {
      if (briefing.ownerAccountId === id) await this.deleteBriefing(briefing.id);
    }
  }

  async listAccountRawPayloadKeys(id: string): Promise<string[]> {
    return (await this.planAccountPayloadDeletion(id)).exclusiveKeys;
  }

  async planAccountPayloadDeletion(id: string): Promise<AccountPayloadDeletionPlan> {
    const briefingIds = new Set(
      Array.from(this.briefings.values())
        .filter((briefing) => briefing.ownerAccountId === id)
        .map((briefing) => briefing.id)
    );
    const candidates = new Set(
      Array.from(this.rawMessages.values())
        .filter((message) => briefingIds.has(message.id.split("::")[0] ?? ""))
        .flatMap((message) => message.rawPayloadKey ? [message.rawPayloadKey] : [])
    );
    for (const run of this.sourceRuns.values()) {
      if (briefingIds.has(run.briefingId) && run.archiveKey) candidates.add(run.archiveKey);
    }
    const shared = new Set<string>();
    for (const message of this.rawMessages.values()) {
      if (!message.rawPayloadKey || !candidates.has(message.rawPayloadKey)) continue;
      const messageBriefingId = message.id.split("::")[0] ?? "";
      if (!briefingIds.has(messageBriefingId)) shared.add(message.rawPayloadKey);
    }
    for (const run of this.sourceRuns.values()) {
      if (run.archiveKey && candidates.has(run.archiveKey) && !briefingIds.has(run.briefingId)) {
        shared.add(run.archiveKey);
      }
    }
    return {
      exclusiveKeys: Array.from(candidates).filter((key) => !shared.has(key)),
      sharedKeysRetained: shared.size,
      totalReferencedKeys: candidates.size
    };
  }

  async planBriefingPayloadDeletion(briefingId: string): Promise<AccountPayloadDeletionPlan> {
    const candidates = new Set<string>();
    for (const message of this.rawMessages.values()) {
      if (message.id.startsWith(`${briefingId}::`) && message.rawPayloadKey) {
        candidates.add(message.rawPayloadKey);
      }
    }
    for (const run of this.sourceRuns.values()) {
      if (run.briefingId === briefingId && run.archiveKey) candidates.add(run.archiveKey);
    }
    const shared = new Set<string>();
    for (const message of this.rawMessages.values()) {
      if (message.rawPayloadKey &&
        candidates.has(message.rawPayloadKey) &&
        !message.id.startsWith(`${briefingId}::`)) shared.add(message.rawPayloadKey);
    }
    for (const run of this.sourceRuns.values()) {
      if (run.archiveKey && candidates.has(run.archiveKey) && run.briefingId !== briefingId) {
        shared.add(run.archiveKey);
      }
    }
    return {
      exclusiveKeys: Array.from(candidates).filter((key) => !shared.has(key)),
      sharedKeysRetained: shared.size,
      totalReferencedKeys: candidates.size
    };
  }

  async getAccountById(id: string): Promise<AccountRecord | null> {
    const account = this.accounts.get(id);
    return account ? rowlessAccount(account) : null;
  }

  async getAccountByEmail(email: string): Promise<(AccountRecord & { passwordHash: string }) | null> {
    const account = Array.from(this.accounts.values()).find((item) => item.email === email);
    return account ? { ...rowlessAccount(account), passwordHash: account.passwordHash } : null;
  }

  async getAccountByUsername(username: string): Promise<AccountRecord | null> {
    const account = Array.from(this.accounts.values()).find((item) => item.username === username);
    return account ? rowlessAccount(account) : null;
  }

  async resolveUsernameAlias(username: string): Promise<{ account: AccountRecord; alias: UsernameAliasRecord } | null> {
    const alias = this.aliases.get(username);
    if (!alias) return null;
    const account = await this.getAccountById(alias.accountId);
    if (!account) return null;
    return { account, alias: { ...alias } };
  }

  async isUsernameRetired(username: string): Promise<boolean> {
    return this.retiredUsernameHashes.has(await usernameRetirementHash(username));
  }

  async updateAccount(input: {
    id: string;
    username?: string;
    role?: AccountRole;
    disabled?: boolean;
    emailVerifiedAt?: string;
    passwordHash?: string;
  }, now = new Date()): Promise<AccountRecord> {
    const account = this.accounts.get(input.id);
    if (!account) throw new Error("account not found");
    const timestamp = now.toISOString();
    const requestedUsername = input.username ? normalizeUsername(input.username) : undefined;
    if (requestedUsername && requestedUsername !== account.username) {
      if (await this.isUsernameRetired(requestedUsername)) {
        throw new Error("username is permanently unavailable");
      }
      const conflictingAlias = this.aliases.get(requestedUsername);
      if (conflictingAlias && conflictingAlias.accountId !== input.id) {
        throw new Error("username is already taken");
      }
      for (const alias of this.aliases.values()) {
        if (alias.accountId === input.id && alias.isCurrent) alias.isCurrent = false;
      }
      this.aliases.set(requestedUsername, {
        username: requestedUsername,
        accountId: input.id,
        isCurrent: true,
        createdAt: timestamp
      });
      account.username = requestedUsername;
    }
    const revokeSessions = Boolean(input.passwordHash || input.role || input.disabled !== undefined);
    if (input.role) account.role = input.role;
    if (input.disabled !== undefined) {
      account.disabledAt = input.disabled ? timestamp : undefined;
      if (input.disabled) {
        for (const [briefingId, votes] of this.starsByBriefing) {
          if (!votes.delete(input.id)) continue;
          const briefing = this.briefings.get(briefingId);
          if (briefing) briefing.stars = votes.size;
        }
      }
    }
    if (input.emailVerifiedAt) account.emailVerifiedAt = input.emailVerifiedAt;
    if (input.passwordHash) {
      account.passwordHash = input.passwordHash;
    }
    if (revokeSessions) account.sessionVersion += 1;
    account.updatedAt = timestamp;
    return rowlessAccount(account);
  }

  async acceptLegalTerms(input: {
    accountId: string;
    termsVersion: string;
    privacyVersion: string;
    acceptableUseVersion: string;
  }, now = new Date()): Promise<AccountRecord> {
    const account = this.accounts.get(input.accountId);
    if (!account || account.disabledAt) throw new Error("account not found");
    const timestamp = now.toISOString();
    account.termsAcceptedAt = timestamp;
    account.termsVersion = input.termsVersion;
    account.privacyVersion = input.privacyVersion;
    account.acceptableUseVersion = input.acceptableUseVersion;
    account.updatedAt = timestamp;
    return rowlessAccount(account);
  }

  async countAdmins(): Promise<number> {
    return Array.from(this.accounts.values()).filter((account) => account.role === "admin" && !account.disabledAt).length;
  }

  async createAuthToken(input: {
    accountId: string;
    purpose: AuthTokenPurpose;
    tokenHash: string;
    expiresAt: string;
  }, now = new Date()): Promise<AuthTokenRecord> {
    const token = {
      id: `token_${this.tokens.size + 1}`,
      accountId: input.accountId,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: now.toISOString()
    };
    this.tokens.set(token.id, token);
    return { ...token };
  }

  async getAuthToken(tokenHash: string, purpose: AuthTokenPurpose): Promise<AuthTokenRecord | null> {
    const token = Array.from(this.tokens.values()).find((item) => item.tokenHash === tokenHash && item.purpose === purpose);
    return token ? { ...token } : null;
  }

  async consumeAuthToken(id: string, now = new Date()): Promise<boolean> {
    const token = this.tokens.get(id);
    if (!token || token.consumedAt || token.expiresAt <= now.toISOString()) return false;
    token.consumedAt = now.toISOString();
    return true;
  }

  async consumePasswordResetToken(input: {
    tokenHash: string;
    passwordHash: string;
  }, now = new Date()): Promise<AccountRecord | null> {
    const token = Array.from(this.tokens.values()).find(
      (candidate) =>
        candidate.tokenHash === input.tokenHash &&
        candidate.purpose === "password_reset" &&
        !candidate.consumedAt &&
        candidate.expiresAt > now.toISOString()
    );
    if (!token) return null;
    const account = this.accounts.get(token.accountId);
    if (!account || account.disabledAt) return null;
    token.consumedAt = now.toISOString();
    account.passwordHash = input.passwordHash;
    account.sessionVersion += 1;
    account.updatedAt = now.toISOString();
    return rowlessAccount(account);
  }

  async countRecentAuthAttempts(input: { key: string; action: string; since: string }): Promise<number> {
    return this.attempts.filter(
      (attempt) => attempt.key === input.key && attempt.action === input.action && attempt.createdAt >= input.since
    ).length;
  }

  async recordAuthAttempt(input: { key: string; action: string }, now = new Date()): Promise<void> {
    this.attempts.push({ ...input, createdAt: now.toISOString() });
  }

  async consumeRateLimit(input: {
    key: string;
    action: string;
    since: string;
    limit: number;
  }, now = new Date()): Promise<boolean> {
    if (await this.countRecentAuthAttempts(input) >= input.limit) return false;
    await this.recordAuthAttempt(input, now);
    return true;
  }

  async ensureDefaultBriefing(account: AccountRecord, now = new Date()): Promise<BriefingConfig> {
    const existing = await this.getBriefingBySlug(account.id, personalNewsBriefing.slug);
    if (existing) return existing;
    const briefing = {
      ...personalNewsBriefing,
      id: `briefing_${account.id}_personal`,
      ownerAccountId: account.id,
      ownerUsername: account.username,
      nextBriefingAt: defaultNextBriefingAt({ now })
    };
    return this.upsertBriefing(briefing, now);
  }

  async listBriefings(accountId?: string): Promise<BriefingConfig[]> {
    return Array.from(this.briefings.values())
      .filter((briefing) => !accountId || briefing.ownerAccountId === accountId)
      .map((briefing) => this.withCurrentBriefingOwner(briefing))
      .sort((a, b) => compareBriefingsByStarsAndAge(a, b, this.briefingCreatedAt))
      .map((briefing) => briefing);
  }

  async listBriefingsDue(before: string, limit: number): Promise<BriefingConfig[]> {
    return Array.from(this.briefings.values())
      .filter((briefing) =>
        !briefing.paused &&
        briefing.publicFeedEnabled &&
        !this.accounts.get(briefing.ownerAccountId)?.disabledAt &&
        Boolean(briefing.nextBriefingAt) &&
        briefing.nextBriefingAt! <= before
      )
      .sort((left, right) => (left.nextBriefingAt ?? "").localeCompare(right.nextBriefingAt ?? ""))
      .slice(0, limit)
      .map((briefing) => this.withCurrentBriefingOwner(briefing));
  }

  async listDueSourceRefreshCandidates(now: string, limit: number): Promise<SourceRefreshCandidate[]> {
    if (limit <= 0) return [];
    const candidates = Array.from(this.sources.values())
      .filter((source) => {
        const briefing = this.briefings.get(source.briefingId);
        if (!source.enabled || !briefing || briefing.paused || !briefing.publicFeedEnabled) return false;
        if (this.accounts.get(briefing.ownerAccountId)?.disabledAt) return false;
        if (isPaidSourceKind(source.kind) && !this.paidProviderSeats.has(briefing.ownerAccountId)) return false;
        if (source.id.startsWith("source_canary_fixture_") || source.input === "synthetic:canary-fixture") return false;
        if (source.nextRetryAt && source.nextRetryAt > now) return false;
        const refresh = source.canonicalKey ? this.canonicalRefreshes.get(source.canonicalKey) : undefined;
        if (refresh?.nextRefreshAt && refresh.nextRefreshAt > now) return false;
        if (refresh?.leaseUntil && refresh.leaseUntil > now) return false;
        if (source.provider === "apify") {
          const canonicalKey = source.canonicalKey ?? source.id;
          const activeEquivalentRun = Array.from(this.sourceRuns.values()).some((run) => {
            if (run.provider !== "apify" || (run.state !== "queued" && run.state !== "running")) return false;
            const activeSource = this.sources.get(run.sourceId);
            return Boolean(activeSource && (activeSource.canonicalKey ?? activeSource.id) === canonicalKey);
          });
          if (activeEquivalentRun) return false;
        }
        const queuedJobs = Array.from(this.jobs.values()).filter(
          (job) => job.briefingId === briefing.id && job.state === "queued"
        ).length;
        return queuedJobs < 40;
      })
      .sort((left, right) => {
        const leftDue = (left.canonicalKey && this.canonicalRefreshes.get(left.canonicalKey)?.nextRefreshAt) ??
          left.nextRetryAt ?? left.lastCheckedAt ?? "";
        const rightDue = (right.canonicalKey && this.canonicalRefreshes.get(right.canonicalKey)?.nextRefreshAt) ??
          right.nextRetryAt ?? right.lastCheckedAt ?? "";
        return leftDue.localeCompare(rightDue) ||
          (left.canonicalKey ?? left.id).localeCompare(right.canonicalKey ?? right.id) ||
          cadencePriority(this.briefings.get(left.briefingId)?.briefingCadence)
            - cadencePriority(this.briefings.get(right.briefingId)?.briefingCadence) ||
          left.id.localeCompare(right.id);
      });
    const seen = new Set<string>();
    const result: SourceRefreshCandidate[] = [];
    for (const source of candidates) {
      const refreshKey = source.canonicalKey ?? source.id;
      if (seen.has(refreshKey)) continue;
      const briefing = this.briefings.get(source.briefingId);
      if (!briefing) continue;
      seen.add(refreshKey);
      result.push({
        briefingId: briefing.id,
        sourceId: source.id,
        provider: source.provider,
        kind: source.kind,
        briefingCadence: briefing.briefingCadence
      });
      if (result.length >= limit) break;
    }
    return result;
  }

  async listBriefingsWithRecoverableEmptyWindows(
    sinceWindowEnd: string,
    limit: number
  ): Promise<BriefingConfig[]> {
    if (limit <= 0) return [];
    const firstRecoverableByBriefing = new Map<string, string>();
    for (const row of this.briefingWindows.values()) {
      const briefing = this.briefings.get(row.briefingId);
      if (!briefing || briefing.paused || !briefing.publicFeedEnabled ||
        this.accounts.get(briefing.ownerAccountId)?.disabledAt) continue;
      if (row.cadence !== briefing.briefingCadence || row.state !== "empty" || row.editionId ||
        row.messageCount <= 0 || !row.contentCutoffAt || row.recoveryAttemptedAt || row.windowEnd < sinceWindowEnd) {
        continue;
      }
      const current = firstRecoverableByBriefing.get(row.briefingId);
      if (!current || row.windowEnd < current) firstRecoverableByBriefing.set(row.briefingId, row.windowEnd);
    }
    return Array.from(firstRecoverableByBriefing.entries())
      .sort((left, right) => left[1].localeCompare(right[1]) || left[0].localeCompare(right[0]))
      .slice(0, limit)
      .flatMap(([briefingId]) => {
        const briefing = this.briefings.get(briefingId);
        return briefing ? [this.withCurrentBriefingOwner(briefing)] : [];
      });
  }

  async listExploreBriefings(limit: number, now = new Date()): Promise<ExploreBriefingRecord[]> {
    if (limit <= 0) return [];
    return Array.from(this.briefings.values())
      .filter((briefing) =>
        !briefing.paused &&
        briefing.publicFeedEnabled &&
        !isOperationalCanaryBriefingId(briefing.id) &&
        !this.accounts.get(briefing.ownerAccountId)?.disabledAt &&
        Array.from(this.sources.values()).some((source) => source.briefingId === briefing.id && source.enabled)
      )
      .flatMap((briefing): ExploreBriefingRecord[] => {
        const latestPublishedAt = Array.from(this.editionsByBriefing.get(briefing.id)?.values() ?? [])
          .filter((edition) =>
            edition.status === "published" &&
            edition.sections.length > 0 &&
            edition.publishedAt > new Date(now.getTime() - FIXED_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString() &&
            edition.publishedAt <= now.toISOString()
          )
          .map((edition) => edition.publishedAt)
          .sort()
          .at(-1);
        if (!latestPublishedAt || latestPublishedAt < exploreFreshnessCutoff(briefing.briefingCadence, now)) return [];
        return [{ ...this.withCurrentBriefingOwner(briefing), latestPublishedAt }];
      })
      .sort((left, right) =>
        right.latestPublishedAt.localeCompare(left.latestPublishedAt) ||
        right.stars - left.stars ||
        compareBriefingsByStarsAndAge(left, right, this.briefingCreatedAt)
      )
      .slice(0, limit);
  }

  async getBriefingById(id: string): Promise<BriefingConfig | null> {
    const briefing = this.briefings.get(id);
    return briefing ? this.withCurrentBriefingOwner(briefing) : null;
  }

  async getBriefingBySlug(ownerAccountId: string, slug: string): Promise<BriefingConfig | null> {
    const briefing = Array.from(this.briefings.values()).find(
      (briefing) => briefing.ownerAccountId === ownerAccountId && briefing.slug === slug
    );
    return briefing ? this.withCurrentBriefingOwner(briefing) : null;
  }

  async hasBriefingStar(briefingId: string, voterId: string): Promise<boolean> {
    return this.starsByBriefing.get(briefingId)?.has(voterId) ?? false;
  }

  async setBriefingStar(briefingId: string, voterId: string, starred: boolean): Promise<number> {
    const votes = this.starsByBriefing.get(briefingId) ?? new Set<string>();
    const voter = this.accounts.get(voterId);
    if (starred && voter && !voter.disabledAt) votes.add(voterId);
    else votes.delete(voterId);
    this.starsByBriefing.set(briefingId, votes);

    const briefing = this.briefings.get(briefingId);
    if (briefing) briefing.stars = votes.size;
    return votes.size;
  }

  async upsertBriefing(
    input: BriefingConfig,
    now = new Date(),
    quota?: BriefingQuota
  ): Promise<BriefingConfig> {
    const account = this.accounts.get(input.ownerAccountId);
    const otherBriefings = Array.from(this.briefings.values())
      .filter((briefing) => briefing.ownerAccountId === input.ownerAccountId && briefing.id !== input.id);
    if (otherBriefings.length >= (quota?.maxFeeds ?? Number.POSITIVE_INFINITY) ||
      (normalizedBriefingCadence(input.briefingCadence) === "hourly" &&
        otherBriefings.filter((briefing) => briefing.briefingCadence === "hourly").length >=
          (quota?.maxHourlyFeeds ?? Number.POSITIVE_INFINITY))) {
      throw new QuotaExceededError(
        normalizedBriefingCadence(input.briefingCadence) === "hourly"
          ? "Hosted accounts can have at most two feeds and one hourly feed."
          : "Hosted accounts can have at most two feeds."
      );
    }
    const existing = this.briefings.get(input.id);
    if (!this.briefingCreatedAt.has(input.id)) this.briefingCreatedAt.set(input.id, now.toISOString());
    this.briefings.set(input.id, {
      ...input,
      stars: existing?.stars ?? 0,
      publicFeedEnabled: true,
      briefingCadence: normalizedBriefingCadence(input.briefingCadence),
      briefingTimeOfDay: normalizedTimeOfDay(input.briefingTimeOfDay),
      briefingTimezone: input.briefingTimezone || "UTC",
      retentionDays: FIXED_RETENTION_DAYS,
      ownerUsername: account?.username ?? input.ownerUsername
    });
    return { ...this.briefings.get(input.id)! };
  }

  private withCurrentBriefingOwner(briefing: BriefingConfig): BriefingConfig {
    const account = this.accounts.get(briefing.ownerAccountId);
    return { ...briefing, ownerUsername: account?.username ?? briefing.ownerUsername };
  }

  async deleteBriefing(id: string): Promise<void> {
    const ownerAccountId = this.briefings.get(id)?.ownerAccountId;
    this.briefings.delete(id);
    this.briefingCreatedAt.delete(id);

    for (const [sourceId, source] of this.sources) {
      if (source.briefingId === id) this.sources.delete(sourceId);
    }

    for (const [rawMessageId, message] of this.rawMessages) {
      if (message.id.startsWith(`${id}::`)) this.rawMessages.delete(rawMessageId);
    }

    this.itemsByBriefing.delete(id);
    this.editionsByBriefing.delete(id);
    this.starsByBriefing.delete(id);

    for (const [jobId, job] of this.jobs) {
      if (job.briefingId === id) this.jobs.delete(jobId);
    }
    if (ownerAccountId) this.syncPaidProviderSeat(ownerAccountId);
  }

  async listSources(briefingId: string): Promise<SourceRecord[]> {
    return Array.from(this.sources.values()).filter((source) => source.briefingId === briefingId);
  }

  async countPaidProviderSeats(): Promise<number> {
    return this.paidProviderSeats.size;
  }

  async getSource(sourceId: string): Promise<SourceRecord | null> {
    const source = this.sources.get(sourceId);
    return source ? { ...source } : null;
  }

  async setSourceEnabled(sourceId: string, enabled: boolean): Promise<void> {
    const source = this.sources.get(sourceId);
    if (source) {
      source.enabled = enabled;
      source.healthState = enabled ? (source.lastSuccessAt ? "healthy" : "degraded") : "disabled_by_user";
      source.nextRetryAt = undefined;
      if (enabled) {
        source.failureClass = source.lastSuccessAt ? undefined : "pending_first_success";
        source.consecutiveFailures = 0;
        source.lastError = undefined;
      }
    }
  }

  async deleteSource(sourceId: string): Promise<void> {
    const source = this.sources.get(sourceId);
    const ownerAccountId = source
      ? this.briefings.get(source.briefingId)?.ownerAccountId
      : undefined;
    this.sources.delete(sourceId);
    for (const [runId, run] of this.sourceRuns) {
      if (run.sourceId === sourceId) this.sourceRuns.delete(runId);
    }
    for (const [id, message] of this.rawMessages) {
      if (message.source.id === sourceId) this.rawMessages.delete(id);
    }
    if (ownerAccountId) this.syncPaidProviderSeat(ownerAccountId);
  }

  async upsertConfiguredSource(input: {
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
  }, now = new Date(), quota?: SourceQuota): Promise<SourceRecord> {
    const id = scopedSourceId(
      input.briefingId,
      stableSourceKey(input.provider, input.kind, input.username ?? input.sourceUrl ?? input.input ?? input.title)
    );
    const existing = this.sources.get(id);
    const briefingIds = new Set(
      Array.from(this.briefings.values())
        .filter((briefing) => briefing.ownerAccountId === quota?.accountId)
        .map((briefing) => briefing.id)
    );
    const accountSources = Array.from(this.sources.values())
      .filter((source) => briefingIds.has(source.briefingId) && source.id !== id);
    const feedSources = accountSources.filter((source) => source.briefingId === input.briefingId);
    const paidSources = accountSources.filter((source) => isPaidSourceKind(source.kind));
    const googleSources = accountSources.filter((source) => source.kind === "google_news");
    const xSources = accountSources.filter((source) => isXSourceKind(source.kind));
    const paidProviderAccountIds = this.paidProviderSeats;
    if (
      quota &&
      isPaidSourceKind(input.kind) &&
      !paidProviderAccountIds.has(quota.accountId) &&
      paidProviderAccountIds.size >= quota.maxPaidProviderAccounts
    ) {
      throw new QuotaExceededError(
        `Paid-provider beta is full: all ${quota.maxPaidProviderAccounts} hosted account seats are claimed. ` +
        "RSS and Telegram remain available."
      );
    }
    if (feedSources.length >= (quota?.maxPerFeed ?? Number.POSITIVE_INFINITY) ||
      accountSources.length >= (quota?.maxPerAccount ?? Number.POSITIVE_INFINITY) ||
      (isPaidSourceKind(input.kind) && paidSources.length >= (quota?.maxPaidPerAccount ?? Number.POSITIVE_INFINITY)) ||
      (input.kind === "google_news" && googleSources.length >= (quota?.maxGoogleNewsPerAccount ?? Number.POSITIVE_INFINITY)) ||
      (isXSourceKind(input.kind) && xSources.length >= (quota?.maxXPerAccount ?? Number.POSITIVE_INFINITY))) {
      throw new QuotaExceededError(
        "Hosted source limit reached: 5 per feed, 10 per account, and at most one Google News plus one X source."
      );
    }
    const source: SourceRecord = {
      id,
      briefingId: input.briefingId,
      title: input.title,
      type: input.type ?? "channel",
      provider: input.provider,
      kind: input.kind,
      username: input.username,
      input: input.input,
      url: input.url ?? input.sourceUrl,
      sourceUrl: input.sourceUrl ?? input.url,
      actorId: input.actorId,
      actorInput: input.actorInput,
      enabled: input.enabled ?? true,
      lastSeenAt: existing?.lastSeenAt ?? now.toISOString(),
      lastCheckedAt: existing?.lastCheckedAt,
      lastError: existing?.lastError,
      cursor: existing?.cursor,
      healthState: existing?.healthState ?? "degraded",
      failureClass: existing?.failureClass ?? "pending_first_success",
      consecutiveFailures: existing?.consecutiveFailures ?? 0,
      lastSuccessAt: existing?.lastSuccessAt,
      lastNewItemAt: existing?.lastNewItemAt,
      nextRetryAt: existing?.nextRetryAt,
      canonicalKey: existing?.canonicalKey ?? canonicalSourceKey(
        input.provider,
        input.kind,
        input.username ?? input.sourceUrl ?? input.url ?? input.input ?? input.title,
        this.briefings.get(input.briefingId)?.ownerAccountId
      )
    };
    this.sources.set(id, source);
    const sourceOwnerAccountId = this.briefings.get(input.briefingId)?.ownerAccountId;
    if (sourceOwnerAccountId && isPaidSourceKind(input.kind)) {
      this.paidProviderSeats.add(sourceOwnerAccountId);
    }
    return { ...source };
  }

  private syncPaidProviderSeat(accountId: string): void {
    const briefingIds = new Set(
      Array.from(this.briefings.values())
        .filter((briefing) => briefing.ownerAccountId === accountId)
        .map((briefing) => briefing.id)
    );
    const stillClaimed = Array.from(this.sources.values()).some(
      (source) => briefingIds.has(source.briefingId) && isPaidSourceKind(source.kind)
    );
    if (stillClaimed) this.paidProviderSeats.add(accountId);
    else this.paidProviderSeats.delete(accountId);
  }

  async updateSourceState(input: {
    sourceId: string;
    title?: string;
    username?: string;
    url?: string;
    sourceUrl?: string;
    lastSeenAt?: string;
    lastCheckedAt?: string;
    lastError?: string;
    cursor?: unknown;
  }, _now = new Date()): Promise<void> {
    const source = this.sources.get(input.sourceId);
    if (!source) return;
    if (input.title) source.title = input.title;
    if (input.username) source.username = input.username;
    if (input.url || input.sourceUrl) {
      source.url = input.url ?? input.sourceUrl;
      source.sourceUrl = input.sourceUrl ?? input.url;
    }
    if (input.lastSeenAt) source.lastSeenAt = input.lastSeenAt;
    if (input.lastCheckedAt) source.lastCheckedAt = input.lastCheckedAt;
    if (input.lastError !== undefined) source.lastError = input.lastError;
    if (input.cursor !== undefined) source.cursor = input.cursor;
  }

  async recordSourceSuccess(sourceId: string, newItemAt?: string, now = new Date()): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source?.enabled) return;
    source.healthState = "healthy";
    source.failureClass = undefined;
    source.consecutiveFailures = 0;
    source.lastError = undefined;
    source.lastSuccessAt = now.toISOString();
    source.lastNewItemAt = newItemAt ?? source.lastNewItemAt;
    source.nextRetryAt = undefined;
  }

  async recordSourceFailure(input: {
    sourceId: string;
    error: string;
    failureClass: string;
    nextRetryAt: string;
  }, _now = new Date()): Promise<void> {
    const source = this.sources.get(input.sourceId);
    if (!source?.enabled) return;
    source.healthState = (source.consecutiveFailures ?? 0) >= 1 ? "backoff" : "degraded";
    source.failureClass = input.failureClass;
    source.consecutiveFailures = (source.consecutiveFailures ?? 0) + 1;
    source.lastError = input.error;
    source.nextRetryAt = input.nextRetryAt;
  }

  async listEquivalentSources(sourceId: string): Promise<SourceRecord[]> {
    const source = this.sources.get(sourceId);
    if (!source) return [];
    return Array.from(this.sources.values())
      .filter((candidate) => {
        const briefing = this.briefings.get(candidate.briefingId);
        return candidate.enabled &&
          candidate.canonicalKey === source.canonicalKey &&
          Boolean(briefing) &&
          !briefing?.paused &&
          briefing?.publicFeedEnabled &&
          !this.accounts.get(briefing!.ownerAccountId)?.disabledAt &&
          (!isPaidSourceKind(candidate.kind) || this.paidProviderSeats.has(briefing!.ownerAccountId));
      })
      .map((candidate) => ({ ...candidate }));
  }

  async claimCanonicalSourceRefresh(sourceId: string, intervalMs: number, leaseMs: number, now = new Date()): Promise<string | null> {
    const source = this.sources.get(sourceId);
    if (!source?.canonicalKey) return null;
    const briefing = this.briefings.get(source.briefingId);
    if (
      isPaidSourceKind(source.kind) &&
      (!briefing || !this.paidProviderSeats.has(briefing.ownerAccountId))
    ) return null;
    const row = this.canonicalRefreshes.get(source.canonicalKey) ?? {
      nextRefreshAt: new Date(now.getTime() - intervalMs).toISOString()
    };
    if (row.nextRefreshAt && row.nextRefreshAt > now.toISOString()) return null;
    if (row.leaseUntil && row.leaseUntil > now.toISOString()) return null;
    row.leaseToken = crypto.randomUUID();
    row.leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
    this.canonicalRefreshes.set(source.canonicalKey, row);
    return row.leaseToken;
  }

  async activateCanonicalSourceRefresh(sourceId: string, dispatchLeaseToken: string, leaseMs: number, now = new Date()): Promise<string | null> {
    const source = this.sources.get(sourceId);
    if (!source?.canonicalKey) return null;
    const briefing = this.briefings.get(source.briefingId);
    if (
      isPaidSourceKind(source.kind) &&
      (!briefing || !this.paidProviderSeats.has(briefing.ownerAccountId))
    ) return null;
    const row = this.canonicalRefreshes.get(source.canonicalKey);
    if (!row || row.leaseToken !== dispatchLeaseToken || !row.leaseUntil || row.leaseUntil <= now.toISOString()) return null;
    row.leaseToken = crypto.randomUUID();
    row.leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
    return row.leaseToken;
  }

  async releaseCanonicalSourceRefresh(sourceId: string, leaseToken: string): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source?.canonicalKey) return;
    const row = this.canonicalRefreshes.get(source.canonicalKey);
    if (!row || row.leaseToken !== leaseToken) return;
    row.leaseToken = undefined;
    row.leaseUntil = undefined;
  }

  async completeCanonicalSourceRefresh(
    sourceId: string,
    leaseToken: string,
    nextRefreshAt: string,
    newItemAt?: string,
    now = new Date(),
    markHealthy = true
  ): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source?.canonicalKey) return;
    const row = this.canonicalRefreshes.get(source.canonicalKey);
    if (!row || row.leaseToken !== leaseToken) return;
    row.leaseToken = undefined;
    row.leaseUntil = undefined;
    row.nextRefreshAt = nextRefreshAt;
    row.lastError = undefined;
    for (const equivalent of await this.listEquivalentSources(sourceId)) {
      const stored = this.sources.get(equivalent.id);
      if (stored) stored.lastCheckedAt = now.toISOString();
      if (markHealthy) await this.recordSourceSuccess(equivalent.id, newItemAt, now);
    }
  }

  async failCanonicalSourceRefresh(sourceId: string, leaseToken: string, error: string, failureClass: string, backoffMs: number, now = new Date()): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source?.canonicalKey) return;
    const row = this.canonicalRefreshes.get(source.canonicalKey);
    if (!row || row.leaseToken !== leaseToken) return;
    row.leaseToken = undefined;
    row.leaseUntil = undefined;
    row.nextRefreshAt = new Date(now.getTime() + backoffMs).toISOString();
    row.lastError = error;
    for (const equivalent of await this.listEquivalentSources(sourceId)) {
      await this.recordSourceFailure({
        sourceId: equivalent.id,
        error,
        failureClass,
        nextRetryAt: row.nextRefreshAt
      }, now);
    }
  }

  async rescheduleCanonicalSourceRefresh(
    sourceId: string,
    nextRefreshAt: string,
    error?: string
  ): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source?.canonicalKey) return;
    const row = this.canonicalRefreshes.get(source.canonicalKey) ?? {};
    row.leaseToken = undefined;
    row.leaseUntil = undefined;
    row.nextRefreshAt = nextRefreshAt;
    row.lastError = error;
    this.canonicalRefreshes.set(source.canonicalKey, row);
  }

  async upsertSourceFromMessage(briefingId: string, message: NormalizedMessage): Promise<SourceRecord> {
    const existing = Array.from(this.sources.values()).find(
      (source) =>
        source.briefingId === briefingId &&
        (source.id === message.source.id ||
          (source.provider === (message.source.provider ?? "telegram") &&
            source.kind === (message.source.kind ?? (message.source.type === "group" ? "telegram_group" : "telegram_channel")) &&
            ((source.username && source.username === message.source.username) || source.sourceUrl === message.sourceUrl || source.title === message.source.title)))
    );
    const source: SourceRecord = {
      id: existing?.id ?? scopedSourceId(briefingId, message.source.id),
      briefingId,
      title: existing?.title ?? message.source.title,
      type: existing?.type ?? message.source.type,
      provider: existing?.kind === "google_news"
        ? message.source.provider ?? existing.provider
        : existing?.provider ?? message.source.provider ?? "telegram",
      kind: existing?.kind ?? message.source.kind ?? (message.source.type === "group" ? "telegram_group" : "telegram_channel"),
      username: existing?.username ?? message.source.username,
      input: existing?.input ?? (message.source.username ? `https://t.me/${message.source.username}` : message.sourceUrl ?? message.source.title),
      url: existing?.url ?? message.sourceUrl ?? (message.source.username ? `https://t.me/${message.source.username}` : undefined),
      sourceUrl: existing?.sourceUrl ?? message.sourceUrl ?? (message.source.username ? `https://t.me/${message.source.username}` : undefined),
      actorId: existing?.actorId,
      actorInput: existing?.actorInput,
      cursor: existing?.cursor,
      enabled: existing?.enabled ?? false,
      lastSeenAt: message.receivedAt,
      lastCheckedAt: existing?.lastCheckedAt,
      lastError: existing?.lastError,
      healthState: existing?.healthState ?? "healthy",
      failureClass: existing?.failureClass,
      consecutiveFailures: existing?.consecutiveFailures ?? 0,
      lastSuccessAt: existing?.lastSuccessAt,
      lastNewItemAt: existing?.lastNewItemAt,
      nextRetryAt: existing?.nextRetryAt,
      canonicalKey: existing?.canonicalKey ?? canonicalSourceKey(
            message.source.provider ?? "telegram",
            message.source.kind ?? (message.source.type === "group" ? "telegram_group" : "telegram_channel"),
            message.source.username ?? message.sourceUrl ?? message.source.title,
            this.briefings.get(briefingId)?.ownerAccountId
          )
    };
    this.sources.set(source.id, source);
    return source;
  }

  async saveRawMessage(_briefingId: string, message: NormalizedMessage): Promise<void> {
    this.rawMessages.set(message.id, message);
  }

  async saveRawMessageAndCreateProcessingJob(
    briefingId: string,
    message: NormalizedMessage,
    now = new Date()
  ): Promise<string> {
    this.rawMessages.set(message.id, message);
    const existing = Array.from(this.jobs.values()).find((job) => job.rawMessageId === message.id);
    if (existing) return existing.id;
    return this.createProcessingJob(briefingId, message.id, now);
  }

  async getRawMessage(id: string): Promise<NormalizedMessage | null> {
    return this.rawMessages.get(id) ?? null;
  }

  async listRecentRawMessages(briefingId: string, now = new Date(), limit = 50): Promise<NormalizedMessage[]> {
    return Array.from(this.rawMessages.values())
      .filter((message) => message.id.startsWith(`${briefingId}::`) && new Date(message.expiresAt).getTime() > now.getTime())
      .sort((left, right) => right.postedAt.localeCompare(left.postedAt))
      .slice(0, limit);
  }

  async listRawMessagesForWindow(
    briefingId: string,
    windowStart: string,
    windowEnd: string,
    limit = 500
  ): Promise<NormalizedMessage[]> {
    return Array.from(this.rawMessages.values())
      .filter((message) =>
        message.id.startsWith(`${briefingId}::`) &&
        message.postedAt >= windowStart &&
        message.postedAt < windowEnd &&
        new Date(message.expiresAt).getTime() > new Date(windowEnd).getTime()
      )
      .sort((left, right) => left.postedAt.localeCompare(right.postedAt))
      .slice(0, limit);
  }

  async listRawMessagesReceivedBetween(
    briefingId: string,
    receivedAfter: string,
    receivedThrough: string,
    postedAfter: string,
    limit = 500
  ): Promise<NormalizedMessage[]> {
    return Array.from(this.rawMessages.values())
      .filter((message) =>
        message.id.startsWith(`${briefingId}::`) &&
        message.receivedAt > receivedAfter &&
        message.receivedAt <= receivedThrough &&
        message.postedAt >= postedAfter &&
        message.expiresAt > receivedThrough
      )
      .sort((left, right) => left.receivedAt.localeCompare(right.receivedAt) || left.postedAt.localeCompare(right.postedAt))
      .slice(0, limit);
  }

  async createProcessingJob(briefingId: string, rawMessageId: string, now = new Date()): Promise<string> {
    const id = `job_${this.jobs.size + 1}`;
    this.jobs.set(id, {
      id, briefingId, rawMessageId, state: "queued", attemptCount: 0,
      availableAt: now.toISOString(), updatedAt: now.toISOString()
    });
    return id;
  }

  async claimProcessingJob(jobId: string, leaseMs: number, now = new Date()): Promise<ProcessingJobClaim | null> {
    const job = this.jobs.get(jobId);
    if (!job || job.state !== "queued") return null;
    if (job.leaseUntil && job.leaseUntil > now.toISOString()) return null;
    job.leaseToken = crypto.randomUUID();
    job.leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
    job.attemptCount += 1;
    job.updatedAt = now.toISOString();
    return { ...job, leaseToken: job.leaseToken, leaseUntil: job.leaseUntil };
  }

  async completeProcessingJob(jobId: string, now = new Date(), leaseToken?: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job && (!leaseToken || job.leaseToken === leaseToken)) {
      job.state = "completed";
      job.completedAt = now.toISOString();
      job.leaseToken = undefined;
      job.leaseUntil = undefined;
      job.updatedAt = now.toISOString();
    }
  }

  async failProcessingJob(jobId: string, error: string, now = new Date(), leaseToken?: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job && (!leaseToken || job.leaseToken === leaseToken)) {
      job.state = "failed";
      job.error = error;
      job.leaseToken = undefined;
      job.leaseUntil = undefined;
      job.updatedAt = now.toISOString();
    }
  }

  async releaseProcessingJob(jobId: string, error: string, delayMs: number, now = new Date(), leaseToken?: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || (leaseToken && job.leaseToken !== leaseToken)) return;
    job.state = "queued";
    job.error = error;
    job.availableAt = new Date(now.getTime() + delayMs).toISOString();
    job.leaseToken = undefined;
    job.leaseUntil = undefined;
    job.updatedAt = now.toISOString();
  }

  async listProcessingJobs(input?: {
    briefingId?: string;
    states?: ProcessingJobState[];
    limit?: number;
    updatedBefore?: string;
    order?: "newest" | "oldest";
  }): Promise<ProcessingJobRecord[]> {
    const allowed = new Set(input?.states ?? ["queued", "completed", "failed"]);
    return Array.from(this.jobs.values())
      .filter((job) => (!input?.briefingId || job.briefingId === input.briefingId) && allowed.has(job.state))
      .filter((job) => !input?.updatedBefore || job.updatedAt < input.updatedBefore)
      .slice()
      .sort((left, right) => input?.order === "oldest" ? left.updatedAt.localeCompare(right.updatedAt) : right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, input?.limit ?? 50)
      .map((job) => ({
        id: job.id,
        briefingId: job.briefingId,
        rawMessageId: job.rawMessageId,
        state: job.state,
        error: job.error,
        leaseToken: job.leaseToken,
        leaseUntil: job.leaseUntil,
        attemptCount: job.attemptCount,
        availableAt: job.availableAt,
        completedAt: job.completedAt,
        lastEnqueuedAt: job.lastEnqueuedAt,
        updatedAt: job.updatedAt
      }));
  }

  async listRecoverableProcessingJobs(input: {
    orphanedBefore: string;
    enqueuedBefore: string;
    abandonedLeaseBefore: string;
    limit: number;
  }): Promise<ProcessingJobRecord[]> {
    return Array.from(this.jobs.values())
      .filter((job) => job.state === "queued")
      .filter((job) =>
        (Boolean(job.leaseUntil) && job.leaseUntil! < input.abandonedLeaseBefore) ||
        (!job.leaseUntil && !job.lastEnqueuedAt && job.updatedAt < input.orphanedBefore) ||
        (!job.leaseUntil && Boolean(job.lastEnqueuedAt) && job.lastEnqueuedAt! < input.enqueuedBefore)
      )
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(0, input.limit)
      .map((job) => ({ ...job }));
  }

  async requeueProcessingJob(jobId: string, now = new Date()): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.state = "queued";
      delete job.error;
      job.updatedAt = now.toISOString();
    }
  }

  async markProcessingJobEnqueued(jobId: string, now = new Date()): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job?.state === "queued") {
      job.lastEnqueuedAt = now.toISOString();
      if (job.leaseUntil && job.leaseUntil <= now.toISOString()) {
        delete job.leaseToken;
        delete job.leaseUntil;
      }
      job.updatedAt = now.toISOString();
    }
  }

  async claimBriefingWindow(input: {
    briefingId: string;
    cadence: "hourly" | "daily" | "weekly" | "monthly";
    windowStart: string;
    windowEnd: string;
    leaseMs: number;
  }, now = new Date()) {
    const key = `${input.briefingId}:${input.cadence}:${input.windowStart}:${input.windowEnd}`;
    const existing = this.briefingWindows.get(key);
    if (existing && existing.state !== "failed" && !(existing.state === "running" && (existing.leaseUntil ?? "") <= now.toISOString())) return null;
    const leaseToken = crypto.randomUUID();
    const leaseUntil = new Date(now.getTime() + input.leaseMs).toISOString();
    const row = {
      id: existing?.id ?? `window_${this.briefingWindows.size + 1}`,
      briefingId: input.briefingId,
      cadence: input.cadence,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      state: "running" as const,
      leaseToken,
      leaseUntil,
      messageCount: 0
    };
    this.briefingWindows.set(key, row);
    return { ...row, leaseToken, leaseUntil };
  }

  async completeBriefingWindow(input: {
    id: string;
    leaseToken: string;
    state: "published" | "empty";
    messageCount: number;
    editionId?: string;
    contentCutoffAt: string;
    qualityState: "ready" | "degraded";
  }, now = new Date()): Promise<void> {
    const row = Array.from(this.briefingWindows.values()).find((entry) => entry.id === input.id);
    if (!row || row.leaseToken !== input.leaseToken) return;
    row.state = input.state;
    row.messageCount = input.messageCount;
    row.editionId = input.editionId;
    row.contentCutoffAt = input.contentCutoffAt;
    row.qualityState = input.qualityState;
    row.preparedAt = now.toISOString();
    row.leaseToken = undefined;
    row.leaseUntil = undefined;
  }

  async getLatestBriefingWindowCutoff(
    briefingId: string,
    cadence: "hourly" | "daily" | "weekly" | "monthly",
    beforeWindowEnd: string
  ): Promise<string | undefined> {
    return Array.from(this.briefingWindows.values())
      .filter((row) =>
        row.briefingId === briefingId && row.cadence === cadence && row.windowEnd <= beforeWindowEnd &&
        (row.state === "published" || row.state === "empty") && Boolean(row.contentCutoffAt)
      )
      .sort((left, right) => right.windowEnd.localeCompare(left.windowEnd))[0]?.contentCutoffAt;
  }

  async listRecoverableEmptyBriefingWindows(
    briefingId: string,
    cadence: "hourly" | "daily" | "weekly" | "monthly",
    sinceWindowEnd: string,
    limit = 2
  ): Promise<RecoverableBriefingWindow[]> {
    return Array.from(this.briefingWindows.values())
      .filter((row) =>
        row.briefingId === briefingId && row.cadence === cadence && row.state === "empty" &&
        !row.editionId && row.messageCount > 0 && Boolean(row.contentCutoffAt) &&
        !row.recoveryAttemptedAt && row.windowEnd >= sinceWindowEnd
      )
      .sort((left, right) => left.windowEnd.localeCompare(right.windowEnd))
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        briefingId: row.briefingId,
        cadence: row.cadence,
        windowStart: row.windowStart,
        windowEnd: row.windowEnd,
        contentCutoffAt: row.contentCutoffAt!,
        messageCount: row.messageCount
      }));
  }

  async claimRecoverableEmptyBriefingWindow(id: string, leaseMs: number, now = new Date()) {
    const row = Array.from(this.briefingWindows.values()).find((entry) => entry.id === id);
    if (!row || row.state !== "empty" || row.editionId || row.messageCount === 0 || row.recoveryAttemptedAt) return null;
    const leaseToken = crypto.randomUUID();
    const leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
    row.state = "running";
    row.leaseToken = leaseToken;
    row.leaseUntil = leaseUntil;
    row.recoveryAttemptedAt = now.toISOString();
    row.error = undefined;
    return {
      id: row.id,
      briefingId: row.briefingId,
      cadence: row.cadence,
      windowStart: row.windowStart,
      windowEnd: row.windowEnd,
      leaseToken,
      leaseUntil
    };
  }

  async failBriefingWindow(id: string, leaseToken: string, error: string): Promise<void> {
    const row = Array.from(this.briefingWindows.values()).find((entry) => entry.id === id);
    if (!row || row.leaseToken !== leaseToken) return;
    row.state = "failed";
    row.error = error;
    row.leaseToken = undefined;
    row.leaseUntil = undefined;
  }

  async getExistingItems(briefingId: string, now = new Date()): Promise<BriefingItem[]> {
    const briefing = await this.getBriefingById(briefingId);
    const items = Array.from(this.itemsByBriefing.get(briefingId)?.values() ?? []).filter(
      (item) => new Date(item.expiresAt).getTime() > now.getTime()
    ).sort((left, right) => right.itemAt.localeCompare(left.itemAt)).slice(0, PROCESSOR_EXISTING_ITEM_QUERY_LIMIT);
    return collapseDuplicateBriefingItems(items, briefing ?? undefined);
  }

  async saveBriefingItems(briefingId: string, items: BriefingItem[], _now = new Date()): Promise<void> {
    const briefing = await this.getBriefingById(briefingId);
    const scoped = this.itemsByBriefing.get(briefingId) ?? new Map<string, BriefingItem>();
    for (const item of collapseDuplicateBriefingItems(items, briefing ?? undefined)) {
      const match = Array.from(scoped.values()).find((candidate) =>
        eventKeysForItem(candidate).some((key) => eventKeysForItem(item).includes(key))
      );
      if (match && match.id !== item.id) {
        scoped.set(match.id, structuredClone(mergeBriefingItem(match, item, briefing ?? undefined)));
      } else {
        scoped.set(item.id, structuredClone({
          ...item,
          eventKey: item.eventKey ?? primaryEventKeyForEvidence(item.evidence),
          mergedUpdateCount: Math.max(0, item.evidence.length - 1)
        }));
      }
    }
    this.itemsByBriefing.set(briefingId, scoped);
  }

  async repairDuplicateBriefingItems(briefingId: string, now = new Date()): Promise<number> {
    const briefing = await this.getBriefingById(briefingId);
    const scoped = this.itemsByBriefing.get(briefingId) ?? new Map<string, BriefingItem>();
    const active = Array.from(scoped.values()).filter((item) => new Date(item.expiresAt).getTime() > now.getTime());
    const collapsed = collapseDuplicateBriefingItems(active, briefing ?? undefined);
    const collapsedIds = new Set(collapsed.map((item) => item.id));
    let deleted = 0;
    for (const id of Array.from(scoped.keys())) {
      const item = scoped.get(id);
      if (item && new Date(item.expiresAt).getTime() > now.getTime() && !collapsedIds.has(id)) {
        scoped.delete(id);
        deleted += 1;
      }
    }
    for (const item of collapsed) scoped.set(item.id, structuredClone(item));
    this.itemsByBriefing.set(briefingId, scoped);
    return deleted;
  }

  async listFeedItems(ownerAccountId: string, slug: string, includeEvidence: boolean, now = new Date()): Promise<BriefingItem[]> {
    const briefing = await this.getBriefingBySlug(ownerAccountId, slug);
    if (!briefing) return [];
    const items = await this.getExistingItems(briefing.id, now);
    return includeEvidence ? items : items.map((item) => ({ ...item, evidence: [] }));
  }

  async getFeedItemEvidence(briefingId: string, itemId: string, now = new Date()): Promise<BriefingEvidence[]> {
    const item = this.itemsByBriefing.get(briefingId)?.get(itemId);
    if (!item || new Date(item.expiresAt).getTime() <= now.getTime()) return [];
    return structuredClone(item.evidence);
  }

  async saveBriefingEdition(edition: BriefingEdition): Promise<void> {
    const scoped = this.editionsByBriefing.get(edition.briefingId) ?? new Map<string, BriefingEdition>();
    const existing = Array.from(scoped.values()).find((candidate) =>
      candidate.cadence === edition.cadence &&
      candidate.windowStart === edition.windowStart &&
      candidate.windowEnd === edition.windowEnd
    );
    scoped.set(existing?.id ?? edition.id, structuredClone({ ...edition, id: existing?.id ?? edition.id }));
    this.editionsByBriefing.set(edition.briefingId, scoped);
  }

  async listBriefingEditions(
    briefingId: string,
    includeSections: boolean,
    now = new Date(),
    limit = 50
  ): Promise<BriefingEdition[]> {
    const retentionCutoff = now.getTime() - FIXED_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    return Array.from(this.editionsByBriefing.get(briefingId)?.values() ?? [])
      .filter((edition) => {
        const publishedAt = new Date(edition.publishedAt).getTime();
        return publishedAt > retentionCutoff && publishedAt <= now.getTime();
      })
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
      .slice(0, limit)
      .map((edition) => includeSections ? structuredClone(edition) : { ...structuredClone(edition), sections: [] });
  }

  async getBriefingEdition(briefingId: string, editionId: string, now = new Date()): Promise<BriefingEdition | null> {
    const edition = this.editionsByBriefing.get(briefingId)?.get(editionId);
    const publishedAt = edition ? new Date(edition.publishedAt).getTime() : Number.NaN;
    if (!edition ||
      publishedAt > now.getTime() ||
      publishedAt <= now.getTime() - FIXED_RETENTION_DAYS * 24 * 60 * 60 * 1000) return null;
    return structuredClone(edition);
  }

  async getHealth(briefingId?: string, now = new Date()): Promise<HealthStatus> {
    const processing = { queued: 0, completed: 0, failed: 0, staleQueued: 0 };
    for (const job of this.jobs.values()) {
      if (briefingId && job.briefingId !== briefingId) continue;
      if (job.state === "queued" || job.updatedAt >= new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()) processing[job.state] += 1;
      const orphaned = !job.lastEnqueuedAt && job.updatedAt < new Date(now.getTime() - ORPHANED_PROCESSING_JOB_STALE_MS).toISOString();
      const abandoned = Boolean(job.lastEnqueuedAt && job.lastEnqueuedAt < new Date(now.getTime() - ENQUEUED_PROCESSING_JOB_STALE_MS).toISOString());
      if (job.state === "queued" && (orphaned || abandoned) && (!job.leaseUntil || job.leaseUntil < now.toISOString())) processing.staleQueued += 1;
    }
    const scopedSources = Array.from(this.sources.values()).filter((source) => !briefingId || source.briefingId === briefingId);
    const sources = {
      enabled: scopedSources.filter((source) => source.enabled).length,
      degraded: scopedSources.filter((source) => source.enabled && source.healthState === "degraded").length,
      backoff: scopedSources.filter((source) => source.enabled && source.healthState === "backoff").length,
      disabled: scopedSources.filter((source) => !source.enabled).length
    };
    const accountId = briefingId
      ? this.briefings.get(briefingId)?.ownerAccountId ?? "__missing_account__"
      : undefined;
    const usage = await this.getSpendUsage(accountId, now);
    return {
      lastSourceEventAt:
        briefingId
          ? this.settings.get(`last_imported_message_at:${briefingId}`) ??
            this.settings.get(`last_source_event_at:${briefingId}`) ??
            this.settings.get(`last_telegram_event_at:${briefingId}`)
          : this.settings.get("last_imported_message_at") ??
            this.settings.get("last_source_event_at") ??
            this.settings.get("last_telegram_event_at"),
      lastSourceFetchAt:
        briefingId
          ? this.settings.get(`last_source_fetch_at:${briefingId}`)
          : this.settings.get("last_source_fetch_at"),
      lastImportedMessageAt:
        briefingId
          ? this.settings.get(`last_imported_message_at:${briefingId}`)
          : this.settings.get("last_imported_message_at"),
      latestPublishedAt: latestEditionPublishedAt(this.editionsByBriefing, briefingId, now),
      nextBriefingAt: briefingId
        ? (() => {
            const briefing = this.briefings.get(briefingId);
            return briefing ? visibleNextBriefingAt(briefing, now) : undefined;
          })()
        : undefined,
      processing,
      sources,
      spendToday: {
        llmUsd: usage.llm.dayUsd,
        collectionUsd: usage.collection.dayUsd
      }
    };
  }

  async createSourceRun(input: {
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
  }, now = new Date()): Promise<SourceRunRecord> {
    if (input.idempotencyKey) {
      const existing = Array.from(this.sourceRuns.values())
        .find((run) => run.idempotencyKey === input.idempotencyKey);
      if (existing) return { ...existing };
    }
    const run: SourceRunRecord = {
      id: `source_run_${this.sourceRuns.size + 1}`,
      sourceId: input.sourceId,
      briefingId: input.briefingId,
      provider: input.provider,
      actorId: input.actorId,
      actorRunId: input.actorRunId,
      datasetId: input.datasetId,
      state: input.state,
      itemCount: 0,
      estimatedCostUsd: input.estimatedCostUsd,
      idempotencyKey: input.idempotencyKey,
      startedAt: input.startedAt ?? now.toISOString(),
      updatedAt: now.toISOString()
    };
    this.sourceRuns.set(run.id, run);
    return { ...run };
  }

  async updateSourceRun(input: {
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
  }, now = new Date()): Promise<void> {
    const run = this.sourceRuns.get(input.id);
    if (!run) return;
    if (input.actorRunId) run.actorRunId = input.actorRunId;
    if (input.datasetId) run.datasetId = input.datasetId;
    if (input.state) run.state = input.state;
    if (input.itemCount !== undefined) run.itemCount = input.itemCount;
    if (input.estimatedCostUsd !== undefined) run.estimatedCostUsd = input.estimatedCostUsd;
    if (input.actualCostUsd !== undefined) run.actualCostUsd = input.actualCostUsd;
    if (input.archiveKey) run.archiveKey = input.archiveKey;
    run.error = input.error;
    if (input.completedAt) run.completedAt = input.completedAt;
    run.updatedAt = now.toISOString();
  }

  async listSourceRuns(input?: {
    briefingId?: string;
    sourceId?: string;
    provider?: SourceProvider;
    states?: SourceRunState[];
    limit?: number;
  }): Promise<SourceRunRecord[]> {
    const states = input?.states ? new Set(input.states) : null;
    return Array.from(this.sourceRuns.values())
      .filter((run) => !input?.briefingId || run.briefingId === input.briefingId)
      .filter((run) => !input?.sourceId || run.sourceId === input.sourceId)
      .filter((run) => !input?.provider || run.provider === input.provider)
      .filter((run) => !states || states.has(run.state))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, input?.limit ?? 50)
      .map((run) => ({ ...run }));
  }

  async hasActiveCanonicalSourceRun(sourceId: string): Promise<boolean> {
    const target = this.sources.get(sourceId);
    if (!target) return false;
    const canonicalKey = target.canonicalKey ?? target.id;
    return Array.from(this.sourceRuns.values()).some((run) => {
      if (run.provider !== "apify" || (run.state !== "queued" && run.state !== "running")) return false;
      const activeSource = this.sources.get(run.sourceId);
      return Boolean(activeSource && (activeSource.canonicalKey ?? activeSource.id) === canonicalKey);
    });
  }

  async getProviderHealthSummary(provider: RuntimeProvider, now = new Date()): Promise<ProviderHealthSummary> {
    const sources = Array.from(this.sources.values()).filter((source) => {
      if (!source.enabled || !sourceMatchesRuntimeProvider(source, provider)) return false;
      const briefing = this.briefings.get(source.briefingId);
      return Boolean(briefing && !briefing.paused && !this.accounts.get(briefing.ownerAccountId)?.disabledAt);
    });
    const freshSources = sources.filter((source) => {
      if (!source.lastSuccessAt) return false;
      const briefing = this.briefings.get(source.briefingId);
      return Boolean(briefing && source.lastSuccessAt >= exploreFreshnessCutoff(briefing.briefingCadence, now));
    }).length;
    const sourceIds = new Set(sources.map((source) => source.id));
    const runSince = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const runs = Array.from(this.sourceRuns.values()).filter(
      (run) => sourceIds.has(run.sourceId) && run.startedAt >= runSince
    );
    const lastDlq = this.settings.get("last_source_dlq_at");
    return {
      enabledSources: sources.length,
      freshSources,
      degradedSources: sources.filter((source) => source.healthState === "degraded").length,
      backoffSources: sources.filter((source) => source.healthState === "backoff").length,
      recentSucceededRuns: runs.filter((run) => run.state === "succeeded").length,
      recentFailedRuns: runs.filter((run) => run.state === "failed").length,
      recentDlq: Boolean(lastDlq && lastDlq >= runSince)
    };
  }

  async sumSourceRunCosts(input: {
    briefingId?: string;
    sourceId?: string;
    actorId?: string;
    since: string;
  }): Promise<number> {
    return Array.from(this.sourceRuns.values())
      .filter((run) => !input.briefingId || run.briefingId === input.briefingId)
      .filter((run) => !input.sourceId || run.sourceId === input.sourceId)
      .filter((run) => !input.actorId || run.actorId === input.actorId)
      .filter((run) => run.startedAt >= input.since)
      .reduce((total, run) => total + (run.actualCostUsd ?? run.estimatedCostUsd ?? 0), 0);
  }

  async reserveSpend(input: {
    idempotencyKey: string;
    accountId: string;
    briefingId?: string;
    category: SpendCategory;
    provider: SpendProvider;
    amountUsd: number;
    limits: SpendBudgetLimits;
  }, now = new Date()): Promise<SpendReservationResult> {
    const idempotencyKeyHash = await sha256Text(input.idempotencyKey);
    const existing = this.spendLedger.find(
      (event) => event.idempotencyKey === input.idempotencyKey && event.eventType === "reservation"
    );
    if (existing || (this.spendIdempotencyTombstones.get(idempotencyKeyHash) ?? "") > now.toISOString()) {
      return {
        status: "duplicate",
        idempotencyKey: input.idempotencyKey,
        reservedUsd: existing?.amountUsd ?? input.amountUsd
      };
    }
    const accountUsage = await this.getSpendUsage(input.accountId, now);
    const globalUsage = await this.getSpendUsage(undefined, now);
    const accountCategory = accountUsage[input.category];
    const globalCategory = globalUsage[input.category];
    const reason = accountCategory.dayUsd + input.amountUsd > input.limits.accountDailyUsd
      ? "account_daily"
      : accountCategory.monthUsd + input.amountUsd > input.limits.accountMonthlyUsd
        ? "account_monthly"
        : globalCategory.dayUsd + input.amountUsd > input.limits.globalDailyUsd
          ? "global_daily"
          : globalCategory.monthUsd + input.amountUsd > input.limits.globalMonthlyUsd
            ? "global_monthly"
            : globalUsage.totalMonthUsd + input.amountUsd > input.limits.totalMonthlyUsd
              ? "total_monthly"
              : undefined;
    if (reason) {
      return {
        status: "denied",
        idempotencyKey: input.idempotencyKey,
        reservedUsd: input.amountUsd,
        reason
      };
    }
    this.spendLedger.push({
      idempotencyKey: input.idempotencyKey,
      accountId: input.accountId,
      briefingId: input.briefingId,
      category: input.category,
      provider: input.provider,
      eventType: "reservation",
      amountUsd: input.amountUsd,
      createdAt: now.toISOString()
    });
    return {
      status: "created",
      idempotencyKey: input.idempotencyKey,
      reservedUsd: input.amountUsd
    };
  }

  async settleSpend(input: {
    idempotencyKey: string;
    actualUsd: number;
  }, now = new Date()): Promise<void> {
    if (this.spendLedger.some((event) =>
      event.idempotencyKey === input.idempotencyKey &&
      (event.eventType === "settlement" || event.eventType === "release"))) return;
    const reservation = this.spendLedger.find(
      (event) => event.idempotencyKey === input.idempotencyKey && event.eventType === "reservation"
    );
    if (!reservation) return;
    this.spendLedger.push({
      ...reservation,
      eventType: "settlement",
      amountUsd: input.actualUsd - reservation.amountUsd,
      createdAt: now.toISOString()
    });
  }

  async releaseSpend(input: {
    idempotencyKey: string;
  }, now = new Date()): Promise<void> {
    if (this.spendLedger.some((event) =>
      event.idempotencyKey === input.idempotencyKey &&
      (event.eventType === "settlement" || event.eventType === "release"))) return;
    const reservation = this.spendLedger.find(
      (event) => event.idempotencyKey === input.idempotencyKey && event.eventType === "reservation"
    );
    if (!reservation) return;
    this.spendLedger.push({
      ...reservation,
      eventType: "release",
      amountUsd: -reservation.amountUsd,
      createdAt: now.toISOString()
    });
  }

  async getSpendUsage(accountId?: string, now = new Date()): Promise<SpendUsage> {
    const dayStart = startOfUtcDay(now).toISOString();
    const monthStart = startOfUtcMonth(now).toISOString();
    const reservations = this.spendLedger.filter(
      (event) => event.eventType === "reservation" && (!accountId || event.accountId === accountId)
    );
    const sum = (category: SpendCategory, since: string) => reservations
      .filter((reservation) => reservation.category === category && reservation.createdAt >= since)
      .reduce((total, reservation) => total + this.spendLedger
        .filter((event) => event.idempotencyKey === reservation.idempotencyKey)
        .reduce((operationTotal, event) => operationTotal + event.amountUsd, 0), 0);
    const aggregateValues = accountId ? [] : Array.from(this.spendDailyAggregates.values());
    const aggregateSum = (category: SpendCategory | undefined, since: string) => aggregateValues
      .filter((aggregate) => (!category || aggregate.category === category) && aggregate.day >= since.slice(0, 10))
      .reduce((total, aggregate) => total + aggregate.amountUsd, 0);
    return {
      collection: {
        dayUsd: sum("collection", dayStart) + aggregateSum("collection", dayStart),
        monthUsd: sum("collection", monthStart) + aggregateSum("collection", monthStart)
      },
      llm: {
        dayUsd: sum("llm", dayStart) + aggregateSum("llm", dayStart),
        monthUsd: sum("llm", monthStart) + aggregateSum("llm", monthStart)
      },
      totalMonthUsd: reservations
        .filter((reservation) => reservation.createdAt >= monthStart)
        .reduce((total, reservation) => total + this.spendLedger
          .filter((event) => event.idempotencyKey === reservation.idempotencyKey)
          .reduce((operationTotal, event) => operationTotal + event.amountUsd, 0), 0) +
        aggregateSum(undefined, monthStart)
    };
  }

  async countStaleSpendReservations(before: string): Promise<number> {
    return this.spendLedger.filter((reservation) =>
      reservation.eventType === "reservation" &&
      reservation.createdAt < before &&
      !this.spendLedger.some((terminal) =>
        terminal.idempotencyKey === reservation.idempotencyKey &&
        (terminal.eventType === "settlement" || terminal.eventType === "release")
      )
    ).length;
  }

  async reconcileStaleSpendReservations(
    before: string,
    now = new Date(),
    limit = 100
  ): Promise<{ reconciled: number; hasMore: boolean }> {
    const boundedLimit = Math.min(1_000, Math.max(1, Math.trunc(limit)));
    const stale = this.spendLedger.filter((reservation) =>
      reservation.eventType === "reservation" &&
      reservation.createdAt < before &&
      !this.spendLedger.some((terminal) =>
        terminal.idempotencyKey === reservation.idempotencyKey &&
        (terminal.eventType === "settlement" || terminal.eventType === "release")
      ) &&
      !Array.from(this.sourceRuns.values()).some((run) =>
        run.idempotencyKey === reservation.idempotencyKey &&
        (run.state === "queued" || run.state === "running") &&
        run.updatedAt >= before
      )
    ).sort((left, right) => left.createdAt.localeCompare(right.createdAt) ||
      left.idempotencyKey.localeCompare(right.idempotencyKey));
    for (const reservation of stale.slice(0, boundedLimit)) {
      const hasSourceRun = Array.from(this.sourceRuns.values()).some(
        (run) => run.idempotencyKey === reservation.idempotencyKey
      );
      const canProveProviderWasNotReached = reservation.category === "collection" && !hasSourceRun;
      this.spendLedger.push({
        ...reservation,
        eventType: canProveProviderWasNotReached ? "release" : "settlement",
        amountUsd: canProveProviderWasNotReached ? -reservation.amountUsd : 0,
        createdAt: now.toISOString()
      });
    }
    return {
      reconciled: Math.min(stale.length, boundedLimit),
      hasMore: stale.length > boundedLimit
    };
  }

  async archiveExpiredSpend(now = new Date(), limit = SPEND_RETENTION_BATCH_LIMIT): Promise<SpendRetentionResult> {
    const cutoff = new Date(now.getTime() - SPEND_DETAIL_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const archived = await this.archiveSpendOperationsInMemory({
      before: cutoff,
      requireTerminal: true,
      now,
      limit
    });
    const aggregateCutoff = subtractUtcMonths(now, SPEND_AGGREGATE_RETENTION_MONTHS).toISOString().slice(0, 10);
    const boundedLimit = Math.min(1_000, Math.max(1, Math.trunc(limit)));
    const expiredAggregates = Array.from(this.spendDailyAggregates.entries())
      .filter(([, aggregate]) => aggregate.day < aggregateCutoff)
      .sort((left, right) => left[1].day.localeCompare(right[1].day))
      .slice(0, boundedLimit);
    for (const [key] of expiredAggregates) this.spendDailyAggregates.delete(key);
    const expiredTombstones = Array.from(this.spendIdempotencyTombstones.entries())
      .filter(([, expiresAt]) => expiresAt <= now.toISOString())
      .sort((left, right) => left[1].localeCompare(right[1]))
      .slice(0, boundedLimit);
    for (const [key] of expiredTombstones) this.spendIdempotencyTombstones.delete(key);
    return {
      ...archived,
      aggregatesDeleted: expiredAggregates.length,
      tombstonesDeleted: expiredTombstones.length,
      hasMore: archived.hasMore ||
        expiredAggregates.length >= boundedLimit ||
        expiredTombstones.length >= boundedLimit
    };
  }

  private async archiveAccountSpendDetailsInMemory(accountId: string, now: Date): Promise<void> {
    let hasMore = true;
    while (hasMore) {
      const result = await this.archiveSpendOperationsInMemory({
        accountId,
        requireTerminal: false,
        now,
        limit: SPEND_RETENTION_BATCH_LIMIT
      });
      hasMore = result.hasMore;
    }
  }

  private async archiveSpendOperationsInMemory(input: {
    accountId?: string;
    before?: string;
    requireTerminal: boolean;
    now: Date;
    limit: number;
  }): Promise<Pick<SpendRetentionResult, "archivedOperations" | "detailRowsDeleted" | "hasMore">> {
    const boundedLimit = Math.min(
      SPEND_RETENTION_BATCH_LIMIT,
      Math.max(1, Math.trunc(input.limit))
    );
    const reservations = this.spendLedger
      .filter((event) => event.eventType === "reservation")
      .filter((event) => !input.accountId || event.accountId === input.accountId)
      .filter((event) => !input.before || event.createdAt < input.before)
      .filter((event) => !input.requireTerminal || this.spendLedger.some((terminal) =>
        terminal.idempotencyKey === event.idempotencyKey &&
        (terminal.eventType === "settlement" || terminal.eventType === "release")
      ))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) ||
        left.idempotencyKey.localeCompare(right.idempotencyKey));
    const candidates = reservations.slice(0, boundedLimit);
    const candidateKeys = new Set(candidates.map((candidate) => candidate.idempotencyKey));
    let detailRowsDeleted = 0;
    for (const reservation of candidates) {
      const amountUsd = this.spendLedger
        .filter((event) => event.idempotencyKey === reservation.idempotencyKey)
        .reduce((total, event) => total + event.amountUsd, 0);
      const day = reservation.createdAt.slice(0, 10);
      const aggregateKey = `${day}|${reservation.category}|${reservation.provider}`;
      const aggregate = this.spendDailyAggregates.get(aggregateKey);
      this.spendDailyAggregates.set(aggregateKey, {
        day,
        category: reservation.category,
        provider: reservation.provider,
        amountUsd: (aggregate?.amountUsd ?? 0) + amountUsd,
        operationCount: (aggregate?.operationCount ?? 0) + 1
      });
      this.spendIdempotencyTombstones.set(
        await sha256Text(reservation.idempotencyKey),
        addUtcMonths(new Date(reservation.createdAt), SPEND_AGGREGATE_RETENTION_MONTHS).toISOString()
      );
    }
    this.spendLedger = this.spendLedger.filter((event) => {
      if (!candidateKeys.has(event.idempotencyKey)) return true;
      detailRowsDeleted += 1;
      return false;
    });
    return {
      archivedOperations: candidates.length,
      detailRowsDeleted,
      hasMore: reservations.length > boundedLimit
    };
  }

  async recordLlmUsage(input: {
    briefingId: string;
    model: string;
    purpose: "summary" | "importance_review" | "event_review" | "edition_summary";
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  }, now = new Date()): Promise<void> {
    this.llmUsageEvents.push({ ...input, createdAt: now.toISOString() });
  }

  async sumLlmUsageCost(input: {
    briefingId?: string;
    since: string;
  }): Promise<number> {
    return this.llmUsageEvents
      .filter((event) => (!input.briefingId || event.briefingId === input.briefingId) && event.createdAt >= input.since)
      .reduce((total, event) => total + event.estimatedCostUsd, 0);
  }

  async getSetting(key: string): Promise<string | null> {
    return this.settings.get(key) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }

  async saveRegistrationEmailReceipt(input: {
    nonceHash: string;
    releaseSha: string;
    recipientFingerprint: string;
    expiresAt: string;
  }, now = new Date()): Promise<void> {
    for (const [key, receipt] of this.registrationEmailReceipts) {
      if (receipt.expiresAt <= now.toISOString()) this.registrationEmailReceipts.delete(key);
    }
    this.registrationEmailReceipts.set(
      `${input.releaseSha}:${input.recipientFingerprint}`,
      { ...input }
    );
  }

  async consumeRegistrationEmailReceipt(input: {
    nonceHash: string;
    releaseSha: string;
    recipientFingerprint: string;
  }, now = new Date()): Promise<boolean> {
    const key = `${input.releaseSha}:${input.recipientFingerprint}`;
    const receipt = this.registrationEmailReceipts.get(key);
    if (
      !receipt ||
      receipt.nonceHash !== input.nonceHash ||
      receipt.expiresAt <= now.toISOString()
    ) return false;
    this.registrationEmailReceipts.delete(key);
    return true;
  }

  async recordOperationalEvent(
    input: Omit<OperationalEvent, "id" | "occurredAt">,
    now = new Date()
  ): Promise<void> {
    this.operationalEvents.push({
      ...input,
      id: `operation_${this.operationalEvents.length + 1}`,
      subsystem: input.subsystem.slice(0, 100),
      bodyType: input.bodyType?.slice(0, 100),
      bodyId: input.bodyId?.slice(0, 200),
      releaseSha: input.releaseSha?.slice(0, 100),
      detail: input.detail?.slice(0, 200),
      occurredAt: now.toISOString()
    });
  }

  async listOperationalEvents(input: {
    since: string;
    category?: OperationalEvent["category"];
    status?: OperationalEvent["status"];
    limit?: number;
  }): Promise<OperationalEvent[]> {
    return this.operationalEvents
      .filter((event) => event.occurredAt >= input.since)
      .filter((event) => !input.category || event.category === input.category)
      .filter((event) => !input.status || event.status === input.status)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id))
      .slice(0, Math.min(500, Math.max(1, input.limit ?? 100)))
      .map((event) => ({ ...event }));
  }

  async deleteOperationalEventsBefore(before: string, limit = 1_000): Promise<{ deleted: number; hasMore: boolean }> {
    const boundedLimit = Math.min(5_000, Math.max(1, Math.trunc(limit)));
    const candidates = this.operationalEvents
      .filter((event) => event.occurredAt < before)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
    const ids = new Set(candidates.slice(0, boundedLimit).map((event) => event.id));
    this.operationalEvents = this.operationalEvents.filter((event) => !ids.has(event.id));
    return { deleted: ids.size, hasMore: candidates.length > boundedLimit };
  }

  async listExpiredRawPayloadKeys(now = new Date(), limit = 1_000): Promise<string[]> {
    const latestExpiryByKey = new Map<string, number>();
    for (const message of this.rawMessages.values()) {
      if (!message.rawPayloadKey) continue;
      const current = latestExpiryByKey.get(message.rawPayloadKey) ?? Number.NEGATIVE_INFINITY;
      latestExpiryByKey.set(message.rawPayloadKey, Math.max(current, new Date(message.expiresAt).getTime()));
    }
    const sourceRunCutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const candidateKeys = new Set(
      Array.from(latestExpiryByKey)
        .filter(([, latestExpiry]) => latestExpiry <= now.getTime())
        .map(([key]) => key)
    );
    for (const run of this.sourceRuns.values()) {
      const runAt = new Date(run.completedAt ?? run.startedAt ?? run.updatedAt).getTime();
      if (run.archiveKey && runAt <= sourceRunCutoff) candidateKeys.add(run.archiveKey);
    }
    return Array.from(candidateKeys).filter((key) =>
      !Array.from(this.rawMessages.values()).some(
        (message) => message.rawPayloadKey === key && new Date(message.expiresAt).getTime() > now.getTime()
      ) &&
      !Array.from(this.sourceRuns.values()).some((run) =>
        run.archiveKey === key &&
        new Date(run.completedAt ?? run.startedAt ?? run.updatedAt).getTime() > sourceRunCutoff
      )
    ).sort().slice(0, Math.max(0, limit));
  }

  async clearExpiredSourceRunArchiveKeys(before: string, archiveKeys?: string[]): Promise<number> {
    const keySet = archiveKeys ? new Set(archiveKeys) : null;
    let cleared = 0;
    for (const run of this.sourceRuns.values()) {
      const runAt = run.completedAt ?? run.startedAt ?? run.updatedAt;
      if (run.archiveKey && runAt <= before && (!keySet || keySet.has(run.archiveKey))) {
        run.archiveKey = undefined;
        cleared += 1;
      }
    }
    return cleared;
  }

  async clearExpiredRawPayloadKeys(before: string, archiveKeys: string[]): Promise<number> {
    const keySet = new Set(archiveKeys);
    let cleared = 0;
    for (const message of this.rawMessages.values()) {
      if (message.rawPayloadKey && keySet.has(message.rawPayloadKey) && message.expiresAt <= before) {
        message.rawPayloadKey = undefined;
        cleared += 1;
      }
    }
    return cleared;
  }

  async deleteExpired(now = new Date(), limit = 1_000): Promise<{ deleted: number; hasMore: boolean }> {
    const boundedLimit = Math.min(5_000, Math.max(1, Math.trunc(limit)));
    let deleted = 0;
    let hasMore = false;
    const deleteBounded = <T>(
      entries: Array<[string, T]>,
      shouldDelete: (value: T) => boolean,
      remove: (id: string) => void
    ) => {
      const candidates = entries.filter(([, value]) => shouldDelete(value));
      for (const [id] of candidates.slice(0, boundedLimit)) {
        remove(id);
        deleted += 1;
      }
      if (candidates.length > boundedLimit) hasMore = true;
    };
    deleteBounded(
      Array.from(this.rawMessages.entries()),
      (message) => new Date(message.expiresAt).getTime() <= now.getTime(),
      (id) => this.rawMessages.delete(id)
    );
    for (const items of this.itemsByBriefing.values()) {
      deleteBounded(
        Array.from(items.entries()),
        (item) => new Date(item.expiresAt).getTime() <= now.getTime(),
        (id) => items.delete(id)
      );
    }
    const editionCutoff = now.getTime() - FIXED_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const editions of this.editionsByBriefing.values()) {
      deleteBounded(
        Array.from(editions.entries()),
        (edition) => new Date(edition.publishedAt).getTime() <= editionCutoff,
        (id) => editions.delete(id)
      );
    }
    deleteBounded(
      Array.from(this.briefingWindows.entries()),
      (window) => new Date(window.windowEnd).getTime() <= editionCutoff,
      (id) => this.briefingWindows.delete(id)
    );
    const sourceRunCutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    deleteBounded(
      Array.from(this.sourceRuns.entries()),
      (run) => Boolean((run.state === "succeeded" || run.state === "failed") &&
        !run.archiveKey &&
        run.completedAt &&
        new Date(run.completedAt).getTime() <= sourceRunCutoff),
      (id) => this.sourceRuns.delete(id)
    );
    const llmUsageCutoff = now.getTime() - SPEND_DETAIL_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const expiredLlmUsage = this.llmUsageEvents
      .filter((event) => new Date(event.createdAt).getTime() <= llmUsageCutoff)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const deletedLlmUsage = new Set(expiredLlmUsage.slice(0, boundedLimit));
    this.llmUsageEvents = this.llmUsageEvents.filter((event) => !deletedLlmUsage.has(event));
    deleted += deletedLlmUsage.size;
    if (expiredLlmUsage.length > boundedLimit) hasMore = true;
    return { deleted, hasMore };
  }
}

function scopedSourceId(briefingId: string, sourceId: string): string {
  return `${briefingId}::${sourceId}`;
}

function stableSourceKey(provider: SourceProvider, kind: SourceKind, value: string): string {
  return `${provider}_${kind}_${stableHash(value.toLowerCase().trim())}`;
}

function canonicalSourceKey(
  provider: SourceProvider,
  kind: SourceKind,
  value: string,
  ownerAccountId?: string
): string {
  const accountScope = isPaidSourceKind(kind) && ownerAccountId ? `${ownerAccountId}|` : "";
  if (kind === "google_news") {
    try {
      const url = new URL(value);
      const rawQuery = url.search.match(/(?:^|[?&])q=([^&]+)/i)?.[1];
      const language = url.searchParams.get("hl")?.match(/^[A-Za-z]{2}/)?.[0]?.toLowerCase() ?? "en";
      if (rawQuery) return `${accountScope}apify|google_news|${language}|${rawQuery.toLowerCase()}`;
    } catch {
      // Fall back to the normalized source value for legacy records.
    }
    return `${accountScope}apify|google_news|${value.toLowerCase().trim().replace(/\/$/, "")}`;
  }
  return `${accountScope}${provider}|${kind}|${value.toLowerCase().trim().replace(/\/$/, "")}`;
}

function compareBriefingsByStarsAndAge(
  left: BriefingConfig,
  right: BriefingConfig,
  createdAt: Map<string, string>
): number {
  if (left.stars !== right.stars) return right.stars - left.stars;
  const leftCreatedAt = createdAt.get(left.id) ?? "";
  const rightCreatedAt = createdAt.get(right.id) ?? "";
  if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt.localeCompare(rightCreatedAt);
  return left.id.localeCompare(right.id);
}

function emptyProviderHealthSummary(): ProviderHealthSummary {
  return {
    enabledSources: 0,
    freshSources: 0,
    degradedSources: 0,
    backoffSources: 0,
    recentSucceededRuns: 0,
    recentFailedRuns: 0,
    recentDlq: false
  };
}

function runtimeProviderSourcePredicate(provider: RuntimeProvider): string | null {
  if (provider === "rss") return "sources.provider = 'rss' AND sources.kind = 'rss_feed'";
  if (provider === "telegram") return "sources.provider = 'telegram'";
  if (provider === "google_news") return "sources.kind = 'google_news'";
  if (provider === "x") return "sources.kind IN ('x_profile', 'x_search')";
  if (provider === "linkedin") return "sources.kind IN ('linkedin_company', 'linkedin_profile')";
  if (provider === "generic_apify") return "sources.kind = 'apify_actor'";
  return null;
}

function sourceMatchesRuntimeProvider(source: SourceRecord, provider: RuntimeProvider): boolean {
  if (provider === "rss") return source.provider === "rss" && source.kind === "rss_feed";
  if (provider === "telegram") return source.provider === "telegram";
  if (provider === "google_news") return source.kind === "google_news";
  if (provider === "x") return source.kind === "x_profile" || source.kind === "x_search";
  if (provider === "linkedin") return source.kind === "linkedin_company" || source.kind === "linkedin_profile";
  if (provider === "generic_apify") return source.kind === "apify_actor";
  return false;
}

function rowToAccount(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    emailVerifiedAt: row.email_verified_at ?? undefined,
    disabledAt: row.disabled_at ?? undefined,
    sessionVersion: Number(row.session_version ?? 1),
    termsAcceptedAt: row.terms_accepted_at ?? undefined,
    termsVersion: row.terms_version ?? undefined,
    privacyVersion: row.privacy_version ?? undefined,
    acceptableUseVersion: row.acceptable_use_version ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToAccountWithStats(row: AccountRow): AccountWithStats {
  return {
    ...rowToAccount(row),
    briefingCount: Number(row.briefing_count ?? 0)
  };
}

function rowToUsernameAlias(row: UsernameAliasRow): UsernameAliasRecord {
  return {
    username: row.username,
    accountId: row.account_id,
    isCurrent: row.is_current === 1,
    createdAt: row.created_at
  };
}

function rowToAuthToken(row: AuthTokenRow): AuthTokenRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    purpose: row.purpose,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at ?? undefined,
    createdAt: row.created_at
  };
}

function rowToBriefing(row: BriefingRow): BriefingConfig {
  return {
    id: row.id,
    ownerAccountId: row.owner_account_id,
    ownerUsername: row.owner_username,
    slug: row.slug,
    title: row.title,
    stars: row.stars ?? 0,
    interestProfile: row.interest_profile,
    styleInstruction: row.style_instruction ?? undefined,
    publicFeedEnabled: row.public_feed_enabled === 1,
    paused: row.paused === 1,
    language: row.language === "ar" || row.language === "fr" ? row.language : "en",
    intensity: row.intensity === "low" || row.intensity === "high" ? row.intensity : "medium",
    briefingCadence: normalizedBriefingCadence(row.briefing_cadence ?? undefined),
    briefingTimeOfDay: normalizedTimeOfDay(row.briefing_time_of_day ?? undefined),
    briefingTimezone: row.briefing_timezone || "UTC",
    nextBriefingAt: row.next_briefing_at ?? undefined,
    retentionDays: FIXED_RETENTION_DAYS
  };
}

function rowToBriefingEdition(row: BriefingEditionRow, includeSections: boolean): BriefingEdition {
  return {
    id: row.id,
    briefingId: row.briefing_id,
    cadence: row.cadence,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    title: row.title,
    summary: row.summary,
    sections: includeSections ? parseJson<BriefingEditionSection[]>(row.sections_json, []) : [],
    status: row.status,
    generationMode: row.generation_mode ?? "deterministic",
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToSource(row: SourceRow): SourceRecord {
  const provider = row.provider ?? "telegram";
  const kind = row.kind ?? (row.type === "group" ? "telegram_group" : "telegram_channel");
  return {
    id: row.id,
    briefingId: row.briefing_id,
    title: row.title,
    type: row.type,
    provider,
    kind,
    username: row.username ?? undefined,
    input: row.input ?? undefined,
    url: row.source_url ?? (row.username ? `https://t.me/${row.username}` : undefined),
    sourceUrl: row.source_url ?? (row.username ? `https://t.me/${row.username}` : undefined),
    actorId: row.actor_id ?? undefined,
    actorInput: parseJson<unknown | undefined>(row.actor_input_json ?? "", undefined),
    cursor: parseJson<unknown | undefined>(row.cursor_json ?? "", undefined),
    enabled: row.enabled === 1,
    lastSeenAt: row.last_seen_at,
    lastCheckedAt: row.last_checked_at ?? undefined,
    lastError: row.last_error ?? undefined,
    healthState: row.health_state ?? (row.enabled === 1 ? "healthy" : "disabled_by_user"),
    failureClass: row.failure_class ?? undefined,
    consecutiveFailures: row.consecutive_failures ?? 0,
    lastSuccessAt: row.last_success_at ?? undefined,
    lastNewItemAt: row.last_new_item_at ?? undefined,
    nextRetryAt: row.next_retry_at ?? undefined,
    canonicalKey: row.canonical_key ?? undefined
  };
}

function rowToRawMessage(row: RawMessageRow): NormalizedMessage {
  return {
    id: row.id,
    source: {
      id: row.source_id,
      title: row.message_source_title ?? row.title,
      type: row.message_source_type ?? row.type,
      provider: row.message_source_provider ?? row.provider ?? "telegram",
      kind: row.message_source_kind ?? row.kind ?? (row.type === "group" ? "telegram_group" : "telegram_channel"),
      username: row.message_source_username ?? row.username ?? undefined
    },
    messageId: row.message_id,
    text: row.text,
    links: parseJson<string[]>(row.links_json, []),
    media: parseJson<MediaReference[]>(row.media_json, []),
    postedAt: row.posted_at,
    receivedAt: row.received_at,
    sourceUrl: row.source_url ?? undefined,
    rawPayloadKey: row.raw_payload_key ?? undefined,
    expiresAt: row.expires_at
  };
}

function rowToBriefingItem(row: BriefingItemRow): Omit<BriefingItem, "evidence"> {
  return {
    id: row.id,
    clusterId: row.cluster_id,
    eventKey: row.event_key ?? undefined,
    summary: sanitizeSummary(row.summary) || row.summary,
    itemAt: row.item_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    mergedUpdateCount: row.merged_update_count
  };
}

function collapseBriefingItemsByStoredEventKey(items: BriefingItem[]): BriefingItem[] {
  const seen = new Set<string>();
  const collapsed: BriefingItem[] = [];
  for (const item of items) {
    const key = item.eventKey ? `event:${item.eventKey}` : `item:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    collapsed.push(item);
  }
  return collapsed;
}

function rowToEvidence(row: EvidenceRow): BriefingEvidence {
  return {
    messageId: row.raw_message_id,
    sourceId: row.source_id,
    sourceTitle: row.source_title,
    sourceType: row.source_type,
    sourceProvider: row.source_provider ?? undefined,
    sourceKind: row.source_kind ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    postedAt: row.posted_at,
    text: row.text,
    links: parseJson<string[]>(row.links_json, []),
    media: parseJson<MediaReference[]>(row.media_json, [])
  };
}

function rowToSourceRun(row: SourceRunRow): SourceRunRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    briefingId: row.briefing_id,
    provider: row.provider,
    actorId: row.actor_id ?? undefined,
    actorRunId: row.actor_run_id ?? undefined,
    datasetId: row.dataset_id ?? undefined,
    state: row.state,
    itemCount: row.item_count,
    estimatedCostUsd: row.estimated_cost_usd ?? undefined,
    actualCostUsd: row.actual_cost_usd ?? undefined,
    idempotencyKey: row.idempotency_key ?? undefined,
    archiveKey: row.archive_key ?? undefined,
    error: row.error ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    updatedAt: row.updated_at
  };
}

function normalizedBriefingCadence(value: string | undefined): BriefingConfig["briefingCadence"] {
  return value === "daily" || value === "weekly" || value === "monthly" ? value : "hourly";
}

function cadencePriority(value: BriefingConfig["briefingCadence"] | undefined): number {
  if (value === "hourly") return 0;
  if (value === "daily") return 1;
  if (value === "weekly") return 2;
  return 3;
}

function normalizedTimeOfDay(value: string | undefined): string {
  return typeof value === "string" && /^\d{1,2}:\d{2}$/.test(value) ? value : "00:00";
}

function rowToProcessingJob(row: ProcessingJobRow): ProcessingJobRecord {
  return {
    id: row.id,
    briefingId: row.briefing_id,
    rawMessageId: row.raw_message_id,
    state: row.state,
    error: row.error ?? undefined,
    leaseToken: row.lease_token ?? undefined,
    leaseUntil: row.lease_until ?? undefined,
    attemptCount: row.attempt_count ?? 0,
    availableAt: row.available_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    lastEnqueuedAt: row.last_enqueued_at ?? undefined,
    updatedAt: row.updated_at
  };
}

function latestPublishedAt(
  itemsByBriefing: Map<string, Map<string, BriefingItem>>,
  briefingId?: string
): string | undefined {
  const values = briefingId
    ? Array.from(itemsByBriefing.get(briefingId)?.values() ?? [])
    : Array.from(itemsByBriefing.values()).flatMap((items) => Array.from(items.values()));
  const latest = values.map((item) => item.itemAt).sort().at(-1);
  return latest ?? undefined;
}

function latestEditionPublishedAt(
  editionsByBriefing: Map<string, Map<string, BriefingEdition>>,
  briefingId?: string,
  now = new Date()
): string | undefined {
  const values = briefingId
    ? Array.from(editionsByBriefing.get(briefingId)?.values() ?? [])
    : Array.from(editionsByBriefing.values()).flatMap((editions) => Array.from(editions.values()));
  const cutoff = now.getTime() - FIXED_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return values
    .filter((edition) => {
      const publishedAt = new Date(edition.publishedAt).getTime();
      return publishedAt > cutoff && publishedAt <= now.getTime();
    })
    .map((edition) => edition.publishedAt)
    .sort()
    .at(-1);
}

function rowlessAccount(account: AccountRecord & { passwordHash: string }): AccountRecord {
  return {
    id: account.id,
    email: account.email,
    username: account.username,
    role: account.role,
    emailVerifiedAt: account.emailVerifiedAt,
    disabledAt: account.disabledAt,
    sessionVersion: account.sessionVersion,
    termsAcceptedAt: account.termsAcceptedAt,
    termsVersion: account.termsVersion,
    privacyVersion: account.privacyVersion,
    acceptableUseVersion: account.acceptableUseVersion,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function stableHash(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

function subtractUtcMonths(date: Date, months: number): Date {
  return addUtcMonths(date, -months);
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function usernameRetirementHash(username: string): Promise<string> {
  return sha256Text(normalizeUsername(username));
}

function exactAccountAliasSetGuard(
  aliases: string[]
): { sql: string; bindings: DbValue[] } {
  if (aliases.length === 0) {
    return {
      sql: `NOT EXISTS (
        SELECT 1 FROM username_aliases
        WHERE username_aliases.account_id = accounts.id
      )`,
      bindings: []
    };
  }
  const placeholders = aliases.map(() => "?").join(", ");
  return {
    sql: `(
      (
        SELECT COUNT(*) FROM username_aliases
        WHERE username_aliases.account_id = accounts.id
      ) = ?
      AND NOT EXISTS (
        SELECT 1 FROM username_aliases
        WHERE username_aliases.account_id = accounts.id
          AND username_aliases.username NOT IN (${placeholders})
      )
    )`,
    bindings: [aliases.length, ...aliases]
  };
}

function exploreFreshnessCutoff(cadence: BriefingConfig["briefingCadence"], now: Date): string {
  const maxAgeMs = cadence === "hourly"
    ? 6 * 60 * 60 * 1000
    : cadence === "daily"
      ? 48 * 60 * 60 * 1000
      : cadence === "weekly"
        ? 14 * 24 * 60 * 60 * 1000
        : 45 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - maxAgeMs).toISOString();
}

function isOperationalCanaryBriefingId(briefingId: string): boolean {
  return briefingId.startsWith("briefing_canary_") ||
    briefingId.startsWith("launch_canary_briefing_");
}

function isXSourceKind(kind: SourceKind): boolean {
  return kind === "x_profile" || kind === "x_search";
}

function isPaidSourceKind(kind: SourceKind): boolean {
  return kind === "google_news" || isXSourceKind(kind);
}

async function first<T>(statement: D1PreparedStatement): Promise<T | null> {
  return (await statement.first<T>()) ?? null;
}

async function all<T>(statement: D1PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>();
  return result.results ?? [];
}
