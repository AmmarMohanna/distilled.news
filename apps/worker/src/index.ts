import { createApp } from "./app";
import { createEventReviewAdapterFromEnv, createSummaryAdapterFromEnv } from "./ai";
import { BRIEFING_PREPARATION_LEAD_MS, EMPTY_WINDOW_RECOVERY_HORIZON_MS, publishDueBriefingEditions } from "./editions";
import { ProcessingJobError, processQueueMessage } from "./processor";
import { D1Repository } from "./repository";
import { runRetentionCleanup } from "./retention";
import { enqueueDueSourceRefreshJobs, pollApifySourceRuns, refreshSourceById } from "./sources";
import { enqueueScheduledSyntheticCanaryFixtures } from "./syntheticCanary";
import type { DistilledQueueMessage, Env, ProcessingJobMessage, PublishEditionJobMessage, Repository, SourceRefreshJobMessage } from "./types";

const app = createApp();
const MAX_QUEUE_ATTEMPTS = 5;
const ORPHANED_PROCESSING_JOB_REQUEUE_AGE_MS = 2 * 60 * 1000;
const ENQUEUED_PROCESSING_JOB_REQUEUE_AGE_MS = 2 * 60 * 60 * 1000;
const ABANDONED_PROCESSING_LEASE_GRACE_MS = 60 * 1000;
const STALE_PROCESSING_JOB_REQUEUE_LIMIT = 25;
const SLOW_QUEUE_JOB_MS = 10_000;

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
    const summaryAdapter = createSummaryAdapterFromEnv(env, repo);
    await publishDueBriefingEditions({
      repo,
      briefings: [briefing],
      now: new Date(),
      summaryAdapter,
      editionSynthesisAdapter: summaryAdapter,
      editionSynthesisMode: env.EDITION_SYNTHESIS_MODE
    });
    return;
  }

  if (isProcessingJobMessage(body)) {
    await processQueueMessage(repo, body, new Date(), summaryAdapter, reviewAdapter);
    return;
  }

  throw new PermanentQueueError("Invalid queue message.");
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
  try {
    await runRetentionCleanup(repo, env.RAW_ARCHIVE, now);
  } catch (error) {
    console.warn("Could not run retention cleanup", error);
  }

  try {
    await pollApifySourceRuns({
      repo,
      bucket: env.RAW_ARCHIVE,
      queue: env.PROCESSING_QUEUE,
      env,
      now
    });
  } catch (error) {
    console.warn("Could not poll Apify source runs", error);
  }

  try {
    const rescued = await rescueStaleProcessingJobs(repo, env.PROCESSING_QUEUE, now);
    if (rescued > 0) console.log("Requeued stale processing jobs", { rescued });
  } catch (error) {
    console.warn("Could not requeue stale processing jobs", error);
  }

  const briefings = await repo.listBriefings();

  try {
    const canaryFixtures = await enqueueScheduledSyntheticCanaryFixtures({
      repo,
      queue: env.PROCESSING_QUEUE,
      now
    });
    if (canaryFixtures > 0) console.log("Enqueued synthetic canary fixtures", { canaryFixtures });
  } catch (error) {
    console.error("Could not enqueue synthetic canary fixtures", error);
  }

  let enqueued = 0;

  for (const briefing of briefings) {
    try {
      enqueued += await enqueueDueSourceRefreshJobs({
        briefing,
        repo,
        queue: env.SOURCE_QUEUE ?? env.PROCESSING_QUEUE,
        now
      });
    } catch (error) {
      console.warn(`Could not enqueue source refreshes for briefing ${briefing.id}`, error);
    }
  }
  if (enqueued > 0) console.log("Enqueued scheduled source refresh jobs", { enqueued });

  try {
    const editionQueue = env.EDITION_QUEUE ?? env.PROCESSING_QUEUE;
    let queuedEditions = 0;
    for (const briefing of briefings) {
      if (briefing.paused) continue;
      const recoverySince = new Date(now.getTime() - EMPTY_WINDOW_RECOVERY_HORIZON_MS).toISOString();
      const hasRecoverableEmptyWindow = (await repo.listRecoverableEmptyBriefingWindows(
        briefing.id,
        briefing.briefingCadence,
        recoverySince,
        1
      )).length > 0;
      const boundaryAt = briefing.nextBriefingAt ? new Date(briefing.nextBriefingAt).getTime() : Number.NaN;
      const dueForPreparation = Number.isFinite(boundaryAt) && boundaryAt - BRIEFING_PREPARATION_LEAD_MS <= now.getTime();
      if (!dueForPreparation && !hasRecoverableEmptyWindow) continue;
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
  } catch (error) {
    console.error("Could not enqueue briefing editions", error);
  }
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
