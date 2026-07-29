import { personalNewsBriefing, type BriefingConfig } from "@distilled/core";
import { describe, expect, it } from "vitest";
import { D1Repository, InMemoryRepository, QuotaExceededError } from "./repository";
import { runRetentionCleanup } from "./retention";
import type { AccountRecord } from "./types";

const NOW = new Date("2026-07-29T12:00:00.000Z");

describe("Explore operational-canary isolation", () => {
  it("keeps internal and launch canaries out of the in-memory Explore result", async () => {
    const repo = new InMemoryRepository();
    const account = await repo.createAccount({
      email: "explore@example.com",
      username: "explore",
      role: "user",
      passwordHash: "hash",
      emailVerifiedAt: NOW.toISOString()
    }, NOW);

    for (const id of ["public-briefing", "briefing_canary_en_02_technology", "launch_canary_briefing_01_hourly"]) {
      const briefing = await repo.upsertBriefing({
        ...personalNewsBriefing,
        id,
        ownerAccountId: account.id,
        ownerUsername: account.username,
        slug: id,
        title: id,
        publicFeedEnabled: true
      }, NOW);
      await repo.upsertConfiguredSource({
        briefingId: briefing.id,
        title: `${id} source`,
        provider: "rss",
        kind: "rss_feed",
        sourceUrl: `https://example.com/${id}.xml`,
        enabled: true
      }, NOW);
      await repo.saveBriefingEdition({
        id: `edition-${id}`,
        briefingId: briefing.id,
        cadence: "hourly",
        windowStart: "2026-07-29T10:00:00.000Z",
        windowEnd: "2026-07-29T11:00:00.000Z",
        title: "Verified update",
        summary: "A verified public update.",
        sections: [{ title: "Update", summary: "A verified public update.", evidence: [] }],
        status: "published",
        publishedAt: "2026-07-29T11:30:00.000Z",
        createdAt: "2026-07-29T11:30:00.000Z",
        updatedAt: "2026-07-29T11:30:00.000Z"
      });
    }

    expect((await repo.listExploreBriefings(10, NOW)).map((briefing) => briefing.id))
      .toEqual(["public-briefing"]);
    expect(await repo.getBriefingById("briefing_canary_en_02_technology")).not.toBeNull();
  });

  it("includes both exact canary-prefix exclusions in the D1 Explore query", async () => {
    const queries: string[] = [];
    const statement = {
      bind: () => statement,
      all: async () => ({ results: [] })
    };
    const db = {
      prepare: (query: string) => {
        queries.push(query);
        return statement;
      }
    } as unknown as D1Database;

    expect(await new D1Repository(db).listExploreBriefings(10, NOW)).toEqual([]);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("briefings.id NOT GLOB 'briefing_canary_*'");
    expect(queries[0]).toContain("briefings.id NOT GLOB 'launch_canary_briefing_*'");
  });
});

