import { describe, expect, it } from "vitest";
import { buildBriefingEdition, createEvidenceOnlySummary, demoMessages, personalNewsBriefing, processMessages, sanitizeEvidenceText, sanitizeSummary } from "../src";

const ctas = [
  "Subscribe to our newsletter", "Read more here", "Watch on YouTube", "Source:",
  "Subscribe to our newsletter: https://example.com/signup", "Read more here!",
  "Watch on YouTube: https://example.com/video", "Source: https://example.com/report", "Source: www.example.com/report"
];
const fact = "Human Rights Watch reported 14 civilian deaths and a 1.25% increase in displacement.";
const briefing = { ...personalNewsBriefing, intensity: "medium" as const, interestProfile: "civilian deaths" };

describe("standalone CTA variants", () => {
  it.each(ctas)("removes only the standalone CTA: %s", (cta) => {
    expect(sanitizeEvidenceText(cta, "en")).toBe("");
    expect(sanitizeSummary(cta, "en")).toBe("");
    expect(sanitizeEvidenceText(`${cta}\r\n${fact}\n${cta}`, "en")).toBe(fact);
    expect(sanitizeSummary(`${cta}\r\n${fact}\n${cta}`, "en")).toBe(fact);
  });

  it.each([
    "The company announced that readers could subscribe to our newsletter.",
    "Residents can read more here about the 14 approved projects.",
    "The agency reported that 14 residents watch on YouTube each day.",
    "Source: Reuters reported 14 civilian deaths.",
    "Source: Reuters Confirmed Closure",
    "Source: Reuters Confirms Ceasefire",
    "Source: Reuters Reports Deal",
    "Source: Reuters Election Results",
    // Text alone cannot distinguish a publisher name from a short headline.
    "Source: Associated Press",
    "Read more here: the council approved 14 projects.",
    "Watch on YouTube as officials announced 14 projects.",
    "A source said the closure was temporary.",
    "Watch manufacturers reported a 1.25% increase in exports.",
    "Source officials confirmed the closure was temporary."
  ])("preserves factual reporting: %s", (text) => {
    expect(sanitizeEvidenceText(text, "en")).toBe(text);
    expect(sanitizeSummary(text, "en")).toBe(text);
    const mixed = `Subscribe to our newsletter\n${text}\nSource: https://example.com/report\nWatch on YouTube`;
    expect(sanitizeEvidenceText(mixed, "en")).toBe(text);
    expect(sanitizeSummary(mixed, "en")).toBe(text);
  });

  it("preserves ambiguous publisher text in evidence without weakening summary checks", () => {
    expect(sanitizeEvidenceText("Source: Reuters", "en")).toBe("Source: Reuters");
    expect(sanitizeSummary("Source: Reuters", "en")).toBe("");
    const headline = "Source: Reuters Election Results";
    expect(sanitizeEvidenceText(`${headline} https://example.com/report`, "en")).toBe(headline);
    expect(sanitizeSummary(`${headline} https://example.com/report`, "en")).toBe(headline);
  });

  it("cleans mixed source lines through fallback, processing, and edition construction", () => {
    const text = [ctas[0], fact, ...ctas.slice(1)].join("\n");
    const result = processMessages({ briefing, messages: [{ ...demoMessages[0], text }] });
    expect(result.suppressed).toEqual([]);
    expect(result.publishedItems).toHaveLength(1);
    expect(result.publishedItems[0].summary).toBe(fact);
    expect(createEvidenceOnlySummary(briefing, result.publishedItems[0].evidence)).toBe(fact);
    const edition = buildBriefingEdition({ briefing, messages: [], processedItems: result.publishedItems,
      windowStart: "2026-06-18T08:00:00.000Z", windowEnd: "2026-06-18T09:00:00.000Z", now: new Date("2026-06-18T09:00:00.000Z") });
    expect(edition.sections[0].summary).toBe(fact);
    expect(edition.sections[0].evidence[0].text).toBe(fact);
    expect(edition.summary).toContain(fact.slice(0, -1));
  });
});
