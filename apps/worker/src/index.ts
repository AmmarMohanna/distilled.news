import { createApp } from "./app";
import { createEventReviewAdapterFromEnv, createSummaryAdapterFromEnv } from "./ai";
import { processQueueMessage } from "./processor";
import { D1Repository } from "./repository";
import { pollApifySourceRuns, refreshEnabledSources } from "./sources";
import type { Env, ProcessingJobMessage } from "./types";
import { upsertPublishedItemsToVectorize } from "./vectorize";

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refreshEnabledPublicSources(env));
  },
  async queue(batch: MessageBatch<ProcessingJobMessage>, env: Env): Promise<void> {
    const repo = new D1Repository(env.DB);
    const summaryAdapter = createSummaryAdapterFromEnv(env, repo);
    const reviewAdapter = createEventReviewAdapterFromEnv(env, repo);
    for (const message of batch.messages) {
      try {
        const result = await processQueueMessage(repo, message.body, new Date(), summaryAdapter, reviewAdapter);
        if (result) await upsertPublishedItemsToVectorize(env, result.publishedItems);
        message.ack();
      } catch {
        message.retry();
      }
    }
  }
};

async function refreshEnabledPublicSources(env: Env): Promise<void> {
  const repo = new D1Repository(env.DB);
  await pollApifySourceRuns({
    repo,
    bucket: env.RAW_ARCHIVE,
    queue: env.PROCESSING_QUEUE,
    env
  });

  const briefings = await repo.listBriefings();

  for (const briefing of briefings) {
    await refreshEnabledSources({
      briefing,
      repo,
      bucket: env.RAW_ARCHIVE,
      queue: env.PROCESSING_QUEUE,
      env
    });
  }
}