describe("hosted account capacity", () => {
  it("caps pending accounts separately and frees capacity through bounded stale cleanup", async () => {
    const repo = new InMemoryRepository();
    const quota = { maxAccounts: 50, maxPendingAccounts: 10 };
    for (let index = 0; index < 10; index += 1) {
      await repo.createAccount({
        email: `pending-${index}@example.com`,
        username: `pending-${index}`,
        role: "user",
        passwordHash: "hash"
      }, new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1_000), quota);
    }
    await expect(repo.createAccount({
      email: "pending-overflow@example.com",
      username: "pending-overflow",
      role: "user",
      passwordHash: "hash"
    }, NOW, quota)).rejects.toBeInstanceOf(QuotaExceededError);

    await expect(repo.createAccount({
      email: "verified@example.com",
      username: "verified",
      role: "user",
      passwordHash: "hash",
      emailVerifiedAt: NOW.toISOString()
    }, NOW, quota)).resolves.toMatchObject({ emailVerifiedAt: NOW.toISOString() });

    const protectedAccount = await repo.getAccountByEmail("pending-0@example.com");
    await repo.createAuthToken({
      accountId: protectedAccount!.id,
      purpose: "email_verification",
      tokenHash: "live-token",
      expiresAt: new Date(NOW.getTime() + 60 * 60 * 1_000).toISOString()
    }, NOW);
    const deleted = await repo.deleteStaleUnverifiedAccounts(
      new Date(NOW.getTime() - 48 * 60 * 60 * 1_000).toISOString(),
      new Date(NOW.getTime() - 24 * 60 * 60 * 1_000).toISOString(),
      new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
      5
    );
    expect(deleted).toBe(5);
    expect(await repo.getAccountById(protectedAccount!.id)).not.toBeNull();
    expect(await repo.isUsernameRetired("pending-1")).toBe(false);
    await expect(repo.createAccount({
      email: "replacement@example.com",
      username: "pending-1",
      role: "user",
      passwordHash: "hash"
    }, NOW, quota)).resolves.toMatchObject({ username: "pending-1" });
  });

  it("does not delete or retire a stale account that becomes verified before cleanup commits", async () => {
    class VerificationRaceRepository extends InMemoryRepository {
      override async deleteAccount(
        id: string,
        now = NOW,
        options: { retireUsernames?: boolean } = {}
      ): Promise<void> {
        await this.updateAccount({ id, emailVerifiedAt: NOW.toISOString() }, now);
        await super.deleteAccount(id, now, options);
      }
    }

    const repo = new VerificationRaceRepository();
    const account = await repo.createAccount({
      email: "verification-race@example.com",
      username: "verification-race",
      role: "user",
      passwordHash: "hash"
    }, new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1_000));

    expect(await repo.deleteStaleUnverifiedAccounts(
      new Date(NOW.getTime() - 48 * 60 * 60 * 1_000).toISOString(),
      new Date(NOW.getTime() - 24 * 60 * 60 * 1_000).toISOString(),
      new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
      10
    )).toBe(0);
    expect(await repo.getAccountById(account.id)).toMatchObject({
      emailVerifiedAt: NOW.toISOString()
    });
    expect(await repo.isUsernameRetired(account.username)).toBe(false);
  });

  it("enforces the absolute seven-day lifetime even after verification-token resends", async () => {
    const repo = new InMemoryRepository();
    const account = await repo.createAccount({
      email: "absolute@example.com",
      username: "absolute",
      role: "user",
      passwordHash: "hash"
    }, new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1_000));
    await repo.createAuthToken({
      accountId: account.id,
      purpose: "email_verification",
      tokenHash: "fresh-resend",
      expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1_000).toISOString()
    }, NOW);

    expect(await repo.deleteStaleUnverifiedAccounts(
      new Date(NOW.getTime() - 48 * 60 * 60 * 1_000).toISOString(),
      new Date(NOW.getTime() - 24 * 60 * 60 * 1_000).toISOString(),
      new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
      10
    )).toBe(1);
    expect(await repo.getAccountById(account.id)).toBeNull();
  });
});

