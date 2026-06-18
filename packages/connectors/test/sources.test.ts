import { describe, expect, it } from "vitest";
import { detectSourceInput } from "../src";

describe("detectSourceInput", () => {
  it("auto-detects Telegram, RSS, Google News, and X inputs", () => {
    expect(detectSourceInput("t: LebUpdate")).toMatchObject({
      provider: "telegram",
      kind: "telegram_channel",
      input: "t: LebUpdate",
      username: "LebUpdate"
    });

    expect(detectSourceInput("https://t.me/LebUpdate")).toMatchObject({
      provider: "telegram",
      kind: "telegram_channel",
      username: "LebUpdate"
    });

    expect(detectSourceInput("rss: https://example.com/feed.xml")).toMatchObject({
      provider: "rss",
      kind: "rss_feed",
      sourceUrl: "https://example.com/feed.xml"
    });

    expect(detectSourceInput("news: lebanon power")).toMatchObject({
      provider: "apify",
      kind: "google_news",
      actorInput: {
        queries: ["lebanon power"],
        geo: "US",
        maxItemsPerQuery: 30
      }
    });

    expect(detectSourceInput("x: @NASA")).toMatchObject({
      provider: "apify",
      kind: "x_profile",
      username: "NASA",
      actorInput: {
        searchTerms: ["from:NASA"],
        sort: "Latest"
      }
    });

    expect(detectSourceInput("x: NASA")).toMatchObject({
      provider: "apify",
      kind: "x_profile",
      username: "NASA"
    });

    expect(detectSourceInput("linkedin: https://www.linkedin.com/company/example/")).toMatchObject({
      provider: "apify",
      kind: "linkedin_company",
      actorInput: {
        targetUrls: ["https://www.linkedin.com/company/example/"],
        maxPosts: 20,
        postedLimit: "24h"
      }
    });
  });
});
