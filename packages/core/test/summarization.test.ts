import { describe, expect, it } from "vitest";
import {
  buildBriefingEdition,
  createEvidenceOnlySummary,
  demoMessages,
  firstSentence,
  personalNewsBriefing,
  processMessages,
  sanitizeEvidenceText,
  sanitizeEditionSectionForLanguage,
  sanitizeSummary
} from "../src";
import type { BriefingLanguage } from "../src/types";

const numericalReports: Array<[BriefingLanguage, string]> = [
  ["en", "The central bank increased the rate to 1.25% from 0.75%."],
  ["en", "The agency reported losses of $1,250.50 and a decline of -0.25%."],
  ["fr", "La banque a annoncé une hausse de 1,25 % et un total de 1 250,50 euros."],
  ["fr", "La banque a annoncé un taux de 1.25% contre 0.75%."],
  ["ar", "أعلن المصرف رفع الفائدة إلى 1.25% من 0.75%."],
  ["ar", "أعلن المصرف رفع الفائدة إلى ١.٢٥٪ من ٠.٧٥٪."],
  ["ar", "أعلن المصرف رفع الفائدة إلى ١٫٢٥٪ ومبلغ ١٬٢٥٠٫٥٠ ليرة."]
];

function evidence(text: string) {
  return [{
    messageId: "cleaner-regression", sourceId: "test", sourceTitle: "Test agency",
    sourceType: "channel" as const, postedAt: "2026-06-18T09:00:00.000Z",
    text, links: [], media: []
  }];
}

describe("briefing cleaner regressions", () => {
  it.each(numericalReports)("preserves %s numerical reporting through cleanup: %s", (language, text) => {
    expect(sanitizeEvidenceText(text, language)).toBe(text);
    expect(sanitizeSummary(text, language)).toBe(text);
    expect(sanitizeSummary(sanitizeSummary(text, language), language)).toBe(text);
  });

  it.each(numericalReports)("preserves %s numerical reporting through fallback and processing: %s", (language, text) => {
    const briefing = { ...personalNewsBriefing, language, intensity: "medium" as const, interestProfile: "" };
    expect(createEvidenceOnlySummary(briefing, evidence(text))).toBe(text);
    const result = processMessages({ briefing, messages: [{ ...demoMessages[0], text }] });
    expect(result.suppressed).toEqual([]);
    expect(result.publishedItems).toHaveLength(1);
    expect(result.publishedItems[0].summary).toBe(text);
    const edition = buildBriefingEdition({
      briefing, messages: [], processedItems: result.publishedItems,
      windowStart: "2026-06-18T08:00:00.000Z", windowEnd: "2026-06-18T09:00:00.000Z",
      now: new Date("2026-06-18T09:00:00.000Z")
    });
    expect(edition.sections[0].summary).toBe(text);
    expect(edition.summary).toContain(text.slice(0, -1));
  });

  it("preserves decimals when repairing a truncated edition section from evidence", () => {
    const prefix = "The central bank announced that the revised lending rules would apply to all commercial banks across the country, including regional branches and credit institutions, with a transition period covering the next fiscal quarter";
    const text = `${prefix} and an interest rate of 1.25%.`;
    expect(prefix.length).toBeGreaterThanOrEqual(200);
    const repaired = sanitizeEditionSectionForLanguage({ title: "Rates", summary: prefix, evidence: evidence(text) }, "en");
    expect(repaired.summary).toBe(text);
  });

  it.each([
    ["en", "The central bank increased the rate to 1.25%.", "No further details were released."],
    ["fr", "La banque a annoncé un taux de 1,25 %!", "No additional details were released."],
    ["ar", "أعلن المصرف رفع الفائدة إلى ١٫٢٥٪؟", "لم ترد تفاصيل إضافية."]
  ] as const)("still separates, deduplicates and filters %s sentences", (language, fact, artifact) => {
    expect(sanitizeSummary(`${fact} ${fact} ${artifact}`, language)).toBe(fact);
    expect(firstSentence(`${fact} ${artifact}`)).toBe(fact);
    expect(createEvidenceOnlySummary({ ...personalNewsBriefing, language }, evidence(`${fact} ${artifact}`))).toBe(fact);
  });

  it.each([
    "Human Rights Watch reported 14 civilian deaths.",
    "A source said the closure was temporary.",
    "Source officials confirmed the closure was temporary.",
    "Watch manufacturers reported a 1.25% increase in exports.",
    "The agency said residents could read more information at the town hall.",
    "The company announced that customers could subscribe to the service."
  ])("retains reporting containing boilerplate vocabulary: %s", (text) => {
    expect(sanitizeEvidenceText(text, "en")).toBe(text);
    expect(sanitizeSummary(text, "en")).toBe(text);
    expect(createEvidenceOnlySummary(personalNewsBriefing, evidence(text))).toBe(text);
  });

  it("retains attributed reporting through real message processing", () => {
    const text = "Human Rights Watch reported 14 civilian deaths.";
    const result = processMessages({
      briefing: { ...personalNewsBriefing, intensity: "medium", interestProfile: "civilian deaths" },
      messages: [{ ...demoMessages[0], text }]
    });
    expect(result.suppressed).toEqual([]);
    expect(result.publishedItems[0].summary).toBe(text);
  });

  it.each([
    "Read more", "Read more: https://example.com/report", "WATCH", "Watch now!",
    "Watch the video: https://example.com/video", "Source: https://example.com/report",
    "Download Telegram", "View in Telegram", "Join channel", "Subscribe",
    "تابعونا https://example.com/channel"
  ])("removes CTA-only lines: %s", (cta) => {
    const fact = "The central bank increased the rate to 1.25%.";
    expect(sanitizeEvidenceText(cta, "en")).toBe("");
    expect(sanitizeSummary(cta, "en")).toBe("");
    expect(sanitizeEvidenceText(`${cta}\r\n${fact}\n${cta}`, "en")).toBe(fact);
    expect(sanitizeSummary(`${cta}\r\n${fact}\n${cta}`, "en")).toBe(fact);
  });
});
