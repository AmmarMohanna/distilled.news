import { describe, expect, it } from "vitest";
import type { BriefingConfig } from "@lownoise/core";
import { formatTime, publicFeedUrl, slugify, uniqueSlug } from "./helpers";

const baseBriefing: BriefingConfig = {
  id: "briefing_default",
  slug: "personal",
  title: "Personal Briefing",
  interestProfile: "Track power and public safety",
  styleInstruction: "",
  publicFeedEnabled: false,
  paused: false,
  language: "en",
  retentionDays: 15
};

describe("web helpers", () => {
  it("slugifies feed names conservatively", () => {
    expect(slugify(" Beirut / Security Feed ")).toBe("beirut-security-feed");
    expect(slugify("###")).toBe("briefing");
  });

  it("creates unique slugs for multiple briefings", () => {
    expect(uniqueSlug([baseBriefing], "personal")).toBe("personal-2");
    expect(uniqueSlug([baseBriefing], "new feed")).toBe("new-feed");
  });

  it("builds shareable public feed URLs", () => {
    expect(publicFeedUrl("personal", "https://lownoise.news")).toBe("https://lownoise.news/feed/personal");
  });

  it("formats timestamps in 24-hour time for both languages", () => {
    const english = formatTime("2026-06-16T10:58:00.000Z", "en");
    const arabic = formatTime("2026-06-16T10:58:00.000Z", "ar");

    expect(english).toMatch(/\b\d{2}:\d{2}\b/);
    expect(arabic).toMatch(/\b\d{2}:\d{2}\b/);
    expect(english).not.toMatch(/am|pm/i);
    expect(arabic).not.toMatch(/am|pm/i);
  });
});