describe("public username retirement", () => {
  it("stores only unlinked hashes and blocks create, bootstrap, and rename takeover", async () => {
    const repo = new InMemoryRepository();
    const owner = await repo.createAccount({
      email: "retirement-owner@example.com",
      username: "first-public-name",
      role: "user",
      passwordHash: "hash",
      emailVerifiedAt: NOW.toISOString()
    }, NOW);
    await repo.updateAccount({
      id: owner.id,
      username: "second-public-name"
    }, NOW);
    expect(await repo.resolveUsernameAlias("first-public-name")).toMatchObject({
      account: { id: owner.id, username: "second-public-name" },
      alias: { isCurrent: false }
    });

    await repo.deleteAccount(owner.id, NOW);

    expect(await repo.isUsernameRetired("first public name")).toBe(true);
    expect(await repo.isUsernameRetired("SECOND-PUBLIC-NAME")).toBe(true);
    expect(repo.retiredUsernameHashes.size).toBe(2);
    expect(Array.from(repo.retiredUsernameHashes)).toEqual([
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.stringMatching(/^[0-9a-f]{64}$/)
    ]);
    expect(JSON.stringify(Array.from(repo.retiredUsernameHashes))).not.toContain("public-name");

    await expect(repo.createAccount({
      email: "retirement-create@example.com",
      username: "first-public-name",
      role: "user",
      passwordHash: "hash"
    }, NOW)).rejects.toThrow("username is permanently unavailable");

    const challenger = await repo.createAccount({
      email: "retirement-challenger@example.com",
      username: "available-name",
      role: "user",
      passwordHash: "hash",
      emailVerifiedAt: NOW.toISOString()
    }, NOW);
    await expect(repo.updateAccount({
      id: challenger.id,
      username: "second-public-name"
    }, NOW)).rejects.toThrow("username is permanently unavailable");
    await repo.deleteAccount(challenger.id, NOW);

    await expect(repo.bootstrapAdmin({
      email: "retirement-admin@example.com",
      username: "first-public-name",
      passwordHash: "hash",
      emailVerifiedAt: NOW.toISOString(),
      briefing: {
        ...personalNewsBriefing,
        ownerAccountId: "bootstrap",
        ownerUsername: "first-public-name"
      }
    }, NOW)).rejects.toThrow("username is permanently unavailable");
  });

  it("classifies a D1 retirement race before generic account-capacity denial", async () => {
    const preparedSql: string[] = [];
    const statementFor = (sql: string) => {
      preparedSql.push(sql);
      const statement = {
        sql,
        bind: () => statement,
        first: async () => sql.includes(
          "SELECT username_hash FROM retired_username_hashes"
        )
          ? { username_hash: "f".repeat(64) }
          : null
      };
      return statement;
    };
    const db = {
      prepare: statementFor,
      batch: async (statements: unknown[]) =>
        statements.map(() => ({ meta: { changes: 0 } }))
    } as unknown as D1Database;
    const repo = new D1Repository(db);

    await expect(repo.createAccount({
      email: "d1-race@example.com",
      username: "d1-race",
      role: "user",
      passwordHash: "hash"
    }, NOW, { maxAccounts: 50, maxPendingAccounts: 10 }))
      .rejects.toThrow("username is permanently unavailable");

    const accountInsert = preparedSql.find((sql) => sql.includes("INSERT INTO accounts"));
    expect(accountInsert).toContain("retired_username_hashes");
    expect(accountInsert).toContain("SELECT 1 FROM username_aliases WHERE username = ?");
  });

  it("retries and refuses D1 deletion when aliases swap without changing count", async () => {
    type CapturedStatement = {
      sql: string;
      bindings: unknown[];
      bind: (...values: unknown[]) => CapturedStatement;
      first: () => Promise<unknown>;
      all: () => Promise<{ results: Array<{ username: string }> }>;
    };
    const accountRow = {
      id: "account_alias_swap",
      email: "alias-swap@example.com",
      normalized_email: "alias-swap@example.com",
      username: "current-name",
      role: "user",
      password_hash: "hash",
      email_verified_at: NOW.toISOString(),
      disabled_at: null,
      session_version: 1,
      terms_accepted_at: null,
      terms_version: null,
      privacy_version: null,
      acceptable_use_version: null,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
      has_briefings: 0
    };
    const aliasSnapshots = ["alias-before", "alias-after", "alias-before"];
    let aliasSnapshotIndex = 0;
    const deletionBatches: CapturedStatement[][] = [];
    const statementFor = (sql: string): CapturedStatement => {
      const statement: CapturedStatement = {
        sql,
        bindings: [],
        bind: (...values: unknown[]) => {
          statement.bindings = values;
          return statement;
        },
        first: async () => sql.includes("FROM accounts")
          ? accountRow
          : null,
        all: async () => {
          const historicalAlias = aliasSnapshots[aliasSnapshotIndex]!;
          aliasSnapshotIndex += 1;
          return {
            results: [
              { username: historicalAlias },
              { username: accountRow.username }
            ]
          };
        }
      };
      return statement;
    };
    const db = {
      prepare: statementFor,
      batch: async (statements: CapturedStatement[]) => {
        deletionBatches.push(statements);
        return statements.map(() => ({ meta: { changes: 0 } }));
      }
    } as unknown as D1Database;
    const repo = new D1Repository(db);
    (repo as unknown as {
      archiveAccountSpendDetails: (accountId: string, now: Date) => Promise<void>;
    }).archiveAccountSpendDetails = async () => {};

    await expect(repo.deleteAccount(accountRow.id, NOW))
      .rejects.toThrow("account changed during deletion; retry");

    expect(deletionBatches).toHaveLength(3);
    const accountDeletes = deletionBatches.map((batch) =>
      batch.find((statement) => statement.sql.includes("DELETE FROM accounts"))!
    );
    expect(accountDeletes.every((statement) =>
      statement.sql.includes("username_aliases.username NOT IN (?, ?)")
    )).toBe(true);
    expect(accountDeletes.map((statement) => statement.bindings.slice(-2)))
      .toEqual([
        ["alias-before", "current-name"],
        ["alias-after", "current-name"],
        ["alias-before", "current-name"]
      ]);
  });

  it("keeps every D1 rename mutation guarded by the retired hash inside one batch", async () => {
    let mutationBatchSql: string[] = [];
    const accountRow = {
      id: "account_d1_rename",
      email: "rename@example.com",
      normalized_email: "rename@example.com",
      username: "before-rename",
      role: "user",
      password_hash: "hash",
      email_verified_at: NOW.toISOString(),
      disabled_at: null,
      session_version: 1,
      terms_accepted_at: null,
      terms_version: null,
      privacy_version: null,
      acceptable_use_version: null,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString()
    };
    const statementFor = (sql: string) => {
      const statement = {
        sql,
        bind: () => statement,
        first: async () => {
          if (sql.includes("SELECT * FROM accounts WHERE id = ?")) return accountRow;
          if (sql.includes("SELECT username_hash FROM retired_username_hashes")) {
            return { username_hash: "e".repeat(64) };
          }
          return null;
        }
      };
      return statement;
    };
    const db = {
      prepare: statementFor,
      batch: async (statements: Array<{ sql: string }>) => {
        mutationBatchSql = statements.map((statement) => statement.sql);
        return statements.map(() => ({ meta: { changes: 0 } }));
      }
    } as unknown as D1Database;

    await expect(new D1Repository(db).updateAccount({
      id: accountRow.id,
      username: "retired-target"
    }, NOW)).rejects.toThrow("username is permanently unavailable");
    expect(mutationBatchSql.slice(0, 3)).toHaveLength(3);
    expect(mutationBatchSql.slice(0, 3).every((sql) =>
      sql.includes("retired_username_hashes")
    )).toBe(true);
  });
});

