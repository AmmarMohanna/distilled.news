import { describe, expect, it } from "vitest";
import type { BriefingConfig } from "@distilled/core";
import { deriveBriefingSlug, formatClock, formatDayHeading, formatFeedUpdated, formatTime, publicFeedUrl, slugify, uniqueSlug } from "./helpers";

const baseBriefing: BriefingConfig = {
  id: "briefing_default",
  ownerAccountId: "account_admin",
  ownerUsername: "admin",
  slug: "personal",
  title: "Personal Briefing",
  stars: 3,
  interestProfile: "Track power and public safety",
  styleInstruction: "",
  publicFeedEnabled: false,
  paused: false,
  language: "en",
  intensity: "low",
  briefingCadence: "hourly",
  briefingTimeOfDay: "00:00",
  briefingTimezone: "UTC",
  retentionDays: 15
};

describe("web helpers", () => {
  it("formats feed freshness across time boundaries and languages", () => {
    const now = Date.parse("2026-10-02T14:00:00Z");
    expect(formatFeedUpdated("2026-10-02T12:00:00Z", "en", now)).toBe("Updated 2 hours ago");
    expect(formatFeedUpdated("2026-10-02T13:00:00Z", "en", now)).toBe("Updated 1 hour ago");
    expect(formatFeedUpdated("2026-10-02T13:59:00Z", "en", now)).toBe("Updated 1 minute ago");
    expect(formatFeedUpdated("2026-10-01T14:00:00Z", "en", now)).toBe("Updated 1 day ago");
    expect(formatFeedUpdated("2026-10-02T15:00:00Z", "en", now)).toBe("Updated just now");
    expect(formatFeedUpdated("invalid", "en", now)).toBe("");
    expect(formatFeedUpdated("2026-10-02T12:00:00Z", "fr", now)).toBe("Mis à jour il y a 2 heures");
    expect(formatFeedUpdated("2026-10-02T12:00:00Z", "ar", now)).toMatch(/^تم التحديث /);
  });
  it("slugifies feed names conservatively", () => {
    expect(slugify(" Beirut / Security Feed ")).toBe("beirut-security-feed");
    expect(slugify("###")).toBe("briefing");
  });

  it("creates unique slugs for multiple briefings", () => {
    expect(uniqueSlug([baseBriefing], "personal")).toBe("personal-2");
    expect(uniqueSlug([baseBriefing], "new feed")).toBe("new-feed");
  });

  it("derives slugs from titles while ignoring the current feed id", () => {
    expect(deriveBriefingSlug([baseBriefing], "Hello world")).toBe("hello-world");
    expect(deriveBriefingSlug([baseBriefing], "Personal Briefing", baseBriefing.id)).toBe("personal-briefing");
  });

  it("builds shareable public feed URLs", () => {
    expect(publicFeedUrl("ammar-mohanna", "personal", "https://distilled.news")).toBe("https://distilled.news/ammar-mohanna/personal/");
  });

  it("formats timestamps consistently for all supported languages", () => {
    const english = formatTime("2026-06-16T10:58:00.000Z", "en");
    const arabic = formatTime("2026-06-16T10:58:00.000Z", "ar");
    const french = formatTime("2026-06-16T10:58:00.000Z", "fr");

    expect(english).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{2}:\d{2}$/);
    expect(arabic).toMatch(/[\u0600-\u06FF]/u);
    expect(arabic).not.toBe(english);
    expect(french).toMatch(/\d{1,2} [A-Za-zÀ-ÖØ-öø-ÿ]+, \d{2}:\d{2}/u);
    expect(french).not.toBe(english);
    expect(english).not.toMatch(/am|pm/i);
  });

  it("labels briefing days relative to now and formats the time of day", () => {
    const now = new Date(2026, 9, 15, 18, 0).getTime();
    const at = (day: number, hour = 9, minute = 5) => new Date(2026, 9, day, hour, minute).toISOString();
    expect(formatDayHeading(at(15), "en", now)).toBe("Today");
    expect(formatDayHeading(at(14), "en", now)).toBe("Yesterday");
    expect(formatDayHeading(at(14), "fr", now)).toBe("Hier");
    expect(formatDayHeading(at(12), "en", now)).toBe("Monday");
    expect(formatDayHeading(at(1), "en", now)).toBe("October 1");
    expect(formatDayHeading(new Date(2025, 11, 30).toISOString(), "en", now)).toBe("December 30, 2025");
    expect(formatClock(at(15, 9, 5), "en")).toBe("09:05");
    expect(formatClock(at(15, 16, 57), "fr")).toBe("16:57");
  });
});
