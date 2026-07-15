import { describe, expect, it } from "vitest";
import { InMemoryRepository } from "./repository";
import { rescueStaleProcessingJobs, shouldQuarantineQueueFailure } from "./index";

describe("queue retry classification", () => {
  it("quarantines permanent failures immediately and transient failures only after the retry ceiling", () => {
    expect(shouldQuarantineQueueFailure(new Error("Could not fetch RSS source: 404"), 1)).toBe(true);
    expect(shouldQuarantineQueueFailure(new Error("APIFY_API_TOKEN is not configured."), 1)).toBe(true);
    expect(shouldQuarantineQueueFailure(new Error("Could not fetch RSS source: 500"), 1)).toBe(false);
    expect(shouldQuarantineQueueFailure(new Error("Could not fetch RSS source: 500"), 5)).toBe(true);
  });
});

describe("queue recovery", () => {
  it("rescues never-enqueued or abandoned jobs without duplicating normal queue waiters", async () => {
    const repo = new InMemoryRepository();
    const now = new Date("2026-07-13T21:00:00.000Z");
    const orphanedId = await repo.createProcessingJob("feed", "raw-orphaned", new Date(now.getTime() - 3 * 60 * 1000));
    const waitingId = await repo.createProcessingJob("feed", "raw-waiting", new Date(now.getTime() - 30 * 60 * 1000));
    const abandonedId = await repo.createProcessingJob("feed", "raw-abandoned", new Date(now.getTime() - 3 * 60 * 60 * 1000));
    const interruptedId = await repo.createProcessingJob("feed", "raw-interrupted", new Date(now.getTime() - 30 * 60 * 1000));
    await repo.markProcessingJobEnqueued(waitingId, new Date(now.getTime() - 30 * 60 * 1000));
    await repo.markProcessingJobEnqueued(abandonedId, new Date(now.getTime() - 3 * 60 * 60 * 1000));
    await repo.markProcessingJobEnqueued(interruptedId, new Date(now.getTime() - 15 * 60 * 1000));
    await repo.claimProcessingJob(interruptedId, 4 * 60 * 1000, new Date(now.getTime() - 10 * 60 * 1000));
    const messages: unknown[] = [];

    const rescued = await rescueStaleProcessingJobs(repo, { send: async (message) => { messages.push(message); } }, now);

    expect(rescued).toBe(3);
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ jobId: orphanedId }),
      expect.objectContaining({ jobId: abandonedId }),
      expect.objectContaining({ jobId: interruptedId })
    ]));
    expect(messages).not.toEqual(expect.arrayContaining([expect.objectContaining({ jobId: waitingId })]));

    const secondPass = await rescueStaleProcessingJobs(repo, { send: async (message) => { messages.push(message); } }, new Date(now.getTime() + 10_000));
    expect(secondPass).toBe(0);
  });
});

describe("source health reset", () => {
  it("clears active failure state when a source is re-enabled", async () => {
    const repo = new InMemoryRepository();
    const now = new Date("2026-07-13T21:00:00.000Z");
    const source = await repo.upsertConfiguredSource({
      briefingId: "feed",
      title: "Example RSS",
      provider: "rss",
      kind: "rss_feed",
      sourceUrl: "https://example.com/feed.xml",
      enabled: true
    }, now);
    await repo.recordSourceFailure({
      sourceId: source.id,
      error: "upstream unavailable",
      failureClass: "upstream_unavailable",
      nextRetryAt: new Date(now.getTime() + 60_000).toISOString()
    }, now);

    await repo.setSourceEnabled(source.id, false);
    await repo.setSourceEnabled(source.id, true);

    expect(await repo.getSource(source.id)).toMatchObject({
      enabled: true,
      healthState: "healthy",
      consecutiveFailures: 0
    });
    expect((await repo.getSource(source.id))?.lastError).toBeUndefined();
    expect((await repo.getSource(source.id))?.failureClass).toBeUndefined();
  });
});