describe("hosted paid-provider beta capacity", () => {
  it("claims one seat per account, keeps it across paid sources, and releases it with the last paid source", async () => {
    const repo = new InMemoryRepository();
    const records: Array<{ account: AccountRecord; briefing: BriefingConfig }> = [];
    for (let index = 0; index < 5; index += 1) {
      const account = await repo.createAccount({
        email: `paid-seat-${index}@example.com`,
        username: `paid-seat-${index}`,
        role: "user",
        passwordHash: "hash",
        emailVerifiedAt: NOW.toISOString()
      }, NOW);
      const briefing = await repo.upsertBriefing({
        ...personalNewsBriefing,
        id: `paid-seat-briefing-${index}`,
        ownerAccountId: account.id,
        ownerUsername: account.username,
        slug: "news"
      }, NOW);
      records.push({ account, briefing });
    }
    const quotaFor = (accountId: string) => ({
      accountId,
      maxPerFeed: 5,
      maxPerAccount: 10,
      maxPaidPerAccount: 2,
      maxPaidProviderAccounts: 4,
      maxGoogleNewsPerAccount: 1,
      maxXPerAccount: 1
    });
    const addGoogleNews = (index: number) => repo.upsertConfiguredSource({
      briefingId: records[index].briefing.id,
      title: `Google News ${index}`,
      provider: "apify",
      kind: "google_news",
      sourceUrl: `https://news.google.com/rss/search?q=seat-${index}`,
      actorId: "groupoject/google-news-scraper",
      enabled: true
    }, NOW, quotaFor(records[index].account.id));

    const firstSources = await Promise.all([0, 1, 2, 3].map(addGoogleNews));
    expect(await repo.countPaidProviderSeats()).toBe(4);
    await expect(addGoogleNews(4)).rejects.toThrow(/all 4 hosted account seats are claimed/i);

    const firstX = await repo.upsertConfiguredSource({
      briefingId: records[0].briefing.id,
      title: "X profile",
      provider: "apify",
      kind: "x_profile",
      username: "distilled",
      actorId: "xquik/x-tweet-scraper",
      enabled: true
    }, NOW, quotaFor(records[0].account.id));
    expect(await repo.countPaidProviderSeats()).toBe(4);

    await repo.deleteSource(firstSources[0].id);
    expect(await repo.countPaidProviderSeats()).toBe(4);
    await expect(addGoogleNews(4)).rejects.toBeInstanceOf(QuotaExceededError);

    await repo.deleteSource(firstX.id);
    expect(await repo.countPaidProviderSeats()).toBe(3);
    await expect(addGoogleNews(4)).resolves.toMatchObject({ kind: "google_news" });
    expect(await repo.countPaidProviderSeats()).toBe(4);
  });

  it("leaves self-hosted repositories uncapped when no hosted quota is supplied", async () => {
    const repo = new InMemoryRepository();
    for (let index = 0; index < 5; index += 1) {
      const account = await repo.createAccount({
        email: `self-host-seat-${index}@example.com`,
        username: `self-host-seat-${index}`,
        role: "user",
        passwordHash: "hash",
        emailVerifiedAt: NOW.toISOString()
      }, NOW);
      const briefing = await repo.upsertBriefing({
        ...personalNewsBriefing,
        id: `self-host-seat-briefing-${index}`,
        ownerAccountId: account.id,
        ownerUsername: account.username,
        slug: "news"
      }, NOW);
      await repo.upsertConfiguredSource({
        briefingId: briefing.id,
        title: `Paid source ${index}`,
        provider: "apify",
        kind: "google_news",
        sourceUrl: `https://news.google.com/rss/search?q=self-host-${index}`,
        actorId: "groupoject/google-news-scraper",
        enabled: true
      }, NOW);
    }
    expect(await repo.countPaidProviderSeats()).toBe(5);
  });

  it("refuses paid scheduling and queued execution after the account seat is absent", async () => {
    const repo = new InMemoryRepository();
    const account = await repo.createAccount({
      email: "paid-seat-scheduler@example.com",
      username: "paid-seat-scheduler",
      role: "user",
      passwordHash: "hash",
      emailVerifiedAt: NOW.toISOString()
    }, NOW);
    const briefing = await repo.upsertBriefing({
      ...personalNewsBriefing,
      id: "paid-seat-scheduler-briefing",
      ownerAccountId: account.id,
      ownerUsername: account.username,
      slug: "paid",
      paused: false,
      publicFeedEnabled: true
    }, NOW);
    const source = await repo.upsertConfiguredSource({
      briefingId: briefing.id,
      title: "Paid scheduler source",
      provider: "apify",
      kind: "x_profile",
      username: "Cloudflare",
      actorId: "xquik/x-tweet-scraper",
      enabled: true
    }, NOW);
    expect(repo.paidProviderSeats.has(account.id)).toBe(true);
    const dispatchLease = await repo.claimCanonicalSourceRefresh(
      source.id,
      60 * 60 * 1_000,
      10 * 60 * 1_000,
      NOW
    );
    expect(dispatchLease).toBeTruthy();

    repo.paidProviderSeats.delete(account.id);
    expect(await repo.activateCanonicalSourceRefresh(
      source.id,
      dispatchLease!,
      2 * 60 * 1_000,
      NOW
    )).toBeNull();
    await repo.releaseCanonicalSourceRefresh(source.id, dispatchLease!);
    expect(await repo.listDueSourceRefreshCandidates(NOW.toISOString(), 10)).toEqual([]);
    expect(await repo.claimCanonicalSourceRefresh(
      source.id,
      60 * 60 * 1_000,
      10 * 60 * 1_000,
      NOW
    )).toBeNull();
  });
});

