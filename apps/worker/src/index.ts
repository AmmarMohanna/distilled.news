import { createApp } from "./app";
import { createEventReviewAdapterFromEnv, createSummaryAdapterFromEnv } from "./ai";
import { BRIEFING_PREPARATION_LEAD_MS, EMPTY_WINDOW_RECOVERY_HORIZON_MS, publishDueBriefingEditions } from "./editions";
import { ProcessingJobError, processQueueMessage } from "./processor";
import { D1Repository } from "./repository";
import { runRetentionCleanup } from "./retention";
import { enqueueDueSourceRefreshCandidates, pollApifySourceRuns, refreshSourceById } from "./sources";
import { enqueueScheduledSyntheticCanaryFixtures } from "./syntheticCanary";
import type { DistilledQueueMessage, Env, ProcessingJobMessage, PublishEditionJobMessage, Repository, SourceRefreshJobMessage } from "./types";

const app = createApp();
const MAX_QUEUE_ATTEMPTS = 5;
const ORPHANED_PROCESSING_JOB_REQUEUE_AGE_MS = 2 * 60 * 1000;
const ENQUEUED_PROCESSING_JOB_REQUEUE_AGE_MS = 2 * 60 * 60 * 1000;
const ABANDONED_PROCESSING_LEASE_GRACE_MS = 60 * 1000;
const STALE_PROCESSING_JOB_REQUEUE_LIMIT = 25;
const SLOW_QUEUE_JOB_MS = 10_000;
const STALE_SPEND_RESERVATION_MS = 2 * 60 * 60 * 1000;
const DUE_SOURCE_QUERY_LIMIT = 150;
const DUE_BRIEFING_QUERY_LIMIT = 250;
const RECOVERABLE_BRIEFING_QUERY_LIMIT = 250;
const STALE_UNVERIFIED_ACCOUNT_LIMIT = 50;
const UNVERIFIED_ACCOUNT_TTL_MS = 48 * 60 * 60 * 1000;
const HOSTED_UNVERIFIED_ACCOUNT_TTL_MS = 60 * 60 * 1000;
const EXPIRED_VERIFICATION_TOKEN_GRACE_MS = 24 * 60 * 60 * 1000;
const ABSOLUTE_UNVERIFIED_ACCOUNT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OPERATIONAL_EVENT_CLEANUP_BATCH_SIZE = 1_000;
const OPERATIONAL_EVENT_CLEANUP_MAX_BATCHES = 5;
const RETENTION_SCHEDULE_MINUTE_UTC = 17;

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledMaintenance(env));
  },
  async queue(batch: MessageBatch<DistilledQueueMessage>, env: Env): Promise<void> {
    const repo = new D1Repository(env.DB);
    const summaryAdapter = createSummaryAdapterFromEnv(env, repo);
    const reviewAdapter = createEventReviewAdapterFromEnv(env, repo);
    if (isDeadLetterQueue(batch.queue)) {
      for (const message of batch.messages) {
        await recordQueueFailure(
          repo,
          message.body,
          new Error(`Message reached ${batch.queue}`),
          true,
          MAX_QUEUE_ATTEMPTS + 1
        );
        await safeRecordOperationalEvent(repo, {
          category: "dlq",
          subsystem: batch.queue ?? "unknown-dlq",
          status: "failed",
          bodyType: queueBodyType(message.body),
          bodyId: queueBodyId(message.body),
          releaseSha: releaseSha(env),
          detail: "dead_letter_delivery"
        }, new Date());
        console.error("Recorded dead-letter queue message", {
          queue: batch.queue,
          messageId: message.id,
          bodyType: queueBodyType(message.body),
          bodyId: queueBodyId(message.body)
        });
        message.ack();
      }
      return;
    }
    for (const message of batch.messages) {
      const startedAt = Date.now();
      const bodyType = queueBodyType(message.body);
      const bodyId = queueBodyId(message.body);
      try {
        await processDistilledQueueMessage(repo, env, message.body, summaryAdapter, reviewAdapter);
        const durationMs = Date.now() - startedAt;
        if (durationMs >= SLOW_QUEUE_JOB_MS) {
          console.warn("Slow queue job completed", {
            messageId: message.id,
            attempts: message.attempts,
            bodyType,
            bodyId,
            durationMs
          });
        }
        message.ack();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const shouldQuarantine = shouldQuarantineQueueFailure(error, message.attempts);
        await recordQueueFailure(repo, message.body, error, shouldQuarantine, message.attempts);
        if (shouldQuarantine) {
          await safeRecordOperationalEvent(repo, {
            category: "dlq",
            subsystem: batch.queue ?? "primary-queue",
            status: "failed",
            bodyType,
            bodyId,
            releaseSha: releaseSha(env),
            detail: isPermanentQueueError(error) ? "permanent_failure" : "attempts_exhausted"
          }, new Date());
        }
        console.error(shouldQuarantine ? "Quarantined queue job" : "Retrying queue job", {
          messageId: message.id,
          attempts: message.attempts,
          bodyType,
          bodyId,
          durationMs: Date.now() - startedAt,
          permanent: isPermanentQueueError(error),
          quarantined: shouldQuarantine,
          error: errorMessage
        });
        if (shouldQuarantine) {
          message.ack();
        } else {
          message.retry({ delaySeconds: retryDelaySeconds(message.attempts) });
        }
      }
    }
  }
};

