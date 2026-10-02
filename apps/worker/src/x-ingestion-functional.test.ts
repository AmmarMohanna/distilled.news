import { describe, expect, it, vi } from "vitest";
import { personalNewsBriefing } from "@distilled/core";
import { InMemoryRepository } from "./repository";
import { pollApifySourceRuns, refreshSourceById } from "./sources";
import { processQueueMessage } from "./processor";
import type { ProcessingJobMessage } from "./types";

// Synthetic fixtures: exercise the production Apify ingestion path, not X API access.
// Regression checks for sequential repeats and same-ID corrections.
async function setup() {
  const now = new Date("2026-09-25T12:00:00Z");
  const repo = new InMemoryRepository();
  const briefing = await repo.upsertBriefing({ ...personalNewsBriefing, id: "x-functional", paused: false, intensity: "medium" }, now);
  const source = await repo.upsertConfiguredSource({
    briefingId: briefing.id, title: "Test source", provider: "apify", kind: "x_profile",
    input: "example", sourceUrl: "https://x.com/example", actorId: "test/offline",
    actorInput: {}, enabled: true
  }, now);
  const original = {
    id: "123456789", text: "Electricite du Liban confirmed electricity supply will increase to 8 hours daily starting Monday.",
    createdAt: "2026-09-25T10:00:00Z", url: "https://x.com/example/status/123456789",
    author: { userName: "example", name: "Example" }
  };
  let dataset = [original];
  let run = 0;
  const fetcher: typeof fetch = vi.fn(async (request) => {
    const url = String(request);
    if (url.includes("/actors/")) return Response.json({ data: { id: `run-${++run}`, status: "RUNNING", defaultDatasetId: "offline" } });
    if (url.includes("/actor-runs/")) return Response.json({ data: { id: `run-${run}`, status: "SUCCEEDED", defaultDatasetId: "offline", usageTotalUsd: 0 } });
    if (url.includes("/datasets/")) return Response.json(dataset);
    throw new Error(`Unexpected mocked request: ${url}`);
  });
  const queue = { send: vi.fn(async (_job: ProcessingJobMessage) => undefined) };
  const input = { repo, briefing, now, fetcher, queue, bucket: { put: vi.fn(async () => undefined) }, env: { APIFY_API_TOKEN: "offline-placeholder" } };
  return {
    repo, briefing, now, original, queue,
    async ingest(text = original.text) {
      dataset = [{ ...original, text }];
      await refreshSourceById({ ...input, sourceId: source.id });
      await pollApifySourceRuns(input);
      expect((await repo.getSource(source.id))?.lastError).toBeFalsy();
      return repo.listRecentRawMessages(briefing.id, now);
    }
  };
}

describe("X ingestion offline characterization", () => {
  it("stores one item and enqueues once when the same post is collected twice", async () => {
    const test = await setup();
    const first = await test.ingest();
    const second = await test.ingest();
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]).toEqual(first[0]);
    expect(second[0].sourceUrl).toBe(test.original.url);
    expect(new Date(second[0].postedAt).toISOString()).toBe(new Date(test.original.createdAt).toISOString());
    expect(test.queue.send).toHaveBeenCalledTimes(1);
  });

  it("updates changed text once without changing publication date or original link", async () => {
    const test = await setup();
    await test.ingest();
    const edited = "Corrected synthetic news text.";
    const messages = await test.ingest(edited);
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe(edited);
    expect(messages[0].sourceUrl).toBe(test.original.url);
    expect(new Date(messages[0].postedAt).toISOString()).toBe(new Date(test.original.createdAt).toISOString());
    expect(test.queue.send).toHaveBeenCalledTimes(2);
    await test.ingest(edited);
    expect(test.queue.send).toHaveBeenCalledTimes(2);
  });

  it("refreshes an already published briefing instead of leaving stale evidence", async () => {
    const test = await setup();
    await test.ingest();
    await processQueueMessage(test.repo, test.queue.send.mock.calls[0][0], test.now);
    const before = await test.repo.getExistingItems(test.briefing.id, test.now);
    expect(before).toHaveLength(1);
    const correction = test.original.text.replace("8 hours", "12 hours");
    await test.ingest(correction);
    await processQueueMessage(test.repo, test.queue.send.mock.calls[1][0], test.now);
    const after = await test.repo.getExistingItems(test.briefing.id, test.now);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before[0].id);
    expect(after[0].evidence).toHaveLength(1);
    expect(after[0].evidence[0].text).toBe(correction);
    expect(after[0].summary).toContain("12 hours");
    expect(after[0].summary).not.toContain("8 hours");
    expect(after[0].itemAt).toBe(before[0].itemAt);
    expect(after[0].evidence[0].sourceUrl).toBe(test.original.url);
  });
});
