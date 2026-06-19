import { describe, expect, it } from "vitest";
import {
  apifyRunMaxItems,
  createPaidSourceBudgetContext,
  dailyPaidSourceBudgetUsd,
  decidePaidSourceRefresh,
  estimateApifySourceRunCostUsd,
  paidSourceRefreshIntervalMs
} from "./costs";
import { InMemoryRepository } from "./repository";
import type { SourceRecord } from "./types";

const xSource: SourceRecord = {
  id: "src_x",
  briefingId: "briefing_1",
  title: "@news",
  type: "channel",
  provider: "apify",
  kind: "x_profile",
  input: "x: news",
  actorInput: { searchTerms: ["from:news"], maxItems: 30 },
  actorId: "actor/x",
  enabled: true,
  lastSeenAt: "2026-06-18T00:00:00.000Z"
};

const googleSource: SourceRecord = {
  id: "src_google",
  briefingId: "briefing_1",
  title: "Google News: lebanon",
  type: "channel",
  provider: "apify",
  kind: "google_news",
  input: "news: lebanon",
  actorInput: { queries: ["lebanon"], maxItemsPerQuery: 30, maxQueries: 1 },
  actorId: "actor/google",
  enabled: true,
  lastSeenAt: "2026-06-18T00:00:00.000Z"
};

describe("daily source budget", () => {
  it("reserves 5% for LLM usage by default", () => {
    expect(dailyPaidSourceBudgetUsd(1, 0)).toBe(0.95);
    expect(dailyPaidSourceBudgetUsd(1, 0.2)).toBe(0.8);
  });

  it("caps known actor result counts and estimates run costs", () => {
    expect(apifyRunMaxItems(xSource)).toBe(20);
    expect(apifyRunMaxItems(googleSource)).toBe(15);
    expect(estimateApifySourceRunCostUsd(xSource)).toBeCloseTo(0.0036, 6);
    expect(estimateApifySourceRunCostUsd(googleSource)).toBeCloseTo(0.0075, 6);
  });

  it("slows Google News more than X under the same per-source budget", () => {
    const perSourceDailyBudgetUsd = 0.095;
    const xIntervalMinutes = paidSourceRefreshIntervalMs("x_profile", 0.0036, perSourceDailyBudgetUsd) / 60_000;
    const googleIntervalMinutes = paidSourceRefreshIntervalMs("google_news", 0.0075, perSourceDailyBudgetUsd) / 60_000;

    expect(Math.round(xIntervalMinutes)).toBe(55);
    expect(Math.round(googleIntervalMinutes)).toBe(114);
  });

  it("blocks paid refreshes when a source spent its rolling daily allocation", async () => {
    const repo = new InMemoryRepository();
    await repo.createSourceRun({
      sourceId: googleSource.id,
      briefingId: googleSource.briefingId,
      provider: "apify",
      state: "succeeded",
      estimatedCostUsd: 0.095,
      startedAt: "2026-06-18T12:00:00.000Z"
    }, new Date("2026-06-18T12:00:00.000Z"));
    const context = await createPaidSourceBudgetContext({
      briefingId: googleSource.briefingId,
      dailyBudgetUsd: 0.1,
      paidSources: [googleSource],
      repo,
      now: new Date("2026-06-18T13:00:00.000Z")
    });

    expect(decidePaidSourceRefresh({ source: googleSource, context }).reason).toBe("budget_exhausted");
  });
});