async function processDistilledQueueMessage(
  repo: Repository,
  env: Env,
  body: unknown,
  summaryAdapter: ReturnType<typeof createSummaryAdapterFromEnv>,
  reviewAdapter: ReturnType<typeof createEventReviewAdapterFromEnv>
): Promise<void> {
  if (isSourceRefreshJobMessage(body)) {
    const briefing = await repo.getBriefingById(body.briefingId);
    if (!briefing) throw new PermanentQueueError("Briefing not found.");
    if (!await isBriefingOwnerActive(repo, briefing.ownerAccountId)) {
      if (body.canonicalLeaseToken) {
        await repo.releaseCanonicalSourceRefresh(body.sourceId, body.canonicalLeaseToken, new Date());
      }
      return;
    }
    await refreshSourceById({
      briefing,
      sourceId: body.sourceId,
      repo,
      bucket: env.RAW_ARCHIVE,
      queue: env.PROCESSING_QUEUE,
      env,
      now: new Date(),
      force: body.force,
      canonicalLeaseToken: body.canonicalLeaseToken
    });
    return;
  }

  if (isPublishEditionJobMessage(body)) {
    const briefing = await repo.getBriefingById(body.briefingId);
    if (!briefing) throw new PermanentQueueError("Briefing not found.");
    if (!await isBriefingOwnerActive(repo, briefing.ownerAccountId)) return;
    const summaryAdapter = createSummaryAdapterFromEnv(env, repo);
    await publishDueBriefingEditions({
      repo,
      briefings: [briefing],
      now: new Date(),
      summaryAdapter,
      editionSynthesisAdapter: summaryAdapter,
      editionSynthesisMode: env.EDITION_SYNTHESIS_MODE,
      releaseSha: releaseSha(env)
    });
    return;
  }

  if (isProcessingJobMessage(body)) {
    const briefing = await repo.getBriefingById(body.briefingId);
    if (!briefing) throw new PermanentQueueError("Briefing not found.");
    if (!await isBriefingOwnerActive(repo, briefing.ownerAccountId)) {
      await repo.failProcessingJob(body.jobId, "Account disabled.", new Date());
      return;
    }
    await processQueueMessage(repo, body, new Date(), summaryAdapter, reviewAdapter);
    return;
  }

  throw new PermanentQueueError("Invalid queue message.");
}

async function isBriefingOwnerActive(repo: Repository, accountId: string): Promise<boolean> {
  const account = await repo.getAccountById(accountId);
  return Boolean(account && !account.disabledAt);
}