describe("registration email receipts", () => {
  it("rejects an expired receipt without exposing or consuming another release", async () => {
    const repo = new InMemoryRepository();
    await repo.saveRegistrationEmailReceipt({
      nonceHash: "a".repeat(64),
      releaseSha: "release-a",
      recipientFingerprint: "b".repeat(64),
      expiresAt: "2026-07-29T12:05:00.000Z"
    }, NOW);
    await repo.saveRegistrationEmailReceipt({
      nonceHash: "c".repeat(64),
      releaseSha: "release-b",
      recipientFingerprint: "b".repeat(64),
      expiresAt: "2026-07-29T12:30:00.000Z"
    }, NOW);

    expect(await repo.consumeRegistrationEmailReceipt({
      nonceHash: "a".repeat(64),
      releaseSha: "release-a",
      recipientFingerprint: "b".repeat(64)
    }, new Date("2026-07-29T12:05:00.000Z"))).toBe(false);
    expect(await repo.consumeRegistrationEmailReceipt({
      nonceHash: "c".repeat(64),
      releaseSha: "release-a",
      recipientFingerprint: "b".repeat(64)
    }, NOW)).toBe(false);
    expect(await repo.consumeRegistrationEmailReceipt({
      nonceHash: "c".repeat(64),
      releaseSha: "release-b",
      recipientFingerprint: "b".repeat(64)
    }, NOW)).toBe(true);
  });
});

