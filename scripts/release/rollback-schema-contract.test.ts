import { DatabaseSync, type StatementSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, expect, it } from "vitest";
import { D1Repository } from "./repository";

const now = new Date("2026-07-29T12:00:00.000Z");
const migrationsDirectory = process.env.ROLLBACK_FORWARD_MIGRATIONS_DIR;
if (!migrationsDirectory) {
  throw new Error("ROLLBACK_FORWARD_MIGRATIONS_DIR is required.");
}

const sqlite = new DatabaseSync(":memory:");
for (const file of readdirSync(migrationsDirectory)
  .filter((candidate) => /^\d{4}_.+\.sql$/.test(candidate))
  .sort()) {
  sqlite.exec(readFileSync(resolve(migrationsDirectory, file), "utf8"));
}
sqlite.exec("PRAGMA foreign_keys = ON;");

let repository: D1Repository;

afterAll(() => sqlite.close());

it("executes the captured Worker repository contract against the forward-migrated schema", async () => {
  const account = await repository.createAccount({
    email: "rollback-contract@example.invalid",
    username: "rollback-contract",
    role: "user",
    passwordHash: "not-a-login",
    emailVerifiedAt: now.toISOString(),
    termsAcceptedAt: now.toISOString(),
    termsVersion: "contract",
    privacyVersion: "contract",
    acceptableUseVersion: "contract"
  }, now);
  expect(await repository.getAccountById(account.id)).toMatchObject({
    email: "rollback-contract@example.invalid",
    username: "rollback-contract"
  });
  expect(await repository.listAccounts()).toHaveLength(1);

  const authToken = await repository.createAuthToken({
    accountId: account.id,
    purpose: "email_verification",
    tokenHash: "rollback-contract-token",
    expiresAt: new Date(now.getTime() + 60_000).toISOString()
  }, now);
  expect(await repository.getAuthToken(
    "rollback-contract-token",
    "email_verification"
  )).toMatchObject({ id: authToken.id, accountId: account.id });
  expect(await repository.consumeAuthToken(authToken.id, now)).toBe(true);
  expect(await repository.consumeRateLimit({
    key: "rollback-contract",
    action: "login",
    since: new Date(now.getTime() - 60_000).toISOString(),
    limit: 2
  }, now)).toBe(true);

  const briefing = await repository.upsertBriefing({
    id: "rollback_contract_briefing",
    ownerAccountId: account.id,
    ownerUsername: account.username,
    slug: "rollback-contract",
    title: "Rollback contract",
    stars: 0,
    interestProfile: "Exercise the rollback-compatible D1 contract.",
    styleInstruction: "Keep it factual.",
    publicFeedEnabled: true,
    paused: false,
    language: "en",
    intensity: "low",
    briefingCadence: "hourly",
    briefingTimeOfDay: "00:00",
    briefingTimezone: "UTC",
    nextBriefingAt: new Date(now.getTime() + 60 * 60 * 1_000).toISOString(),
    retentionDays: 15
  }, now);
  expect(await repository.getBriefingBySlug(account.id, briefing.slug))
    .toMatchObject({ id: briefing.id });

  const source = await repository.upsertConfiguredSource({
    briefingId: briefing.id,
    title: "Rollback RSS",
    provider: "rss",
    kind: "rss_feed",
    sourceUrl: "https://example.invalid/rollback.xml",
    enabled: true
  }, now);
  expect(await repository.listSources(briefing.id)).toEqual([
    expect.objectContaining({ id: source.id, kind: "rss_feed" })
  ]);
  await repository.setSourceEnabled(source.id, false, now);
  await repository.setSourceEnabled(source.id, true, now);

  const message = {
    id: "rollback_contract_message",
    source: {
      id: source.id,
      title: source.title,
      type: source.type,
      provider: source.provider,
      kind: source.kind
    },
    messageId: "rollback-contract-1",
    text: "The rollback compatibility fixture published a deterministic update.",
    links: ["https://example.invalid/rollback-update"],
    media: [],
    postedAt: new Date(now.getTime() - 30_000).toISOString(),
    receivedAt: new Date(now.getTime() - 20_000).toISOString(),
    sourceUrl: "https://example.invalid/rollback-update",
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString()
  };
  const jobId = await repository.saveRawMessageAndCreateProcessingJob(
    briefing.id,
    message,
    now
  );
  expect(await repository.getRawMessage(message.id)).toMatchObject({
    id: message.id,
    source: { id: source.id }
  });
  const claim = await repository.claimProcessingJob(jobId, 60_000, now);
  expect(claim).toMatchObject({ id: jobId, rawMessageId: message.id });
  await repository.completeProcessingJob(jobId, now, claim?.leaseToken);
  expect(await repository.listProcessingJobs({ briefingId: briefing.id }))
    .toEqual([expect.objectContaining({ id: jobId, state: "completed" })]);

  const sourceRun = await repository.createSourceRun({
    sourceId: source.id,
    briefingId: briefing.id,
    provider: "rss",
    state: "running",
    idempotencyKey: "rollback-contract-source-run"
  }, now);
  await repository.updateSourceRun({
    id: sourceRun.id,
    state: "succeeded",
    itemCount: 1,
    actualCostUsd: 0,
    completedAt: now.toISOString()
  }, now);
  expect(await repository.listSourceRuns({ sourceId: source.id }))
    .toEqual([expect.objectContaining({ id: sourceRun.id, state: "succeeded" })]);

  await repository.saveBriefingEdition({
    id: "rollback_contract_edition",
    briefingId: briefing.id,
    cadence: "hourly",
    windowStart: new Date(now.getTime() - 60 * 60 * 1_000).toISOString(),
    windowEnd: now.toISOString(),
    title: "Rollback contract edition",
    summary: "The forward schema accepted the captured repository contract.",
    sections: [],
    status: "published",
    generationMode: "deterministic",
    publishedAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  }, now);
  expect(await repository.listBriefingEditions(briefing.id, true, now))
    .toEqual([expect.objectContaining({ id: "rollback_contract_edition" })]);

  await repository.recordLlmUsage({
    briefingId: briefing.id,
    model: "contract-model",
    purpose: "edition_summary",
    inputTokens: 10,
    outputTokens: 5,
    estimatedCostUsd: 0.001
  }, now);
  expect(await repository.sumLlmUsageCost({
    briefingId: briefing.id,
    since: new Date(now.getTime() - 60_000).toISOString()
  })).toBeCloseTo(0.001);

  expect(await repository.reserveSpend({
    idempotencyKey: "rollback-contract-spend",
    accountId: account.id,
    briefingId: briefing.id,
    category: "llm",
    provider: "openai",
    amountUsd: 0.01,
    limits: {
      accountDailyUsd: 1,
      accountMonthlyUsd: 10,
      globalDailyUsd: 10,
      globalMonthlyUsd: 100,
      totalMonthlyUsd: 100
    }
  }, now)).toMatchObject({ status: "created" });
  await repository.settleSpend({
    idempotencyKey: "rollback-contract-spend",
    actualUsd: 0.008
  }, now);
  expect((await repository.getSpendUsage(account.id, now)).llm.dayUsd)
    .toBeCloseTo(0.008);

  await repository.setSetting("rollback_contract", "passed", now);
  expect(await repository.getSetting("rollback_contract")).toBe("passed");
  await repository.recordOperationalEvent({
    category: "maintenance",
    subsystem: "rollback-schema-contract",
    status: "succeeded",
    bodyType: "release",
    bodyId: briefing.id,
    detail: "forward schema accepted captured repository operations"
  }, now);
  expect(await repository.listOperationalEvents({
    since: new Date(now.getTime() - 60_000).toISOString()
  })).toEqual([
    expect.objectContaining({
      subsystem: "rollback-schema-contract",
      status: "succeeded"
    })
  ]);

  expect(await repository.getHealth(briefing.id, now)).toMatchObject({
    processing: { completed: 1, failed: 0, queued: 0 },
    sources: { enabled: 1 }
  });
});

