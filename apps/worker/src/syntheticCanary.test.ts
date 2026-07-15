import { describe, expect, it } from "vitest";
import { InMemoryRepository } from "./repository";
import { enqueueScheduledSyntheticCanaryFixtures } from "./syntheticCanary";
import type { ProcessingJobMessage } from "./types";

class FakeQueue {
  messages: ProcessingJobMessage[] = [];

  async send(message: ProcessingJobMessage): Promise<void> {
    this.messages.push(message);
  }
}

describe("scheduled synthetic canary fixtures", () => {
  it("enqueues labelled English, Arabic, and French messages before an hourly boundary", async () => {
    const repo = new InMemoryRepository();
    const queue = new FakeQueue();
    const now = new Date("2026-07-14T07:54:00.000Z");

    expect(await enqueueScheduledSyntheticCanaryFixtures({ repo, queue, now })).toBe(3);
    expect(queue.messages).toHaveLength(3);
    expect(queue.messages.map((message) => message.briefingId)).toEqual([
      "briefing_canary_en_02_technology",
      "briefing_canary_ar_01_middle_east",
      "briefing_canary_fr_02_technology"
    ]);

    for (const message of queue.messages) {
      const raw = await repo.getRawMessage(message.rawMessageId);
      expect(raw?.text).toMatch(/synthetic|اصطناعي|synthétique/i);
      expect((await repo.getSource(raw!.source.id))?.enabled).toBe(true);
    }
  });

  it("does not enqueue outside the preparation window", async () => {
    const repo = new InMemoryRepository();
    const queue = new FakeQueue();

    expect(await enqueueScheduledSyntheticCanaryFixtures({ repo, queue, now: new Date("2026-07-14T07:53:59.000Z") })).toBe(0);
    expect(await enqueueScheduledSyntheticCanaryFixtures({ repo, queue, now: new Date("2026-07-14T07:55:00.000Z") })).toBe(0);
    expect(queue.messages).toEqual([]);
  });

  it("is idempotent when the same cron minute is delivered more than once", async () => {
    const repo = new InMemoryRepository();
    const queue = new FakeQueue();
    const now = new Date("2026-07-14T07:54:00.000Z");

    expect(await enqueueScheduledSyntheticCanaryFixtures({ repo, queue, now })).toBe(3);
    expect(await enqueueScheduledSyntheticCanaryFixtures({ repo, queue, now })).toBe(0);
    expect(queue.messages).toHaveLength(3);
  });
});