describe("bounded maintenance", () => {
  it("bounds spend reconciliation and operational-event cleanup", async () => {
    const repo = new InMemoryRepository();
    for (let index = 0; index < 5; index += 1) {
      await repo.reserveSpend({
        idempotencyKey: `stale-${index}`,
        accountId: "account",
        category: "llm",
        provider: "openai",
        amountUsd: 0.01,
        limits: {
          accountDailyUsd: 100,
          accountMonthlyUsd: 100,
          globalDailyUsd: 100,
          globalMonthlyUsd: 100,
          totalMonthlyUsd: 100
        }
      }, new Date(NOW.getTime() - 3 * 60 * 60 * 1_000 - index));
      await repo.recordOperationalEvent({
        category: "maintenance",
        subsystem: `old-${index}`,
        status: "succeeded"
      }, new Date(NOW.getTime() - 20 * 24 * 60 * 60 * 1_000 - index));
    }

    expect(await repo.reconcileStaleSpendReservations(
      new Date(NOW.getTime() - 2 * 60 * 60 * 1_000).toISOString(),
      NOW,
      2
    )).toEqual({ reconciled: 2, hasMore: true });
    expect(await repo.countStaleSpendReservations(
      new Date(NOW.getTime() - 2 * 60 * 60 * 1_000).toISOString()
    )).toBe(3);
    expect(await repo.deleteOperationalEventsBefore(
      new Date(NOW.getTime() - 15 * 24 * 60 * 60 * 1_000).toISOString(),
      2
    )).toEqual({ deleted: 2, hasMore: true });
    expect(repo.operationalEvents).toHaveLength(3);
  });

  it("deletes terminal source runs in bounded batches", async () => {
    const repo = new InMemoryRepository();
    for (let index = 0; index < 3; index += 1) {
      const run = await repo.createSourceRun({
        sourceId: `source-${index}`,
        briefingId: "briefing",
        provider: "rss",
        state: "succeeded",
        startedAt: new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1_000).toISOString()
      }, NOW);
      await repo.updateSourceRun({
        id: run.id,
        state: "succeeded",
        completedAt: new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1_000).toISOString()
      }, NOW);
    }
    expect(await repo.deleteExpired(NOW, 2)).toEqual({ deleted: 2, hasMore: true });
    expect(await repo.listSourceRuns({ limit: 10 })).toHaveLength(1);
    expect(await repo.deleteExpired(NOW, 2)).toEqual({ deleted: 1, hasMore: false });
  });

  it("keeps a source-run archive reference on R2 failure and deletes it only after a successful retry", async () => {
    const repo = new InMemoryRepository();
    const run = await repo.createSourceRun({
      sourceId: "source-archive",
      briefingId: "briefing",
      provider: "apify",
      state: "succeeded",
      startedAt: new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1_000).toISOString()
    }, NOW);
    await repo.updateSourceRun({
      id: run.id,
      state: "succeeded",
      archiveKey: "apify/archive.json",
      completedAt: new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1_000).toISOString()
    }, NOW);
    const failed = await runRetentionCleanup(repo, {
      delete: async () => {
        throw new Error("R2 unavailable");
      }
    }, NOW, 100);
    expect(failed).toMatchObject({
      archiveDeleteFailures: 1,
      sourceRunArchiveReferencesCleared: 0,
      deleted: 0,
      hasMore: true
    });
    expect((await repo.listSourceRuns({ limit: 10 }))[0].archiveKey).toBe("apify/archive.json");

    const deletedKeys: string[] = [];
    const retried = await runRetentionCleanup(repo, {
      delete: async (key) => {
        deletedKeys.push(...(Array.isArray(key) ? key : [key]));
      }
    }, NOW, 100);
    expect(deletedKeys).toEqual(["apify/archive.json"]);
    expect(retried).toMatchObject({
      archiveDeleteFailures: 0,
      sourceRunArchiveReferencesCleared: 1,
      deleted: 1,
      hasMore: false
    });
    expect(await repo.listSourceRuns({ limit: 10 })).toEqual([]);
  });
});

