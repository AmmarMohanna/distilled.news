import { describe, expect, it } from "vitest";
import { suggestSources } from "./sourceSuggestions";
import type { BriefingConfig } from "@distilled/core";

const briefing = {
  id: "briefing_1", ownerAccountId: "account_1", ownerUsername: "ammar", slug: "news", title: "News", stars: 0,
  interestProfile: "Lebanon economy and energy", publicFeedEnabled: true, paused: false, language: "en", intensity: "medium",
  briefingCadence: "hourly", briefingTimeOfDay: "00:00", briefingTimezone: "UTC", retentionDays: 15
} satisfies BriefingConfig;

describe("source suggestions", () => {
  it("returns useful curated suggestions and a broad fallback without external credentials", async () => {
    const result = await suggestSources({ briefing, interestProfile: briefing.interestProfile, language: "en", existingSources: [], env: {} });
    expect(result.degraded).toBe(false);
    expect(result.suggestions.some((item) => item.region === "MENA")).toBe(true);
    expect(result.suggestions.at(-1)).toMatchObject({ origin: "google_news", kind: "google_news" });
  });

  it("enriches with free GDELT discovery, deduplicates domains, and marks existing inputs", async () => {
    const fetcher = async () => new Response(JSON.stringify({ articles: [
      { title: "Lebanon energy update", url: "https://example.com/a", domain: "example.com" },
      { title: "More coverage", url: "https://example.com/b", domain: "example.com" }
    ] }), { headers: { "content-type": "application/json" } });
    const existingInput = `news: site:example.com ${briefing.interestProfile}`;
    const result = await suggestSources({ briefing, interestProfile: briefing.interestProfile, language: "en", env: {}, fetcher: fetcher as typeof fetch,
      existingSources: [{ id: "source_1", briefingId: briefing.id, title: "Example", type: "channel", provider: "rss", kind: "google_news", input: existingInput, enabled: true, lastSeenAt: new Date().toISOString() }] });
    expect(result.suggestions.filter((item) => item.origin === "gdelt")).toHaveLength(1);
    expect(result.suggestions.find((item) => item.origin === "gdelt")?.alreadyAdded).toBe(true);
  });

  it("falls back to curated results when GDELT fails", async () => {
    const result = await suggestSources({ briefing, interestProfile: briefing.interestProfile, language: "en", existingSources: [], env: {}, fetcher: (async () => new Response("unavailable", { status: 503 })) as typeof fetch });
    expect(result.degraded).toBe(true);
    expect(result.suggestions.some((item) => item.origin === "curated")).toBe(true);
  });
});