async function recordQueueFailure(
  repo: Repository,
  body: unknown,
  error: unknown,
  quarantined: boolean,
  attempts: number
): Promise<void> {
  const errorText = error instanceof Error ? error.message : String(error);
  const message = quarantined ? `Quarantined after repeated queue failures: ${errorText}` : errorText;
  if (isProcessingJobMessage(body)) {
    const leaseToken = error instanceof ProcessingJobError ? error.leaseToken : undefined;
    if (quarantined) await repo.failProcessingJob(body.jobId, message, new Date(), leaseToken);
    else await repo.releaseProcessingJob(body.jobId, message, retryDelaySeconds(attempts) * 1000, new Date(), leaseToken);
    return;
  }
  if (isSourceRefreshJobMessage(body) && quarantined) {
    const source = await repo.getSource(body.sourceId);
    if (source) {
      const nextRetryAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const equivalent = await repo.listEquivalentSources(source.id);
      for (const target of equivalent.length > 0 ? equivalent : [source]) {
        await repo.recordSourceFailure({
          sourceId: target.id,
          error: message,
          failureClass: "queue_dlq",
          nextRetryAt
        }, new Date());
      }
      await repo.rescheduleCanonicalSourceRefresh(source.id, nextRetryAt, message, new Date());
    }
    await repo.setSetting("last_source_dlq_at", new Date().toISOString(), new Date());
    return;
  }
  if (isPublishEditionJobMessage(body) && quarantined) {
    await repo.setSetting("last_edition_dlq_at", new Date().toISOString(), new Date());
    await repo.setSetting(`last_edition_dlq_at:${body.briefingId}`, new Date().toISOString(), new Date());
  }
}

function isDeadLetterQueue(queue: string | undefined): boolean {
  return typeof queue === "string" && queue.endsWith("-dlq");
}

function isProcessingJobMessage(body: unknown): body is ProcessingJobMessage {
  if (!isRecord(body)) return false;
  return (!("type" in body) || body.type === undefined || body.type === "process_raw_message") &&
    typeof body.jobId === "string" &&
    typeof body.briefingId === "string" &&
    typeof body.rawMessageId === "string";
}

function isSourceRefreshJobMessage(body: unknown): body is SourceRefreshJobMessage {
  if (!isRecord(body)) return false;
  return body.type === "refresh_source" &&
    typeof body.briefingId === "string" &&
    typeof body.sourceId === "string" &&
    (body.canonicalLeaseToken === undefined || typeof body.canonicalLeaseToken === "string");
}

function isPublishEditionJobMessage(body: unknown): body is PublishEditionJobMessage {
  return isRecord(body) && body.type === "publish_due_edition" && typeof body.briefingId === "string";
}

class PermanentQueueError extends Error {}

function isPermanentQueueError(error: unknown): boolean {
  if (error instanceof PermanentQueueError) return true;
  const message = error instanceof Error ? error.message : String(error);
  if (/(not found|missing|not configured|unsupported source provider|invalid queue message)/i.test(message)) return true;
  const status = message.match(/:\s*(\d{3})\b/)?.[1];
  if (!status) return false;
  const code = Number(status);
  return code >= 400 && code < 500 && ![408, 409, 425, 429].includes(code);
}

export function shouldQuarantineQueueFailure(error: unknown, attempts: number): boolean {
  return isPermanentQueueError(error) || attempts >= MAX_QUEUE_ATTEMPTS;
}

function retryDelaySeconds(attempts: number): number {
  return Math.min(300, Math.max(30, attempts * 60));
}

function queueBodyType(body: unknown): string {
  if (isRecord(body) && typeof body.type === "string") return body.type;
  return "process_raw_message";
}

