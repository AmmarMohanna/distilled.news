import type { Repository } from "./types";

export interface RetentionArchiveBucket {
  delete(key: string): Promise<unknown>;
}

export interface RetentionResult {
  deleted: number;
  archivesDeleted: number;
  archiveDeleteFailures: number;
}

export async function runRetentionCleanup(
  repo: Repository,
  bucket: RetentionArchiveBucket,
  now = new Date()
): Promise<RetentionResult> {
  const archiveKeys = await repo.listExpiredRawPayloadKeys(now);
  // Journal every object before removing the SQL rows that identify it. A crash or
  // R2 failure leaves durable work for the next run, including after process restart.
  for (const key of archiveKeys) await repo.queueArchiveDeletion(key, now);
  const deleted = await repo.deleteExpired(now);
  let archivesDeleted = 0;
  let archiveDeleteFailures = 0;

  for (const key of await repo.listPendingArchiveDeletions(now)) {
    try {
      await bucket.delete(key);
      await repo.completeArchiveDeletion(key);
      archivesDeleted += 1;
    } catch (error) {
      archiveDeleteFailures += 1;
      console.warn("Could not delete expired raw archive", { key, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { deleted, archivesDeleted, archiveDeleteFailures };
}
