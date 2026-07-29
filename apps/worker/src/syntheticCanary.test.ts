import { describe, expect, it } from "vitest";
import { personalNewsBriefing, processMessages } from "@distilled/core";
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
    await seedSyntheticCanaryBriefings(repo);
    const queue = new FakeQueue();
    const now = new Date("2026-07-14T07:54:00.000Z");

    expect(await enqueueScheduledSyntheticCanaryFixtures({ repo, queue, now })).toBe(3);
    expect(queue.messages).toHaveLength(3);
    expect(queue.messages.map((message) => message.briefingId)).toEqual([
      "briefing_canary_en_02_technology",
      "briefing_canary_ar_02_lebanon",
      "briefing_canary_fr_02_technology"
    ]);

    for (const message of queue.messages) {
      const raw = await repo.getRawMessage(message.rawMessageId);
      expect(raw?.text).toMatch(/synthetic|اصطناعي|synthétique/i);
      expect((await repo.getSource(raw!.source.id))?.enabled).toBe(true);

      const briefing = await repo.getBriefingById(message.briefingId);
      expect(briefing).not.toBeNull();
      const result = processMessages({ briefing: briefing!, messages: [raw!] });
      expect(result.suppressed).toEqual([]);
      expect(result.publishedItems).toHaveLength(1);
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
    await seedSyntheticCanaryBriefings(repo);
    const queue = new FakeQueue();
    const now = new Date("2026-07-14T07:54:00.000Z");

    expect(await enqueueScheduledSyntheticCanaryFixtures({ repo, queue, now })).toBe(3);
    expect(await enqueueScheduledSyntheticCanaryFixtures({ repo, queue, now })).toBe(0);
    expect(queue.messages).toHaveLength(3);
  });

  it("does not create sources or processing work for paused canaries", async () => {
    const repo = new InMemoryRepository();
    await seedSyntheticCanaryBriefings(repo, true);
    const queue = new FakeQueue();

    expect(await enqueueScheduledSyntheticCanaryFixtures({
      repo,
      queue,
      now: new Date("2026-07-14T07:54:00.000Z")
    })).toBe(0);
    expect(queue.messages).toEqual([]);
    expect(await repo.getSource("source_canary_fixture_en")).toBeNull();
    expect(await repo.getSource("source_canary_fixture_ar_02")).toBeNull();
    expect(await repo.getSource("source_canary_fixture_fr")).toBeNull();
  });
});

async function seedSyntheticCanaryBriefings(repo: InMemoryRepository, paused = false): Promise<void> {
  const canaries = [
    {
      id: "briefing_canary_en_02_technology",
      ownerUsername: "canary-en-02",
      slug: "technology-watch",
      language: "en" as const,
      interestProfile: "AI tech products company SpaceX Waze privacy surveillance software cybersecurity technology updates.",
      intensity: "high" as const
    },
    {
      id: "briefing_canary_ar_02_lebanon",
      ownerUsername: "canary-ar-02",
      slug: "lebanon-now",
      language: "ar" as const,
      interestProfile: "الاقتصاد والطاقة والبنية التحتية والأمن والقرارات التي تؤثر في الحياة اليومية في لبنان.",
      intensity: "low" as const
    },
    {
      id: "briefing_canary_fr_02_technology",
      ownerUsername: "canary-fr-02",
      slug: "technologie",
      language: "fr" as const,
      interestProfile: "Intelligence artificielle, cybersécurité, logiciels et réglementation numérique.",
      intensity: "low" as const
    }
  ];
  for (const canary of canaries) {
    const account = await repo.createAccount({
      email: `${canary.ownerUsername}@example.com`,
      username: canary.ownerUsername,
      role: "user",
      passwordHash: "test-only",
      emailVerifiedAt: new Date("2026-07-14T00:00:00.000Z").toISOString()
    });
    await repo.upsertBriefing({
      ...personalNewsBriefing,
      ...canary,
      ownerAccountId: account.id,
      paused,
      briefingCadence: "hourly"
    });
  }
}