describe("spend-ledger retention and deletion privacy", () => {
  const limits = {
    accountDailyUsd: 100,
    accountMonthlyUsd: 100,
    globalDailyUsd: 100,
    globalMonthlyUsd: 100,
    totalMonthlyUsd: 100
  };

  it("aggregates settled detail after 90 days and blocks replay with a hashed tombstone", async () => {
    const repo = new InMemoryRepository();
    const operationAt = new Date(NOW.getTime() - 91 * 24 * 60 * 60 * 1_000);
    await repo.reserveSpend({
      idempotencyKey: "retained-operation",
      accountId: "account-private",
      briefingId: "briefing-private",
      category: "collection",
      provider: "apify",
      amountUsd: 0.05,
      limits
    }, operationAt);
    await repo.settleSpend({
      idempotencyKey: "retained-operation",
      actualUsd: 0.03
    }, new Date(operationAt.getTime() + 60_000));

    expect(await repo.archiveExpiredSpend(NOW, 10)).toMatchObject({
      archivedOperations: 1,
      detailRowsDeleted: 2,
      hasMore: false
    });
    expect(repo.spendLedger).toEqual([]);
    expect(Array.from(repo.spendDailyAggregates.values())).toEqual([
      {
        day: operationAt.toISOString().slice(0, 10),
        category: "collection",
        provider: "apify",
        amountUsd: 0.03,
        operationCount: 1
      }
    ]);
    expect(JSON.stringify(Array.from(repo.spendDailyAggregates.values()))).not.toContain("account-private");
    expect(JSON.stringify(Array.from(repo.spendDailyAggregates.values()))).not.toContain("briefing-private");

    expect(await repo.reserveSpend({
      idempotencyKey: "retained-operation",
      accountId: "another-account",
      category: "collection",
      provider: "apify",
      amountUsd: 0.05,
      limits
    }, NOW)).toMatchObject({ status: "duplicate" });
  });

  it("keeps global budget usage while removing account-linked spend detail on deletion", async () => {
    const repo = new InMemoryRepository();
    const account = await repo.createAccount({
      email: "spend-delete@example.com",
      username: "spend-delete",
      role: "user",
      passwordHash: "hash",
      emailVerifiedAt: NOW.toISOString()
    }, NOW);
    await repo.reserveSpend({
      idempotencyKey: "delete-operation",
      accountId: account.id,
      category: "llm",
      provider: "openai",
      amountUsd: 0.05,
      limits
    }, NOW);
    await repo.settleSpend({ idempotencyKey: "delete-operation", actualUsd: 0.04 }, NOW);
    expect((await repo.getSpendUsage(undefined, NOW)).totalMonthUsd).toBeCloseTo(0.04);

    await repo.deleteAccount(account.id, NOW);

    expect(await repo.getAccountById(account.id)).toBeNull();
    expect(repo.spendLedger).toEqual([]);
    expect(JSON.stringify(Array.from(repo.spendDailyAggregates.values()))).not.toContain(account.id);
    expect((await repo.getSpendUsage(undefined, NOW)).totalMonthUsd).toBeCloseTo(0.04);
    expect((await repo.getSpendUsage(account.id, NOW)).totalMonthUsd).toBe(0);
  });

  it("does not archive an old reservation until it has a terminal event", async () => {
    const repo = new InMemoryRepository();
    const operationAt = new Date(NOW.getTime() - 91 * 24 * 60 * 60 * 1_000);
    await repo.reserveSpend({
      idempotencyKey: "open-operation",
      accountId: "account",
      category: "llm",
      provider: "openai",
      amountUsd: 0.01,
      limits
    }, operationAt);

    expect(await repo.archiveExpiredSpend(NOW, 10)).toMatchObject({
      archivedOperations: 0,
      detailRowsDeleted: 0
    });
    expect(repo.spendLedger).toHaveLength(1);
  });

  it("fails closed without touching rows when the D1 retention lease is busy", async () => {
    const queries: string[] = [];
    const statement = {
      bind: () => statement,
      run: async () => ({ meta: { changes: 0 } })
    };
    const db = {
      prepare: (query: string) => {
        queries.push(query);
        return statement;
      }
    } as unknown as D1Database;

    expect(await new D1Repository(db).archiveExpiredSpend(NOW, 10)).toEqual({
      archivedOperations: 0,
      detailRowsDeleted: 0,
      aggregatesDeleted: 0,
      tombstonesDeleted: 0,
      hasMore: true
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("UPDATE spend_retention_lease");
    expect(queries[0]).toContain("lease_until IS NULL OR lease_until <= ?");
  });

  it("drains more than one 25-operation spend batch in a scheduled retention run", async () => {
    const repo = new InMemoryRepository();
    const operationAt = new Date(NOW.getTime() - 91 * 24 * 60 * 60 * 1_000);
    for (let index = 0; index < 30; index += 1) {
      await repo.reserveSpend({
        idempotencyKey: `batch-operation-${index}`,
        accountId: "batch-account",
        category: "llm",
        provider: "openai",
        amountUsd: 0.01,
        limits
      }, new Date(operationAt.getTime() + index));
      await repo.settleSpend({
        idempotencyKey: `batch-operation-${index}`,
        actualUsd: 0.01
      }, new Date(operationAt.getTime() + 60_000 + index));
    }

    const result = await runRetentionCleanup(repo, { delete: async () => undefined }, NOW, 100);

    expect(result).toMatchObject({
      spendOperationsArchived: 30,
      spendDetailRowsDeleted: 60,
      hasMore: false
    });
    expect(repo.spendLedger).toEqual([]);
  });

  it("deletes detailed model-usage events after 90 days", async () => {
    const repo = new InMemoryRepository();
    await repo.recordLlmUsage({
      briefingId: "briefing",
      model: "gpt-5-mini",
      purpose: "summary",
      inputTokens: 100,
      outputTokens: 20,
      estimatedCostUsd: 0.01
    }, new Date(NOW.getTime() - 91 * 24 * 60 * 60 * 1_000));
    await repo.recordLlmUsage({
      briefingId: "briefing",
      model: "gpt-5-mini",
      purpose: "summary",
      inputTokens: 100,
      outputTokens: 20,
      estimatedCostUsd: 0.01
    }, new Date(NOW.getTime() - 89 * 24 * 60 * 60 * 1_000));

    await repo.deleteExpired(NOW, 10);

    expect(repo.llmUsageEvents).toHaveLength(1);
    expect(repo.llmUsageEvents[0].createdAt).toBe(
      new Date(NOW.getTime() - 89 * 24 * 60 * 60 * 1_000).toISOString()
    );
  });
});

describe("source scheduler scale and paid canonical locks", () => {
  it("drains 500 due sources in bounded pages without starvation", async () => {
    const repo = new InMemoryRepository();
    for (let accountIndex = 0; accountIndex < 50; accountIndex += 1) {
      const account = await repo.createAccount({
        email: `scale-${accountIndex}@example.com`,
        username: `scale-${accountIndex}`,
        role: "user",
        passwordHash: "hash",
        emailVerifiedAt: NOW.toISOString()
      }, NOW);
      for (let feedIndex = 0; feedIndex < 2; feedIndex += 1) {
        const briefing = await repo.upsertBriefing({
          ...personalNewsBriefing,
          id: `scale-briefing-${accountIndex}-${feedIndex}`,
          ownerAccountId: account.id,
          ownerUsername: account.username,
          slug: `feed-${feedIndex}`,
          nextBriefingAt: new Date(NOW.getTime() + 60 * 60 * 1_000).toISOString()
        }, NOW);
        for (let sourceIndex = 0; sourceIndex < 5; sourceIndex += 1) {
          await repo.upsertConfiguredSource({
            briefingId: briefing.id,
            title: `Source ${sourceIndex}`,
            provider: "rss",
            kind: "rss_feed",
            sourceUrl: `https://example.com/${accountIndex}/${feedIndex}/${sourceIndex}.xml`,
            enabled: true
          }, NOW);
        }
      }
    }

    const selected = new Set<string>();
    for (let page = 0; page < 4; page += 1) {
      const candidates = await repo.listDueSourceRefreshCandidates(NOW.toISOString(), 150);
      for (const candidate of candidates) {
        expect(selected.has(candidate.sourceId)).toBe(false);
        selected.add(candidate.sourceId);
        const lease = await repo.claimCanonicalSourceRefresh(candidate.sourceId, 15 * 60 * 1_000, 60_000, NOW);
        expect(lease).toBeTruthy();
        await repo.completeCanonicalSourceRefresh(
          candidate.sourceId,
          lease!,
          new Date(NOW.getTime() + 15 * 60 * 1_000).toISOString(),
          undefined,
          NOW
        );
      }
    }
    expect(selected.size).toBe(500);
    expect(await repo.listDueSourceRefreshCandidates(NOW.toISOString(), 150)).toEqual([]);
  });

  it("blocks a representative failover while a canonical-equivalent paid run remains active", async () => {
    const repo = new InMemoryRepository();
    const account = await repo.createAccount({
      email: "paid@example.com",
      username: "paid",
      role: "user",
      passwordHash: "hash",
      emailVerifiedAt: NOW.toISOString()
    }, NOW);
    const hourly = await repo.upsertBriefing({
      ...personalNewsBriefing,
      id: "paid-hourly",
      ownerAccountId: account.id,
      ownerUsername: account.username,
      slug: "hourly",
      briefingCadence: "hourly"
    }, NOW);
    const daily = await repo.upsertBriefing({
      ...personalNewsBriefing,
      id: "paid-daily",
      ownerAccountId: account.id,
      ownerUsername: account.username,
      slug: "daily",
      briefingCadence: "daily"
    }, NOW);
    const sourceInput = {
      title: "Google News: launch",
      provider: "apify" as const,
      kind: "google_news" as const,
      sourceUrl: "https://news.google.com/rss/search?q=launch&hl=en-US&gl=US&ceid=US:en",
      actorId: "actor",
      enabled: true
    };
    const hourlySource = await repo.upsertConfiguredSource({ ...sourceInput, briefingId: hourly.id }, NOW);
    const dailySource = await repo.upsertConfiguredSource({ ...sourceInput, briefingId: daily.id }, NOW);
    expect(hourlySource.canonicalKey).toBe(dailySource.canonicalKey);
    const run = await repo.createSourceRun({
      sourceId: dailySource.id,
      briefingId: daily.id,
      provider: "apify",
      state: "running",
      startedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1_000).toISOString()
    }, NOW);
    await repo.setSourceEnabled(dailySource.id, false);

    expect(await repo.hasActiveCanonicalSourceRun(hourlySource.id)).toBe(true);
    expect(await repo.listDueSourceRefreshCandidates(
      new Date(NOW.getTime() + 2 * 60 * 60 * 1_000).toISOString(),
      10
    )).toEqual([]);
    await repo.updateSourceRun({
      id: run.id,
      state: "succeeded",
      completedAt: NOW.toISOString()
    }, NOW);
    expect(await repo.listDueSourceRefreshCandidates(NOW.toISOString(), 10)).toEqual([
      expect.objectContaining({
        briefingId: hourly.id,
        sourceId: hourlySource.id,
        briefingCadence: "hourly"
      })
    ]);
  });
});