function queueBodyId(body: unknown): string | undefined {
  if (isProcessingJobMessage(body)) return body.jobId;
  if (isSourceRefreshJobMessage(body)) return body.sourceId;
  if (isPublishEditionJobMessage(body)) return body.briefingId;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function runScheduledMaintenance(env: Env): Promise<void> {
  const repo = new D1Repository(env.DB);
  const now = new Date();
  const startedAt = Date.now();
  let failures = 0;
  await safeRecordOperationalEvent(repo, {
    category: "maintenance",
    subsystem: "scheduler",
    status: "started",
    releaseSha: releaseSha(env)
  }, now);
  try {
    const cutoff = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString();
    let deleted = 0;
    let hasMore = false;
    for (let batch = 0; batch < OPERATIONAL_EVENT_CLEANUP_MAX_BATCHES; batch += 1) {
      const result = await repo.deleteOperationalEventsBefore(cutoff, OPERATIONAL_EVENT_CLEANUP_BATCH_SIZE);
      deleted += result.deleted;
      hasMore = result.hasMore;
      if (!result.hasMore) break;
    }
    if (deleted > 0 || hasMore) {
      console.log("Cleaned old operational events", { deleted, hasMore });
    }
  } catch {
    failures += 1;
  }

  try {
    const hosted = env.ENVIRONMENT === "production" || env.ENVIRONMENT === "staging";
    const unverifiedAccountTtlMs = hosted
      ? HOSTED_UNVERIFIED_ACCOUNT_TTL_MS
      : UNVERIFIED_ACCOUNT_TTL_MS;
    const absoluteUnverifiedAccountTtlMs = hosted
      ? HOSTED_UNVERIFIED_ACCOUNT_TTL_MS
      : ABSOLUTE_UNVERIFIED_ACCOUNT_TTL_MS;
    const deleted = await repo.deleteStaleUnverifiedAccounts(
      new Date(now.getTime() - unverifiedAccountTtlMs).toISOString(),
      new Date(now.getTime() - EXPIRED_VERIFICATION_TOKEN_GRACE_MS).toISOString(),
      new Date(now.getTime() - absoluteUnverifiedAccountTtlMs).toISOString(),
      STALE_UNVERIFIED_ACCOUNT_LIMIT
    );
    if (deleted > 0) console.log("Deleted stale unverified accounts", { deleted });
    await recordMaintenanceSuccess(repo, env, "unverified_account_cleanup", now, deleted);
  } catch (error) {
    failures += 1;
    await recordMaintenanceFailure(repo, env, "unverified_account_cleanup", now, error);
    console.warn("Could not delete stale unverified accounts", error);
  }

  try {
    await pollApifySourceRuns({
      repo,
      bucket: env.RAW_ARCHIVE,
      queue: env.PROCESSING_QUEUE,
      env,
      now
    });
    await recordMaintenanceSuccess(repo, env, "apify_poll", now);
  } catch (error) {
    failures += 1;
    await recordMaintenanceFailure(repo, env, "apify_poll", now, error);
    console.warn("Could not poll Apify source runs", error);
  }

  try {
    const rescued = await rescueStaleProcessingJobs(repo, env.PROCESSING_QUEUE, now);
    if (rescued > 0) console.log("Requeued stale processing jobs", { rescued });
    await recordMaintenanceSuccess(repo, env, "processing_rescue", now, rescued);
  } catch (error) {
    failures += 1;
    await recordMaintenanceFailure(repo, env, "processing_rescue", now, error);
    console.warn("Could not requeue stale processing jobs", error);
  }

  try {
    const reconciliation = await repo.reconcileStaleSpendReservations(
      new Date(now.getTime() - STALE_SPEND_RESERVATION_MS).toISOString(),
      now,
      100
    );
    if (reconciliation.reconciled > 0 || reconciliation.hasMore) {
      console.warn("Reconciled stale spend reservations", reconciliation);
    }
    await recordMaintenanceSuccess(repo, env, "spend_reconciliation", now, reconciliation.reconciled);
  } catch (error) {
    failures += 1;
    await recordMaintenanceFailure(repo, env, "spend_reconciliation", now, error);
    console.warn("Could not reconcile stale spend reservations", error);
  }

  try {
    const canaryFixtures = await enqueueScheduledSyntheticCanaryFixtures({
      repo,
      queue: env.PROCESSING_QUEUE,
      now
    });
    if (canaryFixtures > 0) console.log("Enqueued synthetic canary fixtures", { canaryFixtures });
    await recordMaintenanceSuccess(repo, env, "synthetic_canary", now, canaryFixtures);
  } catch (error) {
    failures += 1;
    await recordMaintenanceFailure(repo, env, "synthetic_canary", now, error);
    console.error("Could not enqueue synthetic canary fixtures", error);
  }

  try {
    const sourceCandidates = await repo.listDueSourceRefreshCandidates(
      now.toISOString(),
      DUE_SOURCE_QUERY_LIMIT
    );
    const enqueued = await enqueueDueSourceRefreshCandidates({
      candidates: sourceCandidates,
      repo,
      queue: env.SOURCE_QUEUE ?? env.PROCESSING_QUEUE,
      now
    });
    if (enqueued > 0) console.log("Enqueued scheduled source refresh jobs", { enqueued });
    await recordMaintenanceSuccess(repo, env, "source_dispatch", now, enqueued);
  } catch (error) {
    failures += 1;
    await recordMaintenanceFailure(repo, env, "source_dispatch", now, error);
    console.warn("Could not enqueue scheduled source refreshes", error);
  }

  try {
    const editionQueue = env.EDITION_QUEUE ?? env.PROCESSING_QUEUE;
    const dueBriefings = await repo.listBriefingsDue(
      new Date(now.getTime() + BRIEFING_PREPARATION_LEAD_MS).toISOString(),
      DUE_BRIEFING_QUERY_LIMIT
    );
    const recoverySince = new Date(now.getTime() - EMPTY_WINDOW_RECOVERY_HORIZON_MS).toISOString();
    const recoverableBriefings = await repo.listBriefingsWithRecoverableEmptyWindows(
      recoverySince,
      RECOVERABLE_BRIEFING_QUERY_LIMIT
    );
    const dueBriefingIds = new Set(dueBriefings.map((briefing) => briefing.id));
    const candidates = new Map(
      [...dueBriefings, ...recoverableBriefings].map((briefing) => [briefing.id, briefing])
    );
    let queuedEditions = 0;
    for (const briefing of candidates.values()) {
      const boundaryAt = briefing.nextBriefingAt ? new Date(briefing.nextBriefingAt).getTime() : Number.NaN;
      const dueForPreparation = dueBriefingIds.has(briefing.id);
      if (dueForPreparation && briefing.briefingCadence === "hourly" && boundaryAt + 60_000 < now.getTime()) {
        console.error("Hourly briefing publication overdue", {
          briefingId: briefing.id,
          boundaryAt: briefing.nextBriefingAt,
          overdueMs: now.getTime() - boundaryAt
        });
      }
      await editionQueue.send({ type: "publish_due_edition", briefingId: briefing.id });
      queuedEditions += 1;
    }
    if (queuedEditions > 0) console.log("Enqueued due briefing editions", { queuedEditions });
    await recordMaintenanceSuccess(repo, env, "edition_dispatch", now, queuedEditions);
  } catch (error) {
    failures += 1;
    await recordMaintenanceFailure(repo, env, "edition_dispatch", now, error);
    console.error("Could not enqueue briefing editions", error);
  }

  if (isRetentionScheduleDue(now)) {
    try {
      const retention = await runScheduledRetention(repo, env.RAW_ARCHIVE, now);
      if (!retention) throw new Error("retention_schedule_mismatch");
      if (retention.archiveDeleteFailures > 0) throw new Error("archive_delete_failed");
      await safeRecordOperationalEvent(repo, {
        category: "maintenance",
        subsystem: "retention",
        status: "succeeded",
        releaseSha: releaseSha(env),
        detail: `count=${retention.archivesDeleted + retention.deleted};spend_archived=${retention.spendOperationsArchived};spend_detail_deleted=${retention.spendDetailRowsDeleted};has_more=${retention.hasMore}`
      }, now);
    } catch (error) {
      failures += 1;
      await recordMaintenanceFailure(repo, env, "retention", now, error);
      console.warn("Could not run retention cleanup", error);
    }
  } else {
    await safeRecordOperationalEvent(repo, {
      category: "maintenance",
      subsystem: "retention",
      status: "succeeded",
      releaseSha: releaseSha(env),
      detail: "not_due"
    }, now);
  }

  await safeRecordOperationalEvent(repo, {
    category: "maintenance",
    subsystem: "scheduler",
    status: failures > 0 ? "failed" : "succeeded",
    releaseSha: releaseSha(env),
    detail: `failures=${failures};duration_ms=${Date.now() - startedAt}`
  }, new Date());
}

export function isRetentionScheduleDue(now: Date): boolean {
  return now.getUTCMinutes() === RETENTION_SCHEDULE_MINUTE_UTC;
}

export async function runScheduledRetention(
  repo: Repository,
  bucket: { delete(key: string | string[]): Promise<unknown> },
  now: Date
) {
  if (!isRetentionScheduleDue(now)) return null;
  return runRetentionCleanup(repo, bucket, now, 100);
}

async function recordMaintenanceSuccess(
  repo: Repository,
  env: Env,
  subsystem: string,
  now: Date,
  count?: number
): Promise<void> {
  await safeRecordOperationalEvent(repo, {
    category: "maintenance",
    subsystem,
    status: "succeeded",
    releaseSha: releaseSha(env),
    detail: count === undefined ? undefined : `count=${count}`
  }, now);
}

async function recordMaintenanceFailure(
  repo: Repository,
  env: Env,
  subsystem: string,
  now: Date,
  error: unknown
): Promise<void> {
  await safeRecordOperationalEvent(repo, {
    category: "maintenance",
    subsystem,
    status: "failed",
    releaseSha: releaseSha(env),
    detail: error instanceof Error ? error.name.slice(0, 100) : "unknown_error"
  }, now);
}

async function safeRecordOperationalEvent(
  repo: Repository,
  event: Parameters<Repository["recordOperationalEvent"]>[0],
  now: Date
): Promise<void> {
  try {
    await repo.recordOperationalEvent(event, now);
  } catch (error) {
    console.warn("Could not persist operational event", {
      category: event.category,
      subsystem: event.subsystem,
      status: event.status,
      error: error instanceof Error ? error.name : "unknown_error"
    });
  }
}

function releaseSha(env: Env): string | undefined {
  return env.RELEASE_SHA?.trim() || env.CF_VERSION_METADATA?.tag || env.CF_VERSION_METADATA?.id;
}

export async function rescueStaleProcessingJobs(
  repo: Repository,
  queue: { send(message: ProcessingJobMessage): Promise<unknown> },
  now: Date
): Promise<number> {
  const orphanedBefore = new Date(now.getTime() - ORPHANED_PROCESSING_JOB_REQUEUE_AGE_MS).toISOString();
  const enqueuedBefore = new Date(now.getTime() - ENQUEUED_PROCESSING_JOB_REQUEUE_AGE_MS).toISOString();
  const abandonedLeaseBefore = new Date(now.getTime() - ABANDONED_PROCESSING_LEASE_GRACE_MS).toISOString();
  const jobs = await repo.listRecoverableProcessingJobs({
    orphanedBefore,
    enqueuedBefore,
    abandonedLeaseBefore,
    limit: STALE_PROCESSING_JOB_REQUEUE_LIMIT
  });
  let rescued = 0;

  for (const job of jobs) {
    if (job.availableAt && job.availableAt > now.toISOString()) continue;
    await queue.send({
      type: "process_raw_message",
      jobId: job.id,
      briefingId: job.briefingId,
      rawMessageId: job.rawMessageId
    });
    await repo.markProcessingJobEnqueued(job.id, now);
    rescued += 1;
  }

  return rescued;
}