type SqlValue = string | number | bigint | null | Uint8Array;

class D1DatabaseAdapter {
  constructor(private readonly database: DatabaseSync) {}

  prepare(sql: string) {
    return new D1StatementAdapter(this.database, sql);
  }

  batch(statements: D1StatementAdapter[]) {
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const results = statements.map((statement) => statement.execute());
      this.database.exec("COMMIT;");
      return Promise.resolve(results);
    } catch (error) {
      this.database.exec("ROLLBACK;");
      return Promise.reject(error);
    }
  }
}

class D1StatementAdapter {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly values: SqlValue[] = []
  ) {}

  bind(...values: SqlValue[]) {
    return new D1StatementAdapter(this.database, this.sql, values);
  }

  run() {
    return Promise.resolve(this.execute(false));
  }

  all<T>() {
    return Promise.resolve(this.execute(true) as { results: T[] });
  }

  first<T>(column?: string) {
    const row = this.statement().get(...this.values) as Record<string, unknown> | undefined;
    if (!row) return Promise.resolve(null);
    return Promise.resolve((column ? row[column] : row) as T);
  }

  raw<T>() {
    const statement = this.statement();
    statement.setReturnArrays(true);
    return Promise.resolve(statement.all(...this.values) as T[]);
  }

  execute(forceRows?: boolean) {
    const statement = this.statement();
    if (forceRows || statement.columns().length > 0) {
      const results = statement.all(...this.values) as Record<string, unknown>[];
      return d1Result(results, 0);
    }
    const result = statement.run(...this.values);
    return d1Result([], Number(result.changes), Number(result.lastInsertRowid));
  }

  private statement(): StatementSync {
    return this.database.prepare(this.sql);
  }
}

function d1Result(
  results: Record<string, unknown>[],
  changes: number,
  lastRowId = 0
) {
  return {
    success: true,
    results,
    meta: {
      changes,
      last_row_id: lastRowId,
      duration: 0,
      rows_read: results.length,
      rows_written: changes,
      size_after: 0,
      changed_db: changes > 0
    }
  };
}

repository = new D1Repository(
  new D1DatabaseAdapter(sqlite) as unknown as D1Database
);
