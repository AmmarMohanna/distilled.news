import type { Repository } from "./types";

const SPEND_RETENTION_MAX_BATCHES = 20;

export interface RetentionArchiveBucket {
  delete(key: string | string[]): Promise<unknown>;
}

export interface RetentionResult {
  deleted: number;
  archivesDeleted: number;
  archiveDeleteFailures: number;
  sourceRunArchiveReferencesCleared: number;
  rawPayloadReferencesCleared: number;
  spendOperationsArchived: number;
  spendDetailRowsDeleted: number;
  spendAggregatesDeleted: number;
  spendTombstonesDeleted: number;
  hasMore: boolean;
}

export async function runRetentionCleanup(
  repo: Repository,
  bucket: RetentionArchiveBucket,
  now = new Date(),
  maxArchiveKeys = 100
): Promise<RetentionResult> {
  const boundedLimit = Math.min(1_000, Math.max(1, Math.trunc(maxArchiveKeys)));
  const spendRetention = {
    archivedOperations: 0,
    detailRowsDeleted: 0,
    aggregatesDeleted: 0,
    tombstonesDeleted: 0,
    hasMore: false
  };
  for (let batch = 0; batch < SPEND_RETENTION_MAX_BATCHES; batch += 1) {
    const result = await repo.archiveExpiredSpend(now, boundedLimit);
    spendRetention.archivedOperations += result.archivedOperations;
    spendRetention.detailRowsDeleted += result.detailRowsDeleted;
    spendRetention.aggregatesDeleted += result.aggregatesDeleted;
    spendRetention.tombstonesDeleted += result.tombstonesDeleted;
    spendRetention.hasMore = result.hasMore;
    if (!result.hasMore) break;
    const madeProgress = result.archivedOperations +
      result.aggregatesDeleted +
      result.tombstonesDeleted > 0;
    if (!madeProgress) break;
  }
  const candidates = await repo.listExpiredRawPayloadKeys(now, boundedLimit + 1);
  const hasMore = candidates.length > boundedLimit;
  const archiveKeys = candidates.slice(0, boundedLimit);
  let archivesDeleted = 0;
  let archiveDeleteFailures = 0;

  for (let index = 0; index < archiveKeys.length; index += 1_000) {
    const keys = archiveKeys.slice(index, index + 1_000);
    try {
      await bucket.delete(keys.length === 1 ? keys[0] : keys);
      archivesDeleted += keys.length;
    } catch (error) {
      archiveDeleteFailures += keys.length;
      console.warn("Could not delete expired raw archive batch", {
        count: keys.length,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (archiveDeleteFailures > 0) {
    return {
      deleted: 0,
      archivesDeleted,
      archiveDeleteFailures,
      sourceRunArchiveReferencesCleared: 0,
      rawPayloadReferencesCleared: 0,
      spendOperationsArchived: spendRetention.archivedOperations,
      spendDetailRowsDeleted: spendRetention.detailRowsDeleted,
      spendAggregatesDeleted: spendRetention.aggregatesDeleted,
      spendTombstonesDeleted: spendRetention.tombstonesDeleted,
      hasMore: true
    };
  }

  const sourceRunArchiveReferencesCleared = await repo.clearExpiredSourceRunArchiveKeys(
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    archiveKeys
  );
  const rawPayloadReferencesCleared = await repo.clearExpiredRawPayloadKeys(
    now.toISOString(),
    archiveKeys
  );
  const databaseCleanup = hasMore
    ? { deleted: 0, hasMore: false }
    : await repo.deleteExpired(now, 1_000);
  return {
    deleted: databaseCleanup.deleted,
    archivesDeleted,
    archiveDeleteFailures,
    sourceRunArchiveReferencesCleared,
    rawPayloadReferencesCleared,
    spendOperationsArchived: spendRetention.archivedOperations,
    spendDetailRowsDeleted: spendRetention.detailRowsDeleted,
    spendAggregatesDeleted: spendRetention.aggregatesDeleted,
    spendTombstonesDeleted: spendRetention.tombstonesDeleted,
    hasMore: hasMore || databaseCleanup.hasMore || spendRetention.hasMore
  };
}
